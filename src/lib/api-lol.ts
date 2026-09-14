import { request } from './api'

/**
 * MURAL DO LOL — chamadas ao /api/lol.
 *
 * O servidor manda o painel PRONTO: cada recorte já vem contado, encolhido e
 * ordenado. O launcher não recalcula nada em cima disso — ele tem as últimas
 * 50 mensagens do canal, não as 800 partidas, e qualquer conta feita aqui
 * seria uma conta sobre um pedaço do histórico.
 *
 * O que este arquivo faz além de buscar: transformar número em texto legível
 * (winrate, KDA, duração, milhares) uma vez só, pra que cada tabela não invente
 * o próprio jeito de arredondar.
 */

export interface LolPlayerRef {
  id: string
  displayName: string
  avatar?: string | null
  profileColor?: string | null
}

/** Média que sabe de quantas partidas ela saiu. */
export interface LolAvg {
  value: number | null
  sample: number
}

export interface LolMatchWire {
  id: string
  userId: string
  user: LolPlayerRef | null
  champion: string | null
  queue: string | null
  /** Nome da fila já resolvido pelo servidor (o cliente do LoL é quem sabe). */
  queueLabel: string | null
  result: 'win' | 'loss' | 'remake' | 'unknown'
  kills: number
  deaths: number
  assists: number
  kda: number
  perfect: boolean
  durationSec: number
  startedAt: string
  endedAt: string
  messageId: string | null
  /** Nota de atuação (0–100) comparada com as outras partidas do filtro. */
  score: number | null
  cs: number | null
  gold: number | null
  damage: number | null
  damageTaken: number | null
  visionScore: number | null
  wardsPlaced: number | null
  wardsKilled: number | null
  turrets: number | null
  deadSeconds: number | null
  largestSpree: number | null
  doubleKills: number | null
  tripleKills: number | null
  quadraKills: number | null
  pentaKills: number | null
  csPerMin: number | null
  goldPerMin: number | null
  damagePerMin: number | null
  visionPerMin: number | null
  killParticipation: number | null
  damageShare: number | null
  deathShare: number | null
  deadShare: number | null
  teamKills: number | null
  teamDeaths: number | null
}

export interface LolGroupRow {
  key: string
  label: string
  games: number
  wins: number
  losses: number
  remakes: number
  unknown: number
  decided: number
  winrate: number | null
  /** Winrate encolhido contra a média — é o que ordena ranking honesto. */
  adjWinrate: number | null
  kills: number
  deaths: number
  assists: number
  kda: number
  avgScore: number | null
  csPerMin: number | null
  goldPerMin: number | null
  damagePerMin: number | null
  visionPerMin: number | null
  killParticipation: number | null
  damageShare: number | null
  deathShare: number | null
  avgDurationSec: number | null
  pentaKills: number
  quadraKills: number
  tripleKills: number
  doubleKills: number
  perfectGames: number
  lastPlayedAt: number | null
  user?: LolPlayerRef | null
}

export interface LolStreakRow {
  userId: string
  user: LolPlayerRef | null
  current: number
  bestWin: number
  worstLoss: number
  lastPlayedAt: number | null
}

export interface LolDuoRow {
  key: string
  a: LolPlayerRef | null
  b: LolPlayerRef | null
  games: number
  wins: number
  losses: number
  winrate: number | null
  adjWinrate: number | null
  lift: number | null
}

export interface LolInsight {
  id: string
  tone: 'good' | 'bad' | 'neutral'
  title: string
  detail: string
  sample: number
  delta: number | null
}

export interface LolRecord {
  key: string
  label: string
  value: number
  format: 'number' | 'duration'
  match: LolMatchWire
}

export interface LolStats {
  filters: Record<string, unknown>
  totals: {
    games: number
    wins: number
    losses: number
    remakes: number
    unknown: number
    decided: number
    winrate: number | null
    players: number
    champions: number
    kills: number
    deaths: number
    assists: number
    kda: number
    perGame: { kills: number; deaths: number; assists: number } | null
    playtimeSec: number
    pentaKills: number
    quadraKills: number
    tripleKills: number
    doubleKills: number
    perfectGames: number
    deadSec: number
    /** Bateu no teto de partidas por consulta: o período é maior que a amostra. */
    truncated: boolean
    /** Partidas que têm a ficha do fim de jogo (CS, dano, visão…). */
    withStats: number
    /** Partidas que têm também os totais do time (participação, fatia do dano). */
    withTeamStats: number
    /** Partidas de TFT que ficaram de fora — não são LoL. */
    tftIgnored: number
  }
  averages: Record<string, LolAvg>
  players: LolGroupRow[]
  champions: LolGroupRow[]
  queues: LolGroupRow[]
  hours: LolGroupRow[]
  weekdays: LolGroupRow[]
  dayparts: LolGroupRow[]
  durations: LolGroupRow[]
  marathon: Array<{ bucket: string; games: number; wins: number; winrate: number | null }>
  timeline: Array<{ day: string; games: number; wins: number; losses: number }>
  streaks: LolStreakRow[]
  duos: LolDuoRow[]
  best: LolMatchWire[]
  worst: LolMatchWire[]
  records: LolRecord[]
  insights: LolInsight[]
}

