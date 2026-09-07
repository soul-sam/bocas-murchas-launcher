import { request, type GameSessionSummary } from './api'

/**
 * Contrato com /api/gamification (implementado no backend pelo módulo de
 * gamificação). Vive separado do api.ts pra não inchar o arquivo-mãe — mesma
 * regra dos outros módulos por feature.
 *
 *   GET  /gamification/me                       -> { profile }
 *   GET  /gamification/users/:id                -> { profile }
 *   GET  /gamification/leaderboard?period&metric -> { period, metric, entries }
 *   GET  /gamification/badges                   -> { all, mine }
 *   GET  /gamification/shop                     -> { coins, items }
 *   POST /gamification/shop/buy { cosmeticId }  -> { profile, item }   402 sem saldo, 409 já tem
 *   POST /gamification/equip { type, cosmeticId|null } -> { user }
 *   POST /gamification/checkin                  -> { profile, awarded|null }
 *   GET  /gamification/wagers/live              -> { games }
 *   POST /gamification/wagers { sessionId, prediction, amount } -> { wager, coins }
 *   GET  /gamification/recap/latest             -> { recap|null }
 *   GET  /games/recent?limit=                   -> { sessions }
 */

// ============================================
// TIPOS
// ============================================

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

export type CosmeticType = 'title' | 'nameEffect' | 'avatarFrame' | 'emoji'

export interface Badge {
  id: string
  name: string
  description: string
  icon: string
  rarity: Rarity
  earnedAt: string
}

export interface EquippedCosmetics {
  title: string | null
  nameEffect: string | null
  avatarFrame: string | null
  emoji: string | null
}

export interface GamificationProfile {
  userId: string
  xp: number
  level: number
  /** XP já acumulado DENTRO do nível atual (0..nextLevelXp). */
  levelXp: number
  /** Quanto XP o nível atual pede pra virar o próximo. */
  nextLevelXp: number
  coins: number
  streak: number
  bestStreak: number
  lastCheckIn: string | null
  gamesPlayed: number
  gamesWon: number
  voiceMinutes: number
  messageCount: number
  soundPlays: number
  nudgesSent: number
  weeklyXp: number
  badges: Badge[]
  equipped: EquippedCosmetics
}

export type LeaderboardPeriod = 'week' | 'all'

export type LeaderboardMetric =
  | 'xp'
  | 'coins'
  | 'streak'
  | 'wins'
  | 'voice'
  | 'sounds'
  | 'messages'

export interface LeaderboardEntry {
  rank: number
  userId: string
  displayName: string
  avatar?: string | null
  profileColor?: string | null
  value: number
}

export interface LeaderboardResponse {
  period: LeaderboardPeriod
  metric: LeaderboardMetric
  entries: LeaderboardEntry[]
}

export interface ShopItem {
  id: string
  type: CosmeticType
  name: string
  description: string
  price: number
  rarity: Rarity
  data: Record<string, unknown> | null
  owned: boolean
  equipped: boolean
}

export interface ShopResponse {
  coins: number
  items: ShopItem[]
}

export type WagerPrediction = 'win' | 'loss'

export interface WagerPool {
  win: number
  loss: number
}

export interface WagerBet {
  userId: string
  prediction: WagerPrediction
  amount: number
}

export interface LiveWagerGame {
  session: GameSessionSummary & {
    user: {
      id: string
      displayName: string
      avatar?: string | null
      profileColor?: string | null
    }
  }
  pool: WagerPool
  bets: WagerBet[]
  myWager: { prediction: WagerPrediction; amount: number } | null
}

export interface WeeklyRecap {
  weekStart: string
  weekEnd: string
  /** JSON string de RecapCardMeta — use parseMetadata(). */
  payload: string
  messageId: string | null
}

export interface CheckinAward {
  xp: number
  coins: number
  streak: number
}

// --- metadata dos cartões ------------------------------------------------

