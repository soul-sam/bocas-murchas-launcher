import { app, BrowserWindow } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import pkg from 'electron-updater'
import { isInVoice } from './tray.js'
import { getLaunchStatus } from './launcher.js'
import { getLolStatus } from './lol.js'

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
  /**
   * Quando o launcher vai reiniciar sozinho pra aplicar a versao baixada
   * (epoch ms). Presente so no estagio 'downloaded' e enquanto a contagem
   * regressiva esta rodando; some se a pessoa adiar ou entrar numa call.
   */
  installAt?: number
  /** Ate quando a instalacao automatica foi adiada (epoch ms). */
  postponedUntil?: number
  /**
   * Achou versao nova mas segurou o DOWNLOAD porque baixar agora atrapalharia
   * (call, Minecraft, partida de LoL). Presente so no estagio 'available'; o
   * download comeca sozinho assim que liberar.
   */
  downloadDeferred?: boolean
}

/** De quanto em quanto tempo procuramos versao nova com o app aberto. */
const CHECK_INTERVAL_MS = 30 * 60_000

/**
 * Instalacao automatica.
 *
 * Baixar sozinho ja acontecia; o que faltava era APLICAR sozinho. Quem deixa o
 * launcher na bandeja o dia inteiro nunca clica em "reiniciar" e nunca fecha o
 * app — entao `autoInstallOnAppQuit` nunca dispara e a pessoa fica meses na
 * versao velha, ate o servidor recusar o cliente antigo.
 *
 * A regra: baixou, e ninguem esta no meio de nada (call, Minecraft aberto,
 * partida de LoL), reinicia. Com a janela visivel avisa antes com uma contagem
 * regressiva curta e um botao de adiar; com a janela escondida na bandeja
 * reinicia direto, porque nao ha ninguem olhando pra avisar.
 */
const AUTO_INSTALL_POLL_MS = 30_000
const AUTO_INSTALL_COUNTDOWN_MS = 30_000
const POSTPONE_MS = 30 * 60_000

/** De quanto em quanto tempo olhamos se ja da pra soltar o download segurado. */
const DEFERRED_DOWNLOAD_POLL_MS = 60_000

/**
 * Teto do adiamento do download.
 *
 * Quem deixa a call aberta o dia inteiro fica "ocupado" pra sempre e nunca
 * baixa nada — foi exatamente assim que a 1.18.0 nao chegou em ninguem. Passado
 * esse tempo o download acontece mesmo em call: sao ~90 MB em segundo plano,
 * incomodo bem menor do que ficar semanas numa versao que o servidor ja recusa.
 */
const DOWNLOAD_DEFER_CAP_MS = 4 * 60 * 60_000

