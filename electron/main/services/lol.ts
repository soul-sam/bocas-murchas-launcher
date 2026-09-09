import { app, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  LolGameResult,
  LolLiveScore,
  LolLobbyMember,
  LolPhase,
  LolStatus
} from '../../preload/types.js'
import { loadSettings } from './settings.js'
import { discoverLcu, type LcuCredentials } from './lol-discovery.js'
import {
  closeLcuAgents,
  isConnectionError,
  lcuGet,
  LcuHttpError,
  liveGet,
  mapGameflowPhase,
  queueName
} from './lol-client.js'
import { eogToResult, isUsableEogBlock, type EogStatsBlock } from './lol-eog.js'

/**
 * LEITURA DO CLIENTE DO LEAGUE OF LEGENDS (LCU).
 *
 * Dois modos, um timer so:
 *
 *   - DESCOBRINDO (a cada 5s): procura porta e senha do cliente
 *     (lol-discovery.ts) e valida conectando. Sem cliente aberto, nada no log.
 *   - CONECTADO (a cada 2s): le a fase do gameflow e, conforme a fase, o
 *     lobby, o champ select ou o placar ao vivo do jogo (a cada 5s, na Live
 *     Client Data API do JOGO, porta 2999). Duas falhas de conexao seguidas =
 *     cliente fechou, volta a descobrir.
 *
 * Fim de partida: quando a fase sai de 'in-progress' (ou entra em
 * 'end-of-game'), um laco separado fica pedindo o eog-stats-block por ate 60s
 * e publica UM `lol:game-ended` por gameId. Se o bloco nunca vem, sai um
 * resultado 'unknown' com o que o placar ao vivo deixou.
 *
 * O gameId da ultima partida publicada fica em disco. Sem isso, reabrir o
 * launcher com o cliente parado na tela de fim de jogo postaria o mesmo card
 * de novo.
 *
 * Publica `lol:status` so quando algo que a tela mostra mudou — nao a cada
 * tick. Nada aqui pode estourar de um timer: erro vira texto em `error`.
 */

const DISCOVERY_INTERVAL_MS = 5_000
/**
 * Sem cliente aberto, a descoberta espaca ate aqui. Cada ciclo sem sucesso
 * e um `tasklist` (processo novo, ~50 ms de CPU) e, se ele achar o processo,
 * um PowerShell — o dia inteiro, inclusive com outro jogo aberto. Doze
 * ciclos rapidos (um minuto) pegam o cliente que acabou de abrir; depois
 * disso, 30 s de atraso na deteccao nao atrapalham ninguem: entre abrir o
 * cliente e entrar numa fila passa mais que isso.
 */
const DISCOVERY_IDLE_INTERVAL_MS = 30_000
const DISCOVERY_FAST_TICKS = 12
const POLL_INTERVAL_MS = 2_000
const LIVE_INTERVAL_MS = 5_000
const EOG_INTERVAL_MS = 3_000
const EOG_MAX_WAIT_MS = 60_000
// Um timeout isolado enquanto o cliente carrega um mapa nao e ele morrendo.
const MAX_CONSECUTIVE_FAILURES = 2
const LAST_GAME_FILE = 'lol-last-game.json'

// ---------------- formas da LCU (so o que usamos) ----------------

interface LcuSummoner {
  gameName?: string
  tagLine?: string
  displayName?: string
  puuid?: string
  summonerId?: number
}

interface LcuLobbyMember {
  gameName?: string
  gameTag?: string
  tagLine?: string
  summonerName?: string
  puuid?: string
  summonerId?: number
  isBot?: boolean
}

interface LcuLobby {
  gameConfig?: { queueId?: number; isCustom?: boolean }
  members?: LcuLobbyMember[]
}

interface LcuChampSelectSession {
  localPlayerCellId?: number
  myTeam?: Array<{ cellId?: number; championId?: number; championPickIntent?: number }>
}

interface LcuChampionSummary {
  id: number
  name: string
}

interface LcuGameflowSession {
  gameData?: {
    gameId?: number
    queue?: { id?: number }
    playerChampionSelections?: Array<{ championId?: number; puuid?: string }>
  }
}

