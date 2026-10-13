import { app, dialog, Menu, Tray, nativeImage } from 'electron'
import path from 'node:path'
import { getMainWindow, showMainWindow } from './main-window.js'

/**
 * Icone na bandeja para o launcher continuar rodando com a janela fechada.
 *
 * Isso nao e enfeite: se fechar a janela derruba o processo, a chamada de voz
 * cai junto. O comportamento esperado (e o do Discord) e fechar a janela e
 * continuar na call.
 */

let tray: Tray | null = null

/** Diferencia "esconder na bandeja" de "sair de verdade". */
let quitting = false

/** Estado espelhado do renderer, so pra desenhar o menu. */
let inVoice = false
let micMuted = false
/** Agenda sem resposta, enquete sem voto, clipe sem reacao (lib/pendencias-context). */
let pendencias = 0

/**
 * Cache da preferencia "fechar para a bandeja".
 *
 * O handler de 'close' precisa decidir de forma SINCRONA se chama
 * preventDefault(); ler o settings.json ali (async) ja seria tarde demais e a
 * janela fecharia antes da resposta. Por isso o valor fica em memoria, escrito
 * na inicializacao e a cada settings:update.
 */
let closeToTray = true

export function isQuitting(): boolean {
  return quitting
}

/** O updater consulta isso antes de reiniciar sozinho: call nao se derruba. */
export function isInVoice(): boolean {
  return inVoice
}

export function shouldCloseToTray(): boolean {
  return closeToTray
}

export function setCloseToTray(value: boolean): void {
  closeToTray = value
}

export function beginQuit(): void {
  quitting = true
}

/** Uma caixa de cada vez: clicar "Fechar" duas vezes nao empilha dialogos. */
let quitDialogOpen = false

/**
 * Pergunta antes de sair de verdade. Sair derruba a chamada de voz e tudo o
 * que esta rodando no launcher, entao um clique errado na bandeja (ou no X,
 * sem bandeja) nao pode encerrar sem confirmar.
 */
export async function confirmQuit(): Promise<void> {
  if (quitting || quitDialogOpen) return
  quitDialogOpen = true
  try {
    const win = getMainWindow()
    const opts: Electron.MessageBoxOptions = {
      type: 'question',
      title: 'Sair do Bocas Murchas',
      message: 'Deseja realmente sair do launcher?',
      detail: inVoice
        ? 'Voce esta numa chamada de voz. Sair derruba a chamada.'
        : 'O launcher vai fechar por completo.',
      buttons: ['Sair', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    }
    const { response } =
      win && !win.isDestroyed()
        ? await dialog.showMessageBox(win, opts)
        : await dialog.showMessageBox(opts)
    if (response !== 0) return
    beginQuit()
    app.quit()
  } finally {
    quitDialogOpen = false
  }
}

export function iconPath(): string {
  // Empacotado, os recursos de build ficam em resources/; em dev, na pasta do repo.
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(app.getAppPath(), 'build/icon.ico')
}

const showWindow = showMainWindow

/**
 * Recarrega o renderer.
 *
 * A janela e frameless: fechar e minimizar sao botoes React. Se a interface
 * travar, a bandeja e o unico lugar de onde ainda da pra agir — por isso este
 * item existe aqui e nao so dentro do app.
 */
function reloadWindow(): void {
  const win = getMainWindow()
  if (!win) return
  win.show()
  win.webContents.reloadIgnoringCache()
}

function send(channel: string, payload?: unknown): void {
  getMainWindow()?.webContents.send(channel, payload)
}

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Abrir Bocas Murchas',
      click: showWindow
    },
    ...(pendencias > 0
      ? [
          {
            label: pendencias === 1 ? '1 pendência esperando você' : `${pendencias} pendências esperando você`,
            click: () => {
              showWindow()
              send('tray:command', { command: 'open-pendencias' })
            }
          }
        ]
      : []),
    { type: 'separator' },
    {
      label: micMuted ? 'Reativar microfone' : 'Silenciar microfone',
      enabled: inVoice,
      click: () => send('tray:command', { command: 'toggle-mute' })
    },
    {
      label: 'Sair da chamada',
      enabled: inVoice,
      click: () => send('tray:command', { command: 'leave-voice' })
    },
    { type: 'separator' },
    {
      label: 'Recarregar janela',
      click: reloadWindow
    },
    {
      label: 'Fechar launcher',
      click: () => void confirmQuit()
    }
  ])
}

function refresh(): void {
  if (!tray) return

  tray.setContextMenu(buildMenu())
  tray.setToolTip(
    (inVoice ? 'Bocas Murchas - na call' + (micMuted ? ' (mudo)' : '') : 'Bocas Murchas') +
      (pendencias > 0 ? ` - ${pendencias} pendência${pendencias === 1 ? '' : 's'}` : '')
  )
}

export function initTray(): void {
  if (tray) return

  const image = nativeImage.createFromPath(iconPath())
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)

  tray.on('click', showWindow)
  tray.on('double-click', showWindow)

  refresh()
}

/** O renderer avisa quando entra/sai da call pro menu ficar coerente. */
export function setVoiceState(state: { inVoice?: boolean; micMuted?: boolean }): void {
  if (state.inVoice !== undefined) inVoice = state.inVoice
  if (state.micMuted !== undefined) micMuted = state.micMuted
  refresh()
}

/**
 * Bolinha vermelha no canto do icone da barra de tarefas.
 *
 * Desenhada em codigo (16x16 BGRA) e nao um .png em build/: e um circulo, e
 * um arquivo a mais no instalador pra isso e mais um caminho de recurso pra
 * errar entre dev e empacotado.
 */
let badgeImage: Electron.NativeImage | null = null

function badge(): Electron.NativeImage {
  if (badgeImage) return badgeImage
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c)
      const i = (y * size + x) * 4
      if (d <= 7.5) {
        // Borda escura de 1px pra bolinha nao sumir na barra clara do Windows.
        const edge = d > 6.2
        buf[i] = edge ? 0x14 : 0x3c // B
        buf[i + 1] = edge ? 0x14 : 0x3c // G
        buf[i + 2] = edge ? 0x14 : 0xef // R
        buf[i + 3] = 0xff
      }
    }
  }
  badgeImage = nativeImage.createFromBitmap(buf, { width: size, height: size })
  return badgeImage
}

/**
 * O renderer conta as pendencias; aqui elas viram sinal fora da janela:
 * tooltip e item na bandeja, bolinha na barra de tarefas e a janela piscando
 * quando o numero SOBE com ela fora de foco (pisca ate a pessoa olhar).
 */
export function setPendencias(count: number): void {
  const subiu = count > pendencias
  pendencias = count
  refresh()

  const win = getMainWindow()
  if (!win || win.isDestroyed()) return
  if (process.platform === 'win32') {
    win.setOverlayIcon(count > 0 ? badge() : null, count > 0 ? `${count} pendências` : '')
  }
  if (subiu && !win.isFocused()) {
    win.flashFrame(true)
    win.once('focus', () => {
      if (!win.isDestroyed()) win.flashFrame(false)
    })
  }
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
