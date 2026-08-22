import { app, BrowserWindow, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { registerIpcHandlers } from './ipc.js'
import { initUpdater } from './services/updater.js'
import { startServerStatusPolling } from './services/server-status.js'
import { initScreenShare } from './services/screen-share.js'
import { clearHotkeys } from './services/hotkeys.js'
import {
  initTray,
  isQuitting,
  beginQuit,
  destroyTray,
  shouldCloseToTray,
  setCloseToTray
} from './services/tray.js'
import { loadSettings } from './services/settings.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const isDev = !app.isPackaged
const RENDERER_DEV_URL = process.env['ELECTRON_RENDERER_URL']

// Duas instancias brigariam pelos atalhos globais e apareceriam duplicadas na
// lista de quem esta online. A segunda so traz a primeira pra frente.
const gotTheLock = app.requestSingleInstanceLock()

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#0B0B0B',
    autoHideMenuBar: true,
    title: 'Bocas Murchas',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      // Sem isso o audio do soundboard e da call so toca depois de um clique.
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  win.once('ready-to-show', () => win.show())

  win.on('maximize', () => win.webContents.send('window:state', { maximized: true }))
  win.on('unmaximize', () => win.webContents.send('window:state', { maximized: false }))

  // Fechar a janela nao pode derrubar a chamada de voz: esconde na bandeja.
  win.on('close', (event) => {
    if (isQuitting() || !shouldCloseToTray()) return
    event.preventDefault()
    win.hide()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && RENDERER_DEV_URL) {
    win.loadURL(RENDERER_DEV_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

function focusExistingWindow(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', focusExistingWindow)

  app.whenReady().then(async () => {
    registerIpcHandlers()
    initScreenShare()

    // Preenche o cache antes da janela existir, senao o primeiro 'close'
    // decidiria com o padrao em vez da preferencia salva.
    const settings = await loadSettings()
    setCloseToTray(settings.closeToTray)

    createWindow()
    initTray()
    initUpdater()
    startServerStatusPolling()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else focusExistingWindow()
    })
  })
}

// Com bandeja, fechar a ultima janela nao encerra o app em lugar nenhum.
app.on('window-all-closed', () => {
  if (isQuitting() && process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  beginQuit()
})

app.on('will-quit', () => {
  // Atalho global que sobrevive ao processo trava a tecla pro sistema inteiro.
  clearHotkeys()
  destroyTray()
})