interface LiveActivePlayer {
  riotId?: string
  riotIdGameName?: string
  riotIdTagLine?: string
  summonerName?: string
  level?: number
  currentGold?: number
}

interface LivePlayerScores {
  kills?: number
  deaths?: number
  assists?: number
  creepScore?: number
}

interface LiveGameStats {
  gameTime?: number
}

interface LivePlayer {
  championName?: string
  riotId?: string
  riotIdGameName?: string
  riotIdTagLine?: string
  summonerName?: string
}

// ---------------- estado ----------------

/** Partida em andamento (ou recem-terminada, esperando o bloco de fim de jogo). */
interface PendingGame {
  /** gameId como string quando conhecido; senao `start:<epoch>`. E a chave anti-duplicata. */
  key: string
  gameId?: number
  queue?: string
  champion?: string
  startedAt: number
  lastScore?: LolLiveScore
  /** Quem do lobby estava junto (sem eu) — pro resultado 'unknown', que nao tem time. */
  teammates?: LolLobbyMember[]
}

interface Session {
  creds: LcuCredentials
  me?: LolLobbyMember
  /** championId -> nome. Muda so com patch, e patch reinicia o cliente. */
  champions: Map<number, string> | null
  /** puuid -> Riot ID, pra membros de lobby que vem sem gameName. */
  riotIds: Map<string, string>
  failures: number
  lastPhase: LolPhase | null
  lastLobby?: LolLobbyMember[]
  lastQueue?: string
  lastChampion?: string
  lastLiveAt: number
  game?: PendingGame
  /** Partida cujo bloco estamos esperando; a tela de fim de jogo mostra fila/campeao dela. */
  eogGame?: PendingGame
  /**
   * gameId do bloco que JA estava no cliente quando conectamos. E de uma
   * partida que nao vimos — nao pode virar card agora.
   */
  staleEogGameId?: number
}

let current: LolStatus = idleStatus()
let running = false
let generation = 0
let timer: NodeJS.Timeout | null = null
/** Serializa os ticks: o timer e o botao "testar" podem cair juntos. */
let chain: Promise<void> = Promise.resolve()
let session: Session | null = null
/** Partida que estava rolando quando o cliente caiu; decidimos quando ele voltar. */
let orphanGame: PendingGame | null = null
let resolvingKey: string | null = null
let lastEmittedKey: string | null = null
let lastEmittedLoaded = false
let lastLoggedError: string | null = null

