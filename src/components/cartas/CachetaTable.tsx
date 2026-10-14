import * as React from 'react'
import { Hand, Layers, Loader2, Shuffle, Sparkles, Trash2, WandSparkles } from 'lucide-react'
import { isCacheta, type CachetaEvent, type CachetaView, type CartasSeatView, type CartasTableView } from '@/lib/api-cartas'
import { parseCard, RANK_FACE } from '@/lib/api-poker'
import { useCartas } from '@/lib/cartas-context'
import { useLayout } from '@/lib/layout-context'
import { useSettings } from '@/lib/settings-context'
import { playUiSound, type UiSound } from '@/lib/ui-sounds'
import { cn } from '@/lib/utils'
import { CARD_WIDTH, FlipCard, PlayingCard, cardHeight, type CardSize } from '@/components/poker/PlayingCard'
import { CartasMesa, LogLine, firstName, type MesaCtx } from './CartasMesa'
import './cacheta.css'

/**
 * A MESA DA CACHETA — em cima da casca das cartas (CartasMesa), no mesmo
 * desenho do pôquer.
 *
 * O MEIO é o monte (de costas, embaralha na rodada nova) e o lixo (a de cima
 * aberta, as de baixo espiando tortas), com a vira e o curinga da rodada do
 * lado. Na minha vez os dois acendem e são clicáveis: comprar é clicar.
 *
 * O QUE ANDA PELA MESA sai do histórico (`log`, por `seq`), não da vista:
 * cada compra, descarte e batida vira um fantasma que voa uma vez — da pilha
 * pro assento ou do assento pro lixo. Quem abre a mesa no meio vê tudo
 * parado (os eventos antigos não animam).
 *
 * A MINHA MÃO é minha pra arrumar: a ordem é LOCAL (guardada por código +
 * ocorrência, porque com dois baralhos tem 7♥ repetido), arrastando uma
 * carta ou com "Organizar", que junta os jogos que o servidor já enxerga
 * (`myArrangement`). As cartas são posicionadas por `left` absoluto em vez
 * de reordenar o DOM: mover um nó reinicia a animação de entrada e a carta
 * voaria do baralho de novo; mudar `left` só desliza.
 */

const SHUFFLE_MS = 1_000
const DEAL_STEP_MS = 60
const CARD_FLY_MS = 560
const FLIGHT_MS = 460

/** Tamanho logo abaixo, pra mão que não cabe. */
const STEP_DOWN: Record<CardSize, CardSize> = { xs: 'xs', sm: 'xs', ms: 'sm', md: 'ms', ml: 'md', lg: 'ml', xl: 'lg' }

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
// Onde fica cada coisa no meio
// ---------------------------------------------------------------------------

interface Spots {
  /** Centro da mesa (y em %), onde a casca põe o resultado. */
  centerY: number
  /** A fileira de monte/lixo/vira (y em %) — o `--deck-y` da área. */
  rowY: number
  monteX: number
  lixoX: number
  viraX: number
  /** Onde as cartas que eu compro pousam (em %). */
  heroAt: [number, number]
}

function spotsOf(ctx: MesaCtx): Spots {
  const { layout } = ctx
  const w = layout.w || 1000
  const h = layout.h || 600
  const centerY = ctx.toward(0, 1)[1]
  const cw = CARD_WIDTH[layout.centerCard]
  const step = ((cw * 1.75) / w) * 100
  const heroH = cardHeight(layout.heroCard)
  // A fileira desce se cair em cima da placa de quem senta do lado — no
  // celular os lugares de lado ficam altos e a vira cobria o nome.
  const half = ((cardHeight(layout.centerCard) / 2 + 22) / h) * 100
  const rowLeft = ((w / 2 - cw * 1.75 * 1.1 - cw / 2 - 12) / w) * 100
  const rowRight = ((w / 2 + cw * 1.75 + cw / 2 + 12) / w) * 100
  const plateHalf = ((layout.phone ? 56 : 82) / w) * 100
  const plateDown = ((layout.avatarPx / 2 + (layout.phone ? 54 : 66)) / h) * 100
  let rowY = centerY - 8
  for (const r of ctx.rotated) {
    if (!r.seat || r.index === ctx.table.mySeat) continue
    const [x, y] = r.pos
    if (x + plateHalf < rowLeft || x - plateHalf > rowRight) continue
    const bottom = y + plateDown
    if (y < centerY && rowY - half < bottom) rowY = bottom + half
  }
  const floor = ((layout.heroTop - 10) / h) * 100 - half
  rowY = Math.min(rowY, Math.max(centerY - 8, floor))
  return {
    centerY,
    rowY,
    monteX: 50,
    lixoX: 50 + step,
    viraX: 50 - step * 1.1,
    heroAt: [50, Math.min(96, ((layout.heroTop + heroH / 2) / h) * 100)]
  }
}

type Spot = { kind: 'monte' } | { kind: 'lixo' } | { kind: 'seat'; seat: number }

function spotPos(spot: Spot, ctx: MesaCtx, spots: Spots): [number, number] {
  if (spot.kind === 'monte') return [spots.monteX, spots.rowY]
  if (spot.kind === 'lixo') return [spots.lixoX, spots.rowY]
  if (spot.seat === ctx.table.mySeat) return spots.heroAt
  return ctx.posOf(spot.seat)
}

// ---------------------------------------------------------------------------
// O que acontece na mesa: fantasmas, gritos e avisos, a partir do histórico
// ---------------------------------------------------------------------------

interface Flight {
  id: number
  from: Spot
  to: Spot
  /** Aberta (descarte, compra do lixo) ou de costas (compra do monte). */
  code: string | null
}

interface Fx {
  flights: Flight[]
  shout: { id: number; text: string } | null
  /** Aviso em cima do monte ("reembaralhou o lixo"). */
  monteNote: { id: number; text: string } | null
  /** Rodada que eu vi ser dada AGORA (anima a distribuição) e quando. */
  deal: { round: number; at: number } | null
  /** O lixo segura a carta de cima enquanto o descarte voa até ele. */
  lixoHoldUntil: number
  /** Chave (código) da última compra minha, pra realçar na mão. */
  myDraw: { code: string | null; at: number } | null
}

let flightSeq = 0

