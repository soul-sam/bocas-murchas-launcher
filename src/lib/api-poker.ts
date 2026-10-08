import { request } from './api'

/**
 * Contrato com /api/poker e com os eventos `poker:*` do socket (ver
 * realtime/poker.ts e lib/poker/table.ts na API). O jogo anda por socket; o
 * REST é leitura: regras, estatísticas, ranking e histórico.
 *
 *   GET /poker/rules                 -> { stakes, seats, timers, rake, ... }
 *   GET /poker/me                    -> { stats }
 *   GET /poker/users/:id             -> { stats }
 *   GET /poker/leaderboard?period    -> { period, entries }
 *   GET /poker/hands?limit           -> { hands }
 */

// ============================================
// CARTAS
// ============================================

export type Suit = 's' | 'h' | 'd' | 'c'

export interface Card {
  /** 2..14 (valete 11, dama 12, rei 13, ás 14). */
  rank: number
  suit: Suit
}

const RANK_OF: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14
}

/** Como o valor aparece NA CARTA: 10 por extenso, figuras com a letra em português. */
export const RANK_FACE: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A'
}

export const RANK_NAME: Record<number, string> = {
  2: 'dois', 3: 'três', 4: 'quatro', 5: 'cinco', 6: 'seis', 7: 'sete', 8: 'oito', 9: 'nove',
  10: 'dez', 11: 'valete', 12: 'dama', 13: 'rei', 14: 'ás'
}

export const SUIT_NAME: Record<Suit, string> = {
  s: 'espadas',
  h: 'copas',
  d: 'ouros',
  c: 'paus'
}

export function parseCard(code: string): Card | null {
  if (!code || code.length < 2) return null
  const rank = RANK_OF[code[0].toUpperCase()]
  const suit = code[1].toLowerCase() as Suit
  if (!rank || !['s', 'h', 'd', 'c'].includes(suit)) return null
  return { rank, suit }
}

export function isRedSuit(suit: Suit): boolean {
  return suit === 'h' || suit === 'd'
}

export function cardLabel(code: string): string {
  const card = parseCard(code)
  if (!card) return code
  return `${RANK_NAME[card.rank]} de ${SUIT_NAME[card.suit]}`
}

// ============================================
// MÃOS
// ============================================

export type HandCategory =
  | 'high'
  | 'pair'
  | 'two-pair'
  | 'trips'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'quads'
  | 'straight-flush'
  | 'royal'

export const CATEGORY_LABEL: Record<HandCategory, string> = {
  high: 'Carta alta',
  pair: 'Par',
  'two-pair': 'Dois pares',
  trips: 'Trinca',
  straight: 'Sequência',
  flush: 'Flush',
  'full-house': 'Full house',
  quads: 'Quadra',
  'straight-flush': 'Straight flush',
  royal: 'Royal flush'
}

export interface HandRankingEntry {
  category: HandCategory
  name: string
  /** O que é, numa frase. */
  what: string
  /** Como desempata. */
  tie: string
  /** Exemplo desenhado na colinha. */
  example: string[]
  /**
   * Chance de TER essa mão (ou melhor não conta: é a chance de a sua melhor
   * mão no river ser exatamente esta) com 7 cartas, em porcentagem.
   */
  oddsRiver: number
  /** "1 em N" pra quem prefere assim. */
  oneIn: string
}

/**
 * A colinha, da mão mais forte pra mais fraca. As chances são as de Texas
 * Hold'em (melhor de 7 no river); as de 5 cartas secas que todo mundo decora
 * (royal 1 em 650 mil) são de outro jogo.
 */
