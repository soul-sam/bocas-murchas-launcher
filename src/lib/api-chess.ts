import { request } from './api'

/**
 * Contrato com /api/chess (modules/chess.ts + chess.routes.ts no backend).
 *
 *   POST   /chess/link { username } -> { profile, games }   400 inválido/já vinculado, 404 não existe, 409 de outro, 503 Chess.com fora
 *   DELETE /chess/link              -> 204
 *   GET    /chess/me                -> { profile|null, games }
 *   GET    /chess/user/:id          -> { profile|null, games }
 *   POST   /chess/sync              -> { profile, games, newGames }   429 1/min, 503 Chess.com fora
 *
 * Socket `chess:profile` (sala da própria pessoa) manda um ChessProfile novo
 * depois de cada sync que achou partida.
 */

export type ChessTimeClass = 'bullet' | 'blitz' | 'rapid'
export type ChessResult = 'win' | 'loss' | 'draw'

export interface ChessRating {
  rating: number
  w: number
  l: number
  d: number
}

export interface ChessProfile {
  userId: string
  username: string
  avatar: string | null
  linkedAt: string
  lastSyncAt: string | null
  ratings: { bullet: ChessRating | null; blitz: ChessRating | null; rapid: ChessRating | null }
  chessGames: number
  chessWins: number
}

export interface ChessGame {
  id: string
  uuid: string
  url: string
  timeClass: ChessTimeClass
  rules: string
  rated: boolean
  color: 'white' | 'black'
  result: ChessResult
  resultCode: string
  opponent: string
  opponentRating: number
  ratingAfter: number
  accuracy: number | null
  endedAt: string
  imported: boolean
  xpAwarded: number
  coinsAwarded: number
}

export interface ChessCardMeta {
  gameId: string
  userId: string
  timeClass: 'blitz' | 'rapid'
  rules: string
  rated: boolean
  result: ChessResult
  resultCode: string
  color: 'white' | 'black'
  opponent: string
  opponentRating: number
  ratingAfter: number
  ratingDelta: number | null
  accuracy: number | null
  url: string
  xpAwarded: number
  coinsAwarded: number
}

export interface ChessPayload {
  profile: ChessProfile | null
  games: ChessGame[]
}

export const TIME_CLASS_LABEL: Record<ChessTimeClass, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid'
}

export const CHESS_RESULT_LABEL: Record<ChessResult, string> = {
  win: 'Vitória',
  loss: 'Derrota',
  draw: 'Empate'
}

const RESULT_CODE_LABEL: Record<string, string> = {
  win: 'vitória',
  checkmated: 'mate',
  agreed: 'acordo',
  repetition: 'repetição',
  timeout: 'tempo',
  resigned: 'desistência',
  stalemate: 'afogamento',
  lose: 'derrota',
  insufficient: 'material insuficiente',
  '50move': '50 lances',
  abandoned: 'abandono',
  kingofthehill: 'rei no topo',
  threecheck: 'três xeques',
  timevsinsufficient: 'tempo vs material',
  bughousepartnerlose: 'parceiro perdeu'
}

export function resultCodeLabel(code: string): string {
  return RESULT_CODE_LABEL[code] ?? code
}

export const chess = {
  link(token: string, username: string): Promise<ChessPayload> {
    return request<ChessPayload>('/chess/link', { method: 'POST', token, body: JSON.stringify({ username }) })
  },
  unlink(token: string): Promise<void> {
    return request<void>('/chess/link', { method: 'DELETE', token })
  },
  me(token: string): Promise<ChessPayload> {
    return request<ChessPayload>('/chess/me', { token })
  },
  user(token: string, userId: string): Promise<ChessPayload> {
    return request<ChessPayload>(`/chess/user/${encodeURIComponent(userId)}`, { token })
  },
  sync(token: string): Promise<ChessPayload & { newGames: number }> {
    return request<ChessPayload & { newGames: number }>('/chess/sync', { method: 'POST', token })
  }
}
