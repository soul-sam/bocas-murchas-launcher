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
  /** Verdadeiro quando a checagem partiu de um clique, nao do timer. */
  manualCheck?: boolean
  /** Quando a ultima checagem terminou (ISO). */
  checkedAt?: string
}

/** De quanto em quanto tempo procuramos versao nova com o app aberto. */
const CHECK_INTERVAL_MS = 30 * 60_000

let state: UpdaterStatus = { stage: 'idle' }
let ready = false
let checkTimer: NodeJS.Timeout | null = null

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

  // O cabecalho mostra a versao atual desde o primeiro quadro; sem isso ela so
  // apareceria depois da primeira resposta do servidor de update.
  state = { stage: 'idle', currentVersion: app.getVersion() }

  // Igual Discord: o download acontece sozinho em segundo plano e a unica coisa
  // que sobra pro usuario e o "reiniciar". Reiniciar no meio de uma call e ruim,
  // mas baixar nao incomoda ninguem — e quando a pessoa decidir reiniciar, o
  // arquivo ja esta la e a atualizacao e instantanea.
  autoUpdater.autoDownload = true
  // Quem nunca clica em reiniciar atualiza no proximo fechamento do launcher.
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  ready = true

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
    setState({
      stage: 'available',
      currentVersion: app.getVersion(),
      newVersion: info.version,
      percent: 0,
      error: undefined
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    log('update-not-available', { version: info?.version })
    setState({
      stage: 'not-available',
      currentVersion: app.getVersion(),
      newVersion: undefined,
      error: undefined
    })
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

  autoUpdater.on('update-cancelled', (info) => {
    log('update-cancelled', { version: info?.version })
    // Volta pro zero em vez de 'available': com autoDownload, 'available'
    // desenharia uma barra de progresso parada em 0% pra sempre. A checagem
    // periodica tenta de novo em seguida.
    setState({ stage: 'idle', newVersion: undefined, percent: 0 })
  })

  autoUpdater.on('error', (err) => {
    log('error', { message: err.message, stack: err.stack })
    setState({ stage: 'error', error: err.message })
  })

  // Defer the initial check so the window has time to subscribe to events.
  setTimeout(() => void checkForUpdates(false), 3_000)

  // Quem deixa o launcher aberto o dia inteiro nunca veria uma versao lancada
  // depois da abertura. A checagem periodica e barata (um GET no latest.yml) e
  // e o que faz o aviso no cabecalho aparecer sozinho.
  checkTimer = setInterval(() => void checkForUpdates(false), CHECK_INTERVAL_MS)
}

export function stopUpdater(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}

/**
 * Procura versao nova. `manual` marca no estado que o pedido veio de um clique,
 * pro cabecalho poder mostrar "nenhuma atualizacao" so quando a pessoa pediu.
 */
export async function checkForUpdates(manual = true): Promise<UpdaterStatus> {
  if (!ready) {
    // Em dev nao existe instalador pra aplicar; responder na hora evita o
    // botao girando pra sempre.
    setState({ stage: 'not-available', currentVersion: app.getVersion(), manualCheck: manual })
    return state
  }

  // Ja baixou ou esta baixando: checar de novo so atrapalharia.
  if (state.stage === 'downloading' || state.stage === 'downloaded') return state

  setState({ manualCheck: manual })

  try {
    log('checkForUpdates() dispatched', { manual })
    await autoUpdater.checkForUpdates()
  } catch (err) {
    log('checkForUpdates() rejected', { message: (err as Error).message })
    setState({ stage: 'error', error: (err as Error).message })
  }

  setState({ checkedAt: new Date().toISOString() })
  return state
}

export function quitAndInstall(): void {
  if (state.stage !== 'downloaded') return
  // isSilent = false pra o instalador aparecer; isForceRunAfter = true pra o
  // launcher voltar sozinho depois de atualizar.
  autoUpdater.quitAndInstall(false, true)
}