let state: UpdaterStatus = { stage: 'idle' }
let ready = false
let checkTimer: NodeJS.Timeout | null = null
let autoInstallPoll: NodeJS.Timeout | null = null
let countdownTimer: NodeJS.Timeout | null = null
let deferredDownloadPoll: NodeJS.Timeout | null = null
/** Desde quando estamos segurando o download (epoch ms), ou null. */
let deferredSince: number | null = null

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
  // Ligado por padrao, mas cada checagem redecide: se baixar agora atrapalha
  // (call, jogo), a checagem acontece do mesmo jeito e so o download espera.
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
    // autoDownload desligado = a checagem decidiu segurar o download.
    const deferred = !autoUpdater.autoDownload
    log('update-available', { version: info.version, deferred })
    setState({
      stage: 'available',
      currentVersion: app.getVersion(),
      newVersion: info.version,
      percent: 0,
      error: undefined,
      downloadDeferred: deferred || undefined
    })
    if (deferred) startDeferredDownloadPoll()
  })

  autoUpdater.on('update-not-available', (info) => {
    log('update-not-available', { version: info?.version })
    deferredSince = null
    stopDeferredDownloadPoll()
    setState({
      stage: 'not-available',
      currentVersion: app.getVersion(),
      newVersion: undefined,
      error: undefined
    })
  })

  autoUpdater.on('download-progress', (p) => {
    setState({
      downloadDeferred: undefined,
      stage: 'downloading',
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    log('update-downloaded', { version: info.version })
    deferredSince = null
    stopDeferredDownloadPoll()
    setState({
      stage: 'downloaded',
      newVersion: info.version,
      percent: 100,
      downloadDeferred: undefined
    })
    startAutoInstallPoll()
  })

  autoUpdater.on('update-cancelled', (info) => {
    log('update-cancelled', { version: info?.version })
    // Volta pro zero em vez de 'available': com autoDownload, 'available'
    // desenharia uma barra de progresso parada em 0% pra sempre. A checagem
    // periodica tenta de novo em seguida.
    stopDeferredDownloadPoll()
    setState({ stage: 'idle', newVersion: undefined, percent: 0, downloadDeferred: undefined })
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
  stopAutoInstallPoll()
  stopDeferredDownloadPoll()
  cancelCountdown()
}

// ============================================
// INSTALACAO AUTOMATICA
// ============================================

/** Algo que reiniciar agora estragaria? */
function isBusy(): string | null {
  if (isInVoice()) return 'voice'

  const launch = getLaunchStatus().stage
  if (launch === 'preparing' || launch === 'running') return 'minecraft'

  const lol = getLolStatus()
  if (lol.clientRunning && lol.phase !== 'none' && lol.phase !== 'lobby') {
    return `lol:${lol.phase}`
  }

  return null
}

/**
 * Algo que BAIXAR agora atrapalharia?
 *
 * Quase igual a `isBusy()`, com uma diferenca: a tela de pos-jogo do LoL nao
 * conta. Ali a partida acabou e a banda esta livre — e e a janela mais comum de
 * quem joga a noite inteira. Pra REINICIAR ela continua contando como ocupado,
 * porque e nela que o resultado da partida esta sendo resolvido.
 */
function downloadBlocker(): string | null {
  if (isInVoice()) return 'voice'

  const launch = getLaunchStatus().stage
  if (launch === 'preparing' || launch === 'running') return 'minecraft'

  const lol = getLolStatus()
  if (
    lol.clientRunning &&
    lol.phase !== 'none' &&
    lol.phase !== 'lobby' &&
    lol.phase !== 'end-of-game'
  ) {
    return `lol:${lol.phase}`
  }

  return null
}

/** Ja seguramos o download tempo demais? */
function deferralExpired(): boolean {
  return deferredSince !== null && Date.now() - deferredSince >= DOWNLOAD_DEFER_CAP_MS
}

function stopDeferredDownloadPoll(): void {
  if (deferredDownloadPoll) {
    clearInterval(deferredDownloadPoll)
    deferredDownloadPoll = null
  }
}

function startDeferredDownloadPoll(): void {
  if (deferredDownloadPoll) return
  deferredDownloadPoll = setInterval(evaluateDeferredDownload, DEFERRED_DOWNLOAD_POLL_MS)
}

/** A call acabou (ou o teto estourou)? Entao baixa o que ficou segurado. */
function evaluateDeferredDownload(): void {
  if (state.stage !== 'available' || !state.downloadDeferred) {
    stopDeferredDownloadPoll()
    return
  }

  const blocker = downloadBlocker()
  const capped = deferralExpired()
  if (blocker && !capped) return

  log('download liberado', { blocker, capped, version: state.newVersion })
  stopDeferredDownloadPoll()
  deferredSince = null
  setState({ downloadDeferred: undefined })
  void autoUpdater.downloadUpdate().catch((err: Error) => {
    log('downloadUpdate() rejected', { message: err.message })
    setState({ stage: 'error', error: err.message })
  })
}

function windowVisible(): boolean {
  const win = BrowserWindow.getAllWindows()[0]
  return Boolean(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized())
}

function cancelCountdown(): void {
  if (countdownTimer) {
    clearTimeout(countdownTimer)
    countdownTimer = null
  }
  if (state.installAt !== undefined) setState({ installAt: undefined })
}

function stopAutoInstallPoll(): void {
  if (autoInstallPoll) {
    clearInterval(autoInstallPoll)
    autoInstallPoll = null
  }
}

function startAutoInstallPoll(): void {
  if (autoInstallPoll) return
  // Primeira avaliacao na hora: quem esta na bandeja nem ve o poll.
  evaluateAutoInstall()
  autoInstallPoll = setInterval(evaluateAutoInstall, AUTO_INSTALL_POLL_MS)
}

function evaluateAutoInstall(): void {
  if (state.stage !== 'downloaded') {
    stopAutoInstallPoll()
    cancelCountdown()
    return
  }

  if (state.postponedUntil && Date.now() < state.postponedUntil) return

  const busy = isBusy()
  if (busy) {
    // Entrou numa call no meio da contagem: some o aviso, tenta de novo depois.
    if (countdownTimer) {
      log('auto-install: contagem cancelada', { busy })
      cancelCountdown()
    }
    return
  }

  if (countdownTimer) return

  if (!windowVisible()) {
    log('auto-install: janela escondida, aplicando agora')
    applyNow()
    return
  }

  const installAt = Date.now() + AUTO_INSTALL_COUNTDOWN_MS
  log('auto-install: contagem iniciada', { installAt })
  setState({ installAt, postponedUntil: undefined })
  countdownTimer = setTimeout(() => {
    countdownTimer = null
    // Reconfere: a pessoa pode ter entrado na call nos ultimos segundos.
    if (isBusy()) {
      log('auto-install: ocupado na hora H, adiando')
      setState({ installAt: undefined })
      return
    }
    applyNow()
  }, AUTO_INSTALL_COUNTDOWN_MS)
}

function applyNow(): void {
  stopAutoInstallPoll()
  if (countdownTimer) {
    clearTimeout(countdownTimer)
    countdownTimer = null
  }
  log('auto-install: quitAndInstall', { version: state.newVersion })
  // isSilent = true: ninguem pediu essa instalacao, entao o instalador nao
  // aparece. isForceRunAfter = true: o launcher volta sozinho na versao nova.
  autoUpdater.quitAndInstall(true, true)
}

/** A pessoa clicou em "adiar": volta a perguntar dali a meia hora. */
export function postponeUpdate(): UpdaterStatus {
  if (state.stage !== 'downloaded') return state
  const postponedUntil = Date.now() + POSTPONE_MS
  log('auto-install: adiado', { postponedUntil })
  if (countdownTimer) {
    clearTimeout(countdownTimer)
    countdownTimer = null
  }
  setState({ installAt: undefined, postponedUntil })
  return state
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

  // Ja achou versao nova e so esta esperando a call acabar pra baixar: quem
  // cuida disso e o poll, checar de novo so reescreveria o mesmo estado.
  if (state.stage === 'available' && state.downloadDeferred) return state

  // Checar e um GET de algumas centenas de bytes no latest.yml — isso nunca
  // atrapalhou call nenhuma, e e o que faz o aviso de versao nova aparecer. O
  // que pesa e o DOWNLOAD (~90 MB a toda velocidade), entao e SO ELE que
  // espera. Antes a checagem inteira era pulada quando havia call aberta, e
  // quem fica na call o dia todo nunca via versao nova nenhuma.
  const blocker = manual ? null : downloadBlocker()
  if (blocker && deferredSince === null) deferredSince = Date.now()
  const defer = Boolean(blocker) && !deferralExpired()
  if (!blocker) deferredSince = null
  autoUpdater.autoDownload = !defer
  if (defer) log('download sera segurado se houver versao nova', { blocker })

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
  stopAutoInstallPoll()
  if (countdownTimer) {
    clearTimeout(countdownTimer)
    countdownTimer = null
  }
  // isSilent = false pra o instalador aparecer; isForceRunAfter = true pra o
  // launcher voltar sozinho depois de atualizar.
  autoUpdater.quitAndInstall(false, true)
}