function useCachetaFx(table: CartasTableView, view: CachetaView | null, sound: (n: UiSound) => void): Fx {
  const [fx, setFx] = React.useState<Fx>({ flights: [], shout: null, monteNote: null, deal: null, lixoHoldUntil: 0, myDraw: null })
  const lastSeq = React.useRef<number | null>(null)
  const matchRef = React.useRef<string | null>(null)
  const timers = React.useRef(new Set<ReturnType<typeof setTimeout>>())
  React.useEffect(() => {
    const set = timers.current
    return () => {
      for (const t of set) clearTimeout(t)
      set.clear()
    }
  }, [])
  const later = React.useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.current.delete(t)
      fn()
    }, ms)
    timers.current.add(t)
  }, [])

  React.useEffect(() => {
    if (!view) return
    const log = view.log
    const top = log.length > 0 ? log[log.length - 1].seq : 0
    // Mesa aberta agora, ou partida nova: o que já aconteceu fica parado.
    if (lastSeq.current === null || matchRef.current !== table.matchId) {
      lastSeq.current = top
      matchRef.current = table.matchId
      return
    }
    const fresh = log.filter((e) => e.seq > (lastSeq.current ?? 0))
    lastSeq.current = Math.max(lastSeq.current, top)
    if (fresh.length === 0) return

    const me = table.mySeat
    const born: Flight[] = []
    let shout: Fx['shout'] = null
    let note: Fx['monteNote'] = null
    let deal: Fx['deal'] = null
    let holdLixo = 0
    let myDraw: Fx['myDraw'] = null

    for (const e of fresh) {
      switch (e.kind) {
        case 'deal':
          deal = { round: e.round ?? view.roundNumber, at: Date.now() }
          sound('poker-shuffle')
          break
        case 'draw':
          if (e.seat === undefined) break
          born.push({
            id: ++flightSeq,
            from: e.from === 'discard' ? { kind: 'lixo' } : { kind: 'monte' },
            to: { kind: 'seat', seat: e.seat },
            code: e.from === 'discard' ? e.card ?? null : null
          })
          if (e.seat === me) myDraw = { code: e.from === 'discard' ? e.card ?? null : view.lastDraw?.card ?? null, at: Date.now() }
          sound('poker-card')
          break
        case 'discard':
          if (e.seat === undefined) break
          born.push({ id: ++flightSeq, from: { kind: 'seat', seat: e.seat }, to: { kind: 'lixo' }, code: e.card ?? null })
          holdLixo = Date.now() + FLIGHT_MS
          later(FLIGHT_MS - 80, () => sound('cartas-mesa'))
          break
        case 'knock':
          shout = { id: ++flightSeq, text: e.with10 ? 'BATEU COM 10!' : 'BATEU!' }
          sound('cartas-bate')
          if (e.seat === me) later(500, () => sound('poker-win'))
          if (e.seat !== undefined && e.card) {
            born.push({ id: ++flightSeq, from: { kind: 'seat', seat: e.seat }, to: { kind: 'lixo' }, code: e.card })
            holdLixo = Date.now() + FLIGHT_MS
          }
          break
        case 'reshuffle':
          note = { id: ++flightSeq, text: 'reembaralhou o lixo' }
          sound('poker-shuffle')
          break
        default:
          break
      }
    }

    if (deal) {
      // As cartas saindo do maço, depois do embaralhar: um estalo por leva.
      const alive = Object.values(view.players).filter((p) => !p.out).length
      for (let k = 0; k < Math.min(18, alive * 9); k += 2) {
        later(SHUFFLE_MS + k * DEAL_STEP_MS + 20, () => sound('poker-card'))
      }
    }

    setFx((prev) => ({
      flights: [...prev.flights, ...born],
      shout: shout ?? prev.shout,
      monteNote: note ?? prev.monteNote,
      deal: deal ?? prev.deal,
      lixoHoldUntil: Math.max(prev.lixoHoldUntil, holdLixo),
      myDraw: myDraw ?? prev.myDraw
    }))
    if (born.length > 0) {
      const ids = new Set(born.map((b) => b.id))
      later(FLIGHT_MS + 80, () => setFx((prev) => ({ ...prev, flights: prev.flights.filter((f) => !ids.has(f.id)) })))
    }
    if (holdLixo) later(holdLixo - Date.now() + 20, () => setFx((prev) => ({ ...prev })))
    if (shout) {
      const id = shout.id
      later(1_700, () => setFx((prev) => (prev.shout?.id === id ? { ...prev, shout: null } : prev)))
    }
    if (note) {
      const id = note.id
      later(2_500, () => setFx((prev) => (prev.monteNote?.id === id ? { ...prev, monteNote: null } : prev)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.log, table.matchId])

  return fx
}

// ---------------------------------------------------------------------------
// A minha mão: ordem local por código + ocorrência
// ---------------------------------------------------------------------------

interface HandCard {
  key: string
  code: string
}

/** "7h#0", "7h#1": a segunda cópia de uma carta igual é outra chave. */
function keyed(codes: string[]): HandCard[] {
  const seen = new Map<string, number>()
  return codes.map((code) => {
    const n = seen.get(code) ?? 0
    seen.set(code, n + 1)
    return { key: `${code}#${n}`, code }
  })
}

/** Junta os jogos primeiro (na ordem do servidor), depois as soltas. */
function organized(cards: HandCard[], arrangement: CachetaView['myArrangement']): string[] {
  if (!arrangement) return cards.map((c) => c.key)
  const pool = new Map<string, string[]>()
  for (const c of cards) pool.set(c.code, [...(pool.get(c.code) ?? []), c.key])
  const take = (code: string): string | null => {
    const list = pool.get(code)
    if (!list || list.length === 0) return null
    return list.shift()!
  }
  const out: string[] = []
  for (const meld of arrangement.melds) for (const code of meld) {
    const k = take(code)
    if (k) out.push(k)
  }
  for (const code of arrangement.loose) {
    const k = take(code)
    if (k) out.push(k)
  }
  for (const list of pool.values()) out.push(...list)
  return out
}

/** Em qual jogo do `myArrangement` cada carta está (por chave), ou nada. */
function meldGroups(cards: HandCard[], arrangement: CachetaView['myArrangement']): Map<string, number> {
  const groups = new Map<string, number>()
  if (!arrangement) return groups
  const pool = new Map<string, string[]>()
  for (const c of cards) pool.set(c.code, [...(pool.get(c.code) ?? []), c.key])
  arrangement.melds.forEach((meld, g) => {
    for (const code of meld) {
      const k = pool.get(code)?.shift()
      if (k) groups.set(k, g)
    }
  })
  return groups
}

function useHandOrder(view: CachetaView | null): {
  cards: HandCard[]
  order: string[]
  setOrder: (order: string[]) => void
  organize: () => void
} {
  const codes = view?.myHand ?? null
  const cards = React.useMemo(() => keyed(codes ?? []), [codes])
  const [order, setOrderState] = React.useState<string[]>([])
  const roundRef = React.useRef<number | null>(null)

  // A mão mudou (comprou, descartou, rodada nova): mantém a ordem que a
  // pessoa arrumou, tira o que saiu e põe o que entrou no fim.
  React.useEffect(() => {
    const keys = cards.map((c) => c.key)
    const round = view?.roundNumber ?? null
    if (round !== roundRef.current) {
      roundRef.current = round
      setOrderState(organized(cards, view?.myArrangement ?? null))
      return
    }
    setOrderState((prev) => {
      const have = new Set(keys)
      const kept = prev.filter((k) => have.has(k))
      const keptSet = new Set(kept)
      return [...kept, ...keys.filter((k) => !keptSet.has(k))]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, view?.roundNumber])

  const organize = React.useCallback(() => {
    setOrderState(organized(cards, view?.myArrangement ?? null))
  }, [cards, view?.myArrangement])

  return { cards, order, setOrder: setOrderState, organize }
}

// ---------------------------------------------------------------------------
// A tela
// ---------------------------------------------------------------------------

export function CachetaTable({ onOpenRules }: { onOpenRules: () => void }) {
  const { table } = useCartas()
  if (!table || table.game !== 'cacheta') return null
  return <CachetaScreen table={table} onOpenRules={onOpenRules} />
}

function CachetaScreen({ table, onOpenRules }: { table: CartasTableView; onOpenRules: () => void }) {
  const { act } = useCartas()
  const { isPhone } = useLayout()
  const view = isCacheta(table.match) ? table.match : null
  const sound = useTableSound()
  const fx = useCachetaFx(table, view, sound)
  const hand = useHandOrder(view)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [selected, setSelected] = React.useState<string | null>(null)

  const me = table.mySeat
  const legal = view?.legal ?? null
  const myTurn = !!view && table.playing && me !== null && view.turn === me && !!legal
  const phase = view?.phase ?? null

  // A seleção vale pra esta vez: comprou/descartou, limpa se a carta sumiu.
  React.useEffect(() => {
    setSelected((s) => (s && hand.cards.some((c) => c.key === s) ? s : null))
  }, [hand.cards])

  // Virou a minha vez: um toque (fora da tela quem toca é o contexto).
  const wasMyTurn = React.useRef(myTurn)
  React.useEffect(() => {
    if (myTurn && !wasMyTurn.current && phase === 'draw') sound('poker-turn')
    wasMyTurn.current = myTurn
  }, [myTurn, phase, sound])

  // Ganhei a partida: o arpejo (a batida já tocou o dela).
  const overSeen = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!view?.over || !table.matchId || overSeen.current === table.matchId) return
    overSeen.current = table.matchId
    if (view.over.winner === me) sound('poker-win')
  }, [view?.over, table.matchId, me, sound])

  const send = React.useCallback(
    async (action: Record<string, unknown>): Promise<void> => {
      if (busy) return
      setBusy(true)
      const ack = await act(table.id, action)
      setBusy(false)
      if (!ack.ok) setError(ack.error ?? 'A mesa recusou a jogada.')
    },
    [act, busy, table.id]
  )

  const selectedCode = selected ? hand.cards.find((c) => c.key === selected)?.code ?? null : null
  const canDraw = myTurn && phase === 'draw' && !!legal?.draw
  const canDrawDiscard = myTurn && phase === 'draw' && !!legal?.drawDiscard
  const canDiscard = myTurn && phase === 'discard' && !!legal?.discard
  const knockNine = new Set(legal?.knockNine ?? [])
  const knockTen = myTurn && phase === 'discard' && !!legal?.knockTen
  const selectedKnocks = !!selectedCode && knockNine.has(selectedCode)

  const drawStock = (): void => void (canDraw && send({ type: 'draw', from: 'stock' }))
  const drawDiscard = (): void => void (canDrawDiscard && send({ type: 'draw', from: 'discard' }))
  const discard = (code: string | null = selectedCode): void => {
    if (!canDiscard || !code) return
    if (code === legal?.forbiddenDiscard && hand.cards.filter((c) => c.code === code).length < 2) {
      setError('Você acabou de pegar essa do lixo.')
      return
    }
    void send({ type: 'discard', card: code })
  }
  const knock = (): void => {
    if (knockTen) return void send({ type: 'knock' })
    if (selectedKnocks && selectedCode) return void send({ type: 'knock', discard: selectedCode })
    if (myTurn && phase === 'discard' && knockNine.size > 0) setError('Escolha a carta que vai pro lixo (as marcadas batem).')
  }

  // Atalhos: M monte, L lixo, D descarta a escolhida, B bate.
  const keysRef = React.useRef({ drawStock, drawDiscard, discard, knock })
  keysRef.current = { drawStock, drawDiscard, discard, knock }
  React.useEffect(() => {
    if (!myTurn) return
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'm') keysRef.current.drawStock()
      else if (k === 'l') keysRef.current.drawDiscard()
      else if (k === 'd') keysRef.current.discard()
      else if (k === 'b') keysRef.current.knock()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [myTurn])

  const result = view?.result ?? null
  const turnName = view?.turn !== null && view?.turn !== undefined ? firstName(table, view.turn) : null

  let status: React.ReactNode = null
  if (view) {
    if (phase === 'over') status = <span>Partida encerrada.</span>
    else if (phase === 'done' && result)
      status =
        result.winner === null ? (
          <span>Monte acabou: rodada empatada.</span>
        ) : (
          <span>
            <span className="text-foreground">{result.winner === me ? 'Você' : firstName(table, result.winner)}</span> bateu
            {result.with10 ? ' com 10' : ''}. Próxima rodada já já.
          </span>
        )
    else if (myTurn && phase === 'draw') status = <span className="text-acid-text">Sua vez: compre do monte ou pegue do lixo.</span>
    else if (myTurn && phase === 'discard')
      status = (
        <span className="text-acid-text">
          {knockTen ? 'Dá pra bater com 10!' : knockNine.size > 0 ? 'Dá pra bater: escolha a carta do descarte.' : 'Descarte uma carta.'}
        </span>
      )
    else if (me !== null && view.players[me]?.out) status = <span>Você está fora desta partida.</span>
    else if (turnName) status = <span>Vez de {turnName}.</span>
  }
  const statusLine = (
    <>
      {view?.myHand && view.myHand.length > 0 && (
        <button type="button" className="poker-mini" onClick={hand.organize} title="Junta os jogos formados e deixa as soltas no fim">
          <WandSparkles className="h-3 w-3" aria-hidden />
          Organizar
        </button>
      )}
      {status}
    </>
  )

  const lastActor = React.useMemo(() => lastActionBySeat(view), [view])

  return (
    <CartasMesa
      table={table}
      // As cartas dadas saem do MONTE, onde quer que a fileira tenha ido parar.
      deckAt={(ctx) => {
        const sp = spotsOf(ctx)
        return [sp.monteX, sp.rowY]
      }}
      onOpenRules={onOpenRules}
      error={error}
      onError={setError}
      dealerSeat={view && phase !== 'over' ? view.dealer : null}
      center={(ctx) => (view && table.playing ? <Centro ctx={ctx} view={view} fx={fx} canDraw={canDraw} canDrawDiscard={canDrawDiscard} onStock={drawStock} onDiscardPile={drawDiscard} /> : null)}
      seatCards={(seat, ctx) => (view ? <SeatCards seat={seat} view={view} ctx={ctx} deal={fx.deal} /> : null)}
      seatInfo={(seat) => (view ? <SeatInfo seat={seat} view={view} lastActor={lastActor} /> : null)}
      heroCards={(ctx) =>
        view && me !== null && view.myHand && view.myHand.length > 0 ? (
          <MinhaMao
            ctx={ctx}
            view={view}
            cards={hand.cards}
            order={hand.order}
            onReorder={hand.setOrder}
            selected={selected}
            onSelect={setSelected}
            onDiscard={(code) => discard(code)}
            deal={fx.deal}
            myDraw={fx.myDraw}
            knockNine={myTurn && phase === 'discard' ? knockNine : null}
            forbidden={myTurn && phase === 'discard' ? legal?.forbiddenDiscard ?? null : null}
          />
        ) : null
      }
      overlay={(ctx) => (
        <>
          {view && <Flights ctx={ctx} flights={fx.flights} />}
          {fx.shout && (
            <div key={fx.shout.id} className="cartas-grito" aria-live="polite">
              {fx.shout.text}
            </div>
          )}
          {view && !isPhone && <Placar table={table} view={view} />}
        </>
      )}
      status={statusLine}
      actions={
        view ? (
          <Acoes
            view={view}
            phone={isPhone}
            busy={busy}
            myTurn={myTurn}
            canDraw={canDraw}
            canDrawDiscard={canDrawDiscard}
            canDiscard={canDiscard}
            selectedCode={selectedCode}
            knockTen={knockTen}
            selectedKnocks={selectedKnocks}
            knockNineCount={myTurn && phase === 'discard' ? knockNine.size : 0}
            onStock={drawStock}
            onDiscardPile={drawDiscard}
            onDiscard={() => discard()}
            onKnock={knock}
          />
        ) : null
      }
      log={view ? <Historico table={table} view={view} /> : null}
    />
  )
}

/** A última coisa que cada um fez nesta rodada (pra faixa da placa). */
function lastActionBySeat(view: CachetaView | null): Map<number, CachetaEvent> {
  const out = new Map<number, CachetaEvent>()
  if (!view) return out
  for (let i = view.log.length - 1; i >= 0; i--) {
    const e = view.log[i]
    if (e.kind === 'deal' || e.kind === 'round') break
    if ((e.kind === 'draw' || e.kind === 'discard') && e.seat !== undefined && !out.has(e.seat)) out.set(e.seat, e)
  }
  return out
}

// ---------------------------------------------------------------------------
// O meio: monte, lixo, vira — ou a batida aberta
// ---------------------------------------------------------------------------

function Centro({
  ctx,
  view,
  fx,
  canDraw,
  canDrawDiscard,
  onStock,
  onDiscardPile
}: {
  ctx: MesaCtx
  view: CachetaView
  fx: Fx
  canDraw: boolean
  canDrawDiscard: boolean
  onStock: () => void
  onDiscardPile: () => void
}) {
  const spots = spotsOf(ctx)
  const size = ctx.layout.centerCard
  const w = CARD_WIDTH[size]
  const h = cardHeight(size)
  const result = view.phase === 'done' || view.phase === 'over' ? view.result : null
  // Enquanto um descarte voa, o lixo ainda mostra o que tinha antes.
  const holding = Date.now() < fx.lixoHoldUntil
  const recent = holding ? view.discardRecent.slice(0, -1) : view.discardRecent
  const top = recent.length > 0 ? recent[recent.length - 1] : null
  const under = recent.slice(-4, -1)
  const shuffleKey = fx.deal && fx.deal.round === view.roundNumber && Date.now() - fx.deal.at < 4_000 ? `${fx.deal.round}-${fx.deal.at}` : null
  const stockLayers = Math.min(4, Math.max(1, Math.ceil(view.stockCount / 12)))
  const viraSize: CardSize = ctx.layout.phone ? 'xs' : STEP_DOWN[size]

  return (
    <>
      {/* A VIRA e o curinga */}
      {view.vira && view.wild && !result && (
        <div className="cacheta-pilha" style={{ left: `${spots.viraX}%`, top: `${spots.rowY}%` }}>
          <div className="cacheta-curinga">
            <PlayingCard code={view.vira} size={viraSize} className="-rotate-6" />
            <span className="cacheta-curinga-selo" title="O valor seguinte à vira, da mesma cor">
              <Sparkles className="h-3 w-3" aria-hidden />
              {wildLabel(view.wild)}
            </span>
          </div>
        </div>
      )}

      {/* O MONTE */}
      {!result && (
        <button
          type="button"
          disabled={!canDraw}
          onClick={onStock}
          aria-label={`Comprar do monte (${view.stockCount} cartas)`}
          className={cn('cacheta-pilha', canDraw && 'cacheta-pilha--clica')}
          style={{ left: `${spots.monteX}%`, top: `${spots.rowY}%`, width: w, height: h }}
        >
          <div className="relative" style={{ width: w, height: h }}>
            {Array.from({ length: stockLayers }, (_, i) => (
              <PlayingCard
                key={i}
                faceDown
                size={size}
                style={{ transform: `translate(${-i * 1.2}px, ${i * 1.4}px) rotate(${-i * 1.2}deg)`, zIndex: stockLayers - i }}
              />
            ))}
          </div>
          <span className="cacheta-pilha-rotulo">
            monte <span className="font-mono">{view.stockCount}</span>
          </span>
          {fx.monteNote && (
            <span key={fx.monteNote.id} className="cacheta-aviso-monte">
              <Shuffle className="mr-1 inline h-3 w-3" aria-hidden />
              {fx.monteNote.text}
            </span>
          )}
        </button>
      )}

      {/* Rodada nova: o maço abre em duas metades e volta intercalado, como no
          pôquer. Mora no `--deck-x/--deck-y` da área, que é onde o monte está. */}
      {!result && shuffleKey && <Embaralho key={shuffleKey} size={size} />}

      {/* O LIXO */}
      {!result && (
        <button
          type="button"
          disabled={!canDrawDiscard}
          onClick={onDiscardPile}
          aria-label={top ? `Pegar do lixo` : 'Lixo vazio'}
          className={cn('cacheta-pilha', canDrawDiscard && 'cacheta-pilha--clica')}
          style={{ left: `${spots.lixoX}%`, top: `${spots.rowY}%`, width: w, height: h }}
        >
          {under.map((code, i) => (
            <PlayingCard
              key={`${code}-${i}-${view.discardCount}`}
              code={code}
              size={size}
              className="cacheta-lixo-velha"
              style={{ transform: `translate(${(i - under.length) * 3}px, ${(under.length - i) * 2}px) rotate(${(i % 2 ? 7 : -9) - i * 2}deg)` }}
            />
          ))}
          {top ? (
            <PlayingCard key={`topo-${top}-${view.discardCount}`} code={top} size={size} style={{ transform: 'rotate(2deg)' }} />
          ) : (
            <PlayingCard placeholder size={size} />
          )}
          <span className="cacheta-pilha-rotulo">lixo</span>
        </button>
      )}

      {/* BATEU: a mão aberta no meio, em jogos */}
      {result && <Batida ctx={ctx} view={view} centerY={spots.centerY} />}
    </>
  )
}

/** As oito cartas do embaralhar (mesmo desenho do Deck do pôquer). */
const RIFFLE = Array.from({ length: 8 }, (_, k) => ({ side: k % 2 === 0 ? -1 : 1, i: Math.floor(k / 2), back: 330 + k * 70 }))

function Embaralho({ size }: { size: CardSize }) {
  const w = CARD_WIDTH[size]
  const h = cardHeight(size)
  const [done, setDone] = React.useState(false)
  React.useEffect(() => {
    const t = setTimeout(() => setDone(true), SHUFFLE_MS + 200)
    return () => clearTimeout(t)
  }, [])
  if (done) return null
  return (
    <div className="poker-baralho poker-baralho--embaralha" style={{ ['--bw' as string]: `${w}px`, zIndex: 7 } as React.CSSProperties} aria-hidden>
      <div className="relative" style={{ width: w, height: h }}>
        <div className="poker-baralho-repouso">
          <PlayingCard faceDown size={size} />
        </div>
        {RIFFLE.map((c, k) => (
          <PlayingCard
            key={k}
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

function wildLabel(wild: NonNullable<CachetaView['wild']>): string {
  const rank = parseCard(`${wild.rank}s`)?.rank
  return `curinga: ${rank ? RANK_FACE[rank] : wild.rank} ${wild.color === 'red' ? 'vermelho' : 'preto'}`
}

function Batida({ ctx, view, centerY }: { ctx: MesaCtx; view: CachetaView; centerY: number }) {
  const r = view.result!
  const phone = ctx.layout.phone
  const size: CardSize = phone ? 'xs' : ctx.layout.big ? 'ms' : 'sm'
  const wild = new Set(view.wild?.cards ?? [])
  const who = r.winner === null ? null : r.winner === ctx.table.mySeat ? 'Você' : firstName(ctx.table, r.winner)
  return (
    <div className="cacheta-batida" style={{ top: `${centerY}%` }}>
      {r.winner === null ? (
        <p className="text-sm font-semibold text-foreground">Monte e lixo acabaram — ninguém perde ponto.</p>
      ) : (
        <>
          <p className="text-sm font-semibold text-foreground">
            {who} bateu{r.with10 ? <span className="text-burn"> com 10</span> : null}
            <span className="ml-1.5 text-[11.5px] font-normal text-muted-foreground">
              — {r.with10 ? 'cada um perde 2' : 'cada um perde 1'}
            </span>
          </p>
          <div className="cacheta-batida-jogos">
            {r.melds.map((meld, g) => (
              <span key={g} className="cacheta-batida-jogo">
                {meld.map((code, i) => (
                  <span key={`${code}-${i}`} className="relative inline-flex" style={{ marginLeft: i === 0 ? 0 : -Math.round(CARD_WIDTH[size] * 0.32) }}>
                    <FlipCard code={code} size={size} flipDelayMs={700 + g * 120 + i * 60} />
                    {wild.has(code) && (
                      <span className="cacheta-selo cacheta-selo--curinga !h-3.5 !w-3.5" aria-label="curinga">
                        <Sparkles className="h-2.5 w-2.5" aria-hidden />
                      </span>
                    )}
                  </span>
                ))}
              </span>
            ))}
            {r.discard && (
              <span className="flex flex-col items-center gap-0.5">
                <PlayingCard code={r.discard} size={size} dim />
                <span className="text-[11px] text-muted-foreground">descarte</span>
              </span>
            )}
          </div>
          {r.eliminated.length > 0 && (
            <p className="text-[11.5px] text-destructive">
              {r.eliminated.map((s) => (s === ctx.table.mySeat ? 'você' : firstName(ctx.table, s))).join(', ')}{' '}
              {r.eliminated.length > 1 ? 'saíram' : 'saiu'} do jogo
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fantasmas: a carta indo do monte/lixo pro assento e do assento pro lixo
// ---------------------------------------------------------------------------

function Flights({ ctx, flights }: { ctx: MesaCtx; flights: Flight[] }) {
  const spots = spotsOf(ctx)
  const size = ctx.layout.phone ? 'sm' : STEP_DOWN[ctx.layout.centerCard]
  return (
    <>
      {flights.map((f) => {
        const from = spotPos(f.from, ctx, spots)
        const to = spotPos(f.to, ctx, spots)
        const toSeat = f.to.kind === 'seat'
        const style = {
          ['--de-x' as string]: from[0],
          ['--de-y' as string]: from[1],
          ['--para-x' as string]: to[0],
          ['--para-y' as string]: to[1]
        } as React.CSSProperties
        return (
          <div key={f.id} className={cn('cacheta-voo', toSeat && 'cacheta-voo--some')} style={style} aria-hidden>
            {f.code ? <PlayingCard code={f.code} size={size} /> : <PlayingCard faceDown size={size} />}
          </div>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// Os outros: o leque de costas, as vidas e a última jogada
// ---------------------------------------------------------------------------

function SeatCards({ seat, view, ctx, deal }: { seat: CartasSeatView; view: CachetaView; ctx: MesaCtx; deal: Fx['deal'] }) {
  const p = view.players[seat.index]
  if (!p || p.out) return null
  const done = view.result && (view.phase === 'done' || view.phase === 'over')
  const open = done ? view.result!.hands[seat.index] : null
  if (open && open.length > 0) {
    const size: CardSize = 'xs'
    const stride = Math.round(CARD_WIDTH[size] * 0.58)
    return (
      <div className="cacheta-aberta">
        {open.map((code, i) => (
          <span key={`${code}-${i}`} style={{ marginLeft: i === 0 ? 0 : stride - CARD_WIDTH[size] }}>
            <PlayingCard code={code} size={size} />
          </span>
        ))}
      </div>
    )
  }
  const n = Math.min(10, p.cardCount)
  if (n === 0) return null
  const size = ctx.layout.seatCard
  const cw = CARD_WIDTH[size]
  const stride = Math.max(5, Math.round(cw * (ctx.layout.phone ? 0.16 : 0.2)))
  const fresh = !!deal && deal.round === view.roundNumber && Date.now() - deal.at < 3_500
  return (
    <div className={cn('cacheta-leque', !seat.connected && 'opacity-60')}>
      {Array.from({ length: n }, (_, i) => (
        <PlayingCard
          key={`${view.roundNumber}-${i}`}
          faceDown
          size={size}
          tilt={(i - (n - 1) / 2) * 5}
          enter={fresh ? 'fly' : 'none'}
          delayMs={fresh ? SHUFFLE_MS + i * DEAL_STEP_MS * 2 : 0}
          dx={Math.round((i - (n - 1) / 2) * stride)}
          style={{ marginLeft: i === 0 ? 0 : stride - cw }}
        />
      ))}
    </div>
  )
}

function SeatInfo({ seat, view, lastActor }: { seat: CartasSeatView; view: CachetaView; lastActor: Map<number, CachetaEvent> }) {
  const p = view.players[seat.index]
  if (!p) return null
  const result = view.phase === 'done' || view.phase === 'over' ? view.result : null
  const lost = result?.lost[seat.index] ?? 0
  const eliminated = !!result?.eliminated.includes(seat.index)
  const before = p.points + lost
  const last = !result ? lastActor.get(seat.index) : undefined
  return (
    <span className="relative flex flex-col items-center">
      <span className="cacheta-vidas" aria-label={`${p.points} de ${view.startPoints} pontos`} title={`${p.points} de ${view.startPoints} pontos`}>
        {Array.from({ length: view.startPoints }, (_, i) => (
          <span
            key={i}
            className={cn('cacheta-vida', i >= before && 'cacheta-vida--apagada', i >= p.points && i < before && 'cacheta-vida--caindo')}
          />
        ))}
      </span>
      {p.out && !eliminated ? (
        <span className="poker-jogada poker-jogada--blind">fora</span>
      ) : eliminated ? (
        <span className="poker-jogada poker-jogada--allin">eliminado!</span>
      ) : last ? (
        <span key={last.seq} className={cn('poker-jogada', last.kind === 'discard' ? 'poker-jogada--blind' : 'poker-jogada--check')}>
          {last.kind === 'discard' ? 'descartou' : last.from === 'discard' ? 'pegou do lixo' : 'comprou'}
        </span>
      ) : null}
      {lost > 0 && <span className="cacheta-perde">−{lost}</span>}
    </span>
  )
}

/** As vidas de todo mundo, no canto: quem está perto de sair. */
function Placar({ table, view }: { table: CartasTableView; view: CachetaView }) {
  const rows = Object.entries(view.players)
    .map(([seat, p]) => ({ seat: Number(seat), ...p }))
    .sort((a, b) => Number(a.out) - Number(b.out) || b.points - a.points)
  return (
    <div className="absolute left-2 top-2 z-[16] cacheta-placar">
      <p className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Pontos</span>
        <span>rodada {view.roundNumber}</span>
      </p>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.seat} className={cn('flex items-center gap-2 text-[11.5px]', r.out ? 'text-muted-foreground/60 line-through' : 'text-foreground')}>
            <span className="min-w-0 flex-1 truncate">{r.seat === table.mySeat ? 'Você' : firstName(table, r.seat)}</span>
            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-foreground/10">
              <span
                className={cn('block h-full rounded-full transition-[width] duration-700', r.points <= 1 ? 'bg-destructive' : 'bg-acid')}
                style={{ width: `${(r.points / view.startPoints) * 100}%` }}
              />
            </span>
            <span className="w-4 text-right font-mono">{r.points}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// A minha mão
// ---------------------------------------------------------------------------

interface Drag {
  key: string
  pointerId: number
  startX: number
  startLeft: number
  dx: number
  moved: boolean
}

function MinhaMao({
  ctx,
  view,
  cards,
  order,
  onReorder,
  selected,
  onSelect,
  onDiscard,
  deal,
  myDraw,
  knockNine,
  forbidden
}: {
  ctx: MesaCtx
  view: CachetaView
  cards: HandCard[]
  order: string[]
  onReorder: (order: string[]) => void
  selected: string | null
  onSelect: (key: string | null) => void
  onDiscard: (code: string) => void
  deal: Fx['deal']
  myDraw: Fx['myDraw']
  knockNine: Set<string> | null
  forbidden: string | null
}) {
  const { layout } = ctx
  const [drag, setDrag] = React.useState<Drag | null>(null)
  const byKey = React.useMemo(() => new Map(cards.map((c) => [c.key, c])), [cards])
  const groups = React.useMemo(() => meldGroups(cards, view.myArrangement), [cards, view.myArrangement])
  const wild = React.useMemo(() => new Set(view.wild?.cards ?? []), [view.wild])
  const keys = order.filter((k) => byKey.has(k))
  const n = keys.length

  // O tamanho: o maior que cabe na largura, com sobreposição de no máximo ~60%.
  const avail = Math.min(layout.w - 24, 1040)
  const GAP = layout.phone ? 6 : 12
  const gapCount = (ks: string[]): number => {
    let g = 0
    for (let i = 1; i < ks.length; i++) if (groups.get(ks[i]) !== groups.get(ks[i - 1])) g++
    return g
  }
  let size: CardSize = layout.heroCard
  let stride = 0
  for (;;) {
    const cw = CARD_WIDTH[size]
    stride = n > 1 ? Math.min(cw * 0.8, (avail - cw - gapCount(keys) * GAP) / (n - 1)) : 0
    if (stride >= cw * 0.4 || size === 'sm' || size === 'xs') break
    size = STEP_DOWN[size]
  }
  const cw = CARD_WIDTH[size]
  const ch = cardHeight(size)

  // A ordem mostrada: durante o arrasto, já abre a vaga onde a carta vai cair.
  const lefts = (ks: string[]): Map<string, number> => {
    const out = new Map<string, number>()
    let x = 0
    ks.forEach((k, i) => {
      if (i > 0) {
        x += stride
        if (groups.get(k) !== groups.get(ks[i - 1])) x += GAP
      }
      out.set(k, x)
    })
    return out
  }
  const base = lefts(keys)
  let shown = keys
  if (drag && drag.moved) {
    const at = drag.startLeft + drag.dx
    const rest = keys.filter((k) => k !== drag.key)
    const restLefts = lefts(rest)
    let idx = rest.length
    for (let i = 0; i < rest.length; i++) {
      if (at < (restLefts.get(rest[i]) ?? 0) + stride / 2) {
        idx = i
        break
      }
    }
    shown = [...rest.slice(0, idx), drag.key, ...rest.slice(idx)]
  }
  const pos = lefts(shown)
  const width = n > 0 ? (pos.get(shown[shown.length - 1]) ?? 0) + cw : 0

  // Rodada que vi ser dada: as cartas saem do maço uma a uma e viram ao pousar.
  const dealing = !!deal && deal.round === view.roundNumber && Date.now() - deal.at < SHUFFLE_MS + 9 * DEAL_STEP_MS * 6 + CARD_FLY_MS + 900
  const alive = Math.max(1, Object.values(view.players).filter((p) => !p.out).length)
  const [, rerender] = React.useReducer((x: number) => x + 1, 0)
  React.useEffect(() => {
    if (!dealing || !deal) return
    const t = setTimeout(rerender, SHUFFLE_MS + 9 * DEAL_STEP_MS * alive + CARD_FLY_MS + 1_000)
    return () => clearTimeout(t)
  }, [dealing, deal, alive])
  // A carta que acabou de chegar (comprada por mim) brilha um pouco.
  const freshDraw = myDraw && Date.now() - myDraw.at < 2_600 ? myDraw : null
  const newKey = freshDraw && n > 0 ? keys[keys.length - 1] : null
  React.useEffect(() => {
    if (!freshDraw) return
    const t = setTimeout(rerender, 2_700)
    return () => clearTimeout(t)
  }, [freshDraw])

  const end = (e: React.PointerEvent): void => {
    if (!drag || drag.pointerId !== e.pointerId) return
    if (drag.moved) onReorder(shown)
    else onSelect(selected === drag.key ? null : drag.key)
    setDrag(null)
  }

  // Ponto onde a mão "senta" em relação ao assento (pra o voo do maço acertar).
  const heroH = ch
  const dy = Math.round(layout.h - 4 - (layout.phone ? 58 : 70) - heroH / 2 + 8 - (ctx.posOf(ctx.table.mySeat ?? 0)[1] * layout.h) / 100)

  return (
    <div className="cacheta-mao" style={{ width, height: ch + 22 }} role="list" aria-label="Sua mão">
      {/* Renderizadas SEMPRE na ordem da vista (chave estável); a posição é o `left`. */}
      {cards.map((c, dealIndex) => {
        const left = drag?.moved && drag.key === c.key ? drag.startLeft + drag.dx : pos.get(c.key) ?? 0
        const isSel = selected === c.key
        const knocks = !!knockNine && knockNine.has(c.code)
        const isForbidden = forbidden === c.code && cards.filter((x) => x.code === c.code).length < 2
        const z = (shown.indexOf(c.key) + 1) * 2
        const cx = left + cw / 2 - width / 2
        return (
          <div
            key={c.key}
            role="listitem"
            className={cn(
              'cacheta-carta',
              isSel && 'cacheta-carta--escolhida',
              drag?.key === c.key && drag.moved && 'cacheta-carta--arrasta',
              isForbidden && 'cacheta-carta--proibida',
              newKey === c.key && 'cacheta-carta--nova'
            )}
            style={{ left, zIndex: z }}
            title={isForbidden ? 'Veio do lixo agora: não dá pra devolver' : undefined}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              setDrag({ key: c.key, pointerId: e.pointerId, startX: e.clientX, startLeft: base.get(c.key) ?? 0, dx: 0, moved: false })
            }}
            onPointerMove={(e) => {
              if (!drag || drag.pointerId !== e.pointerId) return
              const dx = e.clientX - drag.startX
              if (!drag.moved && Math.abs(dx) < 6) return
              setDrag({ ...drag, dx, moved: true })
            }}
            onPointerUp={end}
            onPointerCancel={() => setDrag(null)}
            onDoubleClick={() => onDiscard(c.code)}
          >
            {dealing ? (
              <FlipCard
                code={c.code}
                size={size}
                fly
                delayMs={SHUFFLE_MS + dealIndex * DEAL_STEP_MS * alive}
                dx={Math.round(cx)}
                dy={dy}
              />
            ) : (
              <PlayingCard code={c.code} size={size} />
            )}
            {wild.has(c.code) && (
              <span className="cacheta-selo cacheta-selo--curinga" title="Curinga">
                <Sparkles className="h-3 w-3" aria-hidden />
              </span>
            )}
            {knocks && <span className="cacheta-selo cacheta-selo--bate">bate</span>}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// A barra de ação
// ---------------------------------------------------------------------------

function Acoes({
  view,
  phone,
  busy,
  myTurn,
  canDraw,
  canDrawDiscard,
  canDiscard,
  selectedCode,
  knockTen,
  selectedKnocks,
  knockNineCount,
  onStock,
  onDiscardPile,
  onDiscard,
  onKnock
}: {
  view: CachetaView
  phone: boolean
  busy: boolean
  myTurn: boolean
  canDraw: boolean
  canDrawDiscard: boolean
  canDiscard: boolean
  selectedCode: string | null
  knockTen: boolean
  selectedKnocks: boolean
  knockNineCount: number
  onStock: () => void
  onDiscardPile: () => void
  onDiscard: () => void
  onKnock: () => void
}) {
  const compact = phone && 'poker-botao--compacto'
  const canKnock = knockTen || selectedKnocks
  const top = view.discardTop
  return (
    <div className={cn('grid', phone ? 'grid-cols-2 gap-1.5' : 'grid-cols-4 gap-2')}>
      <button type="button" className={cn('poker-botao poker-botao--check', compact, canDraw && 'poker-botao--sugerido')} disabled={busy || !canDraw} onClick={onStock}>
        <Layers className="h-4 w-4" aria-hidden />
        Monte {!phone && <kbd>M</kbd>}
      </button>
      <button type="button" className={cn('poker-botao poker-botao--check', compact)} disabled={busy || !canDrawDiscard} onClick={onDiscardPile}>
        {top ? <PlayingCard code={top} size="xs" /> : null}
        Lixo {!phone && <kbd>L</kbd>}
      </button>
      <button
        type="button"
        className={cn('poker-botao poker-botao--fold', compact)}
        disabled={busy || !canDiscard || !selectedCode}
        onClick={onDiscard}
        title={canDiscard && !selectedCode ? 'Escolha uma carta da mão (ou dois cliques nela)' : undefined}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        {selectedCode && canDiscard ? (
          <>
            Descartar <PlayingCard code={selectedCode} size="xs" />
          </>
        ) : (
          'Descartar'
        )}
        {!phone && <kbd>D</kbd>}
      </button>
      <button
        type="button"
        // Apagado no verde parecia aceso (o verde a 45% ainda grita): sem batida, fica neutro.
        className={cn('poker-botao', canKnock ? (knockTen ? 'poker-botao--allin' : 'poker-botao--raise') : knockNineCount > 0 ? 'poker-botao--raise' : 'poker-botao--check', compact)}
        disabled={busy || !myTurn || (!canKnock && knockNineCount === 0)}
        onClick={onKnock}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Hand className="h-4 w-4" aria-hidden />
        )}
        {knockTen ? (
          'Bater com 10'
        ) : selectedKnocks && selectedCode ? (
          <>
            Bater {!phone && 'descartando'} <PlayingCard code={selectedCode} size="xs" />
          </>
        ) : knockNineCount > 0 ? (
          phone ? 'Bater: escolha' : 'Bater (escolha o descarte)'
        ) : (
          'Bater'
        )}
        {!phone && <kbd>B</kbd>}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// O histórico
// ---------------------------------------------------------------------------

function Historico({ table, view }: { table: CartasTableView; view: CachetaView }) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = ref.current?.parentElement
    el?.scrollTo({ top: el.scrollHeight })
    // Pelo último `seq`, não pelo tamanho: o log tem teto e para de crescer.
  }, [view.log[view.log.length - 1]?.seq])
  const name = (seat: number | undefined): string => (seat === table.mySeat ? 'Você' : firstName(table, seat))
  if (view.log.length === 0) return <LogLine tone="fraco">A rodada ainda não começou.</LogLine>
  return (
    <div ref={ref} className="py-1">
      {view.log.map((e) => (
        <LogLine key={e.seq} tone={e.kind === 'knock' || e.kind === 'deal' || e.kind === 'eliminated' ? 'forte' : undefined}>
          {renderEvent(e, name)}
        </LogLine>
      ))}
    </div>
  )
}

function Carta({ code }: { code: string }) {
  return <PlayingCard code={code} size="xs" className="mx-0.5 inline-block align-middle" />
}

function renderEvent(e: CachetaEvent, name: (seat: number | undefined) => string): React.ReactNode {
  switch (e.kind) {
    case 'deal':
      return `Rodada ${e.round ?? ''} — ${name(e.seat)} deu as cartas`
    case 'draw':
      return e.from === 'discard' && e.card ? (
        <>
          {name(e.seat)} pegou <Carta code={e.card} /> do lixo
        </>
      ) : (
        `${name(e.seat)} comprou do monte`
      )
    case 'discard':
      return e.card ? (
        <>
          {name(e.seat)} descartou <Carta code={e.card} />
        </>
      ) : (
        `${name(e.seat)} descartou`
      )
    case 'knock':
      return (
        <span className="text-burn">
          {name(e.seat)} BATEU{e.with10 ? ' com 10 — todo mundo perde 2' : ' — todo mundo perde 1'}
          {e.card ? (
            <>
              {' '}
              (descartou <Carta code={e.card} />)
            </>
          ) : null}
        </span>
      )
    case 'reshuffle':
      return 'O monte acabou: o lixo foi embaralhado'
    case 'eliminated':
      return <span className="text-destructive">{name(e.seat)} foi eliminado</span>
    case 'round': {
      const lost = e.lost ? Object.values(e.lost).some((v) => v > 0) : false
      return lost ? `Fim da rodada ${e.round ?? ''}` : `Rodada ${e.round ?? ''} empatada: ninguém perde`
    }
    default:
      return null
  }
}
