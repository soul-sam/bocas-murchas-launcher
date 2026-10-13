import { request } from './api'
import type { PokerReaction, Watcher } from './api-poker'

/**
 * Contrato com /api/cartas e com os eventos `cartas:*` do socket — TRUCO
 * (paulista e mineiro) e CACHETA. Ver lib/cartas na API: a mesa genérica em
 * table.ts, a regra de cada jogo no seu motor (truco.ts, cacheta.ts). As
 * vistas abaixo são CÓPIA dos tipos de lá; mudou lá, muda aqui.
 *
 *   GET /cartas/rules                         -> { stakes, seats, timers, cachetaPoints, ... }
 *   GET /cartas/me?game=truco|cacheta         -> { stats }
 *   GET /cartas/leaderboard?game&period       -> { entries }
 *
 * As cartas usam o mesmo código do pôquer ("Ah", "Td"): o desenho é o mesmo
 * PlayingCard.
 */

export type CardGame = 'truco' | 'cacheta'
export type TrucoVariant = 'paulista' | 'mineiro'
export type CartasSpeed = 'normal' | 'turbo'

export interface CartasStake {
  id: string
  name: string
  /** Murchos que CADA um casa ao começar a partida. */
  amount: number
}

export interface CartasAck {
  ok: boolean
  error?: string
  throttled?: boolean
  retryAfterMs?: number
  tableId?: string
  table?: CartasTableView
}

// ============================================
// A MESA (lib/cartas/table.ts)
// ============================================

export interface CartasLobbyTable {
  id: string
  game: CardGame
  variant: TrucoVariant | null
  name: string
  stakeId: string
  stake: number
  speed: CartasSpeed
  maxSeats: number
  startPoints: number
  seated: number
  players: Array<{ userId: string; displayName: string; avatar: string | null }>
  status: 'waiting' | 'playing' | 'closed'
  playing: boolean
  matchNumber: number
  createdById: string
  createdAt: number
  /** "7 x 4" no truco; "3 de pé" na cacheta. */
  summary: string | null
}

export interface CartasSeatView {
  index: number
  userId: string
  displayName: string
  avatar: string | null
  connected: boolean
  /** Jogando no relógio curto (caiu, ou dormiu duas vezes). */
  auto: boolean
  team: 0 | 1 | null
  inMatch: boolean
  /** Vitórias nesta mesa. */
  wins: number
}

export interface CartasOutcome {
  matchId: string
  winners: number[]
  share: number
  pot: number
  names: string[]
  at: number
}

export interface CartasTableView {
  id: string
  game: CardGame
  variant: TrucoVariant | null
  name: string
  stake: CartasStake
  speed: CartasSpeed
  maxSeats: number
  startPoints: number
  status: 'waiting' | 'playing' | 'closed'
  playing: boolean
  canStart: boolean
  needed: number
  createdById: string
  seats: (CartasSeatView | null)[]
  mySeat: number | null
  matchId: string | null
  matchNumber: number
  deadline: number | null
  timerMs: number
  toAct: number[]
  pot: number
  match: TrucoView | CachetaView | null
  outcome: CartasOutcome | null
  spectators: number
  watchers: Watcher[]
}

// ============================================
// TRUCO (lib/cartas/truco.ts)
// ============================================

export type TrucoCall = 'truco' | 'seis' | 'nove' | 'doze'
export type Team = 0 | 1
export type TrucoHandReason = 'vazas' | 'correu' | 'empate' | 'recusou' | 'abandono'

export interface TrucoEvent {
  seq: number
  at: number
  kind: 'deal' | 'play' | 'truco' | 'accept' | 'run' | 'raise' | 'decide' | 'round' | 'hand'
  seat?: number
  /** play: a carta (null se coberta); deal: a vira (paulista). */
  card?: string | null
  covered?: boolean
  value?: number
  name?: TrucoCall
  team?: Team | null
  points?: number
  /** decide: jogou (true) ou correu (false). */
  play?: boolean
  round?: number
  reason?: TrucoHandReason
}

export interface TrucoLegal {
  play: boolean
  cover: boolean
  truco: boolean
  accept: boolean
  run: boolean
  raise: boolean
  decide: boolean
  /** Mão de ferro: joga-se pela posição, às cegas. */
  blind: boolean
}

export interface TrucoPlay {
  seat: number
  card: string | null
  covered: boolean
}

export interface TrucoRound {
  starter: number
  plays: TrucoPlay[]
  winnerTeam: Team | null
  done: boolean
  winnerSeat: number | null
}

export interface TrucoView {
  game: 'truco'
  variant: TrucoVariant
  score: [number, number]
  target: 12
  teams: [number[], number[]]
  myTeam: Team | null
  handNumber: number
  dealer: number
  vira: string | null
  /** As quatro manilhas, da mais forte pra mais fraca. */
  manilhas: string[]
  value: number
  nextValue: number | null
  nextName: TrucoCall | null
  special: 'normal' | 'onze' | 'ferro'
  specialTeam: Team | null
  phase: 'decide' | 'play' | 'truco' | 'done' | 'over'
  pending: { byTeam: Team; bySeat: number; value: number; name: TrucoCall } | null
  turn: number | null
  round: number
  rounds: TrucoRound[]
  hands: Record<number, { count: number; cards: string[] | null }>
  legal: TrucoLegal | null
  result: { winnerTeam: Team | null; points: number; reason: TrucoHandReason } | null
  over: { winnerTeam: Team } | null
  log: TrucoEvent[]
}