function idleStatus(error?: string): LolStatus {
  const now = Date.now()
  const status: LolStatus = { clientRunning: false, phase: 'none', phaseSince: now, updatedAt: now }
  if (error) status.error = error
  return status
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------- publicacao ----------------

export function publishLolStatus(status: LolStatus): void {
  current = status
  broadcast('lol:status', status)
}

export function publishLolGameEnded(result: LolGameResult): void {
  broadcast('lol:game-ended', result)
}

export function getLolStatus(): LolStatus {
  return current
}

/** So o que a tela mostra. `updatedAt` e `phaseSince` ficam de fora de proposito. */
function statusKey(s: LolStatus): string {
  return JSON.stringify([
    s.clientRunning,
    s.phase,
    s.queue ?? null,
    s.champion ?? null,
    s.lobby ?? null,
    s.score ?? null,
    s.me ?? null,
    s.error ?? null
  ])
}

function publishIfChanged(next: LolStatus): void {
  if (statusKey(next) === statusKey(current)) return
  publishLolStatus(next)
}

/** Erro vira texto no status (tela de configuracoes) e UMA linha no log por mensagem distinta. */
function setError(error: string | undefined): void {
  if (error && error !== lastLoggedError) {
    console.warn(`[lol] ${error}`)
    lastLoggedError = error
  }
  const next: LolStatus = { ...current, updatedAt: Date.now() }
  if (error) next.error = error
  else delete next.error
  publishIfChanged(next)
}

// ---------------- ultima partida publicada (disco) ----------------

function lastGameFile(): string {
  return path.join(app.getPath('userData'), LAST_GAME_FILE)
}

async function loadLastEmitted(): Promise<void> {
  if (lastEmittedLoaded) return
  lastEmittedLoaded = true
  try {
    const raw = JSON.parse(await fs.readFile(lastGameFile(), 'utf-8')) as { key?: unknown }
    if (typeof raw?.key === 'string') lastEmittedKey = raw.key
  } catch {
    // Primeira vez, ou arquivo mexido: sem historico.
  }
}

async function persistLastEmitted(key: string): Promise<void> {
  try {
    await fs.writeFile(lastGameFile(), JSON.stringify({ key, at: new Date().toISOString() }))
  } catch {
    // Sem disco, sem memoria entre reaberturas. Continua funcionando.
  }
}

// ---------------- laco principal ----------------

export function startLolWatcher(): void {
  if (running) return
  if (process.platform !== 'win32') {
    // A LCU existe no macOS tambem, mas a descoberta (PowerShell, C:\) e toda
    // Windows — e o launcher so e empacotado pra Windows.
    current = idleStatus('A leitura do cliente do LoL so funciona no Windows')
    return
  }
  running = true
  discoveryMisses = 0
  const gen = ++generation
  void runTick(gen)
}

export function stopLolWatcher(): void {
  generation++
  running = false
  clearTimer()
  const wasConnected = session !== null
  session = null
  resolvingKey = null
  closeLcuAgents()
  if (wasConnected) {
    console.log('[lol] leitura do cliente parada')
    publishLolStatus(idleStatus())
  }
}

export async function refreshLolNow(): Promise<LolStatus> {
  if (!running) return current
  clearTimer()
  await runTick(generation)
  return current
}

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

/** Ciclos seguidos de descoberta sem cliente. Zera quando conecta. */
let discoveryMisses = 0

function discoveryInterval(): number {
  return discoveryMisses >= DISCOVERY_FAST_TICKS
    ? DISCOVERY_IDLE_INTERVAL_MS
    : DISCOVERY_INTERVAL_MS
}

function schedule(gen: number): void {
  if (gen !== generation) return
  clearTimer()
  timer = setTimeout(() => void runTick(gen), session ? POLL_INTERVAL_MS : discoveryInterval())
}

function runTick(gen: number): Promise<void> {
  chain = chain.then(() => tick(gen)).catch(() => undefined)
  return chain
}

async function tick(gen: number): Promise<void> {
  if (gen !== generation) return
  try {
    if (session) await pollConnected(session)
    else await discover()
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err))
  }
  schedule(gen)
}

// ---------------- descoberta ----------------

async function discover(): Promise<void> {
  // Relido a cada ciclo: a pessoa pode ter colado o caminho do lockfile agora.
  const settings = await loadSettings()
  if (!settings.lol.enabled) {
    stopLolWatcher()
    return
  }
  await loadLastEmitted()

  const outcome = await discoverLcu(settings.lol.lockfilePath)
  const creds = outcome.credentials
  if (!creds) {
    discoveryMisses += 1
    setError(outcome.error)
    return
  }
  discoveryMisses = 0

  // Valida de verdade: lockfile pode apontar pra uma porta que ninguem escuta.
  let rawPhase: unknown
  try {
    rawPhase = await lcuGet<unknown>(creds, '/lol-gameflow/v1/gameflow-phase')
  } catch (err) {
    if (err instanceof LcuHttpError) {
      if (err.status === 401 || err.status === 403) {
        setError(`O cliente recusou a senha (${creds.origin})`)
        return
      }
      // 404/500 com o cliente carregando: a LCU ja responde, entao conectou.
    } else {
      setError(`Nada responde na porta ${creds.port} (${creds.origin})`)
      return
    }
  }

  const s: Session = {
    creds,
    champions: null,
    riotIds: new Map(),
    failures: 0,
    lastPhase: null,
    lastLiveAt: 0
  }

  // Bloco de fim de jogo que ja estava la e de uma partida que nao vimos —
  // a menos que o cliente esteja NA tela de fim de jogo, ai e fresco.
  if (mapGameflowPhase(rawPhase) !== 'end-of-game') {
    s.staleEogGameId = await lcuGet<unknown>(creds, '/lol-end-of-game/v1/eog-stats-block')
      .then((block) => (isUsableEogBlock(block) ? block.gameId : undefined))
      .catch(() => undefined)
  }

  session = s
  lastLoggedError = null
  console.log(`[lol] cliente conectado na porta ${creds.port} (${creds.source})`)
  await pollConnected(s)
}