export const HAND_RANKINGS: readonly HandRankingEntry[] = [
  {
    category: 'royal',
    name: 'Royal flush',
    what: 'Dez, valete, dama, rei e ás, todos do mesmo naipe. A melhor mão que existe; não tem empate possível além de dividir.',
    tie: 'Dois royal flushes só acontecem se os cinco estão na mesa — aí todo mundo divide.',
    example: ['Ts', 'Js', 'Qs', 'Ks', 'As'],
    oddsRiver: 0.0032,
    oneIn: '1 em 31 mil'
  },
  {
    category: 'straight-flush',
    name: 'Straight flush',
    what: 'Cinco cartas em sequência e do mesmo naipe. A roda (A-2-3-4-5) do mesmo naipe é o menor deles.',
    tie: 'Ganha a sequência mais alta. A carta de cima decide; o naipe não vale nada.',
    example: ['5h', '6h', '7h', '8h', '9h'],
    oddsRiver: 0.0279,
    oneIn: '1 em 3.600'
  },
  {
    category: 'quads',
    name: 'Quadra',
    what: 'Quatro cartas do mesmo valor e uma de fora (o kicker).',
    tie: 'Quadra maior ganha. Quadra igual (só com ela na mesa): ganha o kicker maior.',
    example: ['7c', '7d', '7h', '7s', 'Kd'],
    oddsRiver: 0.168,
    oneIn: '1 em 595'
  },
  {
    category: 'full-house',
    name: 'Full house',
    what: 'Uma trinca e um par juntos. "Reis cheios de quatros" = três reis e dois quatros.',
    tie: 'A trinca decide primeiro; só se for igual olha-se o par.',
    example: ['Kc', 'Kd', 'Kh', '4s', '4d'],
    oddsRiver: 2.6,
    oneIn: '1 em 38'
  },
  {
    category: 'flush',
    name: 'Flush',
    what: 'Cinco cartas do mesmo naipe, em qualquer ordem.',
    tie: 'Compara-se a carta mais alta; se empatar, a seguinte, até a quinta. Naipe não desempata.',
    example: ['Ad', '9d', '7d', '4d', '2d'],
    oddsRiver: 3.03,
    oneIn: '1 em 33'
  },
  {
    category: 'straight',
    name: 'Sequência',
    what: 'Cinco cartas seguidas, de naipes misturados. O ás pode ser a carta de cima (T-J-Q-K-A) ou a de baixo (A-2-3-4-5), mas não "dá a volta" (Q-K-A-2-3 não vale).',
    tie: 'Ganha a que termina na carta mais alta. A roda (até o 5) é a menor.',
    example: ['9c', 'Td', 'Jh', 'Qs', 'Kc'],
    oddsRiver: 4.62,
    oneIn: '1 em 22'
  },
  {
    category: 'trips',
    name: 'Trinca',
    what: 'Três cartas do mesmo valor e duas de fora. Com um par na mão vira "set"; com uma na mão e duas na mesa, "trips".',
    tie: 'Trinca maior ganha; igual, decide o maior kicker, depois o segundo.',
    example: ['Qc', 'Qd', 'Qh', '9s', '4c'],
    oddsRiver: 4.83,
    oneIn: '1 em 21'
  },
  {
    category: 'two-pair',
    name: 'Dois pares',
    what: 'Dois pares diferentes e uma carta de fora.',
    tie: 'O par mais alto decide; depois o mais baixo; depois o kicker. Só os dois pares maiores contam, mesmo que você tenha três.',
    example: ['Jc', 'Jd', '4h', '4s', 'Ac'],
    oddsRiver: 23.5,
    oneIn: '1 em 4'
  },
  {
    category: 'pair',
    name: 'Par',
    what: 'Duas cartas do mesmo valor e três de fora.',
    tie: 'Par maior ganha; igual, vão-se comparando os três kickers, do maior pro menor.',
    example: ['8c', '8d', 'Kh', '5s', '2c'],
    oddsRiver: 43.8,
    oneIn: '~1 em 2'
  },
  {
    category: 'high',
    name: 'Carta alta',
    what: 'Nada combinou: vale a carta mais alta das suas cinco melhores.',
    tie: 'Compara-se carta a carta, da maior pra menor. Empatou tudo: divide.',
    example: ['Ac', 'Jd', '9h', '6s', '3c'],
    oddsRiver: 17.4,
    oneIn: '1 em 6'
  }
]

// ============================================
// A MESA, como o servidor manda
// ============================================

export type TimerSpeed = 'normal' | 'turbo'
export type TableStatus = 'waiting' | 'playing' | 'closed'
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'done'
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin'

/** murchos (inteiros) ou brl (CENTAVOS, a mesa valendo). */
export type TableCurrency = 'murchos' | 'brl'

export interface StakePreset {
  id: string
  name: string
  currency: TableCurrency
  smallBlind: number
  bigBlind: number
  minBuyInBb: number
  maxBuyInBb: number
  /** Teto por pessoa por mesa (só a valendo tem: R$ 20). */
  capPerSeat?: number
}

export interface LegalActions {
  fold: boolean
  check: boolean
  call: number | null
  bet: { min: number; max: number } | null
  raise: { min: number; max: number } | null
  allin: number | null
}