export type TrucoAction =
  | { type: 'play'; card: string; covered?: boolean }
  | { type: 'play'; index: number }
  | { type: 'truco' }
  | { type: 'accept' }
  | { type: 'run' }
  | { type: 'raise' }
  | { type: 'decide'; play: boolean }

export const TRUCO_CALL_LABEL: Record<TrucoCall, string> = {
  truco: 'Truco',
  seis: 'Seis',
  nove: 'Nove',
  doze: 'Doze'
}

/** O que o grito pede, com o valor: "TRUCO!", "SEIS!"… */
export function trucoShout(name: TrucoCall): string {
  return `${TRUCO_CALL_LABEL[name].toUpperCase()}!`
}

export const VARIANT_LABEL: Record<TrucoVariant, string> = {
  paulista: 'Paulista',
  mineiro: 'Mineiro'
}

export const TRUCO_REASON_LABEL: Record<TrucoHandReason, string> = {
  vazas: 'nas vazas',
  correu: 'o outro lado correu',
  empate: 'empatou tudo',
  recusou: 'correram da mão de onze',
  abandono: 'abandono'
}

// ============================================
// CACHETA (lib/cartas/cacheta.ts)
// ============================================

export interface CachetaEvent {
  seq: number
  at: number
  kind: 'deal' | 'draw' | 'discard' | 'knock' | 'reshuffle' | 'eliminated' | 'round'
  seat?: number
  round?: number
  from?: 'stock' | 'discard'
  card?: string
  with10?: boolean
  lost?: Record<number, number>
}

export interface CachetaLegal {
  draw: boolean
  drawDiscard: boolean
  discard: boolean
  forbiddenDiscard: string | null
  knockTen: boolean
  /** Cartas que, descartadas, deixam bater com nove. */
  knockNine: string[]
}

export interface CachetaResult {
  winner: number | null
  with10: boolean
  melds: string[][]
  discard: string | null
  lost: Record<number, number>
  eliminated: number[]
  hands: Record<number, string[]>
}

export interface CachetaView {
  game: 'cacheta'
  roundNumber: number
  dealer: number
  startPoints: number
  players: Record<number, { points: number; out: boolean; cardCount: number }>
  vira: string | null
  wild: { rank: string; color: 'red' | 'black'; cards: string[] } | null
  stockCount: number
  discardTop: string | null
  discardCount: number
  discardRecent: string[]
  turn: number | null
  phase: 'draw' | 'discard' | 'done' | 'over'
  myHand: string[] | null
  myArrangement: { melds: string[][]; loose: string[] } | null
  legal: CachetaLegal | null
  lastDraw: { seat: number; from: 'stock' | 'discard'; card: string | null } | null
  result: CachetaResult | null
  over: { winner: number } | null
  log: CachetaEvent[]
}

export type CachetaAction =
  | { type: 'draw'; from: 'stock' | 'discard' }
  | { type: 'discard'; card: string }
  | { type: 'knock'; discard?: string }

export function isTruco(view: CartasTableView['match']): view is TrucoView {
  return !!view && view.game === 'truco'
}

export function isCacheta(view: CartasTableView['match']): view is CachetaView {
  return !!view && view.game === 'cacheta'
}

// ============================================
// REST
// ============================================

export interface CartasRules {
  stakes: CartasStake[]
  seats: Record<CardGame, number[]>
  timers: Record<CardGame, Record<CartasSpeed, number>>
  cachetaPoints: number[]
  autoTurnMs: number
  missedTurnsToAuto: number
}

export interface CartasStats {
  matches: number
  wins: number
  net: number
}

export interface CartasLeaderboardEntry {
  rank: number
  userId: string
  matches: number
  wins: number
  net: number
  user: { id: string; displayName: string; avatar: string | null; profileColor: string | null } | null
}

export const cartas = {
  rules: (token: string) => request<CartasRules>('/cartas/rules', { token }),
  me: (token: string, game: CardGame) =>
    request<{ stats: CartasStats }>(`/cartas/me?game=${game}`, { token }).then((r) => r.stats),
  leaderboard: (token: string, game: CardGame, period: 'week' | 'all') =>
    request<{ entries: CartasLeaderboardEntry[] }>(`/cartas/leaderboard?game=${game}&period=${period}`, { token }).then(
      (r) => r.entries
    )
}

// ============================================
// Ajudantes de tela
// ============================================

export const GAME_LABEL: Record<CardGame, string> = {
  truco: 'Truco',
  cacheta: 'Cacheta'
}

export const CARTAS_SPEED_LABEL: Record<CartasSpeed, string> = {
  normal: 'Normal',
  turbo: 'Turbo'
}

/** "Truco paulista", "Truco mineiro", "Cacheta". */
export function tableKind(t: { game: CardGame; variant: TrucoVariant | null }): string {
  if (t.game === 'truco') return `Truco ${t.variant === 'mineiro' ? 'mineiro' : 'paulista'}`
  return 'Cacheta'
}

/** "valendo 500" ou "amistosa". */
export function stakeLabel(amount: number): string {
  return amount > 0 ? `valendo ${amount.toLocaleString('pt-BR')}` : 'amistosa'
}

export type { PokerReaction as CartasReaction }
