import type * as React from 'react'
import { request, type GameSessionSummary } from './api'
import { isShopThemeId, type ShopThemeId } from '../../electron/preload/types'

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
 *   GET  /gamification/wagers/ranking?period&weekStart -> { period, entries }  saldo e aproveitamento
 *   POST /gamification/wagers { sessionId, prediction, amount } -> { wager, coins }
 *   GET  /gamification/recap/latest             -> { recap|null }
 *   GET  /games/recent?limit=                   -> { sessions }
 */

// ============================================
// TIPOS
// ============================================

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

/**
 * `nameColor` é a cor do nome. Equipa pelo /equip como os outros, mas não
 * tem coluna própria: a API grava o hex de `data.color` em `profileColor`.
 *
 * `theme` é o tema do launcher. Só a POSSE é do servidor: vestir é
 * `settings.theme`, local, por máquina — o /equip recusa esse tipo e o /shop
 * devolve `equipped: false` sempre; a Lojinha marca sozinha o que está em
 * uso. `data.theme` é o ThemeId (electron/preload/types.ts).
 */
export type CosmeticType = 'title' | 'nameEffect' | 'avatarFrame' | 'emoji' | 'joinSound' | 'nameColor' | 'theme'

/**
 * Cor do nome: a cor de texto padrão. A cor comprada saiu da lojinha
 * (set/2026); o que diferencia o nome agora é efeito, moldura e título, cada
 * um na paleta da própria raridade.
 */
export const DEFAULT_NAME_COLOR = '#EAEAEA'

/**
 * A cor em que efeito de nome e moldura são pintados (`--fx-c`, ver
 * styles/effects.css): a cor comprada, ou null quando a pessoa não tem cor
 * (ou está na padrão) — aí o CSS cai no branco do tema.
 */
export function cosmeticTint(color: string | null | undefined): string | null {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return null
  return color.toLowerCase() === DEFAULT_NAME_COLOR.toLowerCase() ? null : color
}

/** `style` com a cor dos cosméticos, pra espalhar num elemento (ou nada). */
export function tintStyle(color: string | null | undefined): React.CSSProperties | undefined {
  const tint = cosmeticTint(color)
  return tint ? ({ '--fx-c': tint } as React.CSSProperties) : undefined
}

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
  /**
   * Ids da vitrine, na ordem escolhida (até 3). Opcional porque API antiga
   * não manda — aí o perfil cai nas mais recentes, como sempre foi.
   */
  showcase?: string[]
  equipped: EquippedCosmetics
}

/**
 * Painel de conquistas (GET /gamification/achievements). A conta da
 * raridade mora na API (lib/gamification/achievements.ts):
 * pontos = peso do catálogo × (2 − fatia do grupo que tem).
 */
export interface AchievementBadge {
  id: string
  name: string
  description: string
  icon: string
  /** Raridade de catálogo — a que a badge nasceu tendo. */
  rarity: Rarity
  /** Ovo que eu ainda não achei: vem como "???". */
  secret?: true
  hint?: string
  holders: number
  /** Fração do grupo que tem, 0..1. */
  share: number
  points: number
  /** Raridade real: sai dos pontos, cai um tier se todo mundo tem. */
  tier: Rarity
  /** Do primeiro ao último a ganhar. */
  owners: { userId: string; earnedAt: string }[]
  earnedAt: string | null
  progress: { current: number; target: number; unit: string } | null
}

export interface CollectorEntry {
  rank: number
  userId: string
  points: number
  count: number
}