function disconnect(s: Session, reason?: string): void {
  if (session !== s) return
  session = null
  // Cliente fechou agora: volta a procurar rapido (pode ser so um restart).
  discoveryMisses = 0
  // Cliente caiu no meio da partida: o jogo pode continuar sem ele. Quem
  // decide o que fazer com ela e o proximo connect (ver pollConnected).
  if (s.game) orphanGame = s.game
  closeLcuAgents()
  console.log(`[lol] cliente fechou${reason ? ` (${reason})` : ''}`)
  publishLolStatus(idleStatus(reason))
}

// ---------------- poll conectado ----------------

async function pollConnected(s: Session): Promise<void> {
  let rawPhase: unknown
  try {
    rawPhase = await lcuGet<unknown>(s.creds, '/lol-gameflow/v1/gameflow-phase')
    s.failures = 0
  } catch (err) {
    if (err instanceof LcuHttpError) {
      // Senha velha = cliente reaberto por baixo de nos. Volta a descobrir.
      if (err.status === 401 || err.status === 403) disconnect(s, 'senha recusada')
      // Outro codigo: plugin ainda carregando. Mantem o ultimo status.
      return
    }
    if (++s.failures >= MAX_CONSECUTIVE_FAILURES) disconnect(s)
    return
  }
  if (session !== s) return

  const now = Date.now()
  const phase = mapGameflowPhase(rawPhase)
  const prevPhase = s.lastPhase

  // Ate logar, current-summoner vem vazio. Tenta a cada poll ate conseguir.
  if (!s.me) s.me = await fetchMe(s)

  // Partida orfa de um cliente que caiu: se ele voltou pro jogo, e a mesma
  // partida; se voltou pra qualquer outra fase, ela terminou sem nos.
  if (orphanGame) {
    if (phase === 'in-progress') s.game = orphanGame
    else startEogResolution(s, orphanGame)
    orphanGame = null
  }

  // Transicoes de partida — antes das leituras por fase, que limpam estado.
  if (prevPhase === 'in-progress' && phase !== 'in-progress' && s.game) {
    startEogResolution(s, s.game)
    s.game = undefined
  } else if (phase === 'end-of-game' && prevPhase !== 'end-of-game' && !s.game && !resolvingKey) {
    // Conectamos com o cliente ja na tela de fim de jogo (launcher aberto
    // depois da partida): o bloco ainda vale um card.
    startEogResolution(s, {
      key: `eog:${now}`,
      startedAt: current.clientRunning ? current.phaseSince : now,
      queue: s.lastQueue,
      champion: s.lastChampion,
      teammates: teammatesFromLobby(s)
    })
  }

  const next: LolStatus = {
    clientRunning: true,
    phase,
    phaseSince: current.clientRunning && current.phase === phase ? current.phaseSince : now,
    me: s.me,
    updatedAt: now
  }

  switch (phase) {
    case 'lobby':
    case 'matchmaking':
    case 'ready-check':
    case 'champ-select': {
      await readLobby(s)
      if (phase === 'champ-select') await readChampSelect(s)
      else s.lastChampion = undefined
      next.lobby = s.lastLobby
      next.queue = s.lastQueue
      next.champion = s.lastChampion
      s.eogGame = undefined
      break
    }
    case 'in-progress': {
      if (!s.game) s.game = await startGame(s, now)
      if (now - s.lastLiveAt >= LIVE_INTERVAL_MS) {
        s.lastLiveAt = now
        await pollLive(s, s.game)
      }
      next.lobby = s.lastLobby
      next.queue = s.game.queue
      next.champion = s.game.champion
      next.score = s.game.lastScore
      s.eogGame = undefined
      break
    }
    case 'end-of-game': {
      next.lobby = s.lastLobby
      next.queue = s.eogGame?.queue ?? s.lastQueue
      next.champion = s.eogGame?.champion ?? s.lastChampion
      break
    }
    default: {
      s.lastLobby = undefined
      s.lastQueue = undefined
      s.lastChampion = undefined
      s.eogGame = undefined
    }
  }

  s.lastPhase = phase
  publishIfChanged(next)
}

