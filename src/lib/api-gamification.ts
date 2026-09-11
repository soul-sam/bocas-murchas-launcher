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
 *   GET  /gamification/earn-rules               -> tabela de ganho de murcho
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

export type CosmeticType = 'title' | 'nameEffect' | 'avatarFrame' | 'emoji' | 'joinSound'

/**
 * Cor do nome: a cor de texto padrão. A cor comprada saiu da lojinha
 * (set/2026); o que diferencia o nome agora é efeito, moldura e título, cada
 * um na paleta da própria raridade.
 */
export const DEFAULT_NAME_COLOR = '#EAEAEA'

/**
 * Raridade de cada título, espelho do catálogo da API (`rules.ts`). O
 * `TitleTag` pinta o título com a cor da raridade e roda em telas que não
 * têm o catálogo carregado (autor de mensagem, lista de membros), então o
 * mapa fica aqui, estático. Título desconhecido cai em comum.
 */
export const TITLE_RARITY: Record<string, Rarity> = {
  feeder: 'common',
  suporte: 'common',
  cutucador: 'common',
  coruja: 'common',
  mudo: 'common',
  lagado: 'common',
  afk: 'common',
  ragequitter: 'common',
  'voz-de-blitz': 'common',
  dj: 'rare',
  tiltado: 'rare',
  'cacador-de-elo': 'rare',
  insone: 'rare',
  'mestre-do-soundboard': 'rare',
  'boca-de-ouro': 'epic',
  carry: 'epic',
  veterano: 'epic',
  'boca-murcha': 'legendary'
}

export function titleRarity(titleId: string | null | undefined): Rarity {
  const key = cosmeticKey(titleId)
  return (key && TITLE_RARITY[key]) || 'common'
}

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
  joinSound: string | null
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

/**
 * De onde vem murcho — o que o "?" da lojinha mostra.
 *
 * Vem do servidor de propósito: os números são de `rules.ts` e o
 * balanceamento muda. Cópia no cliente mentiria na primeira mudança.
 */
export interface EarnRules {
  actions: {
    checkinBase: number
    checkinPerStreak: number
    checkinStreakMax: number
    voicePer30Min: number
    gamePlayed: number
    gameWin: number
    missionComplete: number
    recapAward: number
  }
  chess: {
    bullet: { coins: number; perDay: number }
    blitz: { coins: number; perDay: number }
    rapid: { coins: number; perDay: number }
    winMultiplier: number
  }
  levelUp: {
    level: number
    next: { level: number; coins: number }
  }
  wager: {
    min: number
    /** Teto máximo do sistema, alcançado depois de `rampBets` apostas. */
    max: number
    /** Teto de quem perguntou, agora. */
    myMax: number
    /** Teto de quem nunca apostou. */
    startMax: number
    /** Apostas até destravar o teto cheio. */
    rampBets: number
    /** Janela pra apostar, do início da partida. */
    betWindowMs: number
    payoutMultiplier: number
    /**
     * Aposta na PRÓPRIA partida. A odd não vem aqui: ela é por jogo e muda a
     * cada partida, então chega em `LiveWagerGame.self.odds`.
     */
    self: {
      /** Janela mais curta que a dos outros — quem joga lê o placar na hora. */
      betWindowMs: number
      /** Partidas mínimas pra odd sair da winrate em vez do fixo. */
      minSample: number
      sampleSize: number
      rookieMultiplier: number
      rookieMax: number
      minMultiplier: number
      maxMultiplier: number
    }
  }
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
  /** Quanto volta se ganhar — odd travada quando a aposta entrou. */
  potential: number
  /** Apostou na PRÓPRIA partida (só existe em `win`). */
  self: boolean
}

/** Odd de apostar em si mesmo: `1 ÷ winrate`, presa entre 1,3x e 3x. */
export interface SelfWagerOdds {
  multiplier: number
  /** Partidas na conta. Abaixo de `minSample` a odd é a de estreante. */
  sample: number
  wins: number
}

/** O lado "apostar em mim" de uma partida minha. */
export interface SelfWagerBoard {
  odds: SelfWagerOdds
  /** Janela de 3 min ainda aberta? */
  open: boolean
  closesAt: string
  maxAmount: number
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
  myWager: {
    prediction: WagerPrediction
    amount: number
    potential: number
    self: boolean
  } | null
  /** Estou DENTRO dessa partida (eu ou alguém do meu grupo). */
  mine: boolean
  /**
   * Aposta em mim. Só vem preenchido no board da MINHA sessão — nem no dos
   * colegas da mesma partida, porque a aposta em si é registrada na sessão de
   * quem aposta.
   */
  self: SelfWagerBoard | null
  /** Sessão que representa a partida (a primeira do grupo). */
  matchId: string
  /** Todo mundo do grupo na MESMA partida — uma aposta cobre todos. */
  players: MatchPlayer[]
  /** Aposta aberta? Falso = passou dos 5 min ou a partida acabou. */
  open: boolean
  /** ISO de quando a janela de aposta fecha. */
  closesAt: string
  /** Teto de aposta atual de quem pediu (rampa de 50 até 500). */
  maxAmount: number
}