export interface AchievementsBoard {
  members: number
  weights: Record<Rarity, number>
  badges: AchievementBadge[]
  collectors: CollectorEntry[]
  me: { points: number; count: number; rank: number | null }
  showcase: string[]
  showcaseSize: number
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

export interface GiftResult {
  coins: number
  cosmetic: { id: string; name: string; type: CosmeticType; price: number }
  to: { id: string; displayName: string }
}

/** Payload de `gamification:gift` — chega em quem RECEBEU. */
export interface GiftNotice {
  fromId: string
  fromName: string
  cosmeticId: string
  cosmeticName: string
  cosmeticType: CosmeticType
  message: string | null
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

/**
 * Bônus de grupo: cada apostador distinto além do primeiro na mesma partida
 * soma 15% do valor no prêmio de quem acertar, até +60% (5 pessoas).
 */
export interface WagerGroupBonus {
  bettors: number
  percent: number
}

/**
 * Cofre da casa. As perdas de aposta enchem os dois: `bonusFund` paga o bônus
 * de grupo, e `jackpot` é o pote que sai numa partida com 4+ apostadores em
 * que todo mundo acertou.
 */
export interface WagerHouse {
  jackpot: number
  bonusFund: number
}

/** Quantos apostadores distintos a partida precisa pra disputar o pote. */
export const JACKPOT_MIN_BETTORS = 4

/**
 * Espelho de `groupBonusFor` do servidor (WAGER_GROUP_BONUS): +15% do valor
 * por apostador além do primeiro, até 5 pessoas, teto de 200 por aposta.
 * Só pra PRÉVIA — o servidor conta de novo na liquidação, e o bônus sai do
 * cofre da casa, então pode vir menor se o fundo estiver baixo.
 */
export function groupBonusPreview(amount: number, bettors: number): number {
  const extra = Math.max(0, Math.min(5, Math.floor(bettors)) - 1)
  return Math.min(200, Math.max(0, Math.round((amount * extra * 15) / 100)))
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
  /** Janela de 5 min ainda aberta? */
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
  /** Ausente em servidor antigo. */
  groupBonus?: WagerGroupBonus
  /** Cofre da casa: pote em jogo e fundo do bônus. Ausente em servidor antigo. */
  house?: WagerHouse
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
  /** Teto de aposta atual de quem pediu (rampa de 50 até 5000). */
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
  /** Ausente em cartão antigo. */
  groupBonus?: WagerGroupBonus
  bets: WagerBet[]
  settled: boolean
  result?: 'win' | 'loss' | 'remake' | 'unknown'
  /** `bonus` = parte do payout que veio do bônus de grupo. */
  payouts?: { userId: string; payout: number; bonus?: number }[]
  /** Pote pago nessa partida (dividido igualmente entre `winners`). */
  jackpot?: { amount: number; winners: number } | null
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
export const WAGER_MAX = 5000
export const WAGER_START_MAX = 50
export const WAGER_RAMP_BETS = 100
/** Só dá pra apostar nos 5 primeiros minutos da partida. */
export const WAGER_WINDOW_MS = 5 * 60 * 1000

/**
 * Quanto a aposta no COLEGA paga (2x, fixo). A aposta em si mesmo não tem
 * constante porque a odd é pessoal e muda a cada partida: vem do servidor em
 * `LiveWagerGame.self.odds.multiplier`.
 */
export const WAGER_PAYOUT_MULTIPLIER = 2

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
  gift: 'presente',
  purchase: 'compra na lojinha',
  refund: 'reembolso'
}

export function xpReasonLabel(reason: string | undefined | null): string {
  if (!reason) return ''
  // Murchos de nível vêm como `levelup:<nível>` (e `levelup:backfill` no
  // ajuste retroativo), então não dá pra ter uma chave fixa no mapa.
  if (reason.startsWith('gift:')) return 'presente'
  // Easter-egg achado (API: modules/easter-eggs.ts) — o nome do ovo já saiu no toast da badge.
  if (reason.startsWith('egg:')) return 'achou um ovo'
  // Recompensa por hora impressa (API: lib/print-queue/quota-math.ts) — `print_reward:<jobId>`.
  if (reason.startsWith('print_reward:')) return 'impressão concluída'
  if (reason.startsWith('print_hours_buy:')) return 'comprou horas de impressão'
  if (reason.startsWith('print_hours_sell:')) return 'vendeu horas de impressão'
  // Pôquer (API: lib/poker/table.ts) — `poker:<buyin|topup|cashout|refund>:<tableId>`.
  if (reason.startsWith('poker:')) {
    const kind = reason.split(':')[1]
    if (kind === 'buyin') return 'buy-in na mesa de pôquer'
    if (kind === 'topup') return 'recarga na mesa de pôquer'
    if (kind === 'cashout') return 'levantou da mesa de pôquer'
    if (kind === 'refund') return 'devolução da mesa de pôquer'
    return 'pôquer'
  }
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

/**
 * Uma linha do ranking de apostas (só apostas liquidadas). Devolução não é
 * acerto nem erro: fica fora de `wins`/`losses`. `net` = returned + jackpot − staked.
 */
export interface WagerRankingEntry {
  userId: string
  displayName: string
  avatar: string | null
  profileColor: string | null
  bets: number
  wins: number
  losses: number
  refunds: number
  staked: number
  returned: number
  jackpot: number
  net: number
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

/**
 * ThemeId de um cosmético `theme` (`theme:oceano` → "oceano"), ou null se não
 * for um — ou se for um tema que ESTA versão do launcher não conhece (API
 * mais nova que o app): aí não dá pra vestir, e a loja pede pra atualizar.
 */
export function cosmeticTheme(item: Pick<ShopItem, 'type' | 'data'> | undefined): ShopThemeId | null {
  if (item?.type !== 'theme') return null
  const id = item.data?.theme
  return isShopThemeId(id) ? id : null
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

  async achievements(token: string): Promise<AchievementsBoard> {
    return request<AchievementsBoard>('/gamification/achievements', { token })
  },

  async setShowcase(token: string, badgeIds: string[]): Promise<{ showcase: string[] }> {
    return request('/gamification/showcase', {
      method: 'PUT',
      token,
      body: JSON.stringify({ badgeIds })
    })
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

  /** Presente: eu pago, `toUserId` recebe o item. Mesmo preço da compra. */
  async gift(
    token: string,
    cosmeticId: string,
    toUserId: string,
    message?: string
  ): Promise<{ profile: GamificationProfile; gift: GiftResult }> {
    return request('/gamification/shop/gift', {
      method: 'POST',
      token,
      body: JSON.stringify({ cosmeticId, toUserId, message: message || undefined })
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

  /** `weekStart` (ISO) escolhe a semana; sem ele, a corrente. Ignorado em `all`. */
  async wagerRanking(
    token: string,
    period: LeaderboardPeriod,
    weekStart?: string
  ): Promise<WagerRankingEntry[]> {
    const params = new URLSearchParams({ period })
    if (period === 'week' && weekStart) params.set('weekStart', weekStart)
    const res = await request<{ entries: WagerRankingEntry[] }>(
      `/gamification/wagers/ranking?${params.toString()}`,
      { token }
    )
    return Array.isArray(res?.entries) ? res.entries : []
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

  /** Recaps anteriores, do mais novo pro mais velho (máx. 52 no servidor). */
  async recaps(token: string, limit = 12): Promise<WeeklyRecap[]> {
    const res = await request<{ recaps: WeeklyRecap[] }>(
      `/gamification/recaps?limit=${limit}`,
      { token }
    )
    return Array.isArray(res?.recaps) ? res.recaps : []
  },

  async recentGames(token: string, limit = 10): Promise<GameSessionSummary[]> {
    const res = await request<{ sessions: GameSessionSummary[] }>(
      `/games/recent?limit=${limit}`,
      { token }
    )
    return Array.isArray(res?.sessions) ? res.sessions : []
  }
}