async function fetchMe(s: Session): Promise<LolLobbyMember | undefined> {
  try {
    const me = await lcuGet<LcuSummoner>(s.creds, '/lol-summoner/v1/current-summoner')
    const gameName = me?.gameName || me?.displayName
    if (!gameName) return undefined
    return {
      riotId: `${gameName}#${me.tagLine ?? ''}`,
      puuid: me.puuid || undefined,
      summonerId: me.summonerId || undefined
    }
  } catch {
    return undefined
  }
}

function teammatesFromLobby(s: Session): LolLobbyMember[] | undefined {
  const others = (s.lastLobby ?? []).filter((m) => m.riotId !== s.me?.riotId)
  return others.length > 0 ? others : undefined
}

async function championName(s: Session, championId: number): Promise<string | undefined> {
  if (championId <= 0) return undefined
  if (!s.champions) {
    try {
      const list = await lcuGet<LcuChampionSummary[]>(
        s.creds,
        '/lol-game-data/assets/v1/champion-summary.json'
      )
      s.champions = new Map(list.filter((c) => c.id > 0 && c.name).map((c) => [c.id, c.name]))
    } catch {
      return undefined
    }
  }
  return s.champions.get(championId)
}

/**
 * Riot ID de um membro do lobby. O DTO do lobby ja trouxe `gameName`/`gameTag`
 * em algumas versoes e so `summonerName` em outras; quando nada serve, pergunta
 * ao cliente pelo puuid (uma vez por pessoa por sessao).
 */
async function memberRiotId(s: Session, m: LcuLobbyMember): Promise<string | null> {
  const tag = m.gameTag ?? m.tagLine
  if (m.gameName && tag) return `${m.gameName}#${tag}`
  if (m.summonerName?.includes('#')) return m.summonerName

  if (m.puuid) {
    const cached = s.riotIds.get(m.puuid)
    if (cached) return cached
    try {
      const summoner = await lcuGet<LcuSummoner>(
        s.creds,
        `/lol-summoner/v2/summoners/puuid/${encodeURIComponent(m.puuid)}`
      )
      if (summoner?.gameName && summoner.tagLine) {
        const riotId = `${summoner.gameName}#${summoner.tagLine}`
        s.riotIds.set(m.puuid, riotId)
        return riotId
      }
    } catch {
      // Cai pro nome sem tag abaixo.
    }
  }
  return m.gameName || m.summonerName || null
}

async function readLobby(s: Session): Promise<void> {
  try {
    const lobby = await lcuGet<LcuLobby>(s.creds, '/lol-lobby/v2/lobby')
    const queueId = lobby?.gameConfig?.queueId
    if (lobby?.gameConfig?.isCustom) s.lastQueue = queueName(0)
    else if (typeof queueId === 'number' && queueId >= 0) s.lastQueue = queueName(queueId)

    const members: LolLobbyMember[] = []
    for (const m of lobby?.members ?? []) {
      if (m.isBot) continue
      const riotId = await memberRiotId(s, m)
      if (!riotId) continue
      members.push({ riotId, puuid: m.puuid || undefined, summonerId: m.summonerId || undefined })
    }
    s.lastLobby = members
  } catch (err) {
    // 404 = sem lobby (a fase virou entre as duas leituras). Conexao caida o
    // proximo poll da fase pega.
    if (err instanceof LcuHttpError && err.status === 404) {
      s.lastLobby = undefined
      s.lastQueue = undefined
    }
  }
}

