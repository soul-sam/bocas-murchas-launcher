import { request } from './api'

/**
 * LÍNGUA MURCHA — /api/lingua. Tipos são CÓPIA dos da API
 * (src/lib/lingua/{types,engine,finish}.ts e routes/lingua.routes.ts lá).
 *
 *   GET  /me                         -> LinguaMe
 *   POST /:lang/start { level? }     -> AttemptView
 *   POST /attempts/:id/answer { index, choice } -> AnswerResult
 *   POST /attempts/:id/give-up       -> FinishResult
 *   POST /lives/buy                  -> LivesView
 *   GET  /ranking?lang=all|<lang>&period=week|total -> { rows, me }
 *   GET  /podium                     -> LinguaPodium
 */

export const LANGS = ['en', 'ja', 'fr', 'it', 'es', 'de', 'zh'] as const
export type Lang = (typeof LANGS)[number]
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const
export type Level = (typeof LEVELS)[number]

export type AttemptStatus = 'active' | 'awaiting_life' | 'done' | 'failed'
export type DayStatus = 'available' | AttemptStatus

export interface PublicQuestion {
  id: string
  direction: 'to_pt' | 'from_pt'
  prompt: string
  /** Presente quando o prompt é estrangeiro (kana/hanzi pra voz). */
  promptSpeak?: string
  options: string[]
  optionsSpeak?: string[]
}

export interface LivesView {
  left: number
  bought: number
  nextPrice: number | null
}

export interface AttemptView {
  attemptId: string
  lang: Lang
  level: Level
  lesson: number
  topic: string
  questions: PublicQuestion[]
  position: number
  correct: number
  status: AttemptStatus
  lives: LivesView
}

export interface FinishResult {
  status: 'done' | 'failed'
  correct: number
  xp: number
  missions: Array<{ kind: 'perfect' | 'five_days'; xp: 150 }>
  streak: number
  generalStreak: number
  levelUp: Level | null
}

export interface AnswerResult {
  correct: boolean
  /** Índice da opção certa. */
  answer: number
  status: AttemptStatus
  lives: LivesView
  /** Só quando esta resposta encerrou a tentativa. */
  result?: FinishResult
}

export interface LinguaLangState {
  lang: Lang
  level: Level | null
  lesson: number
  streak: number
  today: DayStatus
  xpWeek: number
  xpTotal: number
  missions: { perfect: boolean; fiveDays: number }
}

export interface LinguaMe {
  langs: LinguaLangState[]
  lives: LivesView
  generalStreak: number
  xpWeek: number
  xpTotal: number
}

export interface RankingRow {
  place: number
  userId: string
  name: string
  avatarUrl: string | null
  xp: number
}

export interface LinguaRanking {
  rows: RankingRow[]
  me: { place: number; xp: number } | null
}

export interface LinguaPodium {
  weekStart: string
  general: Array<RankingRow & { coins: number }>
  byLang: Record<Lang, RankingRow[]>
}

export const lingua = {
  me: (token: string) => request<LinguaMe>('/lingua/me', { token }),
  start: (token: string, lang: Lang, level?: Level) =>
    request<AttemptView>(`/lingua/${lang}/start`, {
      token,
      method: 'POST',
      body: JSON.stringify(level ? { level } : {})
    }),
  answer: (token: string, attemptId: string, index: number, choice: number) =>
    request<AnswerResult>(`/lingua/attempts/${encodeURIComponent(attemptId)}/answer`, {
      token,
      method: 'POST',
      body: JSON.stringify({ index, choice })
    }),
  giveUp: (token: string, attemptId: string) =>
    request<FinishResult>(`/lingua/attempts/${encodeURIComponent(attemptId)}/give-up`, {
      token,
      method: 'POST'
    }),
  buyLife: (token: string) => request<LivesView>('/lingua/lives/buy', { token, method: 'POST' }),
  ranking: (token: string, lang: Lang | 'all', period: 'week' | 'total') =>
    request<LinguaRanking>(`/lingua/ranking?lang=${lang}&period=${period}`, { token }),
  podium: (token: string) => request<LinguaPodium>('/lingua/podium', { token })
}
