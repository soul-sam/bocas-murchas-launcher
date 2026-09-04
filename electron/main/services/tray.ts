import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import path from 'node:path'

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

export function shouldCloseToTray(): boolean {
  return closeToTray
}

export function setCloseToTray(value: boolean): void {
  closeToTray = value
}

export function beginQuit(): void {
  quitting = true
}

function iconPath(): string {
  // Empacotado, os recursos de build ficam em resources/; em dev, na pasta do repo.
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(app.getAppPath(), 'build/icon.ico')
}

function mainWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows()[0]
}

function showWindow(): void {
  const win = mainWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/**
 * Recarrega o renderer.
 *
 * A janela e frameless: fechar e minimizar sao botoes React. Se a interface
 * travar, a bandeja e o unico lugar de onde ainda da pra agir — por isso este
 * item existe aqui e nao so dentro do app.
 */
function reloadWindow(): void {
  const win = mainWindow()
  if (!win || win.isDestroyed()) return
  win.show()
  win.webContents.reloadIgnoringCache()
}

function send(channel: string, payload?: unknown): void {
  mainWindow()?.webContents.send(channel, payload)
}

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Abrir Bocas Murchas',
      click: showWindow
    },
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
      click: () => {
        beginQuit()
        app.quit()
      }
    }
  ])
}

function refresh(): void {
  if (!tray) return

  tray.setContextMenu(buildMenu())
  tray.setToolTip(
    inVoice
      ? 'Bocas Murchas - na call' + (micMuted ? ' (mudo)' : '')
      : 'Bocas Murchas'
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

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