export type HandEvent =
  | { seq: number; at: number; kind: 'blind'; seat: number; which: 'sb' | 'bb'; amount: number; allIn: boolean }
  | { seq: number; at: number; kind: 'deal' }
  | { seq: number; at: number; kind: 'action'; seat: number; action: ActionType; amount: number; allIn: boolean }
  | { seq: number; at: number; kind: 'street'; street: Street; board: string[] }
  | { seq: number; at: number; kind: 'refund'; seat: number; amount: number }
  | { seq: number; at: number; kind: 'show'; seat: number; cards: string[]; label: string }
  | { seq: number; at: number; kind: 'win'; seat: number; amount: number; label?: string; potIndex: number }
  | { seq: number; at: number; kind: 'muck'; seat: number }

export interface SeatView {
  index: number
  userId: string
  displayName: string
  avatar: string | null
  stack: number
  bet: number
  total: number
  inHand: boolean
  folded: boolean
  allIn: boolean
  sittingOut: boolean
  connected: boolean
  hasCards: boolean
  cards: string[] | null
  isButton: boolean
  isSmallBlind: boolean
  isBigBlind: boolean
  toAct: boolean
  lastAction: { type: string; amount: number } | null
  won: number | null
  best: { category: HandCategory; label: string } | null
  /** Tudo que você já pôs nesta mesa (só na sua vista). */
  boughtIn?: number | null
}

export interface ResultView {
  showdown: boolean
  rake: number
  pots: Array<{ amount: number; winners: number[]; label?: string; cards?: string[] }>
  hands: Record<string, { category: HandCategory; label: string; cards: string[] }>
}

export interface TableView {
  id: string
  name: string
  stake: StakePreset
  speed: TimerSpeed
  maxSeats: number
  status: TableStatus
  /**
   * O jogo começou (o "Começar" de quem abriu). Mesa nova nasce parada:
   * ninguém recebe cartas antes. Servidor antigo não manda (= começada).
   */
  started?: boolean
  /** EU posso apertar "Começar" (quem abriu; ou qualquer sentado, se quem abriu sumiu). */
  canStart?: boolean
  createdById: string
  handId: string | null
  handNumber: number
  street: Street | string | null
  board: string[]
  pot: number
  pots: Array<{ amount: number; eligible: number[] }>
  currentBet: number
  minRaise: number
  toAct: number | null
  deadline: number | null
  timerMs: number
  seats: (SeatView | null)[]
  mySeat: number | null
  legal: LegalActions | null
  result: ResultView | null
  resultUntil: number | null
  canShow: boolean
  log: HandEvent[]
  /** Quantos assistem (sem lugar). Servidor antigo contava os sentados também. */
  spectators: number
  /** A plateia, em ordem de chegada. Servidor antigo não manda. */
  watchers?: Watcher[]
  minBuyIn: number
  maxBuyIn: number
  pendingTopUp: number
}

export interface Watcher {
  userId: string
  displayName: string
  avatar: string | null
}

// ============================================
// REAÇÕES (poker:react / poker:reaction)
// ============================================

export type ReactionKind = 'emoji' | 'emote' | 'sticker' | 'gif' | 'sound'

/** O que o launcher manda: o servidor resolve url e nome. */
export interface ReactionInput {
  kind: ReactionKind
  /** emoji: o caractere; emote: o nome; sticker/sound: o id; gif: a url do Giphy. */
  value: string
  /** Lugar pra onde a reação voa (mirar em alguém). */
  to?: number | null
}

export interface PokerReaction {
  id: string
  at: number
  kind: ReactionKind
  from: { userId: string; displayName: string; avatar: string | null; seat: number | null }
  to: number | null
  emoji?: string
  emote?: { name: string; url: string }
  sticker?: { id: string; name: string; url: string }
  gif?: { url: string }
  sound?: { id: string; name: string; emoji: string; url: string; volume: number; durationMs: number }
}

export interface LobbyTable {
  id: string
  name: string
  stakeId: string
  currency: TableCurrency
  smallBlind: number
  bigBlind: number
  speed: TimerSpeed
  maxSeats: number
  seated: number
  players: Array<{ userId: string; displayName: string; avatar: string | null }>
  status: TableStatus
  /** O jogo já começou (servidor antigo não manda). */
  started?: boolean
  handCount: number
  createdById: string
  createdAt: number
  pot: number
  minBuyIn: number
  maxBuyIn: number
}

export interface PokerAck {
  ok: boolean
  error?: string
  /** Freio de clique duplo nas reações: não é erro, não mostra nada. */
  throttled?: boolean
  tableId?: string
  table?: TableView
  returned?: number
}

/** Card no chat (Message type 'poker'). Espelho de `cardMetadata` na API. */
export interface PokerCardMetadata {
  tableId: string
  name: string
  stakeId: string
  currency?: TableCurrency
  smallBlind: number
  bigBlind: number
  maxSeats: number
  speed: TimerSpeed
  status: TableStatus
  createdById: string
  seats: Array<{ userId: string; displayName: string; stack: number }>
  handCount: number
  biggestPot: number
  leader: { userId: string; net: number } | null
  closedAt: number | null
}

