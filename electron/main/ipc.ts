import { BrowserWindow, ipcMain, shell } from 'electron'
import { saveToken, loadToken, clearToken } from './secure-store.js'
import { cancelMcAuth, getMcProfile, logoutMc, startMcAuth } from './services/mc-auth-flow.js'
import { startInstall, getInstallStatus } from './services/install-flow.js'
import { launchGame, getLaunchStatus } from './services/launcher.js'
import { getUpdaterStatus, quitAndInstall } from './services/updater.js'
import { loadSettings, updateSettings, type LauncherSettings } from './services/settings.js'

function serializeError(err: unknown): { message: string; code?: string } {
  if (err instanceof Error) {
    return { message: err.message, code: (err as Error & { code?: string }).code }
  }
  return { message: String(err) }
}

export function registerIpcHandlers(): void {
  ipcMain.handle('auth:save-token', async (_e, token: string) => {
    await saveToken(token)
  })

  ipcMain.handle('auth:load-token', async () => loadToken())

  ipcMain.handle('auth:clear-token', async () => {
    await clearToken()
  })

  ipcMain.handle('shell:open-external', async (_e, url: string) => {
    await shell.openExternal(url)
  })

  ipcMain.handle('mc-auth:start', async () => {
    try {
      const code = await startMcAuth()
      return { ok: true as const, code }
    } catch (err) {
      return { ok: false as const, error: serializeError(err) }
    }
  })

  ipcMain.handle('mc-auth:cancel', async () => {
    cancelMcAuth()
  })

  ipcMain.handle('mc-auth:get-profile', async () => getMcProfile())

  ipcMain.handle('mc-auth:logout', async () => {
    await logoutMc()
  })

  ipcMain.handle('install:start', async (_e, options?: { quickCheck?: boolean }) => {
    // Fire and forget — progress reported via 'install:progress' broadcasts
    void startInstall(options)
    return getInstallStatus()
  })

  ipcMain.handle('install:status', async () => getInstallStatus())

  ipcMain.handle('game:launch', async () => launchGame())

  ipcMain.handle('game:status', async () => getLaunchStatus())

  ipcMain.handle('updater:status', async () => getUpdaterStatus())

  ipcMain.handle('updater:quit-and-install', async () => {
    quitAndInstall()
  })

  ipcMain.handle('settings:get', async () => loadSettings())

  ipcMain.handle('settings:update', async (_e, patch: Partial<LauncherSettings>) => updateSettings(patch))

  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })

  ipcMain.handle('window:maximize-toggle', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return false
    if (w.isMaximized()) {
      w.unmaximize()
      return false
    }
    w.maximize()
    return true
  })

  ipcMain.handle('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })

  ipcMain.handle('window:is-maximized', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
  })
}