export interface GameCardMeta {
  sessionId: string
  userId: string
  game: 'lol' | 'minecraft'
  result: 'win' | 'loss' | 'remake' | 'unknown'
  queue?: string | null
  champion?: string | null
  kills?: number
  deaths?: number
  assists?: number
  cs?: number
  gold?: number
  damageToChampions?: number
  visionScore?: number
  doubleKills?: number
  tripleKills?: number
  quadraKills?: number
  pentaKills?: number
  durationSec?: number
  teammates?: { userId: string; riotId?: string }[]
  xpAwarded?: number
  coinsAwarded?: number
  wagers?: { userId: string; prediction: WagerPrediction; amount: number; payout: number }[]
}

export interface RecapAward {
  key: string
  title: string
  emoji: string
  userId: string
  displayName: string
  value: number
  label: string
}

export interface RecapCardMeta {
  weekStart: string
  weekEnd: string
  awards: RecapAward[]
  totals: {
    messages: number
    voiceMinutes: number
    games: number
    wins: number
    soundPlays: number
    nudges: number
    xp: number
  }
  badgesGranted: { userId: string; badgeId: string; name: string; icon: string }[]
}

export interface WagerCardMeta {
  sessionId: string
  userId: string
  displayName: string
  game: 'lol' | 'minecraft'
  champion?: string | null
  queue?: string | null
  since: string | number
  pool: WagerPool
  bets: WagerBet[]
  settled: boolean
  result?: 'win' | 'loss' | 'remake' | 'unknown'
  payouts?: { userId: string; payout: number }[]
}

export interface SystemCardMeta {
  kind: 'levelup' | 'badge' | 'purchase' | 'info'
  title: string
  body: string
  icon?: string
}

// ============================================
// RÓTULOS E CONSTANTES (pt-BR)
// ============================================

/** Aposta mínima/máxima, igual ao servidor. */
export const WAGER_MIN = 10
export const WAGER_MAX = 500

/**
 * Por que ganhou XP, em português de gente. O servidor manda a chave técnica;
 * o toast mostra isto. Chave desconhecida cai no próprio texto da chave.
 */
const XP_REASON_LABEL: Record<string, string> = {
  message: 'mensagem',
  reaction: 'reação',
  reaction_received: 'reação recebida',
  voice_minute: 'tempo em call',
  soundboard: 'som tocado',
  nudge: 'cutucada',
  checkin: 'check-in',
  streak: 'streak',
  poll_vote: 'voto na enquete',
  poll_created: 'enquete criada',
  event_created: 'evento marcado',
  event_rsvp: 'presença no evento',
  link: 'link compartilhado',
  game_played: 'partida jogada',
  game_win: 'vitória',
  fivestack: 'five stack',
  penta: 'PENTAKILL',
  minecraft: 'Minecraft',
  chess_played: 'partida de xadrez',
  chess_win: 'vitória no xadrez',
  mission: 'missão',
  recap: 'recap da semana',
  wager: 'aposta',
  wager_won: 'aposta ganha',
  wager_lost: 'aposta perdida',
  purchase: 'compra na lojinha',
  refund: 'reembolso'
}

export function xpReasonLabel(reason: string | undefined | null): string {
  if (!reason) return ''
  return XP_REASON_LABEL[reason] ?? reason.replace(/_/g, ' ')
}

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'comum',
  rare: 'raro',
  epic: 'épico',
  legendary: 'lendário'
}

/** Cor hex por raridade — usada tanto em classe quanto em estilo inline. */
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#8C8C8C',
  rare: '#6AFF00',
  epic: '#B400FF',
  legendary: '#F2B705'
}

export const METRIC_LABEL: Record<LeaderboardMetric, string> = {
  xp: 'XP',
  coins: 'Murchos',
  streak: 'Streak',
  wins: 'Vitórias',
  voice: 'Call',
  sounds: 'Sons',
  messages: 'Msgs'
}