// ============================================
// REST
// ============================================

export interface PokerRules {
  stakes: StakePreset[]
  /** O servidor tem o Asaas ligado: a mesa valendo existe. */
  cashEnabled: boolean
  tableCapCents: number
  seats: { min: number; max: number }
  timers: Record<TimerSpeed, number>
  rake: { percent: number; capBb: number }
  missedTurnsToSitOut: number
  sitOutKickMinutes: number
}

export interface PokerStats {
  hands: number
  wins: number
  net: number
  biggestPot: number
  showdowns: number
  showdownsWon: number
  allIns: number
  bestCategory: HandCategory | null
  bestCategoryLabel: string | null
  steals: number
}

export interface PokerLeaderboardEntry {
  rank: number
  userId: string
  net: number
  hands: number
  wins: number
  biggestPot: number
  user: { id: string; displayName: string; avatar: string | null; profileColor: string | null } | null
}

export interface PokerHandHistory {
  id: string
  tableName: string
  stakeId: string
  currency: TableCurrency
  bigBlind: number
  pot: number
  showdown: boolean
  board: string[]
  playedAt: string
  me: {
    net: number
    won: boolean
    showdown: boolean
    allIn: boolean
    holeCards: string[]
    category: HandCategory | null
    label: string | null
  }
  players: Array<{
    userId: string
    displayName: string
    avatar: string | null
    net: number
    won: boolean
    holeCards: string[] | null
    label: string | null
  }>
}

export const poker = {
  rules: (token: string) => request<PokerRules>('/poker/rules', { token }),
  me: (token: string, currency: TableCurrency = 'murchos') =>
    request<{ stats: PokerStats }>(`/poker/me?currency=${currency}`, { token }).then((r) => r.stats),
  user: (token: string, userId: string, currency: TableCurrency = 'murchos') =>
    request<{ stats: PokerStats }>(`/poker/users/${userId}?currency=${currency}`, { token }).then((r) => r.stats),
  leaderboard: (token: string, period: 'week' | 'all', currency: TableCurrency = 'murchos') =>
    request<{ period: 'week' | 'all'; currency: TableCurrency; entries: PokerLeaderboardEntry[] }>(
      `/poker/leaderboard?period=${period}&currency=${currency}`,
      { token }
    ),
  hands: (token: string, limit = 20, currency: TableCurrency = 'murchos') =>
    request<{ hands: PokerHandHistory[] }>(`/poker/hands?limit=${limit}&currency=${currency}`, { token }).then(
      (r) => r.hands
    )
}

// ============================================
// Ajudantes de tela
// ============================================

/** "1.250" — fichas com separador de milhar, sem abreviar: na mesa o número exato importa. */
export function formatChips(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Math.round(value).toLocaleString('pt-BR')
}

/**
 * O valor na moeda da mesa: "1.250" em murchos, "R$ 12,50" na valendo. É
 * UMA função pra que nenhuma tela mostre centavos como se fossem fichas.
 */
export function formatMoney(value: number, currency: TableCurrency): string {
  if (currency === 'brl') return (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return formatChips(value)
}

/** Versão curta pra chip de aposta: "R$ 0,40" vira "0,40"; murchos ficam iguais. */
export function formatMoneyShort(value: number, currency: TableCurrency): string {
  if (currency === 'brl') return (value / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return formatChips(value)
}

export const CURRENCY_LABEL: Record<TableCurrency, string> = {
  murchos: 'murchos',
  brl: 'reais'
}

export const SPEED_LABEL: Record<TimerSpeed, string> = {
  normal: 'Normal',
  turbo: 'Turbo'
}

export const STREET_LABEL: Record<string, string> = {
  preflop: 'Pré-flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
  done: 'Fim da mão'
}

export const ACTION_LABEL: Record<string, string> = {
  fold: 'desiste',
  check: 'passa',
  call: 'paga',
  bet: 'aposta',
  raise: 'aumenta para',
  allin: 'all-in',
  'small blind': 'small blind',
  'big blind': 'big blind'
}

/** Rótulo curto pra etiqueta no assento. */
export const ACTION_TAG: Record<string, string> = {
  fold: 'Fold',
  check: 'Check',
  call: 'Call',
  bet: 'Bet',
  raise: 'Raise',
  allin: 'All-in',
  'small blind': 'SB',
  'big blind': 'BB'
}