export interface LolFilterOptions {
  players: Array<LolPlayerRef & { games: number }>
  champions: Array<{ name: string; games: number }>
  queues: Array<{ id: string; label: string; games: number }>
  since: string | null
}

export type LolPeriod = '24h' | '7d' | '30d' | '90d' | '365d' | 'all'

export const LOL_PERIODS: Array<{ id: LolPeriod; label: string }> = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' },
  { id: '365d', label: '1 ano' },
  { id: 'all', label: 'Tudo' }
]

export type LolSort =
  | 'recent'
  | 'score'
  | 'kda'
  | 'kills'
  | 'deaths'
  | 'assists'
  | 'damage'
  | 'damagePerMin'
  | 'cs'
  | 'csPerMin'
  | 'gold'
  | 'vision'
  | 'duration'
  | 'killParticipation'

export interface LolQuery {
  period?: LolPeriod
  users?: string[]
  champions?: string[]
  queues?: string[]
  results?: string[]
  group?: boolean
}

function toParams(query: LolQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.period) params.set('period', query.period)
  if (query.users?.length) params.set('users', query.users.join(','))
  if (query.champions?.length) params.set('champions', query.champions.join(','))
  if (query.queues?.length) params.set('queues', query.queues.join(','))
  if (query.results?.length) params.set('results', query.results.join(','))
  if (query.group) params.set('group', '1')
  // O servidor roda em UTC e o grupo joga de madrugada: sem o fuso daqui, a
  // pergunta "qual o melhor horário" sai deslocada em três horas.
  params.set('tz', String(new Date().getTimezoneOffset()))
  return params
}

export const lol = {
  async options(token: string): Promise<LolFilterOptions> {
    return request<LolFilterOptions>('/lol/filters', { token })
  },

  async stats(token: string, query: LolQuery): Promise<LolStats> {
    return request<LolStats>(`/lol/stats?${toParams(query).toString()}`, { token })
  },

  async matches(
    token: string,
    query: LolQuery & { sort?: LolSort; order?: 'asc' | 'desc'; limit?: number; offset?: number }
  ): Promise<{ total: number; matches: LolMatchWire[]; sort: string; order: string }> {
    const params = toParams(query)
    if (query.sort) params.set('sort', query.sort)
    if (query.order) params.set('order', query.order)
    if (query.limit) params.set('limit', String(query.limit))
    if (query.offset) params.set('offset', String(query.offset))
    return request(`/lol/matches?${params.toString()}`, { token })
  }
}

// ============================================
// NÚMERO VIRANDO TEXTO
// ============================================

/** `null` vira travessão em toda a interface: campo vazio nunca vira zero. */
export const DASH = '—'

export function fmtPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH
  return `${(value * 100).toFixed(digits)}%`
}

export function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH
  return value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function fmtCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`
  return String(Math.round(value))
}

export function fmtDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec) || sec <= 0) return DASH
  const total = Math.round(sec)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Tempo longo em linguagem de gente: "3 h de partida", "2 d 4 h". */
export function fmtPlaytime(sec: number | null | undefined): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return DASH
  const hours = sec / 3600
  if (hours < 1) return `${Math.round(sec / 60)} min`
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)} h`
  return `${Math.floor(hours / 24)} d ${Math.round(hours % 24)} h`
}

export function fmtKda(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH
  return value.toFixed(2)
}

/** Nome de fila do jeito que a galera chama. */
const QUEUE_LABEL: Record<string, string> = {
  ranked_solo: 'Ranked Solo',
  ranked_flex: 'Ranked Flex',
  normal_draft: 'Normal',
  normal_blind: 'Normal (blind)',
  aram: 'ARAM',
  arena: 'Arena',
  tft: 'TFT',
  custom: 'Personalizada',
  urf: 'URF',
  coop: 'Coop vs IA',
  tutorial: 'Tutorial'
}

/**
 * Só para quando o servidor não mandou rótulo (cliente velho). A verdade sobre
 * nome de fila mora no servidor, que por sua vez prefere o nome que o cliente
 * do LoL deu — a tabela aqui embaixo é a última reserva.
 */
export function lolQueueLabel(queue: string | null | undefined): string {
  if (!queue) return 'Sem fila'
  const known = QUEUE_LABEL[queue]
  if (known) return known
  const id = /^queue_(\d+)$/.exec(queue)
  return id ? `Fila ${id[1]}` : queue.replace(/_/g, ' ')
}

export const RESULT_LABEL: Record<LolMatchWire['result'], string> = {
  win: 'Vitória',
  loss: 'Derrota',
  remake: 'Remake',
  unknown: 'Sem fim'
}