/** "1.2k" pra número grande, inteiro pra número pequeno. */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1000)}k`
  if (Math.abs(value) >= 1_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(Math.round(value))
}

/** Valor de uma métrica do ranking, formatado pro tipo dela. */
export function formatMetricValue(metric: LeaderboardMetric, value: number): string {
  if (metric === 'voice') {
    const hours = Math.floor(value / 60)
    const minutes = Math.round(value % 60)
    return hours > 0 ? `${hours}h${String(minutes).padStart(2, '0')}` : `${minutes} min`
  }
  if (metric === 'streak') return `${value} 🔥`
  return formatCompact(value)
}

/**
 * Ids de cosmético têm prefixo por tipo (`effect:glow`, `frame:gold`,
 * `title:xyz`). Os componentes de UI trabalham com o sufixo.
 */
export function cosmeticKey(id: string | null | undefined): string | null {
  if (!id) return null
  const colon = id.indexOf(':')
  return colon >= 0 ? id.slice(colon + 1) : id
}

/**
 * Glifo do cosmético de emoji (`emoji:oculos` → "😎"). Vem de `data.emoji`
 * do catálogo; sem catálogo não dá pra adivinhar, então devolve null.
 */
export function cosmeticEmoji(item: Pick<ShopItem, 'data'> | undefined): string | null {
  const glyph = item?.data?.emoji
  return typeof glyph === 'string' && glyph ? glyph : null
}

/** Nome legível a partir só do id, quando o catálogo ainda não chegou. */
export function cosmeticFallbackName(id: string): string {
  return (cosmeticKey(id) ?? id).replace(/[-_]+/g, ' ')
}

// ============================================
// CHAMADAS
// ============================================

export const gamification = {
  async me(token: string): Promise<GamificationProfile> {
    const res = await request<{ profile: GamificationProfile }>('/gamification/me', { token })
    return res.profile
  },

  async user(token: string, userId: string): Promise<GamificationProfile> {
    const res = await request<{ profile: GamificationProfile }>(
      `/gamification/users/${userId}`,
      { token }
    )
    return res.profile
  },

  async leaderboard(
    token: string,
    period: LeaderboardPeriod,
    metric: LeaderboardMetric
  ): Promise<LeaderboardResponse> {
    const params = new URLSearchParams({ period, metric })
    return request<LeaderboardResponse>(`/gamification/leaderboard?${params.toString()}`, {
      token
    })
  },

  async badges(token: string): Promise<{ all: Omit<Badge, 'earnedAt'>[]; mine: Badge[] }> {
    return request('/gamification/badges', { token })
  },

  async shop(token: string): Promise<ShopResponse> {
    return request<ShopResponse>('/gamification/shop', { token })
  },

  async buy(
    token: string,
    cosmeticId: string
  ): Promise<{ profile: GamificationProfile; item: ShopItem }> {
    return request('/gamification/shop/buy', {
      method: 'POST',
      token,
      body: JSON.stringify({ cosmeticId })
    })
  },

  /** `cosmeticId` null desequipa o que estiver naquele slot. */
  async equip(
    token: string,
    type: CosmeticType,
    cosmeticId: string | null
  ): Promise<{ user: import('./api').AuthUser }> {
    return request('/gamification/equip', {
      method: 'POST',
      token,
      body: JSON.stringify({ type, cosmeticId })
    })
  },

  async checkin(
    token: string
  ): Promise<{ profile: GamificationProfile; awarded: CheckinAward | null }> {
    return request('/gamification/checkin', { method: 'POST', token })
  },

  async liveWagers(token: string): Promise<LiveWagerGame[]> {
    const res = await request<{ games: LiveWagerGame[] }>('/gamification/wagers/live', { token })
    return Array.isArray(res?.games) ? res.games : []
  },

  async placeWager(
    token: string,
    sessionId: string,
    prediction: WagerPrediction,
    amount: number
  ): Promise<{ wager: WagerBet & { sessionId: string }; coins: number }> {
    return request('/gamification/wagers', {
      method: 'POST',
      token,
      body: JSON.stringify({ sessionId, prediction, amount })
    })
  },

  async latestRecap(token: string): Promise<WeeklyRecap | null> {
    const res = await request<{ recap: WeeklyRecap | null }>('/gamification/recap/latest', {
      token
    })
    return res?.recap ?? null
  },

  async recentGames(token: string, limit = 10): Promise<GameSessionSummary[]> {
    const res = await request<{ sessions: GameSessionSummary[] }>(
      `/games/recent?limit=${limit}`,
      { token }
    )
    return Array.isArray(res?.sessions) ? res.sessions : []
  }
}
