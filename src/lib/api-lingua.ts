import { request } from './api'

/**
 * LÍNGUA MURCHA — /api/lingua. Tipos são CÓPIA dos da API
 * (src/lib/lingua/{types,engine,finish}.ts e routes/lingua.routes.ts lá).
 *
 *   GET  /me                         -> LinguaMe
 *   POST /:lang/start { level? }     -> AttemptView
 *   POST /attempts/:id/answer { index, choice } -> AnswerResult
 *   GET  /ranking?lang=all|<lang>&period=week|total -> { rows, me }
 *   GET  /podium                     -> LinguaPodium
 */

export const LANGS = ['en', 'ja', 'fr', 'it', 'es', 'de', 'zh', 'ru'] as const
export type Lang = (typeof LANGS)[number]
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const
export type Level = (typeof LEVELS)[number]

export type AttemptStatus = 'active' | 'done' | 'failed'
export type DayStatus = 'available' | AttemptStatus

export interface PublicQuestion {
  id: string
  direction: 'to_pt' | 'from_pt'
  prompt: string
  /** Presente quando o prompt é estrangeiro (kana/hanzi pra voz). */
  promptSpeak?: string
  options: string[]
  optionsSpeak?: string[]
  /** Pergunta errada numa lição anterior, voltando pra revisão (vem depois das da lição). */
  review?: true
}

export interface AttemptView {
  attemptId: string
  lang: Lang
  level: Level
  lesson: number
  topic: string
  questions: PublicQuestion[]
  /** Quantas das `questions` são da lição; o resto é revisão. */
  lessonCount: number
  /** Acertos mínimos nas perguntas da lição pra passar pra próxima. */
  passMin: number
  position: number
  correct: number
  status: AttemptStatus
}

export interface FinishResult {
  /** done = passou de lição; failed = poucos acertos, repete amanhã. */
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
  /** Perguntas erradas esperando revisão nessa língua. */
  review: number
}

export interface LinguaMe {
  langs: LinguaLangState[]
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

/** Correção de um bloco do nivelamento: só a contagem, nunca o gabarito. */
export interface PlacementResult {
  level: Level
  correct: number
  total: number
  passed: boolean
  /** Próximo bloco; null quando acabou. */
  next: Level | null
  /** Nível de início; null enquanto continua. */
  placed: Level | null
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
  ranking: (token: string, lang: Lang | 'all', period: 'week' | 'total') =>
    request<LinguaRanking>(`/lingua/ranking?lang=${lang}&period=${period}`, { token }),
  podium: (token: string) => request<LinguaPodium>('/lingua/podium', { token }),
  placement: (token: string, lang: Lang, level: Level) =>
    request<{ level: Level; questions: PublicQuestion[] }>(`/lingua/${lang}/placement/${level}`, { token }),
  checkPlacement: (token: string, lang: Lang, level: Level, answers: number[]) =>
    request<PlacementResult>(`/lingua/${lang}/placement/${level}`, {
      token,
      method: 'POST',
      body: JSON.stringify({ answers })
    })
}