async function readChampSelect(s: Session): Promise<void> {
  try {
    const cs = await lcuGet<LcuChampSelectSession>(s.creds, '/lol-champ-select/v1/session')
    const mine = cs?.myTeam?.find((p) => p.cellId === cs.localPlayerCellId)
    // championId fica 0 ate travar; a intencao (hover) ja diz o que vem.
    const championId = mine?.championId || mine?.championPickIntent || 0
    const name = await championName(s, championId)
    if (name) s.lastChampion = name
  } catch {
    // 404 na virada de fase. Fica o que tinha.
  }
}

/**
 * Comeco de partida: junta o que o lobby e o champ select deixaram com o que
 * a sessao do gameflow sabe (gameId, fila e campeao — este ultimo importa
 * quando o launcher abriu com o jogo ja rolando).
 */
async function startGame(s: Session, now: number): Promise<PendingGame> {
  const game: PendingGame = {
    key: `start:${now}`,
    startedAt: now,
    queue: s.lastQueue,
    champion: s.lastChampion,
    teammates: teammatesFromLobby(s)
  }
  try {
    const flow = await lcuGet<LcuGameflowSession>(s.creds, '/lol-gameflow/v1/session')
    const data = flow?.gameData
    if (typeof data?.gameId === 'number' && data.gameId > 0) {
      game.gameId = data.gameId
      game.key = String(data.gameId)
      // A mesma partida voltou (jogo caiu, fase passou por 'none', pessoa
      // reconectou): ela nao terminou, entao cancela a espera pelo bloco de
      // fim de jogo — senao ela estouraria em 'unknown' e engoliria o
      // resultado de verdade.
      if (resolvingKey === game.key) resolvingKey = null
    }
    if (typeof data?.queue?.id === 'number' && data.queue.id >= 0) game.queue = queueName(data.queue.id)
    if (!game.champion && s.me?.puuid) {
      const mine = data?.playerChampionSelections?.find((p) => p.puuid === s.me?.puuid)
      if (mine?.championId) game.champion = await championName(s, mine.championId)
    }
  } catch {
    // Sem sessao do gameflow: segue com o que o lobby deu.
  }
  return game
}

function livePlayerMatches(p: LivePlayer, riotId?: string, summonerName?: string): boolean {
  const fromParts =
    p.riotIdGameName && p.riotIdTagLine ? `${p.riotIdGameName}#${p.riotIdTagLine}` : undefined
  const candidates = [p.riotId, fromParts, p.summonerName].filter(Boolean)
  return candidates.some((c) => c === riotId || c === summonerName)
}

/**
 * Placar ao vivo, direto do JOGO. Antes do jogo abrir a porta 2999 recusa
 * conexao — normal na tela de carregamento, por isso tudo aqui e silencioso.
 */
async function pollLive(s: Session, game: PendingGame): Promise<void> {
  const [activeResult, statsResult] = await Promise.allSettled([
    liveGet<LiveActivePlayer>('/liveclientdata/activeplayer'),
    liveGet<LiveGameStats>('/liveclientdata/gamestats')
  ])
  if (activeResult.status !== 'fulfilled' || !activeResult.value) return
  const active = activeResult.value

  const riotId =
    active.riotId ||
    (active.riotIdGameName && active.riotIdTagLine
      ? `${active.riotIdGameName}#${active.riotIdTagLine}`
      : undefined) ||
    active.summonerName ||
    s.me?.riotId

  let scores: LivePlayerScores | undefined
  if (riotId) {
    scores = await liveGet<LivePlayerScores>(
      `/liveclientdata/playerscores?riotId=${encodeURIComponent(riotId)}`
    ).catch(() => undefined)
    if (!scores) {
      // Patch antigo: o parametro era summonerName, sem a tag.
      const legacyName = active.summonerName || riotId.split('#')[0]
      scores = await liveGet<LivePlayerScores>(
        `/liveclientdata/playerscores?summonerName=${encodeURIComponent(legacyName)}`
      ).catch(() => undefined)
    }
  }

  if (!game.champion) {
    const players = await liveGet<LivePlayer[]>('/liveclientdata/playerlist').catch(() => undefined)
    const self = players?.find((p) => livePlayerMatches(p, riotId, active.summonerName))
    if (self?.championName) game.champion = self.championName
  }

  const prev = game.lastScore
  if (!scores && !prev) return

  const gameTime =
    statsResult.status === 'fulfilled' && typeof statsResult.value?.gameTime === 'number'
      ? Math.round(statsResult.value.gameTime)
      : prev?.gameTimeSec

  game.lastScore = {
    kills: scores?.kills ?? prev?.kills ?? 0,
    deaths: scores?.deaths ?? prev?.deaths ?? 0,
    assists: scores?.assists ?? prev?.assists ?? 0,
    cs: scores?.creepScore ?? prev?.cs,
    gold: typeof active.currentGold === 'number' ? Math.round(active.currentGold) : prev?.gold,
    level: active.level ?? prev?.level,
    gameTimeSec: gameTime
  }
}

