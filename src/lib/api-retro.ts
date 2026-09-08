import { request } from './api'

/**
 * RETROSPECTIVAS — o dia, a lembrança e o ano.
 *
 * Três coisas com o mesmo espírito: contar de volta pro grupo o que ele já
 * fez. Ficam juntas porque são lidas pelas mesmas telas e porque nenhuma
 * delas escreve nada — são todas leitura de coisa que já aconteceu.
 *
 * As rotas moram em /api/gamification (é lá que o recap de domingo já vivia);
 * o arquivo é separado só pra não engordar api-gamification.ts.
 */

// ============================================
// O DIA
// ============================================

export interface DayHighlight {
  key: string
  emoji: string
  title: string
  userId: string
  displayName: string
  label: string
}

export interface DayTotals {
  messages: number
  voiceMinutes: number
  games: number
  wins: number
  soundPlays: number
  clips: number
  tips: number
  tipTotal: number
}

export interface DayRecap {
  dayKey: string
  totals: DayTotals
  highlights: DayHighlight[]
  people: Array<{ id: string; displayName: string; avatar: string | null }>
  bestGame: {
    userId: string
    displayName: string
    champion: string | null
    kills: number
    deaths: number
    assists: number
    result: string | null
  } | null
}

// ============================================
// NAQUELE DIA
// ============================================

export interface MemoryMessage {
  id: string
  content: string
  type: string
  imageUrl: string | null
  gifUrl: string | null
  stickerUrl: string | null
  reactions: number
  authorId: string
  displayName: string
  avatar: string | null
  channelId: string | null
  channelName: string | null
  createdAt: string
}

export interface Memory {
  label: string
  months: number
  dayKey: string
  messages: number
  voiceMinutes: number
  games: number
  top: MemoryMessage[]
  people: Array<{ id: string; displayName: string; avatar: string | null }>
}

/** O card de lembrança no chat carrega a Memory inteira no metadata. */
export interface MemoryCardMetadata extends Memory {
  kind: 'memory'
}

// ============================================
// RETROSPECTIVA MURCHA
// ============================================

export interface WrappedPerson {
  id: string
  displayName: string
  avatar: string | null
}

export interface WrappedGame {
  champion: string | null
  kills: number
  deaths: number
  assists: number
  result: string | null
  at: string
}

export interface WrappedMessage {
  id: string
  content: string
  type: string
  imageUrl: string | null
  gifUrl: string | null
  stickerUrl: string | null
  reactions: number
  authorId: string
  displayName: string
  channelName: string | null
  at: string
}

export interface WrappedClip {
  id: string
  title: string
  url: string
  durationMs: number
  authorId: string
  displayName: string
  reactions: number
  at: string
}

export interface UserWrapped {
  kind: 'user'
  year: number
  user: WrappedPerson

  messages: number
  voiceMinutes: number
  peakHour: number | null
  nightMessages: number
  busiestDay: { dayKey: string; messages: number; voiceMinutes: number } | null
  activeDays: number

  games: number
  wins: number
  bestGame: WrappedGame | null
  favoriteChampion: { name: string; games: number } | null

  soundPlays: number
  favoriteSound: { id: string; name: string; emoji: string; plays: number } | null

  coinsEarned: number
  coinsSpent: number
  biggestWagerWin: number
  biggestWagerLoss: number
  tipsGiven: number
  tipsReceived: number

  xp: number
  level: number
  bestStreak: number
  badgesEarned: number

  clips: number
  clipsIn: number
  topClip: WrappedClip | null

  topDuo: (WrappedPerson & { minutes: number }) | null
  topMessage: WrappedMessage | null

  rank: number
  of: number
}

export interface GroupWrapped {
  kind: 'grupo'
  year: number
  messages: number
  voiceMinutes: number
  games: number
  wins: number
  soundPlays: number
  clips: number
  tipTotal: number
  members: Array<WrappedPerson & { xp: number; messages: number; voiceMinutes: number }>
  busiestDay: { dayKey: string; messages: number; voiceMinutes: number } | null
  topMessage: WrappedMessage | null
  topClip: WrappedClip | null
  topPair: { a: WrappedPerson; b: WrappedPerson; minutes: number } | null
}

export type Wrapped = UserWrapped | GroupWrapped

// ============================================
// CHAMADAS
// ============================================

export const retro = {
  /**
   * O dia. Sem `day`, é hoje.
   *
   * `posted` diz se o card das 23h já saiu. Quando false, o que voltou é o
   * placar parcial calculado na hora — a tela mostra "até agora" em vez de
   * "fechou assim".
   */
  async day(token: string, day?: string): Promise<{ day: DayRecap; posted: boolean }> {
    const query = day ? `?day=${encodeURIComponent(day)}` : ''
    return request<{ day: DayRecap; posted: boolean }>(`/gamification/day${query}`, { token })
  },

  async onThisDay(token: string): Promise<Memory | null> {
    const res = await request<{ memory: Memory | null }>('/gamification/onthisday', { token })
    return res?.memory ?? null
  },

  /**
   * A retrospectiva do ano. `scope: 'grupo'` traz a do grupo inteiro.
   *
   * A PRIMEIRA chamada de cada ano recalcula tudo no servidor e pode levar
   * alguns segundos — quem chama precisa mostrar carregando de verdade, não
   * um spinner de meio segundo.
   */
  async wrapped(token: string, year: number, scope?: 'grupo'): Promise<Wrapped | null> {
    const query = scope ? `?scope=${scope}` : ''
    const res = await request<{ wrapped: Wrapped }>(`/gamification/wrapped/${year}${query}`, {
      token
    })
    return res?.wrapped ?? null
  }
}

// ============================================
// FORMATAÇÃO
// ============================================

/** "3h10" / "25 min" — mesma régua do servidor. */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

/** "8 de setembro" a partir de "2026-09-08". Sem ano: o card já diz qual é. */
export function formatDayKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number)
  if (!year || !month || !day) return key
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  return date.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  })
}

/**
 * "de madrugada", "de manhã"… a partir da hora de pico.
 *
 * O número cru ("sua hora foi 2") não diz nada; a faixa do dia é a forma como
 * as pessoas de fato se descrevem.
 */
export function hourLabel(hour: number | null): string | null {
  if (hour === null) return null
  if (hour < 6) return 'de madrugada'
  if (hour < 12) return 'de manhã'
  if (hour < 18) return 'à tarde'
  if (hour < 22) return 'à noite'
  return 'antes de dormir'
}
