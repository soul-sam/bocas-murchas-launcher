import * as React from 'react'
import { EyeOff, Flame, Hand, Loader2, ShieldCheck, Undo2 } from 'lucide-react'
import {
  TRUCO_CALL_LABEL,
  isTruco,
  trucoShout,
  type CartasSeatView,
  type CartasTableView,
  type Team,
  type TrucoCall,
  type TrucoEvent,
  type TrucoRound,
  type TrucoSignalEvent,
  type TrucoView
} from '@/lib/api-cartas'
import { useCartas } from '@/lib/cartas-context'
import { useLayout } from '@/lib/layout-context'
import { useSettings } from '@/lib/settings-context'
import { playUiSound, type UiSound } from '@/lib/ui-sounds'
import { cn } from '@/lib/utils'
import { CARD_WIDTH, CardRow, FlipCard, PlayingCard, cardHeight, type CardSize } from '@/components/poker/PlayingCard'
import { CartasMesa, LogLine, TEAM_TONE, firstName, type MesaCtx } from './CartasMesa'
import { SeatSignals, SignalButton, SignalChainInline, signalChains } from './truco-sinais'
import './truco.css'

/**
 * A MESA DO TRUCO — em cima da casca das cartas (CartasMesa), no desenho do
 * pôquer. O que é do truco:
 *
 *  - O MEIO: o maço com a vira do lado (paulista) num canto do feltro, o
 *    selo do valor da mão e as três bolinhas das vazas no outro; as cartas
 *    da vaza caem na frente de quem jogou, batidas no feltro (voam do
 *    assento e assentam com um quique). Fechou a vaza: a vencedora acende,
 *    espera um instante e o montinho escorrega pro lado de quem levou.
 *  - O GRITO: "TRUCO!" estoura no meio da mesa, com o som de quem bate na
 *    mesa. Os efeitos saem do histórico (por `seq`), então cada grito toca
 *    uma vez só, mesmo com várias vistas chegando.
 *  - AS MINHAS TRÊS: grandes, em leque, saindo do maço e virando ao pousar
 *    (uma carta por pessoa, como se dá de verdade). Na vez, clicar joga;
 *    clique direito (ou o botão "coberta") joga virada pra baixo.
 *  - O PLACAR de tentos no canto, com as cores das duplas.
 *  - CORRER É DA DUPLA (2x2): o "correr" de um é voto; o parceiro corre
 *    junto ou vai sozinho (aceita/sobe/joga). A faixa em cima dos botões diz
 *    quem quer o quê.
 *  - OS SINAIS (truco-sinais.tsx): botão no rodapé (ou S), a fila de gestos
 *    aparece do lado do avatar de quem fez, pra mesa inteira, e entra no
 *    histórico.
 *
 * Tudo que é regra vem do servidor (a vista já traz `legal`, quem é a vez,
 * quanto vale): a tela só mostra e manda a jogada.
 */

// ---------------------------------------------------------------------------
// Ritmo
// ---------------------------------------------------------------------------

const SHUFFLE_MS = 1_000
const DEAL_STEP_MS = 110
const CARD_FLY_MS = 560
const CARD_FLIP_MS = 520
/** A vaza fechada fica na mesa com a vencedora acesa... */
const ROUND_HOLD_MS = 1_500
/** ...e depois escorrega pro lado de quem levou. */
const ROUND_COLLECT_MS = 450

/** Toca um som da mesa no volume dos avisos (como no pôquer). */
function useTableSound(): (name: UiSound) => void {
  const { settings } = useSettings()
  const ref = React.useRef(settings)
  ref.current = settings
  return React.useCallback((name: UiSound) => {
    const s = ref.current
    playUiSound(name, s.soundEnabled ? s.soundVolume : 0)
  }, [])
}

/** A ordem em que as cartas são dadas: a partir de quem está depois do dealer. */
function dealOrder(view: TrucoView): number[] {
  const seats = [...view.teams[0], ...view.teams[1]].sort((a, b) => a - b)
  const at = seats.indexOf(view.dealer)
  return seats.map((_, k) => seats[(at + 1 + k) % seats.length])
}

interface DealState {
  key: string | null
  /** A mão começou com a tela aberta: embaralha e dá com animação. */
  fresh: boolean
  at: number
}

/**
 * A mão nova, decidida no RENDER (por ref): a carta tem que nascer com o
 * atraso certo — um efeito depois do render remontaria a carta no meio do
 * voo. Quem abre a mesa no meio da mão vê as cartas paradas.
 */
function useDeal(table: CartasTableView, view: TrucoView | null): DealState {
  const key = view ? `${table.matchId}:${view.handNumber}` : null
  const ref = React.useRef<DealState>({ key, fresh: false, at: 0 })
  const r = ref.current
  if (r.key !== key) {
    r.key = key
    r.fresh = !!view && !view.result && view.rounds.length === 1 && view.rounds[0].plays.length === 0
    r.at = Date.now()
  }
  return r
}

// ---------------------------------------------------------------------------
// A tela
// ---------------------------------------------------------------------------

export function TrucoTable({ onOpenRules }: { onOpenRules: () => void }) {
  const { table } = useCartas()
  if (!table || table.game !== 'truco') return null
  return <TrucoScreen table={table} onOpenRules={onOpenRules} />
}

