import { request } from './api'

/**
 * Contrato com os eventos `board:*` do socket (xadrez e dama). Os tipos são
 * CÓPIA dos da API (src/lib/board/types.ts), sem import cruzado: mexeu lá,
 * mexe aqui. O jogo anda por socket; o REST é só o histórico.
 *
 * Notação de lance. Xadrez: UCI (`e2e4`, promoção `e7e8q`). Dama: casas
 * algébricas; simples `c3-d4`; captura com o caminho inteiro `c3xe5xg7`.
 */

export type Side = 'white' | 'black'
export type BoardGame = 'chess' | 'draughts'
export type DraughtsVariant = 'br' | 'us'
export type ClockId = '1+0' | '1+1' | '3+0' | '3+2' | '5+0' | '10+0'
export type BoardPhase = 'open' | 'invited' | 'pending' | 'playing' | 'finished'

export interface BoardPerson { userId: string; displayName: string; avatar: string | null }

export interface LobbyBoardTable {
  id: string
  game: BoardGame
  variant: DraughtsVariant | null
  clock: ClockId
  stake: number
  phase: BoardPhase
  host: BoardPerson
  invited: BoardPerson | null
  white: BoardPerson | null
  black: BoardPerson | null
  /** Pessoas na sala que não são jogadores. */
  spectators: number
  /** Soma das apostas de espectador. */
  pool: number
  createdAt: number
}

export interface BoardBetView { userId: string; displayName: string; side: Side; amount: number; payout: number | null }

export interface BoardResultView {
  winner: Side | null
  /** checkmate | stalemate | repetition | fifty | insufficient | no-moves | kings-20 | timeout | resign | agreement */
  reason: string
  xp: { white: number; black: number }
}

export interface BoardAnalysisView {
  accuracy: { white: number; black: number }
  ratingEst: { white: number | null; black: number | null }
}

export interface BoardTableView extends LobbyBoardTable {
  /** Xadrez: FEN. Dama: 64 caracteres (fileira 8→1, coluna a→h; '.', 'w', 'W', 'b', 'B') + ' ' + 'w'|'b'. */
  position: string
  turn: Side
  /** Só vem preenchido para quem está na vez; para os outros, []. */
  legalMoves: string[]
  moves: string[]
  lastMove: string | null
  /** Milissegundos restantes de cada lado no instante `clockAt` (relógio do servidor). */
  clocks: { white: number; black: number }
  clockAt: number
  /** Falso antes do primeiro lance e depois do fim. */
  clockRunning: boolean
  ready: { white: boolean; black: boolean }
  /** Fase pending: quando a partida começa sozinha. */
  startsAt: number | null
  bets: BoardBetView[]
  drawOfferBy: Side | null
  result: BoardResultView | null
  analysis: BoardAnalysisView | null
  mySide: Side | null
  myBet: { side: Side; amount: number } | null
  /** Teto de aposta de quem está vendo. */
  betLimit: number
}

export interface BoardAck { ok: boolean; error?: string; table?: BoardTableView }

export interface BoardInvite {
  tableId: string
  from: BoardPerson
  game: BoardGame
  variant: DraughtsVariant | null
  clock: ClockId
  stake: number
  expiresAt: number
}

export interface BoardCardMeta {
  matchId: string
  game: BoardGame
  variant: DraughtsVariant | null
  clock: ClockId
  white: BoardPerson
  black: BoardPerson
  winner: Side | null
  reason: string
  plies: number
  stake: number
  pool: number
  xp: { white: number; black: number }
  analysis: BoardAnalysisView | null
}

// ============================================
// Constantes e rótulos
// ============================================

/** Os relógios aceitos pelo servidor, do mais curto pro mais longo. */
export const BOARD_CLOCKS: readonly ClockId[] = ['1+0', '1+1', '3+0', '3+2', '5+0', '10+0']

// Cores: `white` é "quem joga primeiro"; na dama americana isso é o lado escuro.
export { sideIsLight, sideLabel } from './board-sides'

export const BOARD_ROUTE: Record<BoardGame, string> = { chess: '/xadrez', draughts: '/dama' }

export function boardGameLabel(game: BoardGame, variant: DraughtsVariant | null): string {
  if (game === 'chess') return 'Xadrez'
  return variant === 'us' ? 'Dama americana' : 'Dama brasileira'
}

const REASON_LABEL: Record<string, string> = {
  checkmate: 'mate',
  stalemate: 'afogamento',
  repetition: 'repetição',
  fifty: '50 lances',
  insufficient: 'material insuficiente',
  'no-moves': 'sem lances',
  'kings-20': '20 lances de dama',
  timeout: 'tempo',
  resign: 'desistência',
  agreement: 'acordo',
  'settle-error': 'erro no acerto'
}

export function boardReasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason
}

// ============================================
// REST
// ============================================

export interface BoardHistoryEntry {
  id: string
  game: BoardGame
  variant: DraughtsVariant | null
  clock: ClockId
  stake: number
  whiteId: string
  blackId: string
  winner: Side | null
  reason: string | null
  plies: number
  endedAt: string | null
  whiteAccuracy: number | null
  blackAccuracy: number | null
  whiteRatingEst: number | null
  blackRatingEst: number | null
}

export const board = {
  history: (token: string) =>
    request<{ matches: BoardHistoryEntry[] }>('/board/history', { token }).then((r) => r.matches)
}