// ---------------- fim de partida ----------------

function startEogResolution(s: Session, game: PendingGame): void {
  if (lastEmittedKey === game.key || resolvingKey === game.key) return
  resolvingKey = game.key
  s.eogGame = game
  void resolveEog(s, game, generation)
}

/**
 * O bloco certo e o da NOSSA partida: pelo gameId quando o gameflow nos deu
 * um; senao, qualquer bloco que nao seja o que ja estava la ao conectar nem o
 * ultimo que publicamos.
 */
function blockMatches(s: Session, game: PendingGame, block: EogStatsBlock): boolean {
  if (game.gameId) return block.gameId === game.gameId
  return block.gameId !== s.staleEogGameId && String(block.gameId) !== lastEmittedKey
}

async function resolveEog(s: Session, game: PendingGame, gen: number): Promise<void> {
  const deadline = Date.now() + EOG_MAX_WAIT_MS
  while (
    gen === generation &&
    session === s &&
    resolvingKey === game.key &&
    Date.now() < deadline
  ) {
    try {
      const block = await lcuGet<unknown>(s.creds, '/lol-end-of-game/v1/eog-stats-block')
      if (isUsableEogBlock(block) && blockMatches(s, game, block)) {
        emitResult(game, eogToResult(block, { queue: game.queue, champion: game.champion }))
        return
      }
    } catch {
      // 404 ate o bloco existir (WaitingForStats). Conexao caida o laco
      // principal trata; aqui so esperamos.
    }
    await sleep(EOG_INTERVAL_MS)
  }

  // Watcher parado ou espera cancelada (partida voltou): nada pela metade.
  if (gen !== generation || resolvingKey !== game.key) return
  // Cliente fechou ou o bloco nunca veio: sai com o que o placar ao vivo deixou.
  emitResult(game, unknownResult(game))
}

function unknownResult(game: PendingGame): LolGameResult {
  const now = Date.now()
  const score = game.lastScore
  return {
    gameId: game.gameId,
    queue: game.queue,
    result: 'unknown',
    champion: game.champion,
    kills: score?.kills ?? 0,
    deaths: score?.deaths ?? 0,
    assists: score?.assists ?? 0,
    cs: score?.cs,
    gold: score?.gold,
    durationSec: score?.gameTimeSec ?? Math.max(0, Math.round((now - game.startedAt) / 1000)),
    teammates: game.teammates,
    endedAt: now
  }
}

function emitResult(game: PendingGame, result: LolGameResult): void {
  if (resolvingKey === game.key) resolvingKey = null
  const key = result.gameId ? String(result.gameId) : game.key
  if (lastEmittedKey === key) return
  lastEmittedKey = key
  void persistLastEmitted(key)

  const minutes = Math.round(result.durationSec / 60)
  console.log(
    `[lol] partida terminou: ${result.result} ${result.kills}/${result.deaths}/${result.assists}` +
      `${result.champion ? ` de ${result.champion}` : ''}` +
      ` (${result.queue ?? 'fila ?'}, ${minutes}min${result.gameId ? `, gameId=${result.gameId}` : ''})`
  )
  publishLolGameEnded(result)
}