function TrucoScreen({ table, onOpenRules }: { table: CartasTableView; onOpenRules: () => void }) {
  const { act, signals } = useCartas()
  const view = isTruco(table.match) ? table.match : null
  const sound = useTableSound()
  const { isPhone } = useLayout()
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [covered, setCovered] = React.useState(false)
  const [signalsOpen, setSignalsOpen] = React.useState(false)
  const [shout, setShout] = React.useState<{ key: number; text: string; cold: boolean } | null>(null)
  const deal = useDeal(table, view)

  const mySeat = table.mySeat
  const legal = table.playing ? view?.legal ?? null : null
  const canSignal = !!view && mySeat !== null && table.playing && !!table.seats[mySeat]?.inMatch
  const players = view ? view.teams[0].length + view.teams[1].length : table.maxSeats
  const lockUntil = deal.fresh ? deal.at + SHUFFLE_MS + (players * 3 - 1) * DEAL_STEP_MS + CARD_FLY_MS + CARD_FLIP_MS : 0
  const [, rerender] = React.useReducer((x: number) => x + 1, 0)
  const locked = Date.now() < lockUntil
  React.useEffect(() => {
    const ms = lockUntil - Date.now()
    if (ms <= 0) return
    const t = setTimeout(rerender, ms + 30)
    return () => clearTimeout(t)
  }, [lockUntil])

  // Coberta vale pra ESTA jogada: mudou a vaza ou a vez, desarma.
  React.useEffect(() => {
    setCovered(false)
  }, [view?.handNumber, view?.round, view?.turn])

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

  // --- efeitos do histórico (uma vez por evento) ---------------------------
  const seenRef = React.useRef<{ match: string | null; seq: number } | null>(null)
  React.useEffect(() => {
    if (!view) return
    const log = view.log
    const maxSeq = log.reduce((m, e) => Math.max(m, e.seq), 0)
    const seen = seenRef.current
    if (!seen) {
      // Primeira vista: o que já aconteceu não toca.
      seenRef.current = { match: table.matchId, seq: maxSeq }
      return
    }
    // Partida nova com a tela aberta: tudo dela é novo.
    const from = seen.match !== table.matchId ? 0 : seen.seq
    seenRef.current = { match: table.matchId, seq: Math.max(from, maxSeq) }
    const fresh = log.filter((e) => e.seq > from)
    for (const e of fresh) {
      switch (e.kind) {
        case 'play':
          sound('cartas-mesa')
          break
        case 'truco':
        case 'raise':
          if (e.name) {
            setShout({ key: e.seq, text: trucoShout(e.name), cold: false })
            sound('cartas-truco')
          }
          break
        case 'accept':
          setShout({ key: e.seq, text: e.alone ? 'VAI SOZINHO!' : 'DESCE!', cold: true })
          sound('poker-chip')
          break
        case 'wantrun':
          // O parceiro de quem votou: agora é com ele.
          if (mySeat !== null && e.seat !== undefined && e.seat !== mySeat && e.team === view.myTeam) sound('poker-turn')
          break
        case 'run':
          setShout({ key: e.seq, text: 'CORREU!', cold: true })
          sound('poker-deal')
          break
        case 'decide':
          if (e.play) {
            setShout({ key: e.seq, text: e.alone ? 'VAI SOZINHO!' : 'VAMO!', cold: false })
            sound('poker-chip')
          }
          break
        case 'hand':
          if (view.myTeam !== null && e.team === view.myTeam && (e.points ?? 0) > 0) sound('poker-win')
          break
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.log, table.matchId])

  React.useEffect(() => {
    if (!shout) return
    const t = setTimeout(() => setShout(null), 1_700)
    return () => clearTimeout(t)
  }, [shout])

  // Sons do crupiê na mão nova: embaralhar, uma carta por vez, as minhas virando.
  React.useEffect(() => {
    if (!deal.fresh || !view) return
    const timers: Array<ReturnType<typeof setTimeout>> = []
    sound('poker-shuffle')
    for (let k = 0; k < players * 3; k++) timers.push(setTimeout(() => sound('poker-card'), SHUFFLE_MS + k * DEAL_STEP_MS + 30))
    if (mySeat !== null && view.special !== 'ferro') {
      timers.push(setTimeout(() => sound('poker-flip'), SHUFFLE_MS + players * 3 * DEAL_STEP_MS + CARD_FLY_MS))
    }
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.key])

  // A minha vez com a tela aberta: o toque é daqui (o contexto só toca com ela fechada).
  const myTurn = mySeat !== null && table.playing && table.toAct.includes(mySeat)
  const wasMyTurn = React.useRef(myTurn)
  React.useEffect(() => {
    if (myTurn && !wasMyTurn.current && !document.hidden) sound('poker-turn')
    wasMyTurn.current = myTurn
  }, [myTurn, sound])

  // --- jogar ----------------------------------------------------------------
  const canPlay = !!legal?.play && !busy && !locked
  const playCard = React.useCallback(
    (index: number, cover: boolean) => {
      if (!view || mySeat === null || !canPlay) return
      if (view.special === 'ferro' || legal?.blind) {
        void send({ type: 'play', index })
        return
      }
      const code = view.hands[mySeat]?.cards?.[index]
      if (!code) return
      void send(cover && legal?.cover ? { type: 'play', card: code, covered: true } : { type: 'play', card: code })
    },
    [view, mySeat, canPlay, legal, send]
  )

  // Atalhos: 1/2/3 joga, T grita, A aceita (ou topa a mão de onze), C corre, X arma a coberta.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const k = e.key.toLowerCase()
      if (k === 's' && canSignal) {
        setSignalsOpen((v) => !v)
        e.preventDefault()
        return
      }
      if (!legal) return
      if (k === '1' || k === '2' || k === '3') playCard(Number(k) - 1, covered)
      else if (k === 't' && (legal.truco || legal.raise)) void send({ type: legal.raise ? 'raise' : 'truco' })
      else if (k === 'a' && legal.accept) void send({ type: 'accept' })
      else if (k === 'a' && legal.decide) void send({ type: 'decide', play: true })
      else if (k === 'c' && legal.run) void send({ type: 'run' })
      else if (k === 'c' && legal.decide && !legal.voted) void send({ type: 'decide', play: false })
      else if (k === 'x' && legal.cover) setCovered((v) => !v)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [legal, playCard, covered, send, canSignal])

  const teamLabel = React.useCallback(
    (team: Team | null | undefined): string => {
      if (team === null || team === undefined) return 'Ninguém'
      // No 1x1 não tem "nós": é você e o outro, pelo nome.
      if (view && view.teams[team].length === 1) {
        return team === view.myTeam ? 'Você' : firstName(table, view.teams[team][0])
      }
      if (view?.myTeam !== null && view?.myTeam !== undefined) return team === view.myTeam ? 'Nós' : 'Eles'
      const seats = view?.teams[team] ?? []
      return seats.map((s) => firstName(table, s)).join(' e ') || (team === 0 ? 'Dupla A' : 'Dupla B')
    },
    [view, table]
  )

  // A última fala de cada um nesta mão (pra faixa na placa).
  const tags = React.useMemo(() => (view ? lastTags(view) : new Map<number, Tag>()), [view])

  const showMatch = !!view && (table.playing || !table.outcome)

  return (
    <CartasMesa
      table={table}
      error={error}
      onError={setError}
      onOpenRules={onOpenRules}
      dealerSeat={showMatch ? view?.dealer ?? null : null}
      deckAt={(ctx) => deckPos(ctx)}
      center={(ctx) =>
        view && showMatch ? (
          <TrucoCenter ctx={ctx} view={view} deal={deal} shout={shout} teamLabel={teamLabel} players={players} />
        ) : null
      }
      overlay={(ctx) => (view ? <Placar view={view} teamLabel={teamLabel} phone={ctx.layout.phone} /> : null)}
      seatCards={(seat, ctx) => (view && showMatch ? <SeatCards seat={seat} view={view} ctx={ctx} deal={deal} /> : null)}
      seatInfo={(seat) => (view && showMatch ? <SeatTag seat={seat} view={view} tag={tags.get(seat.index) ?? null} /> : null)}
      seatAside={(seat, side, ctx) => (view ? <SeatSignals seat={seat} variant={view.variant} side={side} compact={ctx.layout.phone} mine={seat === mySeat} /> : null)}
      dockExtra={
        canSignal && view ? (
          <SignalButton
            tableId={table.id}
            mySeat={mySeat!}
            variant={view.variant}
            open={signalsOpen}
            onOpenChange={setSignalsOpen}
            compact={isPhone}
            onError={setError}
          />
        ) : null
      }
      heroCards={(ctx) =>
        view && showMatch && mySeat !== null ? (
          <HeroHand
            ctx={ctx}
            view={view}
            seat={mySeat}
            deal={deal}
            canPlay={canPlay}
            covered={covered}
            onPlay={playCard}
          />
        ) : null
      }
      status={view && table.playing ? <StatusLine table={table} view={view} teamLabel={teamLabel} /> : null}
      actions={
        view ? (
          <ActionBar
            table={table}
            view={view}
            legal={legal}
            busy={busy}
            locked={locked}
            covered={covered}
            onCover={() => setCovered((v) => !v)}
            send={(a) => void send(a)}
          />
        ) : null
      }
      log={view ? <TrucoLog table={table} view={view} teamLabel={teamLabel} signals={signals} /> : null}
    />
  )
}

// ---------------------------------------------------------------------------
// Geometria do meio
// ---------------------------------------------------------------------------

function centerOf(ctx: MesaCtx): [number, number] {
  const seat = ctx.rotated[0]?.index ?? 0
  return ctx.toward(seat, 1)
}

/** O maço mora num canto de cima do feltro (à esquerda); o selo do valor, no outro. */
function deckPos(ctx: MesaCtx): [number, number] {
  const [, cy] = centerOf(ctx)
  return ctx.layout.phone ? [24, Math.max(22, cy - 18)] : [27, Math.max(24, cy - 18)]
}

function infoPos(ctx: MesaCtx): [number, number] {
  const [x, y] = deckPos(ctx)
  return [100 - x, y]
}

const ONE_DOWN: Record<CardSize, CardSize> = { xs: 'xs', sm: 'xs', ms: 'sm', md: 'ms', ml: 'md', lg: 'ml', xl: 'lg' }

/** Onde a carta de um lugar cai na vaza, em %. A minha não pode encostar nas minhas cartas. */
function playPos(ctx: MesaCtx, seat: number, card: CardSize): [number, number] {
  const { layout, table } = ctx
  const t = layout.phone ? 0.5 : 0.55
  const p = ctx.toward(seat, t)
  if (seat === table.mySeat && layout.h > 0) {
    const [, cy] = centerOf(ctx)
    const ch = (cardHeight(card) / layout.h) * 100
    const limit = (layout.heroTop / layout.h) * 100 - ch / 2 - 2
    return [p[0], Math.max(cy + ch / 2 + 1, Math.min(p[1], limit))]
  }
  return p
}

// ---------------------------------------------------------------------------
// O meio da mesa
// ---------------------------------------------------------------------------

function TrucoCenter({
  ctx,
  view,
  deal,
  shout,
  teamLabel,
  players
}: {
  ctx: MesaCtx
  view: TrucoView
  deal: DealState
  shout: { key: number; text: string; cold: boolean } | null
  teamLabel: (t: Team | null | undefined) => string
  players: number
}) {
  const { layout } = ctx
  const card = layout.centerCard
  const deckCard = ONE_DOWN[card]
  const [dx, dy] = deckPos(ctx)
  const [ix, iy] = infoPos(ctx)
  const [, cy] = centerOf(ctx)

  return (
    <>
      {/* O maço e a vira */}
      <div className="truco-maco absolute z-[4] flex -translate-x-1/2 -translate-y-1/2 items-end gap-2" style={{ left: `${dx}%`, top: `${dy}%` }}>
        <Deck size={deckCard} shuffleKey={deal.fresh ? deal.key : null} />
        {view.vira && (
          <div className="flex flex-col items-center gap-1">
            {deal.fresh ? (
              <FlipCard key={`vira-${deal.key}`} code={view.vira} size={deckCard} flipDelayMs={SHUFFLE_MS + players * 3 * DEAL_STEP_MS + 200} className="truco-vira" />
            ) : (
              <PlayingCard code={view.vira} size={deckCard} className="truco-vira" />
            )}
            <span className="truco-selo-mini">vira</span>
          </div>
        )}
      </div>

      {/* O valor, as vazas e a manilha */}
      <div className="absolute z-[4] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5" style={{ left: `${ix}%`, top: `${iy}%` }}>
        <ValueBadge view={view} />
        <VazaDots view={view} teamLabel={teamLabel} />
        <ManilhaHint view={view} />
      </div>

      {/* A vaza */}
      <Vaza ctx={ctx} view={view} card={card} />

      {/* Mão de onze, mão de ferro: o aviso no meio */}
      {(view.special !== 'normal' || view.phase === 'decide') && !view.result && (
        <SpecialNotice view={view} teamLabel={teamLabel} top={cy} />
      )}

      {/* Resultado da mão */}
      {view.result && view.phase === 'done' && <HandResult view={view} teamLabel={teamLabel} top={cy} />}

      {shout && (
        <span key={shout.key} className={cn('cartas-grito', shout.cold && 'cartas-grito--frio')} aria-live="assertive">
          {shout.text}
        </span>
      )}
    </>
  )
}

/** O maço: três cartas de costas; na mão nova, embaralha (o mesmo número do pôquer). */
function Deck({ size, shuffleKey }: { size: CardSize; shuffleKey: string | null }) {
  const w = CARD_WIDTH[size]
  const h = cardHeight(size)
  return (
    <div key={shuffleKey ?? 'maco'} className={cn('relative', shuffleKey && 'truco-maco--embaralha')} style={{ width: w, height: h }} aria-hidden>
      <PlayingCard faceDown size={size} className="absolute left-0 top-0" style={{ transform: 'translate(-2px, 3px) rotate(-4deg)', opacity: 0.85 }} />
      <PlayingCard faceDown size={size} className="absolute left-0 top-0" style={{ transform: 'translate(-1px, 1.5px) rotate(-1.5deg)', opacity: 0.92 }} />
      <PlayingCard faceDown size={size} className={cn('absolute left-0 top-0', shuffleKey && 'truco-maco-topo')} />
    </div>
  )
}

function ValueBadge({ view }: { view: TrucoView }) {
  const pending = view.pending
  return (
    <div key={`${view.handNumber}-${view.value}`} className={cn('truco-valor', view.value > (view.variant === 'mineiro' ? 2 : 1) && 'truco-valor--sobe')}>
      <span className="text-[11px] font-medium text-foreground/70">vale</span>
      <span className="font-mono text-lg font-bold leading-none">{view.value}</span>
      {pending && (
        <span className="truco-valor-pedido">
          <Flame className="h-3 w-3" aria-hidden />
          {TRUCO_CALL_LABEL[pending.name].toLowerCase()} {pending.value}?
        </span>
      )}
    </div>
  )
}

function VazaDots({ view, teamLabel }: { view: TrucoView; teamLabel: (t: Team | null | undefined) => string }) {
  const mine: Team = view.myTeam ?? 0
  return (
    <div className="flex items-center gap-1.5" aria-label="Vazas da mão">
      {[0, 1, 2].map((i) => {
        const r = view.rounds[i]
        const done = !!r?.done
        const t = r?.winnerTeam ?? null
        const label = !done ? `${i + 1}ª vaza` : t === null ? `${i + 1}ª cangou` : `${i + 1}ª: ${teamLabel(t)}`
        return (
          <span
            key={i}
            title={label}
            className={cn(
              'truco-vaza-ponto',
              done && t !== null && TEAM_TONE[t],
              done && t !== null && 'truco-vaza-ponto--ganha',
              done && t === null && 'truco-vaza-ponto--cangou',
              done && t !== null && t !== mine && 'truco-vaza-ponto--deles',
              !done && i === view.round && view.phase !== 'done' && 'truco-vaza-ponto--agora'
            )}
          />
        )
      })}
    </div>
  )
}

function ManilhaHint({ view }: { view: TrucoView }) {
  if (view.variant === 'paulista') {
    const rank = view.manilhas[0]?.[0]
    if (!rank) return null
    return (
      <span className="truco-selo-mini" title="A carta logo acima da vira, nos quatro naipes">
        manilha <span className="font-mono font-bold text-foreground">{rank}</span>
      </span>
    )
  }
  return (
    <div className="flex items-end gap-0.5 opacity-80" title="Manilhas fixas do mineiro: zap, copas, espadilha, pica-fumo">
      {view.manilhas.map((c) => (
        <PlayingCard key={c} code={c} size="xs" />
      ))}
    </div>
  )
}

/**
 * As cartas na mesa: a vaza corrente; ou, logo depois de fechar, a que
 * fechou (vencedora acesa) e então o montinho escorregando pra quem levou.
 */
function Vaza({ ctx, view, card }: { ctx: MesaCtx; view: TrucoView; card: CardSize }) {
  const closedAt = React.useRef(new Map<string, number>())
  const mounted = React.useRef(false)
  const handKey = `${ctx.table.matchId}:${view.handNumber}`
  const now = Date.now()
  view.rounds.forEach((r, i) => {
    const key = `${handKey}:${i}`
    // Vaza que já estava fechada quando a tela abriu: conta como velha.
    if (r.done && !closedAt.current.has(key)) closedAt.current.set(key, mounted.current ? now : 0)
  })
  mounted.current = true

  const [, rerender] = React.useReducer((x: number) => x + 1, 0)
  const cur = view.rounds[view.rounds.length - 1]
  const prevIdx = view.rounds.length - 2
  const prev = prevIdx >= 0 ? view.rounds[prevIdx] : null

  let shown: { round: TrucoRound; index: number; mode: 'live' | 'hold' | 'collect' } | null = null
  if (cur && (cur.plays.length > 0 || cur.done)) {
    shown = { round: cur, index: view.rounds.length - 1, mode: cur.done ? 'hold' : 'live' }
  } else if (prev?.done) {
    const at = closedAt.current.get(`${handKey}:${prevIdx}`) ?? 0
    const age = now - at
    if (age < ROUND_HOLD_MS) shown = { round: prev, index: prevIdx, mode: 'hold' }
    else if (age < ROUND_HOLD_MS + ROUND_COLLECT_MS) shown = { round: prev, index: prevIdx, mode: 'collect' }
  }

  // Acorda a tela pra trocar de fase (segurar → recolher → sumir).
  const wake = shown && shown.mode !== 'live' && shown.round !== cur ? (closedAt.current.get(`${handKey}:${shown.index}`) ?? 0) : 0
  React.useEffect(() => {
    if (!wake) return
    const left = [ROUND_HOLD_MS, ROUND_HOLD_MS + ROUND_COLLECT_MS].map((ms) => wake + ms - Date.now()).filter((ms) => ms > 0)
    if (left.length === 0) return
    const t = setTimeout(rerender, Math.min(...left) + 20)
    return () => clearTimeout(t)
  }, [wake, shown?.mode])

  if (!shown) return null
  const { round, index, mode } = shown
  const winnerSeat = round.done ? round.winnerSeat : null
  const winnerPos = winnerSeat !== null ? ctx.posOf(winnerSeat) : centerOf(ctx)

  return (
    <>
      {round.plays.map((p, k) => {
        const at = playPos(ctx, p.seat, card)
        const from = ctx.posOf(p.seat)
        const tilt = ((p.seat * 37 + index * 11) % 13) - 6
        const style = {
          left: `${at[0]}%`,
          top: `${at[1]}%`,
          zIndex: 6 + k,
          ['--seat-x' as string]: at[0],
          ['--seat-y' as string]: at[1],
          ['--de-x' as string]: from[0],
          ['--de-y' as string]: from[1],
          ['--alvo-x' as string]: winnerPos[0],
          ['--alvo-y' as string]: winnerPos[1],
          ['--giro' as string]: `${tilt}deg`
        } as React.CSSProperties
        const win = round.done && winnerSeat === p.seat
        const lose = round.done && !win && round.winnerTeam !== null
        return (
          <div
            key={`${handKey}:${index}:${p.seat}`}
            className={cn('truco-jogada', mode === 'collect' && 'truco-jogada--recolhe', win && mode === 'hold' && 'truco-jogada--vence')}
            style={style}
          >
            {p.card ? (
              <PlayingCard code={p.card} size={card} highlight={win} dim={lose && mode === 'hold'} />
            ) : (
              <PlayingCard faceDown size={card} dim={round.done} />
            )}
          </div>
        )
      })}
      {round.done && round.winnerTeam === null && mode === 'hold' && (
        <span className="truco-cangou absolute z-[12] -translate-x-1/2 -translate-y-1/2" style={{ left: '50%', top: `${centerOf(ctx)[1]}%` }}>
          cangou
        </span>
      )}
    </>
  )
}

function SpecialNotice({ view, teamLabel, top }: { view: TrucoView; teamLabel: (t: Team | null | undefined) => string; top: number }) {
  const name = view.variant === 'mineiro' ? 'mão de dez' : 'mão de onze'
  const play = view.variant === 'mineiro' ? 4 : 3
  const run = view.variant === 'mineiro' ? 2 : 1
  let text: React.ReactNode
  if (view.special === 'ferro') {
    text = (
      <>
        <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          <span className="font-semibold text-foreground">Mão de ferro</span> — todo mundo no escuro. Quem levar, fecha.
        </span>
      </>
    )
  } else if (view.phase === 'decide') {
    const ours = view.myTeam !== null && view.specialTeam === view.myTeam
    text = ours ? (
      <>
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          <span className="font-semibold text-foreground">{name[0].toUpperCase() + name.slice(1)}</span>: vocês veem as cartas
          {view.teams[view.myTeam!].length > 1 ? ' do parceiro' : ''}. Jogar vale {play}; correr dá {run} pra eles.
        </span>
      </>
    ) : (
      <>
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
        <span>
          {name[0].toUpperCase() + name.slice(1)}: {teamLabel(view.specialTeam)} {conj(teamLabel(view.specialTeam), 'está', 'estão', 'estamos')} decidindo se vale jogar.
        </span>
      </>
    )
  } else {
    text = (
      <>
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          {name[0].toUpperCase() + name.slice(1)} valendo {view.value} — sem truco.
        </span>
      </>
    )
  }
  // Durante a decisão fica no meio; jogando, sobe pro alto pra não cobrir a vaza.
  const y = view.phase === 'decide' || view.special === 'ferro' ? top : top - 14
  const playing = view.phase === 'play' && view.rounds.some((r) => r.plays.length > 0)
  if (playing && view.special !== 'ferro') return null
  return (
    <div
      className={cn('truco-aviso absolute left-1/2 z-[11] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2', playing && 'opacity-80')}
      style={{ top: `${y}%` }}
    >
      {text}
    </div>
  )
}

function HandResult({ view, teamLabel, top }: { view: TrucoView; teamLabel: (t: Team | null | undefined) => string; top: number }) {
  const r = view.result!
  const team = r.winnerTeam
  const why =
    r.reason === 'correu'
      ? 'correram'
      : r.reason === 'recusou'
        ? `correram da mão de ${view.variant === 'mineiro' ? 'dez' : 'onze'}`
        : r.reason === 'abandono'
          ? 'abandono'
          : r.reason === 'empate'
            ? 'empatou tudo'
            : null
  return (
    <div
      key={`${view.handNumber}`}
      className={cn('truco-resultado absolute left-1/2 z-[13] -translate-x-1/2 -translate-y-1/2', team !== null && TEAM_TONE[team])}
      style={{ top: `${top}%` }}
    >
      {team === null || r.points === 0 ? (
        <span className="text-sm font-semibold text-foreground">{r.reason === 'abandono' ? 'Abandono' : 'Ninguém marca'}</span>
      ) : (
        <span className="text-base font-bold text-foreground">
          {teamLabel(team)} <span className="truco-resultado-pontos font-mono">+{r.points}</span>
        </span>
      )}
      {why && r.reason !== 'abandono' && <span className="text-[11.5px] text-muted-foreground">{why}</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Os assentos
// ---------------------------------------------------------------------------

function SeatCards({ seat, view, ctx, deal }: { seat: CartasSeatView; view: TrucoView; ctx: MesaCtx; deal: DealState }) {
  const hand = view.hands[seat.index]
  if (!hand || hand.count === 0) return null
  const open = hand.cards
  const order = dealOrder(view)
  const rank = Math.max(0, order.indexOf(seat.index))
  const n = order.length
  const size = ctx.layout.phone ? 'xs' : open ? ONE_UP[ctx.layout.seatCard] : ctx.layout.seatCard
  return (
    <div className={cn('absolute left-1/2 -translate-x-1/2 transition-all duration-300', open ? 'z-[2]' : 'z-0')} style={{ bottom: open ? '44%' : '42%' }}>
      <CardRow
        codes={open ?? Array.from({ length: hand.count }, () => '?')}
        size={size}
        faceDown={!open}
        fan
        enter={open ? 'flip' : deal.fresh ? 'fly' : 'none'}
        staggerMs={open ? 140 : n * DEAL_STEP_MS}
        baseDelayMs={open ? 0 : SHUFFLE_MS + rank * DEAL_STEP_MS}
      />
    </div>
  )
}

const ONE_UP: Record<CardSize, CardSize> = { xs: 'sm', sm: 'ms', ms: 'md', md: 'ml', ml: 'lg', lg: 'xl', xl: 'xl' }

interface Tag {
  text: string
  tone: 'raise' | 'check' | 'fold' | 'blind'
}

/** Os lugares da dupla de `seat` (ele mesmo, no 1x1). */
function teamOf(view: TrucoView, seat: number): number[] {
  return view.teams.find((t) => t.includes(seat)) ?? [seat]
}

/** A última fala de cada um na mão corrente (depois do último `deal`). */
function lastTags(view: TrucoView): Map<number, Tag> {
  const tags = new Map<number, Tag>()
  let start = 0
  view.log.forEach((e, i) => {
    if (e.kind === 'deal') start = i
  })
  for (const e of view.log.slice(start)) {
    if (e.seat === undefined) continue
    if (e.kind === 'truco' || e.kind === 'raise') tags.set(e.seat, { text: `pediu ${e.name ?? 'truco'}`, tone: 'raise' })
    else if (e.kind === 'accept') tags.set(e.seat, { text: e.alone ? 'foi sozinho' : 'aceitou', tone: 'check' })
    // A dupla correu junto: "quer correr" do parceiro vira "correu" também.
    else if (e.kind === 'run') for (const s of teamOf(view, e.seat)) tags.set(s, { text: 'correu', tone: 'fold' })
    else if (e.kind === 'wantrun') tags.set(e.seat, { text: 'quer correr', tone: 'fold' })
    else if (e.kind === 'decide' && e.play) tags.set(e.seat, { text: e.alone ? 'foi sozinho' : 'topou', tone: 'check' })
    else if (e.kind === 'decide') for (const s of teamOf(view, e.seat)) tags.set(s, { text: 'correu', tone: 'fold' })
  }
  return tags
}

function SeatTag({ seat, view, tag }: { seat: CartasSeatView; view: TrucoView; tag: Tag | null }) {
  if (tag) {
    return (
      <span key={tag.text} className={cn('poker-jogada', `poker-jogada--${tag.tone}`)}>
        {tag.text.toUpperCase()}
      </span>
    )
  }
  // "Mão": quem abre a primeira vaza.
  const starter = view.rounds[0]?.starter
  if (starter === seat.index && !view.result && view.rounds.length === 1 && view.rounds[0].plays.length === 0) {
    return <span className="poker-jogada poker-jogada--blind">mão</span>
  }
  return null
}

// ---------------------------------------------------------------------------
// As minhas cartas
// ---------------------------------------------------------------------------

function HeroHand({
  ctx,
  view,
  seat,
  deal,
  canPlay,
  covered,
  onPlay
}: {
  ctx: MesaCtx
  view: TrucoView
  seat: number
  deal: DealState
  canPlay: boolean
  covered: boolean
  onPlay: (index: number, cover: boolean) => void
}) {
  const hand = view.hands[seat]
  const cards = hand?.cards ?? null
  const count = hand?.count ?? 0
  // As que entraram voando nesta mão continuam FlipCard até ela acabar
  // (trocar de componente remontaria a carta, e ela voaria de novo).
  const animated = React.useRef<{ key: string | null; codes: Set<string> }>({ key: null, codes: new Set() })
  if (animated.current.key !== deal.key) {
    animated.current = { key: deal.key, codes: new Set(deal.fresh && cards ? cards : []) }
  }
  if (count === 0) return null

  const size = ctx.layout.heroCard
  const w = CARD_WIDTH[size]
  const stride = Math.round(w * 0.78)
  const order = dealOrder(view)
  const rank = Math.max(0, order.indexOf(seat))
  const n = order.length
  const blind = !cards
  const manilhas = new Set(view.manilhas)
  const lost = view.result && view.result.winnerTeam !== null && view.result.winnerTeam !== view.myTeam

  return (
    <div className={cn('truco-mao relative flex items-end justify-center', canPlay && 'truco-mao--vez')} style={{ paddingTop: 10 }}>
      {Array.from({ length: count }, (_, i) => {
        const code = cards?.[i] ?? null
        const dx = Math.round((i - (count - 1) / 2) * stride)
        const tilt = (i - (count - 1) / 2) * 6
        const delay = SHUFFLE_MS + (i * n + rank) * DEAL_STEP_MS
        const fresh = deal.fresh && (code ? animated.current.codes.has(code) : true)
        const manilha = !!code && manilhas.has(code)
        const label = blind ? `Jogar a carta ${i + 1} no escuro` : `Jogar ${code}${covered ? ' coberta' : ''}`
        return (
          <button
            key={code ?? `cega-${i}`}
            type="button"
            disabled={!canPlay}
            aria-label={label}
            title={canPlay ? `${i + 1}${!blind ? ' · clique direito: coberta' : ''}` : undefined}
            onClick={() => onPlay(i, covered)}
            onContextMenu={(e) => {
              e.preventDefault()
              if (canPlay && !blind) onPlay(i, true)
            }}
            className={cn('truco-mao-carta', manilha && 'truco-mao-carta--manilha', covered && canPlay && 'truco-mao-carta--coberta')}
            style={{ marginLeft: i > 0 ? -(w - stride) : 0, zIndex: i + 1 }}
          >
            {blind ? (
              <PlayingCard faceDown size={size} enter={fresh ? 'fly' : 'none'} delayMs={delay} dx={dx} tilt={tilt} />
            ) : fresh ? (
              <FlipCard code={code!} size={size} fly delayMs={delay} dx={dx} tilt={tilt} dim={!!lost} />
            ) : (
              <PlayingCard code={code!} size={size} dx={dx} tilt={tilt} dim={!!lost} />
            )}
            {canPlay && !ctx.layout.phone && <kbd className="truco-mao-tecla">{i + 1}</kbd>}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// O placar
// ---------------------------------------------------------------------------

function Placar({ view, teamLabel, phone }: { view: TrucoView; teamLabel: (t: Team | null | undefined) => string; phone: boolean }) {
  const left: Team = view.myTeam ?? 0
  const right: Team = left === 0 ? 1 : 0
  return (
    <div className={cn('truco-placar absolute left-2 top-2 z-[17]', phone && 'truco-placar--compacto')} aria-label="Placar">
      {[left, right].map((t) => {
        const pts = view.score[t]
        const hot = pts >= (view.variant === 'mineiro' ? 10 : 11)
        return (
          <div key={t} className={cn('truco-placar-linha', TEAM_TONE[t])}>
            <span className="truco-placar-nome truncate">{teamLabel(t)}</span>
            <span className={cn('truco-placar-pontos font-mono', hot && 'truco-placar-pontos--quente')} key={pts}>
              {pts}
            </span>
            <span className="truco-placar-trilha" aria-hidden>
              {Array.from({ length: 12 }, (_, k) => (
                <span key={k} className={cn('truco-tento', k < pts && 'truco-tento--feito')} />
              ))}
            </span>
          </div>
        )
      })}
      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">até 12 · mão {view.handNumber}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rodapé: estado e ações
// ---------------------------------------------------------------------------

function StatusLine({ table, view, teamLabel }: { table: CartasTableView; view: TrucoView; teamLabel: (t: Team | null | undefined) => string }) {
  const me = table.mySeat
  const mine = me !== null && table.toAct.includes(me)
  const votes = view.runVotes ?? []
  const iVoted = me !== null && votes.includes(me)
  const partnerVote = votes.find((s) => s !== me)
  let text: React.ReactNode
  if (view.phase === 'done') text = 'Fim da mão — a próxima já vem.'
  else if ((view.phase === 'truco' || view.phase === 'decide') && votes.length > 0) {
    // Quem decide tem a faixa em cima dos botões; aqui é só o estado.
    text = iVoted ? (
      'Você votou correr — esperando o parceiro'
    ) : mine && partnerVote !== undefined ? (
      <span className="font-semibold text-burn">Sua dupla decide</span>
    ) : (
      `${votes.map((s) => firstName(table, s)).join(' e ')} quer correr — falta o parceiro`
    )
  } else if (view.phase === 'decide') {
    text = mine ? (
      <span className="text-acid-text">Decida a mão de {view.variant === 'mineiro' ? 'dez' : 'onze'}</span>
    ) : (
      `${teamLabel(view.specialTeam)} decidindo a mão de ${view.variant === 'mineiro' ? 'dez' : 'onze'}`
    )
  } else if (view.phase === 'truco' && view.pending) {
    text = mine ? (
      <span className="font-semibold text-burn">Responda o {TRUCO_CALL_LABEL[view.pending.name].toLowerCase()}!</span>
    ) : (
      `Esperando resposta ao ${TRUCO_CALL_LABEL[view.pending.name].toLowerCase()}`
    )
  } else if (mine) text = <span className="text-acid-text">Sua vez — jogue uma carta</span>
  else if (view.turn !== null) text = `Vez de ${firstName(table, view.turn)}`
  return (
    <>
      <span>{text}</span>
      <span>
        valendo <span className="font-mono text-foreground">{view.value}</span>
      </span>
    </>
  )
}

function ActionBar({
  table,
  view,
  legal,
  busy,
  locked,
  covered,
  onCover,
  send
}: {
  table: CartasTableView
  view: TrucoView
  legal: TrucoView['legal']
  busy: boolean
  locked: boolean
  covered: boolean
  onCover: () => void
  send: (action: Record<string, unknown>) => void
}) {
  const { isPhone: phone } = useLayout()
  const off = busy || locked
  const btn = (extra: string) => cn('poker-botao', extra, phone && 'poker-botao--compacto')
  const key = (k: string) => (phone ? null : <kbd>{k}</kbd>)

  // 2x2: correr é da dupla. Quem votou espera; o parceiro corre junto ou vai sozinho.
  const me = table.mySeat
  const votes = view.runVotes ?? []
  const iVoted = !!legal?.voted
  const partnerVote = votes.find((s) => s !== me)
  const partnerWants = !iVoted && partnerVote !== undefined
  const voteLine =
    iVoted || partnerWants ? (
      <p className={cn('truco-voto', partnerWants && 'truco-voto--parceiro')} role="status">
        <Undo2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {iVoted
          ? 'Você votou correr. Falta o parceiro concordar — ou ele vai sozinho.'
          : `${firstName(table, partnerVote)} quer correr. Corre junto, ou vai sozinho?`}
      </p>
    ) : null
  const alone = partnerWants ? <span className="text-[11px] font-medium opacity-80">sozinho</span> : null

  // Decidindo a mão de onze/dez.
  if (legal?.decide) {
    const play = view.variant === 'mineiro' ? 4 : 3
    const run = view.variant === 'mineiro' ? 2 : 1
    return (
      <div className="flex flex-col gap-1.5">
        {voteLine}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={btn('poker-botao--fold')}
            disabled={off || iVoted}
            aria-pressed={iVoted}
            onClick={() => send({ type: 'decide', play: false })}
          >
            {iVoted ? 'Votou correr' : partnerWants ? 'Correr junto' : 'Correr'}{' '}
            <span className="text-[11px] font-medium opacity-80">(dá {run})</span>
            {!iVoted && key('C')}
          </button>
          <button type="button" className={btn('poker-botao--raise')} disabled={off} onClick={() => send({ type: 'decide', play: true })}>
            Jogar valendo {play}
            {alone}
            {key('A')}
          </button>
        </div>
      </div>
    )
  }

  // Respondendo um grito: subir é o degrau DEPOIS do que foi pedido.
  if (legal?.accept || legal?.run) {
    const pending = view.pending
    const up = pending ? NEXT_CALL[pending.name] : view.nextName
    return (
      <div className="flex flex-col gap-1.5">
        {voteLine}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            className={btn('poker-botao--fold')}
            disabled={off || !legal.run}
            aria-pressed={iVoted}
            onClick={() => send({ type: 'run' })}
          >
            <Undo2 className="h-4 w-4" aria-hidden />
            {iVoted ? 'Votou correr' : partnerWants ? 'Correr junto' : 'Correr'}
            {!iVoted && key('C')}
          </button>
          <button type="button" className={btn('poker-botao--check')} disabled={off || !legal.accept} onClick={() => send({ type: 'accept' })}>
            <Hand className="h-4 w-4" aria-hidden />
            Aceitar{pending ? ` ${pending.value}` : ''}
            {alone}
            {key('A')}
          </button>
          <button type="button" className={btn('poker-botao--allin')} disabled={off || !legal.raise || !up} onClick={() => send({ type: 'raise' })}>
            <Flame className="h-4 w-4" aria-hidden />
            {up ? `${TRUCO_CALL_LABEL[up]}!` : 'Subir'}
            {alone}
            {key('T')}
          </button>
        </div>
      </div>
    )
  }

  // Jogando (ou esperando a vez): coberta, a dica e o grito.
  const myTurn = !!legal?.play
  const call = view.nextName
  return (
    <div className="grid grid-cols-3 gap-2">
      <button
        type="button"
        className={btn(cn('poker-botao--check', covered && 'truco-botao--armado'))}
        disabled={off || !legal?.cover}
        aria-pressed={covered}
        onClick={onCover}
        title="A próxima carta vai virada pra baixo (não ganha de nada)"
      >
        <EyeOff className="h-4 w-4" aria-hidden />
        {covered ? 'Coberta!' : 'Coberta'}
        {key('X')}
      </button>
      <div className="flex min-w-0 items-center justify-center text-center text-[12px] leading-tight text-muted-foreground">
        {myTurn ? (
          <span className="text-foreground">{legal?.blind ? 'Escolha uma no escuro' : covered ? 'Clique na carta pra cobrir' : 'Clique numa carta'}</span>
        ) : view.phase === 'truco' ? (
          'Esperando a resposta…'
        ) : (
          'Aguarde a sua vez'
        )}
      </div>
      <button
        type="button"
        className={btn('poker-botao--allin truco-botao-grito')}
        disabled={off || !legal?.truco || !call}
        onClick={() => send({ type: 'truco' })}
      >
        <Flame className="h-4 w-4" aria-hidden />
        {call ? `${TRUCO_CALL_LABEL[call]}!` : 'Truco!'}
        {key('T')}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

const ORDINAL = ['1ª', '2ª', '3ª']

/** O degrau acima de cada pedido (doze é o teto). */
const NEXT_CALL: Record<TrucoCall, TrucoCall | null> = { truco: 'seis', seis: 'nove', nove: 'doze', doze: null }

/** Quantos tem a dupla de um lugar (1 no 1x1, 2 no 2x2). */
function teamSize(view: TrucoView, seat: number | undefined): number {
  if (seat === undefined) return 1
  return view.teams.find((t) => t.includes(seat))?.length ?? 1
}

/** O verbo concordando com quem: "Nós levamos", "Eles levaram", "Zé e Bia levaram", "Você levou". */
function conj(label: string, one: string, many: string, nos: string): string {
  if (label === 'Nós') return nos
  return label === 'Eles' || label.includes(' e ') ? many : one
}

function TrucoLog({
  table,
  view,
  teamLabel,
  signals
}: {
  table: CartasTableView
  view: TrucoView
  teamLabel: (t: Team | null | undefined) => string
  signals: readonly TrucoSignalEvent[]
}) {
  // Em ordem, do mais velho pro mais novo, rolando sozinho pro fim — como o
  // histórico da mão do pôquer. Os sinais entram no meio, pela hora (as duas
  // horas são do servidor), uma linha por frase.
  const events = view.log.slice(-40)
  const since = events[0]?.at ?? 0
  const chains = React.useMemo(() => signalChains(signals.filter((s) => s.at >= since)), [signals, since])
  const items: Array<{ at: number; node: React.ReactNode }> = events.map((e) => ({
    at: e.at,
    node: <TrucoLogLine key={`e${e.seq}`} e={e} table={table} view={view} teamLabel={teamLabel} />
  }))
  for (const chain of chains) {
    items.push({
      at: chain[0].at,
      node: (
        <LogLine key={`s${chain[0].id}`} tone="fraco">
          <span className="inline-flex flex-wrap items-center gap-x-1.5">
            {firstName(table, chain[0].seat)} fez sinal: <SignalChainInline chain={chain} variant={view.variant} />
          </span>
        </LogLine>
      )
    })
  }
  // sort é estável: na mesma hora, o lance vem antes do sinal.
  items.sort((a, b) => a.at - b.at)
  const ref = React.useRef<HTMLDivElement>(null)
  const last = `${events[events.length - 1]?.seq}:${signals.length}`
  React.useEffect(() => {
    const el = ref.current?.parentElement
    el?.scrollTo({ top: el.scrollHeight })
  }, [last])
  if (items.length === 0) return <LogLine tone="fraco">Nada ainda.</LogLine>
  return (
    <div ref={ref} className="py-1">
      {items.map((x) => x.node)}
    </div>
  )
}

function TrucoLogLine({
  e,
  table,
  view,
  teamLabel
}: {
  e: TrucoEvent
  table: CartasTableView
  view: TrucoView
  teamLabel: (t: Team | null | undefined) => string
}) {
  const who = firstName(table, e.seat)
  switch (e.kind) {
    case 'deal':
      return (
        <LogLine tone="fraco">
          <span className="inline-flex items-center gap-1.5">
            {who} deu as cartas{e.card ? ' · vira' : ''}
            {e.card && <PlayingCard code={e.card} size="xs" />}
          </span>
        </LogLine>
      )
    case 'play':
      return (
        <LogLine>
          <span className="inline-flex items-center gap-1.5">
            {who} jogou {e.card ? <PlayingCard code={e.card} size="xs" /> : 'coberta'}
          </span>
        </LogLine>
      )
    case 'truco':
      return <LogLine tone="forte">{who} pediu {e.name ?? 'truco'}!</LogLine>
    case 'raise':
      return (
        <LogLine tone="forte">
          {who} subiu{e.alone ? ' sozinho' : ''}: {e.name ?? 'mais'}!
        </LogLine>
      )
    case 'accept':
      return (
        <LogLine tone={e.alone ? 'forte' : undefined}>
          {who} aceitou{e.alone ? ' sozinho' : ''}
          {e.value ? ` — vale ${e.value}` : ''}
        </LogLine>
      )
    case 'run':
      return <LogLine>{who} correu{teamSize(view, e.seat) > 1 ? ' — a dupla correu junto' : ''}</LogLine>
    case 'wantrun':
      return <LogLine>{who} quer correr — falta o parceiro</LogLine>
    case 'decide':
      return (
        <LogLine tone={e.alone ? 'forte' : undefined}>
          {who} {e.play ? (e.alone ? 'topou sozinho a' : 'topou a') : 'correu da'} mão de {view.variant === 'mineiro' ? 'dez' : 'onze'}
        </LogLine>
      )
    case 'round': {
      const n = ORDINAL[e.round ?? 0] ?? `${(e.round ?? 0) + 1}ª`
      return (
        <LogLine>
          {e.team === null || e.team === undefined ? `${n} vaza cangou` : `${teamLabel(e.team)} ${conj(teamLabel(e.team), 'levou', 'levaram', 'levamos')} a ${n} vaza`}
        </LogLine>
      )
    }
    case 'hand':
      return (
        <LogLine tone="forte">
          {e.team === null || e.team === undefined || !e.points
            ? e.reason === 'abandono'
              ? 'Abandono — acabou a partida'
              : 'Ninguém marcou'
            : `${teamLabel(e.team)} ${conj(teamLabel(e.team), 'marcou', 'marcaram', 'marcamos')} ${e.points}${e.reason === 'correu' ? ' — correram' : e.reason === 'recusou' ? ' — correram da mão' : ''}`}
        </LogLine>
      )
    default:
      return null
  }
}
