import { app, BrowserWindow } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import pkg from 'electron-updater'

const { autoUpdater } = pkg

// File logger so we can diagnose auto-update failures in the field. The
// log lives at %APPDATA%\bocas-murchas-launcher\updater.log on Windows.
function logFile(): string {
  return path.join(app.getPath('userData'), 'updater.log')
}

function log(msg: string, extra?: unknown): void {
  try {
    mkdirSync(path.dirname(logFile()), { recursive: true })
    const line = `[${new Date().toISOString()}] ${msg}${
      extra !== undefined ? ' ' + JSON.stringify(extra) : ''
    }\n`
    appendFileSync(logFile(), line)
  } catch {
    // best-effort logging — never throw from the logger
  }
}

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

  log('initUpdater', { version: app.getVersion(), platform: process.platform })

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false

  // Pipe electron-updater's internal logs to the same file so we see HTTP
  // failures (DNS, TLS, 404 on latest.yml, etc).
  autoUpdater.logger = {
    debug: (m: unknown) => log('[updater:debug] ' + String(m)),
    info: (m: unknown) => log('[updater:info] ' + String(m)),
    warn: (m: unknown) => log('[updater:warn] ' + String(m)),
    error: (m: unknown) => log('[updater:error] ' + String(m))
  } as unknown as typeof autoUpdater.logger

  autoUpdater.on('checking-for-update', () => {
    log('checking-for-update')
    setState({ stage: 'checking', currentVersion: app.getVersion() })
  })

  autoUpdater.on('update-available', (info) => {
    log('update-available', { version: info.version })
    setState({ stage: 'available', newVersion: info.version, percent: 0 })
  })

  autoUpdater.on('update-not-available', (info) => {
    log('update-not-available', { version: info?.version })
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
    log('update-downloaded', { version: info.version })
    setState({ stage: 'downloaded', newVersion: info.version, percent: 100 })
  })

  autoUpdater.on('error', (err) => {
    log('error', { message: err.message, stack: err.stack })
    setState({ stage: 'error', error: err.message })
  })

  // Defer the initial check so the window has time to subscribe to events.
  setTimeout(() => {
    log('checkForUpdates() dispatched')
    void autoUpdater.checkForUpdates().catch((err) => {
      log('checkForUpdates() rejected', { message: (err as Error).message })
      setState({ stage: 'error', error: (err as Error).message })
    })
  }, 3000)
}

export function quitAndInstall(): void {
  if (state.stage !== 'downloaded') return
  autoUpdater.quitAndInstall()
}
