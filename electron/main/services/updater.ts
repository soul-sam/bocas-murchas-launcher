import { app, BrowserWindow } from 'electron'
import pkg from 'electron-updater'

const { autoUpdater } = pkg

export type UpdaterStage =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdaterStatus {
  stage: UpdaterStage
  currentVersion?: string
  newVersion?: string
  percent?: number
  bytesPerSecond?: number
  transferred?: number
  total?: number
  error?: string
}

let state: UpdaterStatus = { stage: 'idle' }

export function getUpdaterStatus(): UpdaterStatus {
  return state
}

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('updater:status', state)
  }
}

function setState(patch: Partial<UpdaterStatus>): void {
  state = { ...state, ...patch }
  broadcast()
}

export function initUpdater(): void {
  // Auto-update is meaningless in dev (no installer to run).
  if (!app.isPackaged) {
    state = { stage: 'idle', currentVersion: app.getVersion() }
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false

  autoUpdater.on('checking-for-update', () => {
    setState({ stage: 'checking', currentVersion: app.getVersion() })
  })

  autoUpdater.on('update-available', (info) => {
    setState({ stage: 'available', newVersion: info.version, percent: 0 })
  })

  autoUpdater.on('update-not-available', () => {
    setState({ stage: 'not-available', currentVersion: app.getVersion() })
  })

  autoUpdater.on('download-progress', (p) => {
    setState({
      stage: 'downloading',
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    setState({ stage: 'downloaded', newVersion: info.version, percent: 100 })
  })

  autoUpdater.on('error', (err) => {
    setState({ stage: 'error', error: err.message })
  })

  // Defer the initial check so the window has time to subscribe to events.
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((err) => {
      setState({ stage: 'error', error: (err as Error).message })
    })
  }, 3000)
}

export function quitAndInstall(): void {
  if (state.stage !== 'downloaded') return
  autoUpdater.quitAndInstall()
}
