import * as React from 'react'
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Coins,
  DoorOpen,
  Eye,
  History,
  Loader2,
  Minus,
  Pause,
  Play,
  Plus,
  Trash2,
  X
} from 'lucide-react'
import { MurchosIcon } from '@/lib/bocas-icons'
import { UserAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/ui/tooltip'
import { resolveAssetUrl } from '@/lib/api'
import {
  ACTION_LABEL,
  ACTION_TAG,
  CATEGORY_LABEL,
  CURRENCY_LABEL,
  SPEED_LABEL,
  STREET_LABEL,
  formatMoney,
  formatMoneyShort,
  type HandCategory,
  type HandEvent,
  type LegalActions,
  type PokerAck,
  type SeatView,
  type TableView
} from '@/lib/api-poker'
import { cash as cashApi } from '@/lib/api-cash'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { useGamification } from '@/lib/gamification-context'
import { useLayout } from '@/lib/layout-context'
import { usePoker } from '@/lib/poker-context'
import { breakdown, chipFace, chipSet, sumChips, type ChipDenom } from '@/lib/poker-chips'
import { useSettings } from '@/lib/settings-context'
import { playUiSound, type UiSound } from '@/lib/ui-sounds'
import { useTicker } from '@/lib/use-now'
import { cn } from '@/lib/utils'
import { CARD_WIDTH, CardRow, FlipCard, PlayingCard, cardHeight, type CardSize } from './PlayingCard'
import { BRAND_MASK_STYLE, ChipFace, ChipPile, DealerChip } from './PokerGlyphs'
import { PLATEIA_VISIBLE, Plateia, ReactionButton, ReactionLayer, type ReactionGeometry, type ReactionTarget } from './PokerReactions'
import { WinFx, WinnerPlaque } from './PokerWinFx'
import './poker.css'

/**
 * A MESA — o trilho com o feltro, os assentos em volta no oval, a mesa
 * comunitária no meio, o SEU lugar embaixo (com as suas duas cartas grandes
 * em cima da placa) e o rodapé de ação.
 *
 * Tudo que aparece vem da vista que o servidor manda pra MIM (poker-context):
 * minhas cartas viradas, as dos outros não; a lista de jogadas legais já
 * calculada; o relógio como um prazo (epoch ms), nunca como "faltam 12 s" —
 * assim duas janelas da mesma pessoa mostram o mesmo anel, e um atraso na
 * rede não dá segundos a mais.
 *
 * O MEU ASSENTO FICA SEMPRE EMBAIXO, no centro: os outros giram em volta a
 * partir dele, no sentido horário. Quem assiste vê o assento 0 embaixo.
 *
 * Geometria (`computeLayout`): os outros assentos ficam numa elipse que
 * acompanha a borda do trilho (o avatar monta na beirada da mesa); o meu
 * lugar não está na elipse, está ancorado no pé da área. O MIOLO (pote,
 * cartas da mesa e a minha aposta) é medido em PIXELS a partir do tamanho
 * real da área: a maior carta que cabe entre a placa de quem senta em cima e
 * as minhas cartas, sem encostar em placa nenhuma — numa tela grande a mesa
 * usa cartas do tamanho das minhas. Cada aposta fica no feltro na frente de
 * quem apostou, no caminho até o meio, logo depois da placa. Tudo sai em %
 * da área, e cada coisa publica `--seat-x`/`--seat-y` pra que as animações
 * (cartas saindo do baralho, fichas indo pro pote, pote indo pro vencedor)
 * acertem o destino sem medir nada.
 *
 * Fichas (`lib/poker-chips`): cada mesa tem cinco fichas tiradas dos blinds,
 * e todo valor na mesa — aposta, pote — aparece como pilhas delas. A barra
 * de ação tem as mesmas fichas pra clicar: escolher fichas é empurrar as
 * fichas pro meio, como numa mesa de verdade.
 *
 * Valores: `fmt()` escreve na moeda da mesa — 1.250 (murchos) ou R$ 12,50
 * (mesa valendo). Nenhum número bruto chega ao JSX sem passar por ele.
 */

interface Geometry {
  /** Centro e raios da elipse dos assentos, em % da área. */
  cx: number
  cy: number
  rx: number
  ry: number
  /** `inset` do trilho (top right bottom left), em %. */
  rail: [number, number, number, number]
  /** Onde fica a mesa comunitária (centro das cartas) e o pote. */
  boardY: number
  potY: number
  /** Onde o baralho descansa. */
  deck: [number, number]
  /** Faixa de x permitida pros assentos (a placa não pode sair da tela). */
  clampX: [number, number]
}

const GEOMETRY_DESKTOP: Geometry = {
  cx: 50,
  cy: 48,
  rx: 40.5,
  ry: 34,
  rail: [13, 8, 17, 8],
  boardY: 52,
  potY: 38,
  deck: [39, 27],
  clampX: [10, 90]
}

const GEOMETRY_PHONE: Geometry = {
  cx: 50,
  cy: 44,
  rx: 38,
  ry: 32,
  rail: [10, 5, 26, 5],
  boardY: 48,
  potY: 35,
  deck: [37, 24],
  clampX: [16, 84]
}

/**
 * Ângulos dos assentos a partir do meu (embaixo, 90°), no sentido horário da
 * tela. Uma mesa de 6 tem um lugar no topo; a de 4 tem um em cada lado. No
 * celular os de cima abrem mais pra não cair em cima do cabeçalho.
 */
function seatAngles(count: number, phone: boolean): number[] {
  if (phone) {
    const PHONE: Record<number, number[]> = {
      2: [90, 270],
      3: [90, 215, 325],
      4: [90, 170, 270, 10],
      5: [90, 160, 230, 310, 20],
      6: [90, 150, 212, 270, 328, 30]
    }
    return PHONE[count] ?? PHONE[6]
  }
  const n = Math.max(2, count)
  return Array.from({ length: n }, (_, k) => (90 + (360 / n) * k) % 360)
}

function seatPositions(count: number, geo: Geometry, phone: boolean): Array<[number, number]> {
  return seatAngles(count, phone).map((deg) => {
    const rad = (deg * Math.PI) / 180
    const x = geo.cx + geo.rx * Math.cos(rad)
    const y = geo.cy + geo.ry * Math.sin(rad)
    return [Math.min(geo.clampX[1], Math.max(geo.clampX[0], x)), y]
  })
}

// ---------------------------------------------------------------------------
// O ritmo das cartas
// ---------------------------------------------------------------------------

/**
 * O crupiê na tela, em ms. As durações das animações moram no poker.css
 * (carta-voa 560, virada 520–720); aqui é QUANDO cada coisa começa.
 *
 * Mão nova: o baralho embaralha (SHUFFLE_MS) e só então as cartas saem, uma
 * por pessoa por vez, a partir de quem está depois do botão.
 *
 * A mesa: antes de cada rua uma carta vai pro monte das queimadas; o flop sai
 * de costas e vira UMA POR UMA; turn e river pousam de costas, levantam,
 * balançam acesos (o suspense) e viram devagar — no run-out de all-in, com
 * todo mundo de cartas abertas, o river segura mais. O servidor espera
 * 2,3 s entre as ruas do run-out (POKER.runoutStepMs): tudo aqui cabe nisso.
 */
const SHUFFLE_MS = 1_000
const DEAL_STEP_MS = 105
const CARD_FLY_MS = 560
const CARD_FLIP_MS = 520
const BURN_MS = 240

interface CardTiming {
  /** Sai do baralho. */
  fly: number
  /** Começa a virar. */
  flip: number
  flipMs: number
  /** Suspense antes de virar (0 = vira direto). */
  hold: number
}

/** Quando cada carta NOVA da mesa (de `from` até `to`) sai e vira, e quando tudo termina. */
function boardTimings(from: number, to: number, drama: boolean): { cards: CardTiming[]; endMs: number } {
  const n = to - from
  const cards: CardTiming[] = []
  if (n >= 3) {
    // Flop: as três saem de costas em fila e viram uma de cada vez.
    const flys = Array.from({ length: n }, (_, i) => BURN_MS - 20 + i * 90)
    const landed = flys[n - 1] + CARD_FLY_MS
    for (let i = 0; i < n; i++) cards.push({ fly: flys[i], flip: landed + 60 + i * 330, flipMs: CARD_FLIP_MS, hold: 0 })
  } else {
    // Turn, river (ou os dois de uma vez, um depois do outro).
    let at = 0
    for (let i = 0; i < n; i++) {
      const last = from + i === 4
      const hold = drama && last ? 720 : 420
      const flipMs = drama && last ? 720 : 640
      const fly = at + BURN_MS - 20
      const flip = fly + CARD_FLY_MS + hold
      cards.push({ fly, flip, flipMs, hold })
      at = flip + flipMs + 120
    }
  }
  const endMs = cards.reduce((m, c) => Math.max(m, c.flip + c.flipMs), 0)
  return { cards, endMs }
}

/** Quantas cartas foram queimadas até esta mesa: uma antes de cada rua. */
function burnsFor(boardLength: number): number {
  return boardLength >= 5 ? 3 : boardLength === 4 ? 2 : boardLength >= 3 ? 1 : 0
}

interface RevealState {
  handId: string | null
  /** Cartas da mesa que já apareceram (as próximas animam). */
  shown: number
  /** Ritmo de cada carta que entrou animando nesta mão (fica até a mão acabar: a carta não remonta no meio). */
  timings: Map<number, CardTiming>
  /** Até quando a mesa está virando cartas (epoch ms). */
  endAt: number
  burned: number
  /** A última leva de cartas da mesa, pros sons. */
  batch: { at: number; from: number; cards: CardTiming[] } | null
  /** Mão que começou com a tela aberta: embaralha e dá as cartas com som. */
  freshHand: boolean
}

/**
 * A revelação da mesa, decidida DURANTE o render (por ref): a carta tem que
 * nascer já com o atraso certo — um efeito depois do render remontaria a
 * carta no meio do voo. Quem abre a mesa no meio da mão vê as cartas paradas.
 */
function useReveal(table: TableView): RevealState {
  const ref = React.useRef<RevealState>({
    handId: table.handId,
    shown: table.board.length,
    timings: new Map(),
    endAt: 0,
    burned: burnsFor(table.board.length),
    batch: null,
    freshHand: false
  })
  const r = ref.current
  if (r.handId !== table.handId) {
    r.handId = table.handId
    // Mão nova começa sem mesa; se a vista já chega com cartas (abri a mesa
    // no meio), elas aparecem paradas.
    r.shown = table.board.length
    r.timings = new Map()
    r.burned = burnsFor(table.board.length)
    r.batch = null
    r.freshHand = !!table.handId && table.board.length === 0
    // Até as cartas de todo mundo pousarem e as minhas virarem, ninguém age por aqui.
    const dealt = table.seats.filter((s) => s?.inHand).length
    r.endAt = r.freshHand ? Date.now() + SHUFFLE_MS + Math.max(0, dealt * 2 - 1) * DEAL_STEP_MS + CARD_FLY_MS + 420 + CARD_FLIP_MS : 0
  }
  if (table.board.length > r.shown) {
    // Run-out de all-in (ninguém age, cartas abertas): o river segura mais.
    const others = table.seats.filter((s) => s && s.index !== table.mySeat && s.cards && !s.folded).length
    const drama = table.toAct === null && !table.result && others > 0
    const { cards, endMs } = boardTimings(r.shown, table.board.length, drama)
    cards.forEach((c, k) => r.timings.set(r.shown + k, c))
    r.batch = { at: Date.now(), from: r.shown, cards }
    r.endAt = Date.now() + endMs
    r.burned = burnsFor(table.board.length)
    r.shown = table.board.length
  } else if (table.board.length < r.shown) {
    r.shown = table.board.length
    r.burned = burnsFor(table.board.length)
  }
  return r
}

/** Toca um som da mesa no volume dos avisos (ou nada, se os avisos estão desligados). */
function useTableSound(): (name: UiSound) => void {
  const { settings } = useSettings()
  const ref = React.useRef(settings)
  ref.current = settings
  return React.useCallback((name: UiSound) => {
    const s = ref.current
    playUiSound(name, s.soundEnabled ? s.soundVolume : 0)
  }, [])
}

// ---------------------------------------------------------------------------
// Medidas
// ---------------------------------------------------------------------------

interface Layout {
  geo: Geometry
  w: number
  h: number
  phone: boolean
  boardCard: CardSize
  seatCard: CardSize
  heroCard: CardSize
  avatarPx: number
  /** Topo das cartas da mesa, em % (a placa do vencedor encosta nele por cima). */
  boardTopY: number
  /** Largura de uma ficha (px) no pote e numa aposta. */
  chipPot: number
  chipBet: number
  /** Por posição na roda (0 = embaixo): onde fica o assento e onde para a aposta dele, em %. */
  slots: Array<{ pos: [number, number]; bet: [number, number] }>
}

/** Placa de um assento (px): do centro do avatar pra baixo. */
function plateBox(phone: boolean): { half: number; h: number } {
  return phone ? { half: 52, h: 52 } : { half: 80, h: 64 }
}

/** Até onde (t) um raio saindo da origem na direção (ux, uy) continua dentro do retângulo. 0 = não cruza. */
function exitT(rect: [number, number, number, number], ux: number, uy: number): number {
  const [x0, y0, x1, y1] = rect
  let tMin = -Infinity
  let tMax = Infinity
  for (const [d, lo, hi] of [
    [ux, x0, x1],
    [uy, y0, y1]
  ] as const) {
    if (Math.abs(d) < 1e-6) {
      if (lo > 0 || hi < 0) return 0
      continue
    }
    const a = lo / d
    const b = hi / d
    tMin = Math.max(tMin, Math.min(a, b))
    tMax = Math.min(tMax, Math.max(a, b))
  }
  return tMax >= Math.max(tMin, 0) ? tMax : 0
}

function computeLayout(w: number, h: number, phone: boolean, maxSeats: number, heroSeated: boolean): Layout {
  const base = phone ? GEOMETRY_PHONE : GEOMETRY_DESKTOP
  const avatarPx = phone ? 44 : 56
  // Tela grande (janela maximizada num monitor grande): tudo um degrau acima.
  const big = !phone && w >= 1400 && h >= 860
  const seatCard: CardSize = phone ? 'xs' : big ? 'md' : w >= 1050 && h >= 540 ? 'ms' : 'sm'
  const heroCard: CardSize = phone ? 'md' : big ? 'xl' : 'lg'
  const positions = seatPositions(maxSeats, base, phone)
  const heroPos: [number, number] = [50, 100 - base.rail[2] - 3]

  // Antes da primeira medida (ou num teste sem layout): a geometria fixa de sempre.
  if (w <= 0 || h <= 0) {
    const slots = positions.map((pos, slot) => {
      const p: [number, number] = slot === 0 && heroSeated ? heroPos : pos
      return { pos: p, bet: [p[0] + (50 - p[0]) * 0.4, p[1] + (base.potY + 6 - p[1]) * 0.45] as [number, number] }
    })
    return {
      geo: base,
      w,
      h,
      phone,
      boardCard: phone ? 'sm' : 'md',
      seatCard,
      heroCard,
      avatarPx,
      boardTopY: base.boardY - 8,
      chipPot: phone ? 16 : 22,
      chipBet: phone ? 14 : 18,
      slots
    }
  }

  const plate = plateBox(phone)
  const seatCardH = cardHeight(seatCard)
  const seatCardsHalf = CARD_WIDTH[seatCard] * 0.9
  const boxes = positions.slice(heroSeated ? 1 : 0).map(([x, y]) => {
    const px = (x * w) / 100
    const py = (y * h) / 100
    return {
      cy: py,
      left: px - plate.half,
      right: px + plate.half,
      top: py - avatarPx / 2 - seatCardH * 0.55,
      bottom: py + avatarPx / 2 - 6 + plate.h
    }
  })
  const heroTop = h - 4 - (phone ? 66 : 78) - cardHeight(heroCard) + 8
  const feltTop = (h * base.rail[0]) / 100 + 22
  const feltBottom = h - (h * base.rail[2]) / 100 - 22
  const midY = (feltTop + (heroSeated ? heroTop : feltBottom)) / 2
  const gap = phone ? 5 : 8

  // A maior carta da mesa que cabe no miolo sem encostar em ninguém.
  const candidates: CardSize[] = phone ? ['md', 'ms', 'sm'] : ['xl', 'lg', 'ml', 'md', 'sm']
  let chosen: { size: CardSize; top: number; bottom: number; potH: number; chipPot: number; chipBet: number } | null = null
  for (const size of candidates) {
    const cw = CARD_WIDTH[size]
    const ch = cardHeight(size)
    const rowW = 5 * cw + 4 * gap
    const chipPot = Math.round(Math.max(16, Math.min(32, cw * 0.32)))
    const chipBet = Math.round(Math.max(14, Math.min(27, cw * 0.27)))
    const potH = Math.round(chipPot * 1.75) + 4
    // A minha aposta fica do lado das minhas cartas, não no miolo: o miolo
    // inteiro é do pote e das cartas da mesa.
    const blockH = potH + 10 + ch
    const halfW = Math.max(rowW, 240) / 2 + 10
    let top = feltTop
    let bottom = heroSeated ? heroTop - 6 : feltBottom
    for (const b of boxes) {
      if (b.right < w / 2 - halfW || b.left > w / 2 + halfW) continue
      if (b.cy < midY) top = Math.max(top, b.bottom + 6)
      else bottom = Math.min(bottom, b.top - 6)
    }
    chosen = { size, top, bottom, potH, chipPot, chipBet }
    if (bottom - top >= blockH && rowW <= w - 2 * (phone ? 18 : 40)) break
  }
  const c = chosen!
  const ch = cardHeight(c.size)
  const rowW = 5 * CARD_WIDTH[c.size] + 4 * gap
  const blockH = c.potH + 10 + ch
  const blockTop = c.top + Math.max(0, (c.bottom - c.top - blockH) / 2)
  const potY = blockTop + c.potH / 2
  const boardY = blockTop + c.potH + 10 + ch / 2
  // A minha aposta: à esquerda das minhas cartas, na altura do terço de cima delas.
  const heroBetX = w / 2 - (CARD_WIDTH[heroCard] * 0.9 + 22 + c.chipBet)
  const heroBetY = heroTop + cardHeight(heroCard) * 0.3
  const pct = (px: number, total: number): number => (px * 100) / total

  const geo: Geometry = {
    ...base,
    boardY: pct(boardY, h),
    potY: pct(potY, h),
    // O baralho fica do lado do pote, à esquerda: é de lá que tudo sai.
    deck: [pct(w / 2 - (phone ? 112 : 160), w), pct(potY, h)]
  }

  // Onde a aposta de cada assento para: saindo do avatar em direção ao meio,
  // logo depois da placa (e das cartas que espiam atrás do avatar). Se cair
  // em cima do pote ou das cartas da mesa, desvia pro lado.
  const potRect = { x0: w / 2 - 120, x1: w / 2 + 120, y0: potY - c.potH / 2, y1: potY + c.potH / 2 }
  const boardRect = { x0: w / 2 - rowW / 2 - 6, x1: w / 2 + rowW / 2 + 6, y0: boardY - ch / 2 - 6, y1: boardY + ch / 2 + 6 }
  const pileR = c.chipBet * 1.1
  const hits = (x: number, y: number, r: typeof potRect): boolean =>
    x + pileR > r.x0 && x - pileR < r.x1 && y + pileR > r.y0 && y - pileR < r.y1
  const betFor = (pos: [number, number]): [number, number] => {
    const sx = (pos[0] * w) / 100
    const sy = (pos[1] * h) / 100
    let ux = w / 2 - sx
    let uy = boardY - sy
    const len = Math.hypot(ux, uy) || 1
    ux /= len
    uy /= len
    const rects: Array<[number, number, number, number]> = [
      [-plate.half, avatarPx / 2 - 6, plate.half, avatarPx / 2 - 6 + plate.h],
      [-seatCardsHalf, -avatarPx / 2 - seatCardH * 0.6, seatCardsHalf, 0]
    ]
    const place = (dx: number, dy: number): [number, number] => {
      const t = Math.max(avatarPx / 2, ...rects.map((r) => exitT(r, dx, dy))) + 8 + pileR
      return [sx + dx * t, sy + dy * t]
    }
    // Desvia aos poucos, pros dois lados, até achar feltro livre: quem senta
    // do lado põe a aposta do lado da placa, quem senta em cima, logo abaixo
    // e de lado do pote.
    let spot = place(ux, uy)
    for (const deg of [0, -20, 20, -40, 40, -60, 60]) {
      const a = (deg * Math.PI) / 180
      const at = place(ux * Math.cos(a) - uy * Math.sin(a), ux * Math.sin(a) + uy * Math.cos(a))
      if (!hits(at[0], at[1], potRect) && !hits(at[0], at[1], boardRect)) {
        spot = at
        break
      }
    }
    return [pct(spot[0], w), pct(spot[1], h)]
  }

  const slots = positions.map((pos, slot) => {
    if (slot === 0 && heroSeated) return { pos: heroPos, bet: [pct(heroBetX, w), pct(heroBetY, h)] as [number, number] }
    return { pos, bet: betFor(pos) }
  })

  return {
    geo,
    w,
    h,
    phone,
    boardCard: c.size,
    seatCard,
    heroCard,
    avatarPx,
    boardTopY: pct(boardY - ch / 2, h),
    chipPot: c.chipPot,
    chipBet: c.chipBet,
    slots
  }
}

/** Largura e altura da área da mesa, acompanhando a janela. */
function useAreaSize(ref: React.RefObject<HTMLElement | null>): { w: number; h: number } {
  const [size, setSize] = React.useState({ w: 0, h: 0 })
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = (): void => {
      const w = Math.round(el.clientWidth)
      const h = Math.round(el.clientHeight)
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

// ---------------------------------------------------------------------------
// A tela
// ---------------------------------------------------------------------------

export function PokerTable(props: {
  onOpenRules: (category?: HandCategory | null) => void
  /** Mesa valendo: abre o caixa pra depositar (quem quebrou e está sem saldo). */
  onOpenCash?: () => void
}) {
  const { table } = usePoker()
  if (!table) return null
  return <TableScreen table={table} {...props} />
}

function TableScreen({
  table,
  onOpenRules,
  onOpenCash
}: {
  table: TableView
  onOpenRules: (category?: HandCategory | null) => void
  onOpenCash?: () => void
}) {
  const { leaveTable, act, sit, stand, topUp, sitOut, show, closeTable, start, seatedAt, reactions } = usePoker()
  const { user } = useAuth()
  const { isPhone } = useLayout()
  const reveal = useReveal(table)
  const sound = useTableSound()
  const [sitAt, setSitAt] = React.useState<number | null>(null)
  const [topUpOpen, setTopUpOpen] = React.useState(false)
  const [confirmStand, setConfirmStand] = React.useState(false)
  const [logOpen, setLogOpen] = React.useState(false)
  const [logShown, setLogShown] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  /** Mão em que a pessoa mandou o aviso de "quebrou" embora (volta na próxima). */
  const [bustDismissedFor, setBustDismissedFor] = React.useState<string | null>(null)
  /** As fichas escolhidas na barra (null = não está usando fichas). */
  const [picked, setPicked] = React.useState<number[] | null>(null)
  const [reactOpen, setReactOpen] = React.useState(false)
  const [reactTarget, setReactTarget] = React.useState<ReactionTarget | null>(null)
  const areaRef = React.useRef<HTMLDivElement>(null)
  const area = useAreaSize(areaRef)

  React.useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 4_500)
    return () => clearTimeout(t)
  }, [error])

  // Sentou (ou a mesa fechou): o diálogo de buy-in não tem mais razão de ser.
  React.useEffect(() => {
    if (table.mySeat !== null) setSitAt(null)
  }, [table.mySeat])

  const me = table.mySeat !== null ? table.seats[table.mySeat] : null
  const myTurn = me !== null && table.toAct === table.mySeat && !!table.legal

  // Fichas escolhidas valem pra ESTA vez: mão, rua ou aposta nova zeram.
  React.useEffect(() => {
    setPicked(null)
  }, [table.handId, table.street, table.currentBet, myTurn])

  const layout = React.useMemo(
    () => computeLayout(area.w, area.h, isPhone, table.maxSeats, table.mySeat !== null),
    [area.w, area.h, isPhone, table.maxSeats, table.mySeat]
  )
  const geo = layout.geo
  const set = React.useMemo(() => chipSet(table.stake.smallBlind, table.stake.bigBlind), [table.stake.smallBlind, table.stake.bigBlind])

  const fmt = (v: number): string => formatMoney(v, table.stake.currency)
  const inHand = !!me?.inHand && !me.folded
  const isOwner = table.createdById === user?.id || user?.role === 'admin'
  const canSitHere = table.mySeat === null && (!seatedAt || seatedAt.id === table.id) && table.status !== 'closed'
  const watchers = table.watchers ?? []

  const run = async (fn: () => Promise<PokerAck>, after?: () => void): Promise<void> => {
    if (busy) return
    setBusy(true)
    const ack = await fn()
    setBusy(false)
    if (!ack.ok) {
      setError(ack.error ?? 'Deu ruim.')
      return
    }
    after?.()
  }

  // Assentos girados: o meu (ou o 0) embaixo, os outros no sentido horário.
  const anchor = table.mySeat ?? 0
  const rotated = table.seats.map((seat, index) => {
    const slot = (index - anchor + table.maxSeats) % table.maxSeats
    const s = layout.slots[slot] ?? layout.slots[0]
    return { index, seat, pos: s.pos, bet: s.bet, slot }
  })
  // Quem recebeu cartas nesta mão, na ordem em que o crupiê dá: a partir de
  // quem está depois do botão. Estável a mão inteira (fold não muda nada:
  // mudar o atraso de uma carta já pousada a faria voar de novo).
  const inHandKey = table.seats.map((s) => (s?.inHand ? 1 : 0)).join('')
  const dealRank = React.useMemo(() => {
    const n = table.maxSeats
    const btn = table.seats.find((s) => s?.isButton)?.index ?? -1
    const order = table.seats
      .filter((s): s is SeatView => !!s && s.inHand)
      .map((s) => s.index)
      .sort((a, b) => ((a - btn - 1 + 2 * n) % n) - ((b - btn - 1 + 2 * n) % n))
    return new Map(order.map((index, rank) => [index, rank]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.handId, inHandKey])
  const dealing = Math.max(1, dealRank.size)
  const dealOffset = reveal.freshHand ? SHUFFLE_MS : 0

  // Os sons do crupiê: embaralhar e uma carta por vez (só com a mesa na tela).
  React.useEffect(() => {
    if (!reveal.freshHand || !table.handId) return
    const timers: Array<ReturnType<typeof setTimeout>> = []
    sound('poker-shuffle')
    for (let k = 0; k < dealing * 2; k++) timers.push(setTimeout(() => sound('poker-card'), SHUFFLE_MS + k * DEAL_STEP_MS + 30))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.handId])
  // ...e as da mesa: a queimada, cada carta saindo e cada uma virando.
  React.useEffect(() => {
    const b = reveal.batch
    if (!b || Date.now() - b.at > 1_500) return
    const timers: Array<ReturnType<typeof setTimeout>> = []
    const at = (ms: number, name: UiSound): void => {
      timers.push(setTimeout(() => sound(name), Math.max(0, b.at + ms - Date.now())))
    }
    b.cards.forEach((c, i) => {
      if (i === 0 || c.hold) at(c.fly - BURN_MS + 20, 'poker-card')
      at(c.fly + 30, 'poker-card')
      at(c.flip + 40, 'poker-flip')
    })
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.handId, table.board.length])

  // Enquanto o crupiê dá ou a mesa vira, a barra espera: ninguém aposta sem ver a carta.
  const [, rerender] = React.useReducer((x: number) => x + 1, 0)
  const locked = Date.now() < reveal.endAt
  React.useEffect(() => {
    const ms = reveal.endAt - Date.now()
    if (ms <= 0) return
    const timer = setTimeout(rerender, ms + 30)
    return () => clearTimeout(timer)
  }, [reveal.endAt])

  const ghosts = useGhosts(table, rotated)

  const myCategory = me?.best?.category ?? null

  // QUEBROU: pilha zerada, sem recarga a caminho, e a mão que zerou já
  // acabou (all-in no meio da mão ainda não é quebrar). Enquanto o aviso
  // está na tela a pessoa decide: recarrega, levanta ou fica olhando.
  const busted =
    !!me &&
    me.stack === 0 &&
    table.pendingTopUp === 0 &&
    (table.result !== null || !me.inHand || me.folded)
  const bustKey = table.handId ?? 'sem-mao'
  const showBusted = busted && bustDismissedFor !== bustKey

  // Onde cada reação nasce: no assento de quem mandou, ou no avatar dela na plateia.
  const reactionGeometry = React.useMemo<ReactionGeometry>(() => {
    const bySeat = new Map(rotated.map((r) => [r.index, r.pos] as const))
    return {
      seatPos: (seat) => bySeat.get(seat) ?? null,
      watcherPos: (userId) => {
        const i = Math.min(PLATEIA_VISIBLE - 1, Math.max(0, watchers.findIndex((w) => w.userId === userId)))
        const w = area.w || 1000
        const h = area.h || 600
        // A plateia mora no canto de cima à direita; o avatar i fica i passos pra esquerda do último.
        return [100 - ((isPhone ? 30 : 36) + i * (isPhone ? 16 : 20)) * (100 / w), (isPhone ? 30 : 34) * (100 / h)]
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, table.mySeat, table.maxSeats, watchers.map((w) => w.userId).join(','), area.w, area.h, isPhone])

  const myBet = me?.bet ?? 0
  const pickedSum = picked ? sumChips(picked) : 0

  const areaStyle = {
    ['--deck-x' as string]: geo.deck[0],
    ['--deck-y' as string]: geo.deck[1],
    ['--pot-y' as string]: geo.potY
  } as React.CSSProperties

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Cabeçalho da mesa: fino e translúcido, a sala continua atrás. */}
      <header className="relative z-conteudo flex shrink-0 items-center gap-2 border-b border-line/50 bg-void/40 px-2 py-1.5 backdrop-blur-sm sm:px-3">
        <button type="button" onClick={leaveTable} className="poker-topo-botao">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Saguão
        </button>
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-sm font-semibold leading-tight text-foreground">{table.name}</p>
          <p className="truncate text-[11.5px] leading-tight text-muted-foreground">
            {table.stake.currency === 'brl' ? 'Valendo' : 'Murchos'} · blinds{' '}
            <span className="font-mono">{formatMoneyShort(table.stake.smallBlind, table.stake.currency)}</span>/
            <span className="font-mono">{formatMoneyShort(table.stake.bigBlind, table.stake.currency)}</span> ·{' '}
            {SPEED_LABEL[table.speed]}
            {table.handNumber > 0 && (
              <>
                {' '}
                · mão <span className="font-mono">{table.handNumber}</span>
              </>
            )}
            {!table.watchers && table.spectators > 0 && (
              <>
                {' '}
                · <Eye className="inline h-3 w-3" aria-hidden /> <span className="font-mono">{table.spectators}</span>
              </>
            )}
          </p>
        </div>
        {!isPhone && (
          <Hint label={logShown ? 'Esconder o histórico' : 'Mostrar o histórico'} side="bottom">
            <button
              type="button"
              onClick={() => setLogShown((v) => !v)}
              aria-pressed={logShown}
              aria-label="Histórico da mão"
              className={cn('poker-topo-botao hidden lg:inline-flex', logShown && 'text-foreground')}
            >
              <History className="h-3.5 w-3.5" aria-hidden />
            </button>
          </Hint>
        )}
        <Hint label="Colinha e regras" description="As combinações, do royal flush à carta alta, e as regras da mesa." side="bottom">
          <button type="button" onClick={() => onOpenRules(myCategory)} aria-label="Colinha" className="poker-topo-botao">
            <BookOpen className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Colinha</span>
          </button>
        </Hint>
        {isOwner && (
          <Hint label="Fechar a mesa" description="Todo mundo levanta e leva as fichas. Só entre uma mão e outra." side="bottom">
            <button
              type="button"
              disabled={busy || (table.street !== null && table.street !== 'done')}
              onClick={() => void run(() => closeTable(table.id))}
              aria-label="Fechar a mesa"
              className="poker-topo-botao hover:!border-destructive/60 hover:!text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </Hint>
        )}
      </header>

      <div className={cn('flex min-h-0 flex-1', isPhone ? 'flex-col' : 'flex-row')}>
        {/* A sala */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div ref={areaRef} className="poker-area relative min-h-0 flex-1 overflow-hidden" style={areaStyle}>
            {/* A mesa: trilho, filete e feltro */}
            <div
              className="poker-mesa"
              style={{ top: `${geo.rail[0]}%`, right: `${geo.rail[1]}%`, bottom: `${geo.rail[2]}%`, left: `${geo.rail[3]}%` }}
            >
              <div className="poker-felt">
                <span aria-hidden className="poker-marca" style={BRAND_MASK_STYLE} />
              </div>
            </div>

            <Deck size={isPhone ? 'xs' : 'sm'} shuffleKey={reveal.freshHand ? table.handId : null} burned={reveal.burned} />

            <Board table={table} fmt={fmt} layout={layout} set={set} timings={reveal.timings} />

            {table.street === null && (
              <WaitingCenter
                table={table}
                topY={geo.boardY}
                canStart={!!table.canStart || (user?.role === 'admin' && table.started === false)}
                busy={busy}
                onStart={() => void run(() => start(table.id))}
              />
            )}

            {ghosts.map((g) => (
              <Ghost key={g.id} ghost={g} table={table} set={set} layout={layout} />
            ))}

            {rotated.map(({ index, seat, pos, bet }) =>
              index === table.mySeat && seat ? (
                <HeroSeat
                  key={index}
                  table={table}
                  seat={seat}
                  pos={pos}
                  bet={bet}
                  dealOrder={dealRank.get(index) ?? 0}
                  dealing={dealing}
                  dealOffset={dealOffset}
                  fmt={fmt}
                  layout={layout}
                  set={set}
                  myTurn={myTurn}
                  staged={myTurn && picked && pickedSum > 0 ? pickedSum : 0}
                  onOpenRules={onOpenRules}
                />
              ) : (
                <SeatSpot
                  key={index}
                  table={table}
                  index={index}
                  seat={seat}
                  pos={pos}
                  bet={bet}
                  dealOrder={dealRank.get(index) ?? 0}
                  dealing={dealing}
                  dealOffset={dealOffset}
                  canSit={canSitHere}
                  onSit={() => setSitAt(index)}
                  fmt={fmt}
                  layout={layout}
                  set={set}
                />
              )
            )}

            {table.result && <WinFx key={table.handId ?? 'mao'} table={table} rotated={rotated} geo={geo} set={set} />}
            {table.result && <WinnerPlaque key={`placa-${table.handId}`} table={table} fmt={fmt} topY={layout.boardTopY} />}

            <ReactionLayer reactions={reactions} geometry={reactionGeometry} />

            {/* A plateia, no canto de cima. */}
            <div className="absolute right-2 top-2 z-[17]">
              <Plateia watchers={watchers} compact={isPhone} />
            </div>

            {/* Reagir: o botão redondo no canto de baixo. */}
            <div className={cn('absolute z-[17]', isPhone ? 'bottom-2 right-2' : 'bottom-3 right-3')}>
              <ReactionButton
                table={table}
                target={reactTarget}
                onTargetChange={setReactTarget}
                open={reactOpen}
                onOpenChange={setReactOpen}
                compact={isPhone}
              />
            </div>

            {error && (
              <p
                role="alert"
                className="poker-aviso absolute left-1/2 top-3 z-flutuante max-w-[90%] -translate-x-1/2 rounded-full border border-destructive/60 bg-void/90 px-4 py-1.5 text-center text-xs text-destructive shadow-[0_8px_24px_rgb(0_0_0/0.5)]"
              >
                {error}
              </p>
            )}

            {showBusted && me && (
              <BustedOverlay
                table={table}
                seat={me}
                busy={busy}
                onTopUp={(amount) => void run(() => topUp(table.id, amount))}
                onStand={() => void run(() => stand(table.id))}
                onDismiss={() => setBustDismissedFor(bustKey)}
                onOpenCash={onOpenCash}
              />
            )}

            {sitAt !== null && (
              <SitDialog
                table={table}
                seat={sitAt}
                busy={busy}
                onClose={() => setSitAt(null)}
                onConfirm={(amount) => void run(() => sit(table.id, sitAt, amount), () => setSitAt(null))}
              />
            )}
            {topUpOpen && me && (
              <TopUpDialog
                table={table}
                seat={me}
                busy={busy}
                onClose={() => setTopUpOpen(false)}
                onConfirm={(amount) => void run(() => topUp(table.id, amount), () => setTopUpOpen(false))}
              />
            )}
          </div>

          {/* O rodapé de ação */}
          <footer className={cn('poker-dock shrink-0 px-3 py-2', myTurn && 'poker-dock--vez')}>
            {me ? (
              <div className={cn('flex gap-3', isPhone ? 'flex-col' : 'flex-row items-end')}>
                {/* Esquerda: a sua mesa — pilha, recarga, levantar; e a linha de estado. */}
                <div className={cn('flex min-w-0 flex-col gap-1.5', isPhone ? '' : 'w-[300px] shrink-0 xl:w-[340px]')}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {table.canShow && (
                      <button type="button" className="poker-mini" onClick={() => void run(() => show(table.id))}>
                        <Eye className="h-3 w-3" aria-hidden />
                        Mostrar
                      </button>
                    )}
                    <button type="button" className="poker-mini" onClick={() => setTopUpOpen(true)}>
                      <Plus className="h-3 w-3" aria-hidden />
                      Recarregar
                    </button>
                    <button type="button" className="poker-mini" onClick={() => void run(() => sitOut(table.id, !me.sittingOut))}>
                      {me.sittingOut ? <Play className="h-3 w-3" aria-hidden /> : <Pause className="h-3 w-3" aria-hidden />}
                      {me.sittingOut ? 'Voltar' : 'Sentar fora'}
                    </button>
                    <button
                      type="button"
                      className={cn('poker-mini', confirmStand && 'poker-mini--perigo')}
                      onClick={() => {
                        if (!confirmStand) {
                          setConfirmStand(true)
                          setTimeout(() => setConfirmStand(false), 4_000)
                          return
                        }
                        setConfirmStand(false)
                        void run(() => stand(table.id))
                      }}
                    >
                      <DoorOpen className="h-3 w-3" aria-hidden />
                      {confirmStand ? (inHand ? 'Desistir e levantar?' : 'Levantar mesmo?') : 'Levantar'}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {table.stake.currency === 'brl' ? <Coins className="h-3.5 w-3.5 text-burn" aria-hidden /> : <MurchosIcon className="h-3.5 w-3.5 text-burn" aria-hidden />}
                      pilha <span className="font-mono text-foreground">{fmt(me.stack)}</span>
                      {table.pendingTopUp > 0 && (
                        <span>
                          {' '}
                          (+<span className="font-mono">{fmt(table.pendingTopUp)}</span> na próxima)
                        </span>
                      )}
                    </span>
                    {busted && !showBusted && (
                      <button
                        type="button"
                        onClick={() => setBustDismissedFor(null)}
                        className="poker-quebrou-chama rounded-full border border-destructive/60 bg-destructive/10 px-2 py-0.5 text-[11.5px] text-destructive transition-colors hover:bg-destructive/20"
                      >
                        sem fichas — recarregar
                      </button>
                    )}
                    <WaitingLine table={table} me={me} />
                  </div>
                  {/* As fichas pra empurrar: no desktop moram aqui, embaixo da pilha. */}
                  {!isPhone && (
                    <ChipTray
                      table={table}
                      set={set}
                      legal={myTurn && !locked ? table.legal : null}
                      myBet={myBet}
                      myStack={me.stack}
                      picked={picked}
                      onPick={setPicked}
                      fmt={fmt}
                    />
                  )}
                </div>

                {/* Direita: a aposta. */}
                <div className="min-w-0 flex-1">
                  {isPhone && (
                    <ChipTray
                      table={table}
                      set={set}
                      legal={myTurn && !locked ? table.legal : null}
                      myBet={myBet}
                      myStack={me.stack}
                      picked={picked}
                      onPick={setPicked}
                      fmt={fmt}
                      compact
                    />
                  )}
                  <ActionBar
                    table={table}
                    legal={myTurn ? table.legal : null}
                    busy={busy}
                    fmt={fmt}
                    phone={isPhone}
                    myBet={myBet}
                    picked={picked}
                    locked={locked}
                    onClearPicked={() => setPicked(null)}
                    onAct={(type, amount) => void run(() => act(table.id, type, amount), () => setPicked(null))}
                  />
                </div>
              </div>
            ) : (
              <p className="py-1 text-center text-xs text-muted-foreground">
                {canSitHere
                  ? table.seats.some((s) => s === null)
                    ? 'Você está assistindo. Clique num lugar vazio pra sentar.'
                    : 'Mesa cheia. Você está assistindo.'
                  : seatedAt && seatedAt.id !== table.id
                    ? `Você está sentado em "${seatedAt.name}". Levante de lá pra sentar aqui.`
                    : 'Você está assistindo.'}
              </p>
            )}
          </footer>
        </div>

        {/* Histórico da mão */}
        <aside
          className={cn(
            'shrink-0 border-line bg-void/80',
            isPhone ? 'border-t' : cn('hidden w-60 border-l lg:flex-col', logShown && 'lg:flex')
          )}
        >
          {isPhone ? (
            <>
              <button
                type="button"
                onClick={() => setLogOpen((v) => !v)}
                aria-expanded={logOpen}
                className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground"
              >
                Histórico da mão
                {logOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </button>
              {logOpen && <HandLog table={table} fmt={fmt} className="max-h-40" />}
            </>
          ) : (
            <>
              <h4 className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-xs font-semibold text-foreground">
                <History className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                Histórico da mão
              </h4>
              <HandLog table={table} fmt={fmt} className="min-h-0 flex-1" />
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// O baralho, a mesa comunitária e o pote
// ---------------------------------------------------------------------------

/** Como as oito cartas do embaralhar voltam pro maço: intercaladas, uma de cada metade. */
const RIFFLE = Array.from({ length: 8 }, (_, k) => ({
  side: k % 2 === 0 ? -1 : 1,
  i: Math.floor(k / 2),
  back: 330 + k * 70
}))

/**
 * O baralho no lugar do crupiê: três cartas viradas, um fio fora do lugar.
 * Mão nova (`shuffleKey`): o maço se abre em duas metades que se intercalam
 * e bate na mesa — só então as cartas saem. Do lado, de costas e tortas, as
 * queimadas da mão (uma antes de cada rua).
 */
function Deck({ size, shuffleKey, burned }: { size: 'xs' | 'sm'; shuffleKey: string | null; burned: number }) {
  const w = size === 'xs' ? 24 : 42
  const h = size === 'xs' ? 34 : 59
  // A última queimada chega voando; as anteriores já estão no monte.
  const seen = React.useRef(burned)
  const fresh = burned > seen.current ? burned - 1 : -1
  React.useEffect(() => {
    seen.current = burned
  }, [burned])
  return (
    <div key={shuffleKey ?? 'baralho'} className={cn('poker-baralho', shuffleKey && 'poker-baralho--embaralha')} aria-hidden>
      <div className="relative" style={{ width: w, height: h }}>
        {Array.from({ length: burned }, (_, q) => (
          <PlayingCard
            key={`q${q}`}
            faceDown
            size={size}
            className={cn('poker-queimada', q === fresh && 'poker-queimada--nova')}
            style={{ ['--q' as string]: q } as React.CSSProperties}
          />
        ))}
        <div className="poker-baralho-repouso">
          <PlayingCard faceDown size={size} style={{ transform: 'translate(-2px, 3px) rotate(-4deg)', opacity: 0.85 }} />
          <PlayingCard faceDown size={size} style={{ transform: 'translate(-1px, 1.5px) rotate(-1.5deg)', opacity: 0.92 }} />
          <PlayingCard faceDown size={size} />
        </div>
        {shuffleKey &&
          RIFFLE.map((c, k) => (
            <PlayingCard
              key={`e${k}`}
              faceDown
              size={size}
              className="poker-embaralho-carta"
              style={
                {
                  zIndex: k + 2,
                  ['--lado' as string]: c.side,
                  ['--i' as string]: c.i,
                  ['--ordem' as string]: k,
                  ['--volta' as string]: `${c.back}ms`
                } as React.CSSProperties
              }
            />
          ))}
      </div>
    </div>
  )
}

function Board({
  table,
  fmt,
  layout,
  set,
  timings
}: {
  table: TableView
  fmt: (v: number) => string
  layout: Layout
  set: ChipDenom[]
  /** Ritmo das cartas que entraram animando nesta mão (useReveal). */
  timings: Map<number, CardTiming>
}) {
  const geo = layout.geo
  const result = table.result
  const winningCards = React.useMemo(
    () => (result ? result.pots.flatMap((p) => p.cards ?? []) : null),
    [result]
  )
  // O pote dá um "tum" quando cresce.
  const [pulse, setPulse] = React.useState(0)
  const prevPot = React.useRef(table.pot)
  React.useEffect(() => {
    if (table.pot > prevPot.current) setPulse((n) => n + 1)
    prevPot.current = table.pot
  }, [table.pot])

  const streetLabel = table.street ? STREET_LABEL[table.street] ?? table.street : null
  const winners = winningCards && winningCards.length > 0 ? new Set(winningCards) : null
  const gap = layout.phone ? 5 : 8
  const cw = CARD_WIDTH[layout.boardCard]

  // A soma das apostas da rodada ainda não está no pote: mostra "+ 150 na mesa".
  const onTable = table.seats.reduce((sum, s) => sum + (s?.bet ?? 0), 0)
  const potStacks = React.useMemo(() => breakdown(table.pot, set), [table.pot, set])

  const style = {
    left: '50%',
    top: `${geo.boardY}%`,
    ['--seat-x' as string]: 50,
    ['--seat-y' as string]: geo.boardY
  } as React.CSSProperties

  return (
    <>
      {/* O pote: as fichas arrumadas pelo crupiê e o valor do lado. */}
      <div className="absolute left-1/2 z-[6] -translate-x-1/2 -translate-y-1/2" style={{ top: `${geo.potY}%` }}>
        {table.street !== null &&
          !result && (
            <div key={pulse} className={cn('poker-pote-mesa', pulse > 0 && 'poker-pote-pulso')}>
              {table.pot > 0 && <ChipPile stacks={potStacks} size={layout.chipPot} layout="cluster" maxPerStack={7} maxStacks={6} />}
              <div className="flex flex-col items-start">
                <span className="poker-pote">
                  <span className="mr-1.5 font-sans text-[11.5px] font-medium text-foreground/70">Pote</span>
                  {fmt(table.pot)}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 pl-2 text-[11px] leading-4 text-foreground/65">
                  {streetLabel}
                  {onTable > 0 && (
                    <span>
                      · + <span className="font-mono">{fmt(onTable)}</span> na mesa
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}
      </div>

      {/* As cinco cartas */}
      <div className="absolute z-[6] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5" style={style}>
        {table.street !== null && (
          <span className="relative inline-flex items-end" style={{ gap }}>
            {Array.from({ length: 5 }, (_, i) => {
              const code = table.board[i]
              if (!code) return <PlayingCard key={`vaga-${i}`} placeholder size={layout.boardCard} />
              const highlight = !!winners && winners.has(code)
              const dim = !!winners && !highlight
              const t = timings.get(i)
              // Carta que entrou animando continua FlipCard a mão inteira:
              // trocar de componente a remontaria (e ela voaria de novo).
              return t ? (
                <FlipCard
                  key={`${code}-${i}`}
                  code={code}
                  size={layout.boardCard}
                  dim={dim}
                  highlight={highlight}
                  fly
                  delayMs={t.fly}
                  flipDelayMs={t.flip}
                  flipMs={t.flipMs}
                  holdMs={t.hold || undefined}
                  dx={Math.round((i - 2) * (cw + gap))}
                />
              ) : (
                <PlayingCard key={`${code}-${i}`} code={code} size={layout.boardCard} dim={dim} highlight={highlight} />
              )
            })}
          </span>
        )}
      </div>
    </>
  )
}

/**
 * O meio da mesa sem mão rolando: o "Começar" de quem abriu (a mesa nasce
 * parada, pra quem chega atrasado sentar antes da primeira mão), ou o aviso
 * de quem a mesa está esperando.
 */
function WaitingCenter({
  table,
  topY,
  canStart,
  busy,
  onStart
}: {
  table: TableView
  topY: number
  canStart: boolean
  busy: boolean
  onStart: () => void
}) {
  const { byId } = useMembers()
  const seated = table.seats.filter((s) => s && !s.sittingOut && s.stack > 0).length
  const notStarted = table.started === false
  const creator =
    table.seats.find((s) => s?.userId === table.createdById)?.displayName ??
    byId[table.createdById]?.displayName ??
    'quem abriu a mesa'
  const first = creator.split(/\s+/)[0]

  let body: React.ReactNode
  if (table.status === 'closed') {
    body = <p className="poker-espera">Mesa fechada</p>
  } else if (notStarted && canStart) {
    body = (
      <div className="flex flex-col items-center gap-1.5">
        <button type="button" className="poker-comecar" disabled={busy || seated < 2} onClick={onStart}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          Começar o jogo
        </button>
        <p className="poker-espera !py-0.5 text-[11.5px]">
          {seated < 2
            ? 'Precisa de pelo menos duas pessoas sentadas.'
            : `${seated} na mesa — quem chegar depois entra na mão seguinte.`}
        </p>
      </div>
    )
  } else if (notStarted) {
    body = (
      <p className="poker-espera">
        Esperando <span className="font-semibold text-foreground">{first}</span> começar o jogo
        <span className="poker-reticencias" aria-hidden />
      </p>
    )
  } else {
    body = <p className="poker-espera">{seated < 2 ? 'Esperando mais alguém sentar' : 'A mão começa já'}</p>
  }

  return (
    <div className="absolute left-1/2 z-[12] -translate-x-1/2 -translate-y-1/2" style={{ top: `${topY}%` }}>
      {body}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fichas na mesa: a aposta de cada um
// ---------------------------------------------------------------------------

/**
 * A aposta na frente de alguém: as pilhas no feltro e o valor embaixo. Entra
 * deslizando do assento (as fichas saem da mão da pessoa); cada aumento
 * remonta a pilha e ela desliza de novo.
 */
function BetChips({
  amount,
  at,
  from,
  table,
  set,
  layout,
  staged
}: {
  amount: number
  at: [number, number]
  from: [number, number]
  table: TableView
  set: ChipDenom[]
  layout: Layout
  /** Prévia das fichas escolhidas (ainda não apostadas): tracejada e transparente. */
  staged?: boolean
}) {
  const stacks = React.useMemo(() => breakdown(amount, set), [amount, set])
  const style = {
    left: `${at[0]}%`,
    top: `${at[1]}%`,
    ['--seat-x' as string]: from[0],
    ['--seat-y' as string]: from[1],
    ['--bet-x' as string]: at[0],
    ['--bet-y' as string]: at[1]
  } as React.CSSProperties
  return (
    <div className={cn('poker-aposta absolute z-[7]', staged ? 'poker-aposta--previa' : 'poker-aposta--entra')} style={style}>
      <ChipPile stacks={stacks} size={layout.chipBet} maxPerStack={6} maxStacks={4} />
      <span className={cn('poker-aposta-valor', staged && 'poker-aposta-valor--previa')}>
        {staged ? '+' : ''}
        {formatMoneyShort(amount, table.stake.currency)}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fantasmas: fichas indo pro pote e cartas de quem desistiu indo pro meio.
// Existem só durante a animação. (O pote indo pro vencedor é da WinFx.)
// ---------------------------------------------------------------------------

interface GhostSpec {
  id: number
  kind: 'bet' | 'fold'
  /** Onde nasce, em % da área. */
  pos: [number, number]
  amount?: number
}

let ghostSeq = 0

function useGhosts(
  table: TableView,
  rotated: Array<{ index: number; seat: SeatView | null; pos: [number, number]; bet: [number, number] }>
): GhostSpec[] {
  const [ghosts, setGhosts] = React.useState<GhostSpec[]>([])
  const prevRef = React.useRef<TableView | null>(null)
  // `rotated` nasce novo a cada render: como dependência, o efeito rodava de
  // novo a cada pintura (o próprio `setGhosts` pinta) e a limpeza cancelava
  // o timer que tira os fantasmas — eles ficavam pra sempre (visíveis com
  // "reduzir movimento", que tira a animação que os apagava).
  const rotatedRef = React.useRef(rotated)
  rotatedRef.current = rotated
  /** Timers de remoção: só caem ao desmontar, nunca numa vista nova. */
  const timersRef = React.useRef(new Set<ReturnType<typeof setTimeout>>())
  React.useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  React.useEffect(() => {
    const prev = prevRef.current
    prevRef.current = table
    if (!prev || prev.id !== table.id || prev.handId !== table.handId) return

    const born: GhostSpec[] = []
    const of = (index: number) => rotatedRef.current.find((r) => r.index === index)

    for (const seat of table.seats) {
      if (!seat) continue
      const before = prev.seats[seat.index]
      if (!before) continue
      // Rodada fechou: o que estava na frente de cada um vai pro meio.
      if (before.bet > 0 && seat.bet === 0 && !prev.result) {
        born.push({ id: ++ghostSeq, kind: 'bet', pos: of(seat.index)?.bet ?? [50, 50], amount: before.bet })
      }
      // Desistiu: as cartas vão pro centro. As MINHAS ficam na mão, apagadas.
      if (!before.folded && seat.folded && before.hasCards && seat.index !== table.mySeat) {
        born.push({ id: ++ghostSeq, kind: 'fold', pos: of(seat.index)?.pos ?? [50, 50] })
      }
    }

    if (born.length === 0) return
    setGhosts((g) => [...g, ...born])
    const timer = setTimeout(() => {
      timersRef.current.delete(timer)
      const ids = new Set(born.map((b) => b.id))
      setGhosts((g) => g.filter((x) => !ids.has(x.id)))
    }, 1_300)
    timersRef.current.add(timer)
  }, [table])

  return ghosts
}

function Ghost({ ghost, table, set, layout }: { ghost: GhostSpec; table: TableView; set: ChipDenom[]; layout: Layout }) {
  const atSeat = {
    ['--x' as string]: `${ghost.pos[0]}%`,
    ['--y' as string]: `${ghost.pos[1]}%`,
    ['--seat-x' as string]: ghost.pos[0],
    ['--seat-y' as string]: ghost.pos[1]
  } as React.CSSProperties

  if (ghost.kind === 'bet') {
    return (
      <div className="poker-fantasma poker-fantasma--pote" style={atSeat} aria-hidden>
        <ChipPile stacks={breakdown(ghost.amount ?? 0, set)} size={layout.chipBet} maxPerStack={6} maxStacks={4} />
        <span className="sr-only">{formatMoneyShort(ghost.amount ?? 0, table.stake.currency)}</span>
      </div>
    )
  }
  return (
    <div className="poker-fantasma poker-fantasma--fold" style={atSeat} aria-hidden>
      <CardRow codes={['?', '?']} size="xs" faceDown fan dim />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Um assento (dos outros)
// ---------------------------------------------------------------------------

const SHOWDOWN_SIZE: Record<CardSize, CardSize> = { xs: 'sm', sm: 'ms', ms: 'md', md: 'ml', ml: 'lg', lg: 'lg', xl: 'xl' }

function seatVars(pos: [number, number], avatarPx: number): React.CSSProperties {
  return {
    ['--seat-x' as string]: pos[0],
    ['--seat-y' as string]: pos[1],
    ['--avatar' as string]: `${avatarPx}px`
  } as React.CSSProperties
}

function SeatSpot({
  table,
  index,
  seat,
  pos,
  bet,
  dealOrder,
  dealing,
  dealOffset,
  canSit,
  onSit,
  fmt,
  layout,
  set
}: {
  table: TableView
  index: number
  seat: SeatView | null
  pos: [number, number]
  bet: [number, number]
  /** Posição na roda a partir de mim: define a ordem (e o atraso) das cartas dadas. */
  dealOrder: number
  /** Quantos receberam cartas nesta mão (o ritmo de uma carta por pessoa). */
  dealing: number
  /** Espera do embaralhar antes da primeira carta sair (0 = mão já em andamento). */
  dealOffset: number
  canSit: boolean
  onSit: () => void
  fmt: (v: number) => string
  layout: Layout
  set: ChipDenom[]
}) {
  const { byId } = useMembers()
  const phone = layout.phone
  const avatarPx = layout.avatarPx
  const vars = seatVars(pos, avatarPx)

  if (!seat) {
    return (
      <div className="poker-assento" style={vars}>
        {canSit ? (
          <button type="button" onClick={onSit} className="poker-vazio alvo-dedo">
            <Plus className="h-4 w-4" aria-hidden />
            sentar
          </button>
        ) : (
          <span aria-hidden className="poker-vazio poker-vazio--parado" />
        )}
      </div>
    )
  }

  const member = byId[seat.userId]
  const result = table.result
  const won = (seat.won ?? 0) > 0
  const showdownLoser = !!result?.showdown && seat.inHand && !seat.folded && !won
  const cards = seat.cards
  const handCards = result ? result.hands[String(index)]?.cards ?? null : null
  const highlight = won && handCards ? handCards : null
  const dim = seat.folded || showdownLoser
  const away = seat.folded || seat.sittingOut || !seat.connected
  const action = seat.lastAction && !seat.toAct && !result ? seat.lastAction : null
  const handLabel = result?.hands[String(index)]?.label ?? null
  // O botão do dealer fica do lado do assento que olha pro centro.
  const dealerSide = pos[0] <= 50 ? 'right' : 'left'

  return (
    <>
      {/* Aposta na frente do assento, rumo ao pote */}
      {seat.bet > 0 && (
        <BetChips key={`${table.handId}-${seat.bet}`} amount={seat.bet} at={bet} from={pos} table={table} set={set} layout={layout} />
      )}

      <div className={cn('poker-assento', seat.toAct && 'z-[8]', showdownLoser && 'poker-assento--perdeu')} style={vars}>
        {/* O avatar com o relógio; as cartas atrás dele */}
        <div className="relative" style={{ width: avatarPx, height: avatarPx }}>
          {seat.hasCards && (
            <div
              className={cn(
                'absolute left-1/2 -translate-x-1/2 transition-all duration-300',
                // Viradas pra baixo espiam atrás do avatar; abertas (showdown)
                // passam pra frente dele, um pouco mais altas.
                cards ? 'z-[2]' : 'z-0',
                dim && !cards && 'opacity-60'
              )}
              style={{ bottom: cards ? '44%' : '42%' }}
            >
              <CardRow
                codes={cards ?? ['?', '?']}
                // Abertas no showdown, um degrau maiores: dá pra ler de longe.
                size={phone ? 'xs' : cards ? SHOWDOWN_SIZE[layout.seatCard] : layout.seatCard}
                faceDown={!cards}
                dim={dim}
                highlightCodes={highlight}
                fan
                // Viradas pra baixo: saem do baralho, uma carta por pessoa,
                // na ordem da mesa. Viradas pra cima (showdown): viram no lugar.
                enter={cards ? 'flip' : 'fly'}
                staggerMs={cards ? 140 : dealing * DEAL_STEP_MS}
                baseDelayMs={cards ? 0 : dealOffset + dealOrder * DEAL_STEP_MS}
              />
            </div>
          )}

          <div className={cn('relative z-[1] h-full w-full rounded-full', seat.toAct && 'poker-vez', won && 'poker-vencedor')}>
            <UserAvatar
              userId={seat.userId}
              src={resolveAssetUrl(member?.avatar ?? seat.avatar)}
              name={seat.displayName}
              ringColor={member?.profileColor ?? undefined}
              frame={member?.avatarFrame}
              frameColor={member?.profileColor}
              className={cn('poker-avatar h-full w-full border-2 border-void transition-opacity', away && 'opacity-50')}
              style={{ width: avatarPx, height: avatarPx }}
            />
            {seat.toAct && table.deadline && <TimerRing deadline={table.deadline} total={table.timerMs} />}
          </div>

          {seat.isButton && (
            <DealerChip className={cn('absolute top-0 z-[3]', dealerSide === 'right' ? '-right-3' : '-left-3')} />
          )}
          {seat.allIn && !result && (
            <span className="absolute -bottom-1.5 left-1/2 z-[3] -translate-x-1/2 whitespace-nowrap rounded-full bg-destructive px-1.5 font-sans text-[11px] font-black leading-4 tracking-wide text-destructive-foreground shadow-[0_2px_6px_rgb(0_0_0/0.5)]">
              ALL-IN
            </span>
          )}
        </div>

        {/* A placa */}
        <div
          className={cn(
            'poker-placa -mt-1.5',
            phone && 'min-w-[84px] max-w-[110px] px-2',
            seat.toAct && 'poker-placa--vez',
            won && 'poker-placa--vencedor',
            away && !won && 'poker-placa--fora'
          )}
        >
          <p className="truncate text-[12px] font-semibold leading-tight text-foreground">{seat.displayName}</p>
          <p className={cn('font-mono text-[13px] leading-tight', won ? 'text-burn' : 'text-foreground/90')}>{fmt(seat.stack)}</p>
          {seat.toAct && table.deadline ? (
            <Countdown deadline={table.deadline} />
          ) : seat.sittingOut ? (
            <span className="poker-jogada poker-jogada--blind">fora</span>
          ) : !seat.connected ? (
            <span className="poker-jogada poker-jogada--blind">caiu</span>
          ) : action ? (
            <ActionTag action={action} currency={table.stake.currency} />
          ) : null}
          {handLabel && (
            <p className={cn('mt-0.5 truncate text-[11px] leading-tight', won ? 'text-acid-text' : 'text-muted-foreground')}>{handLabel}</p>
          )}
          {won && (
            <span aria-hidden className="poker-ganho absolute -top-2 left-1/2 whitespace-nowrap font-mono text-sm font-bold text-burn drop-shadow-[0_2px_6px_rgb(0_0_0/0.8)]">
              +{formatMoneyShort(seat.won ?? 0, table.stake.currency)}
            </span>
          )}
        </div>
      </div>
    </>
  )
}

/** A faixa da jogada no pé da placa: CHECK, CALL 50, RAISE 250, FOLD, ALL-IN. */
function ActionTag({ action, currency }: { action: { type: string; amount: number }; currency: TableView['stake']['currency'] }) {
  const type = action.type
  const blind = type === 'small blind' || type === 'big blind'
  const tone = blind ? 'blind' : type
  const label = ACTION_TAG[type] ?? type
  const withAmount = action.amount > 0 && type !== 'check' && type !== 'fold'
  return (
    <span key={`${type}-${action.amount}`} className={cn('poker-jogada', `poker-jogada--${tone}`)}>
      {label.toUpperCase()}
      {withAmount && <span className="ml-1 font-mono font-semibold">{formatMoneyShort(action.amount, currency)}</span>}
    </span>
  )
}

// ---------------------------------------------------------------------------
// O meu lugar: as duas cartas grandes em cima da placa, embaixo no centro
// ---------------------------------------------------------------------------

function HeroSeat({
  table,
  seat,
  pos,
  bet,
  dealOrder,
  dealing,
  dealOffset,
  fmt,
  layout,
  set,
  myTurn,
  staged,
  onOpenRules
}: {
  table: TableView
  seat: SeatView
  pos: [number, number]
  bet: [number, number]
  dealOrder: number
  dealing: number
  dealOffset: number
  fmt: (v: number) => string
  layout: Layout
  set: ChipDenom[]
  myTurn: boolean
  /** Soma das fichas escolhidas na barra (0 = nenhuma): aparece na frente, tracejada. */
  staged: number
  onOpenRules: (category?: HandCategory | null) => void
}) {
  const { byId } = useMembers()
  const member = byId[seat.userId]
  const phone = layout.phone
  const result = table.result
  const won = (seat.won ?? 0) > 0
  const mine = result ? result.hands[String(seat.index)]?.cards ?? null : null
  const lost = !!result?.showdown && !won && seat.inHand && !seat.folded
  const dim = seat.folded || lost
  const inHand = seat.inHand && !seat.folded
  const away = seat.sittingOut || !seat.connected
  const action = seat.lastAction && !seat.toAct && !result ? seat.lastAction : null
  const best = inHand && !result ? seat.best : null
  const handLabel = result?.hands[String(seat.index)]?.label ?? null
  const avatarPx = layout.avatarPx
  const vars = seatVars(pos, avatarPx)

  return (
    <>
      {staged > 0 ? (
        <BetChips amount={staged} at={bet} from={pos} table={table} set={set} layout={layout} staged />
      ) : (
        seat.bet > 0 && <BetChips key={`${table.handId}-${seat.bet}`} amount={seat.bet} at={bet} from={pos} table={table} set={set} layout={layout} />
      )}

      <div className="poker-assento z-[9]" style={{ ...vars, bottom: 4, top: 'auto', transform: 'translateX(-50%)' }}>
        {/* As SUAS cartas: grandes, em leque, saindo do baralho e virando ao
            pousar. Desistiu: elas FICAM na mão, apagadas e um pouco abaixadas
            (dá pra lembrar o que tinha) até a mão acabar. */}
        {seat.inHand && seat.cards && (
          <div
            className={cn(
              'poker-heroi-cartas relative z-[2] -mb-2',
              myTurn && inHand && 'poker-heroi-cartas--vez',
              seat.folded && 'poker-heroi-cartas--fora'
            )}
          >
            <CardRow
              codes={seat.cards}
              size={layout.heroCard}
              dim={dim}
              highlightCodes={won ? mine : null}
              fan
              spread
              enter="fly-flip"
              staggerMs={dealing * DEAL_STEP_MS}
              baseDelayMs={dealOffset + dealOrder * DEAL_STEP_MS}
            />
            {seat.folded && (
              <span className="poker-heroi-fold absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-line-strong bg-void/85 px-2.5 py-0.5 text-[11.5px] font-medium text-foreground/80">
                você desistiu
              </span>
            )}
          </div>
        )}

        {/* A placa do herói: avatar à esquerda, nome e pilha à direita. */}
        <div
          className={cn(
            'poker-placa flex min-w-[220px] max-w-[320px] items-center gap-3 px-3 py-2 text-left',
            phone && 'min-w-[200px]',
            seat.toAct && 'poker-placa--vez',
            won && 'poker-placa--vencedor',
            away && !won && 'poker-placa--fora'
          )}
        >
          <div className={cn('relative shrink-0 rounded-full', seat.toAct && 'poker-vez', won && 'poker-vencedor')} style={{ width: avatarPx, height: avatarPx }}>
            <UserAvatar
              userId={seat.userId}
              src={resolveAssetUrl(member?.avatar ?? seat.avatar)}
              name={seat.displayName}
              ringColor={member?.profileColor ?? undefined}
              frame={member?.avatarFrame}
              frameColor={member?.profileColor}
              className={cn('poker-avatar border-2 border-void', away && 'opacity-50')}
              style={{ width: avatarPx, height: avatarPx }}
            />
            {seat.toAct && table.deadline && <TimerRing deadline={table.deadline} total={table.timerMs} />}
          </div>
          {seat.isButton && <DealerChip className="absolute -right-2 -top-2 z-[3]" />}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate text-[12.5px] font-semibold leading-tight text-foreground">
              <span className="truncate">{seat.displayName}</span>
              {seat.allIn && !result && (
                <span className="rounded-full bg-destructive px-1.5 font-sans text-[11px] font-black leading-4 tracking-wide text-destructive-foreground">ALL-IN</span>
              )}
            </p>
            <p className={cn('font-mono text-base leading-tight', won ? 'text-burn' : 'text-foreground')}>
              {fmt(seat.stack)}
              {seat.toAct && table.deadline && (
                <span className="ml-2 inline-block align-middle">
                  <Countdown deadline={table.deadline} inline />
                </span>
              )}
            </p>
            <div className="mt-0.5 flex min-h-[18px] items-center gap-1.5">
              {best ? (
                <button
                  type="button"
                  onClick={() => onOpenRules(best.category)}
                  className="truncate rounded-full border border-acid/40 bg-acid/[0.08] px-2 text-[11px] font-medium leading-4 text-acid-text transition-colors hover:bg-acid/15"
                  title="Abrir a colinha nesta mão"
                >
                  {best.label}
                </button>
              ) : handLabel ? (
                <span className={cn('truncate text-[11px] leading-4', won ? 'text-acid-text' : 'text-muted-foreground')}>{handLabel}</span>
              ) : seat.sittingOut ? (
                <span className="poker-jogada poker-jogada--blind !mt-0">fora</span>
              ) : action ? (
                <ActionTag action={action} currency={table.stake.currency} />
              ) : null}
            </div>
          </div>
          {won && (
            <span aria-hidden className="poker-ganho absolute -top-2 left-1/2 whitespace-nowrap font-mono text-base font-bold text-burn drop-shadow-[0_2px_6px_rgb(0_0_0/0.8)]">
              +{formatMoneyShort(seat.won ?? 0, table.stake.currency)}
            </span>
          )}
        </div>
      </div>
    </>
  )
}

/** Anel que esvazia até o prazo. A animação é CSS; o React só a arma. */
function TimerRing({ deadline, total }: { deadline: number; total: number }) {
  const remaining = Math.max(0, deadline - Date.now())
  const elapsed = Math.max(0, total - remaining)
  return (
    <svg
      key={deadline}
      className="poker-anel pointer-events-none absolute -inset-[5px] h-[calc(100%+10px)] w-[calc(100%+10px)]"
      viewBox="0 0 36 36"
      aria-hidden
    >
      <circle cx="18" cy="18" r="16.5" fill="none" stroke="hsl(var(--background) / 0.7)" strokeWidth="3" />
      <circle
        className="poker-anel-arco"
        cx="18"
        cy="18"
        r="16.5"
        pathLength={1}
        fill="none"
        stroke={remaining < total * 0.3 ? 'hsl(var(--destructive))' : 'hsl(var(--acid))'}
        strokeWidth="3"
        strokeLinecap="round"
        style={{ animationDuration: `${total}ms`, animationDelay: `-${elapsed}ms` }}
      />
    </svg>
  )
}

function Countdown({ deadline, inline }: { deadline: number; inline?: boolean }) {
  const now = useTicker(250)
  const secs = Math.max(0, Math.ceil((deadline - now) / 1000))
  return (
    <span
      className={cn(
        'font-mono text-[12px] font-semibold leading-tight',
        secs <= 5 ? 'text-destructive' : 'text-acid-text',
        inline ? '' : 'block'
      )}
    >
      {secs}s
    </span>
  )
}

// ---------------------------------------------------------------------------
// As fichas pra escolher
// ---------------------------------------------------------------------------

/**
 * As cinco fichas da mesa, clicáveis: cada clique empurra mais uma ficha
 * daquele valor (a pilha aparece tracejada na frente do seu lugar) e o botão
 * de apostar passa a valer o que você escolheu. Botão direito tira uma ficha
 * daquele valor; o "x" devolve todas. Fora da sua vez ficam apagadas.
 */
function ChipTray({
  table,
  set,
  legal,
  myBet,
  myStack,
  picked,
  onPick,
  fmt,
  compact
}: {
  table: TableView
  set: ChipDenom[]
  legal: LegalActions | null
  myBet: number
  myStack: number
  picked: number[] | null
  onPick: (next: number[] | null) => void
  fmt: (v: number) => string
  compact?: boolean
}) {
  const range = legal ? legal.raise ?? legal.bet : null
  const sum = picked ? sumChips(picked) : 0
  // O teto é a pilha inteira (all-in): ficha que passaria disso não entra.
  const room = range ? range.max - myBet - sum : 0
  const on = !!range
  const size = compact ? 30 : 34
  const add = (value: number): void => {
    if (!range) return
    const next = [...(picked ?? []), Math.min(value, Math.max(0, range.max - myBet - sum))]
    onPick(next.filter((v) => v > 0))
  }
  const removeOne = (value: number): void => {
    if (!picked) return
    const i = picked.lastIndexOf(value)
    if (i < 0) return
    const next = [...picked.slice(0, i), ...picked.slice(i + 1)]
    onPick(next.length ? next : null)
  }
  const target = myBet + sum
  const hint = !range
    ? null
    : sum === 0
      ? 'clique pra montar a aposta'
      : target >= range.max
        ? 'all-in'
        : target < range.min
          ? `mínimo ${fmt(range.min)}`
          : null

  return (
    <div className={cn('flex min-w-0 items-center gap-1.5 transition-opacity', !on && 'opacity-45', compact && 'mb-1.5')}>
      <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="Fichas">
        {set.map((d) => {
          const disabled = !on || room <= 0 || d.value > myStack
          const count = picked ? picked.filter((v) => v === d.value).length : 0
          return (
            <button
              key={d.value}
              type="button"
              disabled={disabled}
              onClick={() => add(d.value)}
              onContextMenu={(e) => {
                e.preventDefault()
                removeOne(d.value)
              }}
              className="poker-ficha-botao"
              aria-label={`Ficha de ${fmt(d.value)}${count ? `, ${count} escolhida${count > 1 ? 's' : ''}` : ''}`}
              title={`+${fmt(d.value)} · botão direito tira`}
            >
              <ChipFace tone={d.tone} label={chipFace(d.value, table.stake.currency)} size={size} />
              {count > 0 && <span className="poker-ficha-conta">{count}</span>}
            </button>
          )
        })}
      </div>
      {sum > 0 ? (
        <span className="flex min-w-0 items-center gap-1 rounded-full border border-acid/40 bg-acid/[0.08] py-0.5 pl-2 pr-1 text-[11.5px] text-foreground">
          <span className="font-mono">+{fmt(sum)}</span>
          {hint && <span className="truncate text-muted-foreground">· {hint}</span>}
          <button type="button" onClick={() => onPick(null)} aria-label="Devolver as fichas" className="rounded-full p-0.5 text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ) : (
        hint && !compact && <span className="min-w-0 truncate text-[11px] text-muted-foreground">{hint}</span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Barra de ação
// ---------------------------------------------------------------------------

function roundTo(value: number, step: number): number {
  if (step <= 0) return Math.round(value)
  return Math.round(value / step) * step
}

function ActionBar({
  table,
  legal,
  busy,
  fmt,
  phone,
  myBet,
  picked,
  locked,
  onClearPicked,
  onAct
}: {
  table: TableView
  /** As jogadas possíveis AGORA; null quando não é a minha vez (botões apagados, mas no lugar). */
  legal: LegalActions | null
  busy: boolean
  fmt: (v: number) => string
  phone: boolean
  /** O que já está na minha frente nesta rodada (as fichas escolhidas somam a isso). */
  myBet: number
  /** Fichas escolhidas na bandeja (null = a régua manda). */
  picked: number[] | null
  /** O crupiê está dando ou a mesa está virando: espera a carta aparecer. */
  locked: boolean
  onClearPicked: () => void
  onAct: (type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin', amount?: number) => void
}) {
  const range = legal ? legal.raise ?? legal.bet : null
  const isBet = !!legal?.bet
  const step = table.stake.smallBlind
  const [amount, setAmount] = React.useState<number>(range?.min ?? 0)

  // Mão nova, rua nova ou aposta nova: a régua volta pro mínimo.
  React.useEffect(() => {
    setAmount(range?.min ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.handId, table.street, table.currentBet, range?.min])

  const clamp = React.useCallback(
    (v: number): number => {
      if (!range) return 0
      // O teto é o all-in e vale EXATO: depois de um pote dividido a pilha
      // pode não ser múltipla do small blind, e arredondar deixava fichas atrás.
      if (v >= range.max) return range.max
      const r = Math.max(range.min, Math.min(range.max, roundTo(v, step)))
      return Math.max(range.min, Math.min(range.max, r))
    },
    [range, step]
  )

  // Com fichas escolhidas, a aposta é o que já está na frente + as fichas.
  // Abaixo do mínimo ela não sai (o botão diz quanto falta).
  const pickedSum = picked ? sumChips(picked) : 0
  const chipsMode = !!range && pickedSum > 0
  const chipsTarget = chipsMode ? Math.min(range!.max, myBet + pickedSum) : 0
  const chipsShort = chipsMode && chipsTarget < range!.min
  const value = chipsMode ? chipsTarget : amount
  // Mexeu na régua ou num atalho: as fichas saem de cena.
  const setFromRuler = (v: number): void => {
    if (picked) onClearPicked()
    setAmount(v)
  }

  const call = legal?.call ?? 0
  const potAfterCall = table.pot + call
  const presets: Array<{ label: string; value: number }> = React.useMemo(() => {
    if (!range) return []
    const list: Array<{ label: string; value: number }> = [{ label: 'mín', value: range.min }]
    if (isBet) {
      list.push({ label: '½ pote', value: table.pot / 2 })
      list.push({ label: '¾ pote', value: (table.pot * 3) / 4 })
      list.push({ label: 'pote', value: table.pot })
    } else {
      list.push({ label: '2,5×', value: table.currentBet * 2.5 })
      list.push({ label: '½ pote', value: table.currentBet + potAfterCall / 2 })
      list.push({ label: 'pote', value: table.currentBet + potAfterCall })
    }
    list.push({ label: 'all-in', value: range.max })
    const seen = new Set<number>()
    return list
      .map((p) => ({ ...p, value: clamp(p.value) }))
      .filter((p) => (seen.has(p.value) ? false : (seen.add(p.value), true)))
  }, [range, isBet, table.pot, table.currentBet, potAfterCall, clamp])

  // Atalhos: F desiste, C passa/paga, A all-in, Enter confirma a aposta.
  React.useEffect(() => {
    if (!legal) return
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && target.getAttribute('type') !== 'range') return
      if (e.ctrlKey || e.metaKey || e.altKey || busy || locked) return
      const k = e.key.toLowerCase()
      if (k === 'f' && legal.fold) onAct('fold')
      else if (k === 'c') {
        if (legal.check) onAct('check')
        else if (legal.call !== null) onAct('call')
      } else if (k === 'a' && legal.allin !== null) onAct('allin')
      else if (k === 'enter' && range && !chipsShort) onAct(isBet ? 'bet' : 'raise', value)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [legal, range, isBet, value, chipsShort, busy, locked, onAct])

  const allInOnly = !!range && range.min === range.max
  const off = !legal || busy || locked
  const myStack = table.seats[table.mySeat ?? -1]?.stack ?? Infinity
  const callIsAllIn = legal?.call !== null && legal?.call !== undefined && legal.call >= myStack

  return (
    <div className="flex flex-col gap-2">
      {/* Tamanho da aposta: atalhos + régua. Só aparece quando dá pra apostar. */}
      <div className={cn('flex flex-wrap items-center gap-2 transition-opacity', !range && 'pointer-events-none opacity-0')}>
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setFromRuler(p.value)}
              className={cn('poker-preset', !chipsMode && amount === p.value && 'poker-preset--ativo')}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex min-w-[200px] flex-1 items-center gap-2">
          <button
            type="button"
            aria-label="Menos"
            disabled={!range || allInOnly || value <= range.min}
            onClick={() => setFromRuler(clamp(value - step))}
            className="poker-preset flex h-[26px] w-[26px] items-center justify-center !px-0"
          >
            <Minus className="h-3.5 w-3.5" aria-hidden />
          </button>
          <input
            type="range"
            className="poker-regua flex-1"
            min={range?.min ?? 0}
            max={range?.max ?? 0}
            step={step}
            value={Math.max(range?.min ?? 0, value)}
            disabled={!range || allInOnly}
            onChange={(e) => setFromRuler(clamp(Number(e.target.value)))}
            aria-label="Valor da aposta"
          />
          <button
            type="button"
            aria-label="Mais"
            disabled={!range || allInOnly || value >= range.max}
            onClick={() => setFromRuler(clamp(value + step))}
            className="poker-preset flex h-[26px] w-[26px] items-center justify-center !px-0"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
          <span className="w-24 text-right font-mono text-sm font-semibold text-foreground">{range ? fmt(value) : ''}</span>
        </div>
      </div>

      <div className={cn('grid grid-cols-3', phone ? 'gap-1.5' : 'gap-2')}>
        <button
          type="button"
          className={cn('poker-botao poker-botao--fold', phone && 'poker-botao--compacto')}
          disabled={off || !legal?.fold}
          onClick={() => onAct('fold')}
        >
          Desistir {!phone && <kbd>F</kbd>}
        </button>
        {!legal || legal.check ? (
          <button
            type="button"
            className={cn('poker-botao poker-botao--check', phone && 'poker-botao--compacto')}
            disabled={off}
            onClick={() => onAct('check')}
          >
            Passar {!phone && <kbd>C</kbd>}
          </button>
        ) : (
          <button
            type="button"
            className={cn('poker-botao poker-botao--check', phone && 'poker-botao--compacto', chipsMode && chipsTarget === myBet + call && 'poker-botao--sugerido')}
            disabled={off || legal.call === null}
            onClick={() => onAct('call')}
          >
            {callIsAllIn ? 'All-in' : 'Pagar'} <span className="font-mono">{fmt(call)}</span>
            {!phone && <kbd>C</kbd>}
          </button>
        )}
        {!legal ? (
          <button type="button" className={cn('poker-botao poker-botao--raise', phone && 'poker-botao--compacto')} disabled>
            Apostar
          </button>
        ) : range ? (
          chipsShort ? (
            <button type="button" className={cn('poker-botao poker-botao--raise', phone && 'poker-botao--compacto')} disabled>
              Mín. <span className="font-mono">{fmt(range.min)}</span>
            </button>
          ) : (
            <button
              type="button"
              className={cn('poker-botao', value >= range.max ? 'poker-botao--allin' : 'poker-botao--raise', phone && 'poker-botao--compacto')}
              disabled={off}
              onClick={() => onAct(isBet ? 'bet' : 'raise', value)}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : value >= range.max ? (
                <>
                  All-in <span className="font-mono">{fmt(value)}</span>
                </>
              ) : isBet ? (
                <>
                  Apostar <span className="font-mono">{fmt(value)}</span>
                </>
              ) : (
                <>
                  {phone ? 'Aumentar' : 'Aumentar p/'} <span className="font-mono">{fmt(value)}</span>
                </>
              )}
              {!phone && <kbd>⏎</kbd>}
            </button>
          )
        ) : legal.allin !== null ? (
          <button
            type="button"
            className={cn('poker-botao poker-botao--allin', phone && 'poker-botao--compacto')}
            disabled={off}
            onClick={() => onAct('allin')}
          >
            All-in <span className="font-mono">{fmt(legal.allin)}</span>
            {!phone && <kbd>A</kbd>}
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}

function WaitingLine({ table, me }: { table: TableView; me: SeatView }) {
  const acting = table.toAct !== null ? table.seats[table.toAct] : null
  const myTurn = table.toAct === me.index && !table.result
  let text: string
  if (myTurn) text = 'Sua vez.'
  else if (table.result) text = 'Próxima mão daqui a pouco.'
  else if (table.started === false) text = table.canStart ? 'Aperte "Começar o jogo" quando todo mundo sentar.' : 'Esperando começar o jogo.'
  else if (me.sittingOut) text = 'Sentado fora. "Voltar" entra na próxima mão.'
  else if (!me.inHand) text = table.street ? 'Você entra na próxima mão.' : 'Esperando a mão começar.'
  else if (me.folded) text = 'Você desistiu desta mão.'
  else if (acting) text = `Vez de ${acting.displayName.split(/\s+/)[0]}…`
  else if (table.street === 'showdown' || table.street === 'done') text = 'Showdown.'
  else text = 'A mesa está correndo…'
  return <span className={cn(myTurn && 'font-semibold text-acid-text')}>{text}</span>
}

// ---------------------------------------------------------------------------
// Buy-in e recarga
// ---------------------------------------------------------------------------

function useBalanceFor(table: TableView): number | null {
  const { profile } = useGamification()
  const { token } = useAuth()
  const [cents, setCents] = React.useState<number | null>(null)
  React.useEffect(() => {
    if (table.stake.currency !== 'brl' || !token) return
    let alive = true
    cashApi
      .me(token)
      .then((state) => alive && setCents(state.balanceCents))
      .catch(() => alive && setCents(null))
    return () => {
      alive = false
    }
  }, [table.stake.currency, token])
  if (table.stake.currency === 'brl') return cents
  return profile?.coins ?? null
}

function AmountDialog({
  title,
  description,
  min,
  max,
  step,
  initial,
  balance,
  currency,
  busy,
  confirmLabel,
  onClose,
  onConfirm,
  children
}: {
  title: string
  description: string
  min: number
  max: number
  step: number
  initial: number
  balance: number | null
  currency: TableView['stake']['currency']
  busy: boolean
  confirmLabel: string
  onClose: () => void
  onConfirm: (amount: number) => void
  children?: React.ReactNode
}) {
  const [amount, setAmount] = React.useState(() => Math.max(min, Math.min(max, initial)))
  const fmt = (v: number): string => formatMoney(v, currency)
  const short = balance !== null && balance < min
  const cappedMax = balance !== null ? Math.min(max, Math.floor(balance / step) * step) : max
  const ok = !short && amount >= min && amount <= cappedMax

  return (
    <div className="absolute inset-0 z-dialogo flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="card-gradient w-full max-w-sm rounded-brutal border-2 border-acid-dark p-4 shadow-[0_20px_60px_rgb(0_0_0/0.6)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">{description}</p>
        {children}

        <div className="mt-3 flex items-center gap-2">
          <input
            type="range"
            className="poker-regua flex-1"
            min={min}
            max={Math.max(min, cappedMax)}
            step={step}
            value={Math.min(amount, Math.max(min, cappedMax))}
            disabled={short}
            onChange={(e) => setAmount(Number(e.target.value))}
            aria-label="Valor"
          />
          <span className="w-24 text-right font-mono text-sm text-foreground">{fmt(amount)}</span>
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
          <span>mín {fmt(min)}</span>
          <span>máx {fmt(max)}</span>
        </div>
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          seu saldo:{' '}
          <span className={cn('font-mono', short ? 'text-destructive' : 'text-burn')}>
            {balance === null ? '…' : fmt(balance)}
          </span>
          {short && <span className="text-destructive"> — não dá pro mínimo</span>}
        </p>

        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button size="sm" disabled={busy || !ok} onClick={() => onConfirm(amount)}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : `${confirmLabel} ${fmt(amount)}`}
          </Button>
        </div>
      </div>
    </div>
  )
}

function SitDialog({
  table,
  seat,
  busy,
  onClose,
  onConfirm
}: {
  table: TableView
  seat: number
  busy: boolean
  onClose: () => void
  onConfirm: (amount: number) => void
}) {
  const balance = useBalanceFor(table)
  const cap = table.stake.capPerSeat
  const max = cap !== undefined ? Math.min(table.maxBuyIn, cap) : table.maxBuyIn
  return (
    <AmountDialog
      title={`Sentar no lugar ${seat + 1}`}
      description={
        table.stake.currency === 'brl'
          ? `O buy-in sai do seu caixa agora e vira a sua pilha. Teto de ${formatMoney(cap ?? max, 'brl')} por pessoa nesta mesa, recargas incluídas.`
          : 'O buy-in sai do seu saldo de murchos agora e vira a sua pilha. Ao levantar, o que sobrar volta.'
      }
      min={table.minBuyIn}
      max={max}
      step={table.stake.smallBlind}
      initial={max}
      balance={balance}
      currency={table.stake.currency}
      busy={busy}
      confirmLabel="Sentar com"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  )
}

function TopUpDialog({
  table,
  seat,
  busy,
  onClose,
  onConfirm
}: {
  table: TableView
  seat: SeatView
  busy: boolean
  onClose: () => void
  onConfirm: (amount: number) => void
}) {
  const balance = useBalanceFor(table)
  const room = Math.max(0, table.maxBuyIn - seat.stack - table.pendingTopUp)
  const step = table.stake.smallBlind
  const inHand = seat.inHand && !!table.street && table.street !== 'done'
  return (
    <AmountDialog
      title="Recarregar a pilha"
      description={
        room <= 0
          ? 'Sua pilha já está no teto da mesa.'
          : inHand
            ? 'A recarga é paga agora e entra na pilha quando esta mão acabar.'
            : 'Entra na pilha na hora.'
      }
      min={Math.min(step, room || step)}
      max={Math.max(step, room)}
      step={step}
      initial={Math.max(step, room)}
      balance={balance}
      currency={table.stake.currency}
      busy={busy}
      confirmLabel="Recarregar"
      onClose={onClose}
      onConfirm={onConfirm}
    >
      {table.stake.capPerSeat !== undefined && (
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          Teto da mesa valendo: {formatMoney(table.stake.capPerSeat, 'brl')} por pessoa somando tudo que já entrou.
        </p>
      )}
    </AmountDialog>
  )
}

// ---------------------------------------------------------------------------
// Quebrou
// ---------------------------------------------------------------------------

const FALLING_CHIPS: Array<{ x: number; delay: number; dur: number; spin: number; color: string }> = [
  { x: 18, delay: 0, dur: 1300, spin: 300, color: 'hsl(var(--acid))' },
  { x: 31, delay: 120, dur: 1500, spin: -260, color: 'hsl(var(--burn))' },
  { x: 44, delay: 60, dur: 1200, spin: 380, color: 'hsl(var(--destructive))' },
  { x: 56, delay: 220, dur: 1600, spin: -340, color: 'hsl(var(--acid))' },
  { x: 67, delay: 90, dur: 1350, spin: 290, color: 'hsl(var(--muted-foreground))' },
  { x: 79, delay: 260, dur: 1450, spin: -300, color: 'hsl(var(--burn))' },
  { x: 25, delay: 380, dur: 1250, spin: 330, color: 'hsl(var(--destructive))' },
  { x: 73, delay: 440, dur: 1400, spin: -280, color: 'hsl(var(--acid))' }
]

/**
 * A pilha zerou. Véu por cima do feltro, carimbo "QUEBROU", fichas caindo e
 * — um instante depois — o painel com a saída: recarregar (o quanto cabe no
 * teto da mesa e no saldo), levantar, ou ficar olhando. Na mesa valendo sem
 * saldo no caixa, o caminho é depositar.
 */
function BustedOverlay({
  table,
  seat,
  busy,
  onTopUp,
  onStand,
  onDismiss,
  onOpenCash
}: {
  table: TableView
  seat: SeatView
  busy: boolean
  onTopUp: (amount: number) => void
  onStand: () => void
  onDismiss: () => void
  onOpenCash?: () => void
}) {
  const balance = useBalanceFor(table)
  const currency = table.stake.currency
  const fmt = (v: number): string => formatMoney(v, currency)
  const step = table.stake.smallBlind
  const min = table.stake.bigBlind
  const cap = table.stake.capPerSeat
  const capRoom = cap !== undefined ? Math.max(0, cap - (seat.boughtIn ?? cap)) : Infinity
  const max = Math.min(table.maxBuyIn, capRoom)
  const affordable = balance !== null ? Math.floor(balance / step) * step : max
  const top = Math.min(max, affordable)
  const canTopUp = top >= min
  const capHit = cap !== undefined && capRoom < min
  const broke = !capHit && balance !== null && affordable < min
  const [amount, setAmount] = React.useState(() => Math.max(min, Math.min(max, affordable)))
  React.useEffect(() => {
    setAmount(Math.max(min, Math.min(max, affordable)))
  }, [min, max, affordable])

  return (
    <div
      className="poker-quebrou absolute inset-0 z-dialogo flex items-center justify-center overflow-hidden bg-black/70 p-4"
      role="dialog"
      aria-label="Suas fichas acabaram"
    >
      {FALLING_CHIPS.map((c, i) => (
        <span
          key={i}
          aria-hidden
          className="poker-ficha-caindo poker-ficha-redonda poker-ficha-redonda--aposta h-7 w-7"
          style={
            {
              ['--x' as string]: `${c.x}%`,
              ['--atraso' as string]: `${c.delay}ms`,
              ['--dura' as string]: `${c.dur}ms`,
              ['--giro' as string]: `${c.spin}deg`,
              ['--ficha-cor' as string]: c.color
            } as React.CSSProperties
          }
        />
      ))}

      <div className="poker-quebrou-tremor flex w-full max-w-md flex-col items-center gap-4">
        <div className="poker-quebrou-carimbo rounded-brutal border-4 border-destructive px-6 py-2">
          <p className="font-display text-5xl uppercase leading-none tracking-wide text-destructive sm:text-6xl">Quebrou</p>
        </div>

        <div className="poker-quebrou-painel card-gradient w-full rounded-brutal border-2 border-acid-dark p-4 shadow-[0_20px_60px_rgb(0_0_0/0.6)]">
          <p className="text-center text-sm text-foreground">Suas fichas acabaram nesta mesa.</p>
          <p className="mt-1 text-center text-[11.5px] text-muted-foreground">
            {capHit
              ? `Você já pôs o teto de ${fmt(cap ?? 0)} nesta mesa, recargas incluídas. Dá pra ficar olhando ou levantar.`
              : broke
                ? currency === 'brl'
                  ? `Seu caixa tem ${balance === null ? '…' : fmt(balance)}, menos que o mínimo (${fmt(min)}). Deposite por Pix pra voltar.`
                  : `Você tem ${balance === null ? '…' : fmt(balance)} murchos, menos que o mínimo (${fmt(min)}). Murcho se ganha em call, partida, check-in e missão.`
                : currency === 'brl'
                  ? `Recarregue do seu caixa — ainda cabem ${fmt(capRoom === Infinity ? max : capRoom)} no teto desta mesa.`
                  : 'Recarregue do seu saldo e entre na próxima mão.'}
          </p>

          {canTopUp && (
            <>
              <div className="mt-4 flex items-center gap-2">
                <input
                  type="range"
                  className="poker-regua flex-1"
                  min={min}
                  max={Math.max(min, top)}
                  step={step}
                  value={Math.min(amount, Math.max(min, top))}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  aria-label="Valor da recarga"
                />
                <span className="w-24 text-right font-mono text-sm text-foreground">{fmt(amount)}</span>
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>mín {fmt(min)}</span>
                <span>
                  saldo <span className="font-mono text-burn">{balance === null ? '…' : fmt(balance)}</span>
                </span>
              </div>
            </>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onDismiss} disabled={busy}>
              Ficar olhando
            </Button>
            <Button variant="destructive" size="sm" onClick={onStand} disabled={busy}>
              <DoorOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Levantar
            </Button>
            {canTopUp ? (
              <Button size="sm" className="poker-quebrou-chama" disabled={busy} onClick={() => onTopUp(amount)}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : `Recarregar ${fmt(amount)}`}
              </Button>
            ) : broke && currency === 'brl' && onOpenCash ? (
              <Button size="sm" className="poker-quebrou-chama" onClick={onOpenCash}>
                <Coins className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Depositar no caixa
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

function HandLog({ table, fmt, className }: { table: TableView; fmt: (v: number) => string; className?: string }) {
  const ref = React.useRef<HTMLOListElement>(null)
  const name = (seat: number): string => table.seats[seat]?.displayName?.split(/\s+/)[0] ?? `lugar ${seat + 1}`
  React.useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [table.log.length])

  if (table.log.length === 0) {
    return <p className={cn('px-3 py-3 text-[11.5px] text-muted-foreground', className)}>A mão ainda não começou.</p>
  }

  return (
    <ol ref={ref} className={cn('scroll-stable space-y-1 overflow-y-auto px-3 py-2 text-[11.5px] leading-snug', className)}>
      {table.log.map((e) => (
        <li key={e.seq} className={cn(e.kind === 'street' || e.kind === 'win' ? 'text-foreground' : 'text-muted-foreground')}>
          {renderEvent(e, name, fmt, table.stake.currency)}
        </li>
      ))}
    </ol>
  )
}

function renderEvent(
  e: HandEvent,
  name: (seat: number) => string,
  fmt: (v: number) => string,
  currency: TableView['stake']['currency']
): React.ReactNode {
  switch (e.kind) {
    case 'deal':
      return 'Cartas dadas.'
    case 'blind':
      return (
        <>
          {name(e.seat)} paga {e.which === 'sb' ? 'small' : 'big'} blind <span className="font-mono">{formatMoneyShort(e.amount, currency)}</span>
          {e.allIn && ' (all-in)'}
        </>
      )
    case 'action':
      return (
        <>
          {name(e.seat)} {ACTION_LABEL[e.action] ?? e.action}
          {e.amount > 0 && e.action !== 'fold' && e.action !== 'check' && (
            <>
              {' '}
              <span className="font-mono">{formatMoneyShort(e.amount, currency)}</span>
            </>
          )}
          {e.allIn && e.action !== 'allin' && ' (all-in)'}
        </>
      )
    case 'street':
      return (
        <span className="flex items-center gap-1.5">
          <span>{STREET_LABEL[e.street] ?? e.street}:</span>
          <CardRow codes={e.board} size="xs" gap={3} />
        </span>
      )
    case 'refund':
      return (
        <>
          {name(e.seat)} recebe de volta <span className="font-mono">{fmt(e.amount)}</span> (ninguém pagou)
        </>
      )
    case 'show':
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          <span>{name(e.seat)} mostra</span>
          <CardRow codes={e.cards} size="xs" gap={3} />
          <span>— {e.label}</span>
        </span>
      )
    case 'win':
      return (
        <>
          <span className="text-burn">{name(e.seat)}</span> leva <span className="font-mono text-burn">{fmt(e.amount)}</span>
          {e.label ? ` com ${e.label}` : ''}
          {e.potIndex > 0 ? ` (pote lateral ${e.potIndex})` : ''}
        </>
      )
    case 'muck':
      return `${name(e.seat)} não mostra.`
  }
}

// ---------------------------------------------------------------------------

/** Rótulo da categoria, pra quem precisa fora da mesa (saguão). */
export function categoryLabel(category: HandCategory | null | undefined): string | null {
  return category ? CATEGORY_LABEL[category] : null
}

export { CURRENCY_LABEL, PlayingCard }
