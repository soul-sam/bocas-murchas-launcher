import { BrowserWindow, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { iconPath } from './tray.js'
import { getMainWindow, showMainWindow } from './main-window.js'
import type { PopoutKind, PopoutState } from '../../preload/types.js'

/**
 * JANELA PRÓPRIA PRA MESA — o pôquer em outra janela, pra jogar num monitor
 * e ficar com o launcher no outro.
 *
 * É uma segunda BrowserWindow carregando o MESMO renderer (`index.html`),
 * com `?janela=poker` na query e a rota `#/poker` no hash. O renderer lê a
 * query (lib/platform `isPopout()`) e vira uma casca enxuta: sem barra de
 * ícones, sem chat, sem jukebox, sem atalhos globais — só a tela do pôquer,
 * com a barra de título pra arrastar e fechar. O estado da mesa continua no
 * servidor; a janela nova abre um socket próprio e entra na sala da mesa,
 * como se fosse um segundo launcher da mesma pessoa (o servidor já aceita:
 * é assim que celular e PC convivem).
 *
 * Só uma por vez. Quem pediu outra mesa reaproveita a janela que existe. A
 * janela principal fica sabendo por `popout:state` (pra avisar "a mesa está
 * em outra janela") e por `popout:bring-back` (o "Trazer de volta" de lá,
 * que fecha esta janela e manda a principal abrir a mesa).
 *
 * Nada de API do Electron no corpo do módulo: ele é importado pelo ipc.ts
 * antes do `ready`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let popout: BrowserWindow | null = null
let current: { kind: PopoutKind; tableId: string | null } | null = null
/** Onde a pessoa deixou a janela da última vez (vale enquanto o app estiver aberto). */
let lastBounds: Electron.Rectangle | null = null

export function getPopoutState(): PopoutState {
  const alive = !!popout && !popout.isDestroyed()
  return { open: alive, kind: alive && current ? current.kind : null, tableId: alive && current ? current.tableId : null }
}

function broadcastState(): void {
  const state = getPopoutState()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('popout:state', state)
  }
}

function urlFor(kind: PopoutKind, tableId: string | null): { route: string; query: Record<string, string> } {
  const search = tableId ? `?mesa=${encodeURIComponent(tableId)}` : ''
  return { route: `/${kind}${search}`, query: { janela: kind } }
}

function load(win: BrowserWindow, kind: PopoutKind, tableId: string | null): void {
  const { route, query } = urlFor(kind, tableId)
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    const qs = new URLSearchParams(query).toString()
    void win.loadURL(`${devUrl}/index.html?${qs}#${route}`)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'), { query, hash: route })
  }
}

function create(kind: PopoutKind, tableId: string | null): BrowserWindow {
  const main = getMainWindow()
  const bounds = lastBounds ?? (main ? centeredNear(main.getBounds(), 1180, 760) : { width: 1180, height: 760 })
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#0B0B0B',
    autoHideMenuBar: true,
    title: 'Bocas Murchas — Pôquer',
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      autoplayPolicy: 'no-user-gesture-required',
      // A mesa continua andando com a janela atrás de outra: o relógio e as
      // cartas não podem cair pra 1 quadro por segundo.
      backgroundThrottling: false
    }
  })

  win.once('ready-to-show', () => win.show())
  win.on('maximize', () => win.webContents.send('window:state', { maximized: true }))
  win.on('unmaximize', () => win.webContents.send('window:state', { maximized: false }))
  win.on('close', () => {
    if (!win.isMaximized()) lastBounds = win.getBounds()
  })
  win.on('closed', () => {
    if (popout === win) {
      popout = null
      current = null
    }
    broadcastState()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[popout] renderer caiu:', details.reason)
    if (details.reason === 'clean-exit' || win.isDestroyed()) return
    win.webContents.reload()
  })

  load(win, kind, tableId)
  return win
}

function centeredNear(ref: Electron.Rectangle, width: number, height: number): Electron.Rectangle {
  return {
    width,
    height,
    x: Math.round(ref.x + (ref.width - width) / 2 + 40),
    y: Math.round(ref.y + (ref.height - height) / 2 + 24)
  }
}

/** Abre (ou reaproveita) a janela própria com aquela tela. */
export function openPopout(kind: PopoutKind, tableId: string | null): PopoutState {
  if (popout && !popout.isDestroyed()) {
    if (!current || current.kind !== kind || current.tableId !== tableId) load(popout, kind, tableId)
    current = { kind, tableId }
    if (popout.isMinimized()) popout.restore()
    popout.show()
    popout.focus()
  } else {
    current = { kind, tableId }
    popout = create(kind, tableId)
  }
  broadcastState()
  return getPopoutState()
}

export function closePopout(): void {
  if (popout && !popout.isDestroyed()) popout.close()
}

export function focusPopout(): boolean {
  if (!popout || popout.isDestroyed()) return false
  if (popout.isMinimized()) popout.restore()
  popout.show()
  popout.focus()
  return true
}

/**
 * O "Trazer de volta" da janela própria: fecha ela e manda a principal abrir
 * a mesma tela. A principal é quem navega (ela conhece o router).
 */
export function bringBack(): void {
  const state = getPopoutState()
  const main = getMainWindow()
  if (main) {
    main.webContents.send('popout:bring-back', { kind: state.kind ?? 'poker', tableId: state.tableId })
    showMainWindow()
  }
  closePopout()
}

/** É a janela própria quem está falando? (pelo remetente do IPC) */
export function isPopoutSender(sender: Electron.WebContents): boolean {
  return !!popout && !popout.isDestroyed() && popout.webContents === sender
}

/** Pisca a janela própria na barra de tarefas (é a sua vez e ela está atrás). */
export function flashPopout(): void {
  if (!popout || popout.isDestroyed() || popout.isFocused()) return
  popout.flashFrame(true)
  popout.once('focus', () => popout?.flashFrame(false))
}

export function destroyPopout(): void {
  if (popout && !popout.isDestroyed()) popout.destroy()
  popout = null
  current = null
}
