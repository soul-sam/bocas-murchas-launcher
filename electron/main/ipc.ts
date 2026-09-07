import { BrowserWindow, Notification, ipcMain, shell } from 'electron'
import { saveToken, loadToken, clearToken } from './secure-store.js'
import { cancelMcAuth, getMcProfile, logoutMc, startMcAuth } from './services/mc-auth-flow.js'
import { startInstall, getInstallStatus } from './services/install-flow.js'
import { getLatestModpackChangelog, getInstalledModpackVersion } from './services/modpack.js'
import { launchGame, getLaunchStatus } from './services/launcher.js'
import {
  getUpdaterStatus,
  quitAndInstall,
  checkForUpdates,
  postponeUpdate
} from './services/updater.js'
import { loadSettings, updateSettings, type LauncherSettings } from './services/settings.js'
import { getServerStatus, refreshServerStatusNow } from './services/server-status.js'
import {
  setHotkeys,
  probeAccelerator,
  clearHotkeys,
  type HotkeyBinding
} from './services/hotkeys.js'
import { listSources, selectSource, cancelSelection } from './services/screen-share.js'
import { shakeWindow, type NudgeOptions } from './services/nudge.js'
import { setVoiceState, setCloseToTray } from './services/tray.js'
import { getLolStatus, refreshLolNow, startLolWatcher, stopLolWatcher } from './services/lol.js'
import { applyAutostart, launchedAtLogin } from './services/autostart.js'
import { app, powerMonitor } from 'electron'

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

  ipcMain.handle('updater:check', async () => checkForUpdates(true))

  ipcMain.handle('updater:quit-and-install', async () => {
    quitAndInstall()
  })

  ipcMain.handle('updater:postpone', async () => postponeUpdate())

  ipcMain.handle('settings:get', async () => loadSettings())

  ipcMain.handle('settings:update', async (_e, patch: Partial<LauncherSettings>) => {
    const before = await loadSettings()
    const next = await updateSettings(patch)
    // O handler de 'close' e sincrono e nao pode ler o arquivo; mantemos o
    // cache do main alinhado a cada salvamento.
    setCloseToTray(next.closeToTray)

    // Preferencias que o main precisa aplicar na hora, nao so gravar.
    if (before.autostart !== next.autostart) void applyAutostart()
    if (before.lol.enabled !== next.lol.enabled || before.lol.lockfilePath !== next.lol.lockfilePath) {
      stopLolWatcher()
      if (next.lol.enabled) startLolWatcher()
    }

    return next
  })

  // ============================================
  // LEAGUE OF LEGENDS (LCU) E APP
  // ============================================
  ipcMain.handle('lol:status', async () => getLolStatus())

  ipcMain.handle('lol:refresh', async () => refreshLolNow())

  ipcMain.handle('app:apply-autostart', async () => applyAutostart())

  ipcMain.handle('app:launched-at-login', async () => launchedAtLogin())

  ipcMain.handle('app:version', async () => app.getVersion())

  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })

  // Ocioso do SISTEMA, nao da janela: e o unico jeito de saber que a pessoa
  // levantou da cadeira. O renderer pergunta de tempo em tempo (ver
  // lib/afk-context) em vez de a gente empurrar evento — o valor so importa
  // quando alguem vai decidir algo com ele.
  ipcMain.handle('app:idle-seconds', async () => powerMonitor.getSystemIdleTime())

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

  // Saida de emergencia: se a interface travar de um jeito que nem o guarda do
  // renderer resolva, recarregar a janela devolve o app sem derrubar o
  // processo (e sem perder a sessao, que fica no disco).
  ipcMain.handle('window:reload', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.webContents.reload()
  })

  ipcMain.handle('server-status:get', async () => getServerStatus())

  ipcMain.handle('server-status:refresh', async () => refreshServerStatusNow())

  ipcMain.handle('modpack:changelog', async () => getLatestModpackChangelog())

  ipcMain.handle('modpack:installed-tag', async () => getInstalledModpackVersion())

  // ============================================
  // ATALHOS GLOBAIS
  // ============================================
  ipcMain.handle('hotkeys:set', async (_e, bindings: HotkeyBinding[]) =>
    setHotkeys(Array.isArray(bindings) ? bindings : [])
  )

  ipcMain.handle('hotkeys:probe', async (_e, accelerator: string) =>
    probeAccelerator(accelerator)
  )

  ipcMain.handle('hotkeys:clear', async () => {
    clearHotkeys()
  })

  // ============================================
  // COMPARTILHAR TELA
  // ============================================
  ipcMain.handle('screen:list-sources', async () => listSources())

  ipcMain.handle(
    'screen:select-source',
    async (_e, payload: { sourceId: string; withAudio?: boolean }) => {
      selectSource(payload.sourceId, payload.withAudio ?? true)
    }
  )

  ipcMain.handle('screen:cancel-selection', async () => {
    cancelSelection()
  })

  // ============================================
  // NUDGE
  // ============================================
  ipcMain.handle('nudge:shake', async (_e, options?: NudgeOptions) => shakeWindow(options))

  // ============================================
  // BANDEJA E NOTIFICACOES
  // ============================================
  ipcMain.handle(
    'tray:set-voice-state',
    async (_e, state: { inVoice?: boolean; micMuted?: boolean }) => {
      setVoiceState(state ?? {})
    }
  )

  ipcMain.handle(
    'notify:show',
    async (_e, payload: { title: string; body: string; silent?: boolean }) => {
      if (!Notification.isSupported()) return

      const notification = new Notification({
        title: payload.title,
        body: payload.body,
        silent: payload.silent ?? false
      })

      notification.on('click', () => {
        const win = BrowserWindow.getAllWindows()[0]
        if (!win) return
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
      })

      notification.show()
    }
  )
}