export interface MatchPlayer {
  sessionId: string
  userId: string
  displayName: string
  champion: string | null
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
  /** Quando a janela de 5 min fecha (epoch ms). */
  closesAt?: string | number
  /** Id da sessão que representa a partida. */
  matchId?: string
  /** Grupo na mesma partida — a aposta vale por todos. */
  players?: MatchPlayer[]
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

/**
 * Aposta mínima e teto do sistema, igual ao servidor. O teto REAL de cada um
 * é pessoal (`LiveWagerGame.maxAmount` / `EarnRules.wager.myMax`): começa em
 * `WAGER_START_MAX` e sobe até `WAGER_MAX` na aposta de número
 * `WAGER_RAMP_BETS`. Use `WAGER_MAX` só como limite absoluto de input.
 */
export const WAGER_MIN = 10
export const WAGER_MAX = 500
export const WAGER_START_MAX = 50
export const WAGER_RAMP_BETS = 20
/** Só dá pra apostar nos 5 primeiros minutos da partida. */
export const WAGER_WINDOW_MS = 5 * 60 * 1000

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
  // Murchos de nível vêm como `levelup:<nível>` (e `levelup:backfill` no
  // ajuste retroativo), então não dá pra ter uma chave fixa no mapa.
  if (reason.startsWith('levelup:')) {
    const level = reason.slice('levelup:'.length)
    return level === 'backfill' ? 'níveis que você já tinha' : `nível ${level}`
  }
  return XP_REASON_LABEL[reason] ?? reason.replace(/_/g, ' ')
}

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'comum',
  rare: 'raro',
  epic: 'épico',
  legendary: 'lendário'
}

/**
 * Cor hex por raridade — usada tanto em classe quanto em estilo inline.
 *
 * A escala é FRIA → QUENTE e não encosta nas cores de sistema, de propósito:
 *  - `rare` era #6AFF00, o mesmo verde do botão primário. Item raro parecia
 *    controle clicável.
 *  - `legendary` era #F2B705, o mesmo âmbar de alerta. Item lendário parecia
 *    aviso de erro.
 *  - `epic` era #B400FF: 4,1:1 sobre o fundo do app, reprovando WCAG AA — e
 *    aplicado em rótulo pequeno, o pior lugar possível.
 *
 * Todas passam AA sobre #0B0B0B (6,4 / 9,6 / 9,6 / 12,5:1). A progressão de
 * peso NÃO é carregada só pela cor: vem junto com RARITY_GLYPH e com a
 * intensidade de brilho definida em RARITY_STYLE.
 */
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#9AA3A0',
  rare: '#3FC1FF',
  epic: '#D0A2FF',
  legendary: '#FFC53D'
}

/**
 * Identificador que NÃO depende de cor. Quem não distingue roxo de âmbar (ou
 * está lendo em monocromia) continua lendo o tier pelo glifo.
 */
export const RARITY_GLYPH: Record<Rarity, string> = {
  common: '○',
  rare: '◆',
  epic: '✦',
  legendary: '★'
}

/**
 * Peso visual por tier, para card e badge. `ring` é a borda, `wash` o fundo
 * tingido e `glow` o halo — que só existe do épico pra cima, senão a loja
 * inteira brilha e nada se destaca.
 */
export const RARITY_STYLE: Record<Rarity, { ring: string; wash: string; glow: string }> = {
  common: { ring: '#3C443A', wash: 'transparent', glow: 'none' },
  rare: { ring: 'rgba(63, 193, 255, 0.40)', wash: 'rgba(63, 193, 255, 0.08)', glow: 'none' },
  epic: {
    ring: 'rgba(208, 162, 255, 0.45)',
    wash: 'rgba(208, 162, 255, 0.10)',
    glow: '0 0 14px rgba(208, 162, 255, 0.10)'
  },
  legendary: {
    ring: 'rgba(255, 197, 61, 0.55)',
    wash: 'rgba(255, 197, 61, 0.12)',
    glow: '0 0 20px rgba(255, 197, 61, 0.16), inset 0 1px 0 rgba(255, 197, 61, 0.14)'
  }
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
  // Streak sai como número puro: a chama é desenhada como ícone ao lado, em
  // quem mostra o valor (ver LeaderboardPanel), e não como emoji no texto.
  if (metric === 'streak') return `${value} d`
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

/** Chave do par de sons de um cosmético `joinSound` (`sound:bell` → "bell"). */
export function cosmeticSound(item: Pick<ShopItem, 'type' | 'data'> | undefined): string | null {
  if (item?.type !== 'joinSound') return null
  const key = item.data?.sound
  return typeof key === 'string' && key ? key : null
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

  async earnRules(token: string): Promise<EarnRules> {
    return request<EarnRules>('/gamification/earn-rules', { token })
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
