import * as React from 'react'
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Coins,
  DoorOpen,
  Eye,
  Loader2,
  Minus,
  Pause,
  Play,
  Plus,
  Trash2,
  Users
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
import { useTicker } from '@/lib/use-now'
import { cn } from '@/lib/utils'
import { CardRow, PlayingCard } from './PlayingCard'
import { BetChip, DealerChip } from './PokerGlyphs'
import './poker.css'

/**
 * A MESA — o feltro com os assentos em volta, a mesa comunitária no meio e a
 * barra de ação embaixo.
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
 * Valores: `fmt()` escreve na moeda da mesa — 1.250 (murchos) ou R$ 12,50
 * (mesa valendo). Nenhum número bruto chega ao JSX sem passar por ele.
 */

/**
 * Onde cada assento fica em volta do feltro, em coordenadas normalizadas
 * (-1..1 em cada eixo; o meu lugar é sempre (0, 1), embaixo no centro). A
 * margem transforma isso em porcentagem da área da mesa deixando espaço pro
 * cartão do assento não sair do quadro — e é maior no celular, onde 7% de
 * 390px não cabe um nome.
 */
const TEMPLATE: Record<number, Array<[number, number]>> = {
  2: [
    [0, 1],
    [0, -1]
  ],
  3: [
    [0, 1],
    [-1, -0.45],
    [1, -0.45]
  ],
  4: [
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 0]
  ],
  5: [
    [0, 1],
    [-1, 0.5],
    [-0.62, -1],
    [0.62, -1],
    [1, 0.5]
  ],
  6: [
    [0, 1],
    [-1, 0.55],
    [-0.9, -0.6],
    [0, -1],
    [0.9, -0.6],
    [1, 0.55]
  ]
}

/**
 * No celular a área é alta e estreita e a mesa comunitária fica no meio: os
 * assentos laterais sobem pra não cair em cima das cartas.
 */
const TEMPLATE_PHONE: Record<number, Array<[number, number]>> = {
  2: [
    [0, 1],
    [0, -1]
  ],
  3: [
    [0, 1],
    [-1, -0.62],
    [1, -0.62]
  ],
  4: [
    [0, 1],
    [-1, -0.35],
    [0, -1],
    [1, -0.35]
  ],
  5: [
    [0, 1],
    [-1, 0.12],
    [-0.72, -1],
    [0.72, -1],
    [1, 0.12]
  ],
  6: [
    [0, 1],
    [-1, 0.2],
    [-0.85, -0.72],
    [0, -1],
    [0.85, -0.72],
    [1, 0.2]
  ]
}

function seatPositions(count: number, phone: boolean): Array<[number, number]> {
  const xm = phone ? 22 : 9
  const ym = phone ? 11 : 13
  const template = (phone ? TEMPLATE_PHONE : TEMPLATE)[count] ?? TEMPLATE[6]
  return template.map(([dx, dy]) => [50 + dx * (50 - xm), 50 + dy * (50 - ym)])
}

const CENTER: [number, number] = [50, 50]

export function PokerTable({ onOpenRules }: { onOpenRules: (category?: HandCategory | null) => void }) {
  const { table, leaveTable, act, sit, stand, topUp, sitOut, show, closeTable, seatedAt } = usePoker()
  const { user } = useAuth()
  const { isPhone } = useLayout()
  const [sitAt, setSitAt] = React.useState<number | null>(null)
  const [topUpOpen, setTopUpOpen] = React.useState(false)
  const [confirmStand, setConfirmStand] = React.useState(false)
  const [logOpen, setLogOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 4_500)
    return () => clearTimeout(t)
  }, [error])

  // Sentou (ou a mesa fechou): o diálogo de buy-in não tem mais razão de ser.
  React.useEffect(() => {
    if (table?.mySeat !== null) setSitAt(null)
  }, [table?.mySeat])

  if (!table) return null

  const fmt = (v: number): string => formatMoney(v, table.stake.currency)
  const me = table.mySeat !== null ? table.seats[table.mySeat] : null
  const myTurn = me !== null && table.toAct === table.mySeat && !!table.legal
  const inHand = !!me?.inHand && !me.folded
  const isOwner = table.createdById === user?.id || user?.role === 'admin'
  const canSitHere = table.mySeat === null && (!seatedAt || seatedAt.id === table.id) && table.status !== 'closed'

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
  const positions = seatPositions(table.maxSeats, isPhone)
  const rotated = table.seats.map((seat, index) => {
    const slot = (index - anchor + table.maxSeats) % table.maxSeats
    return { index, seat, pos: positions[slot], slot }
  })

  const ghosts = useGhosts(table, rotated)

  const bestLabel = me?.best?.label ?? null
  const myCategory = me?.best?.category ?? null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Cabeçalho da mesa */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line/70 bg-void/40 px-3 py-2 backdrop-blur-sm">
        <button
          type="button"
          onClick={leaveTable}
          className="flex items-center gap-1 rounded-brutal px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Saguão
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">{table.name}</h3>
          <p className="truncate text-[11.5px] text-muted-foreground">
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
            {table.spectators > 0 && (
              <>
                {' '}
                · <Users className="inline h-3 w-3" aria-hidden /> <span className="font-mono">{table.spectators}</span>
              </>
            )}
          </p>
        </div>
        <Hint label="Colinha e regras" description="As combinações, do royal flush à carta alta, e as regras da mesa." side="bottom">
          <button
            type="button"
            onClick={() => onOpenRules(myCategory)}
            aria-label="Colinha"
            className="rounded-brutal border border-line px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-acid/60 hover:text-foreground"
          >
            <BookOpen className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            Colinha
          </button>
        </Hint>
        {isOwner && (
          <Hint label="Fechar a mesa" description="Todo mundo levanta e leva as fichas. Só entre uma mão e outra." side="bottom">
            <button
              type="button"
              disabled={busy || (table.street !== null && table.street !== 'done')}
              onClick={() => void run(() => closeTable(table.id))}
              aria-label="Fechar a mesa"
              className="rounded-brutal border border-line p-1.5 text-muted-foreground transition-colors hover:border-destructive/60 hover:text-destructive disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </Hint>
        )}
      </header>

      <div className={cn('flex min-h-0 flex-1', isPhone ? 'flex-col' : 'flex-row')}>
        {/* O feltro */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className={cn('poker-area relative mx-auto w-full flex-1', isPhone ? 'px-12 py-12' : 'px-24 py-14 xl:px-32 2xl:px-48 2xl:py-20')}>
            <div className="poker-felt h-full w-full">
              <Board table={table} fmt={fmt} />
            </div>

            {ghosts.map((g) => (
              <Ghost key={g.id} ghost={g} table={table} />
            ))}

            {rotated.map(({ index, seat, pos, slot }) => (
              <SeatSpot
                key={index}
                table={table}
                index={index}
                seat={seat}
                pos={pos}
                dealOrder={slot}
                isMe={index === table.mySeat}
                canSit={canSitHere}
                onSit={() => setSitAt(index)}
                fmt={fmt}
                phone={isPhone}
              />
            ))}

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

          {error && (
            <p className="mx-3 mb-1 rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-center text-xs text-destructive">
              {error}
            </p>
          )}

          {/* Barra de ação / minha linha */}
          <footer className="shrink-0 border-t border-line bg-depth-2 px-3 py-2">
            {me ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {/* As MINHAS cartas moram aqui, não no assento: grandes, e
                      sem brigar com o feltro nem com os botões. */}
                  {me.hasCards && (
                    <HeroCards table={table} seat={me} phone={isPhone} />
                  )}
                  <span className="flex items-center gap-1 text-muted-foreground">
                    {table.stake.currency === 'brl' ? <Coins className="h-3.5 w-3.5 text-burn" aria-hidden /> : <MurchosIcon className="h-3.5 w-3.5 text-burn" aria-hidden />}
                    sua pilha <span className="font-mono text-foreground">{fmt(me.stack)}</span>
                    {table.pendingTopUp > 0 && (
                      <span className="text-muted-foreground">
                        {' '}
                        (+<span className="font-mono">{fmt(table.pendingTopUp)}</span> na próxima mão)
                      </span>
                    )}
                  </span>
                  {bestLabel && inHand && (
                    <button
                      type="button"
                      onClick={() => onOpenRules(myCategory)}
                      className="rounded-full border border-acid/40 bg-acid/[0.07] px-2 py-0.5 text-[11.5px] text-acid-text transition-colors hover:bg-acid/15"
                      title="Abrir a colinha nesta mão"
                    >
                      você tem: {bestLabel}
                    </button>
                  )}
                  <span className="ml-auto flex flex-wrap items-center gap-1">
                    {table.canShow && (
                      <SmallButton onClick={() => void run(() => show(table.id))} icon={<Eye className="h-3 w-3" aria-hidden />}>
                        Mostrar
                      </SmallButton>
                    )}
                    <SmallButton onClick={() => setTopUpOpen(true)} icon={<Plus className="h-3 w-3" aria-hidden />}>
                      Recarregar
                    </SmallButton>
                    <SmallButton
                      onClick={() => void run(() => sitOut(table.id, !me.sittingOut))}
                      icon={me.sittingOut ? <Play className="h-3 w-3" aria-hidden /> : <Pause className="h-3 w-3" aria-hidden />}
                    >
                      {me.sittingOut ? 'Voltar' : 'Sentar fora'}
                    </SmallButton>
                    <SmallButton
                      tone={confirmStand ? 'danger' : 'default'}
                      onClick={() => {
                        if (!confirmStand) {
                          setConfirmStand(true)
                          setTimeout(() => setConfirmStand(false), 4_000)
                          return
                        }
                        setConfirmStand(false)
                        void run(() => stand(table.id))
                      }}
                      icon={<DoorOpen className="h-3 w-3" aria-hidden />}
                    >
                      {confirmStand ? (inHand ? 'Desistir e levantar?' : 'Levantar mesmo?') : 'Levantar'}
                    </SmallButton>
                  </span>
                </div>

                {myTurn && table.legal ? (
                  <ActionBar
                    table={table}
                    legal={table.legal}
                    busy={busy}
                    fmt={fmt}
                    onAct={(type, amount) => void run(() => act(table.id, type, amount))}
                  />
                ) : (
                  <WaitingLine table={table} me={me} />
                )}
              </div>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
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
            'shrink-0 border-line bg-void',
            isPhone ? 'border-t' : 'hidden w-64 border-l lg:flex lg:flex-col'
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
              <h4 className="border-b border-line px-3 py-2 text-xs font-semibold text-foreground">Histórico da mão</h4>
              <HandLog table={table} fmt={fmt} className="min-h-0 flex-1" />
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// A mesa comunitária, o pote e o resultado
// ---------------------------------------------------------------------------

function Board({ table, fmt }: { table: TableView; fmt: (v: number) => string }) {
  const { isPhone } = useLayout()
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

  // Só as cartas NOVAS viram: a partir de quantas já estavam na mesa. Mão nova
  // zera a conta (o handId muda).
  const shownRef = React.useRef({ handId: table.handId, count: 0 })
  if (shownRef.current.handId !== table.handId) shownRef.current = { handId: table.handId, count: 0 }
  const staggerFrom = Math.min(shownRef.current.count, table.board.length)
  React.useEffect(() => {
    shownRef.current = { handId: table.handId, count: table.board.length }
  }, [table.handId, table.board.length])

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6">
      {table.street === null ? (
        <p className="text-center text-xs text-muted-foreground">
          {table.status === 'waiting'
            ? table.seats.filter((s) => s && !s.sittingOut && s.stack > 0).length < 2
              ? 'Esperando mais alguém sentar.'
              : 'A mão começa já.'
            : 'Mesa fechada.'}
        </p>
      ) : (
        <>
          {streetLabel && !result && (
            <p className="text-[11.5px] text-muted-foreground">{streetLabel}</p>
          )}
          <CardRow
            codes={table.board}
            size={isPhone ? 'sm' : 'md'}
            slots={5}
            highlightCodes={winningCards}
            enter="flip"
            staggerMs={180}
            staggerFrom={staggerFrom}
          />
          {!result && (
            <div
              key={pulse}
              className={cn(
                'poker-pote-pulso flex items-center gap-1.5 rounded-full border border-burn/60 bg-void/80 px-3 py-1 font-mono text-sm text-burn',
                pulse === 0 && 'animate-none'
              )}
            >
              <span className="text-[11.5px] text-muted-foreground">pote</span>
              {fmt(table.pot)}
            </div>
          )}
        </>
      )}

      {result && <ResultBanner table={table} fmt={fmt} />}
    </div>
  )
}

function ResultBanner({ table, fmt }: { table: TableView; fmt: (v: number) => string }) {
  const result = table.result!
  const name = (seat: number): string => table.seats[seat]?.displayName?.split(/\s+/)[0] ?? '?'
  return (
    <div className="poker-faixa absolute inset-x-12 top-[58%] rounded-brutal border border-burn/60 bg-void/90 px-3 py-2 text-center shadow-[0_10px_30px_rgb(0_0_0/0.5)] md:inset-x-16">
      {result.pots.map((pot, i) => (
        <p key={i} className="text-xs text-foreground">
          <span className="font-semibold text-burn">{pot.winners.map(name).join(' e ')}</span>{' '}
          {pot.winners.length > 1 ? 'dividem' : 'leva'} <span className="font-mono text-burn">{fmt(pot.amount)}</span>
          {pot.label ? <span className="text-muted-foreground"> com {pot.label}</span> : null}
          {result.pots.length > 1 && (
            <span className="text-muted-foreground"> ({i === 0 ? 'pote principal' : `pote lateral ${i}`})</span>
          )}
        </p>
      ))}
      {!result.showdown && <p className="text-[11px] text-muted-foreground">todo mundo desistiu</p>}
      {result.rake > 0 && (
        <p className="text-[11px] text-muted-foreground">
          rake de <span className="font-mono">{fmt(result.rake)}</span> pro cofre da casa
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fantasmas: fichas indo pro pote, pote indo pro vencedor, cartas de quem
// desistiu indo pro meio. Existem só durante a animação.
// ---------------------------------------------------------------------------

interface GhostSpec {
  id: number
  kind: 'bet' | 'win' | 'fold'
  /** Onde nasce (bet/fold) ou onde chega (win), em % da área. */
  pos: [number, number]
  amount?: number
}

let ghostSeq = 0

function useGhosts(
  table: TableView,
  rotated: Array<{ index: number; seat: SeatView | null; pos: [number, number] }>
): GhostSpec[] {
  const [ghosts, setGhosts] = React.useState<GhostSpec[]>([])
  const prevRef = React.useRef<TableView | null>(null)

  React.useEffect(() => {
    const prev = prevRef.current
    prevRef.current = table
    if (!prev || prev.id !== table.id || prev.handId !== table.handId) return

    const born: GhostSpec[] = []
    const posOf = (index: number): [number, number] => rotated.find((r) => r.index === index)?.pos ?? [50, 50]
    const betPosOf = (index: number): [number, number] => {
      const p = posOf(index)
      return [p[0] + (50 - p[0]) * 0.42, p[1] + (50 - p[1]) * 0.42]
    }

    for (const seat of table.seats) {
      if (!seat) continue
      const before = prev.seats[seat.index]
      if (!before) continue
      // Rodada fechou: o que estava na frente de cada um vai pro meio.
      if (before.bet > 0 && seat.bet === 0 && !prev.result) {
        born.push({ id: ++ghostSeq, kind: 'bet', pos: betPosOf(seat.index), amount: before.bet })
      }
      // Desistiu: as cartas vão pro centro.
      if (!before.folded && seat.folded && before.hasCards) {
        born.push({ id: ++ghostSeq, kind: 'fold', pos: posOf(seat.index) })
      }
      // Levou: o pote sai do meio e vai até o assento.
      if (table.result && !prev.result && (seat.won ?? 0) > 0) {
        born.push({ id: ++ghostSeq, kind: 'win', pos: posOf(seat.index), amount: seat.won ?? 0 })
      }
    }

    if (born.length === 0) return
    setGhosts((g) => [...g, ...born])
    const timer = setTimeout(() => {
      const ids = new Set(born.map((b) => b.id))
      setGhosts((g) => g.filter((x) => !ids.has(x.id)))
    }, 1_300)
    return () => clearTimeout(timer)
  }, [table, rotated])

  return ghosts
}

function Ghost({ ghost, table }: { ghost: GhostSpec; table: TableView }) {
  const style = {
    ['--x' as string]: `${ghost.pos[0]}%`,
    ['--y' as string]: `${ghost.pos[1]}%`,
    ['--seat-x' as string]: ghost.pos[0],
    ['--seat-y' as string]: ghost.pos[1]
  } as React.CSSProperties

  if (ghost.kind === 'bet') {
    return (
      <div className="poker-fantasma poker-fantasma--pote flex items-center gap-1 rounded-full border border-line bg-void/85 py-0.5 pl-1 pr-2 font-mono text-[11.5px] text-foreground" style={style} aria-hidden>
        <BetChip amount={ghost.amount ?? 0} bigBlind={table.stake.bigBlind} />
        {formatMoneyShort(ghost.amount ?? 0, table.stake.currency)}
      </div>
    )
  }
  if (ghost.kind === 'win') {
    return (
      <div className="poker-fantasma poker-fantasma--vencedor flex items-center gap-1.5 rounded-full border border-burn/70 bg-void/90 px-2.5 py-1 font-mono text-sm text-burn shadow-[0_0_18px_hsl(var(--burn)/0.35)]" style={style} aria-hidden>
        <span className="poker-ficha-redonda inline-block h-4 w-4" />
        +{formatMoneyShort(ghost.amount ?? 0, table.stake.currency)}
      </div>
    )
  }
  return (
    <div className="poker-fantasma poker-fantasma--fold" style={style} aria-hidden>
      <CardRow codes={['?', '?']} size="xs" faceDown overlap dim />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Um assento
// ---------------------------------------------------------------------------

function SeatSpot({
  table,
  index,
  seat,
  pos,
  dealOrder,
  isMe,
  canSit,
  onSit,
  fmt,
  phone
}: {
  table: TableView
  index: number
  seat: SeatView | null
  pos: [number, number]
  /** Posição na roda a partir de mim: define a ordem (e o atraso) das cartas dadas. */
  dealOrder: number
  isMe: boolean
  canSit: boolean
  onSit: () => void
  fmt: (v: number) => string
  phone: boolean
}) {
  const { byId } = useMembers()
  const style = {
    left: `${pos[0]}%`,
    top: `${pos[1]}%`,
    ['--seat-x' as string]: pos[0],
    ['--seat-y' as string]: pos[1]
  } as React.CSSProperties
  const betPos = {
    left: `${pos[0] + (CENTER[0] - pos[0]) * 0.42}%`,
    top: `${pos[1] + (CENTER[1] - pos[1]) * 0.42}%`
  }

  if (!seat) {
    return (
      <div className="absolute -translate-x-1/2 -translate-y-1/2" style={style}>
        {canSit ? (
          <button
            type="button"
            onClick={onSit}
            className="alvo-dedo flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 border-dashed border-line-strong text-[11px] text-muted-foreground transition-colors hover:border-acid hover:text-acid"
          >
            <Plus className="h-4 w-4" aria-hidden />
            sentar
          </button>
        ) : (
          <span aria-hidden className="block h-14 w-14 rounded-full border-2 border-dashed border-line/60" />
        )}
      </div>
    )
  }

  const member = byId[seat.userId]
  const result = table.result
  const won = (seat.won ?? 0) > 0
  const showdownLoser = !!result?.showdown && seat.inHand && !seat.folded && !won
  const cards = seat.cards
  const myHandCards = result ? result.hands[String(index)]?.cards ?? null : null
  const highlight = won && myHandCards ? myHandCards : null
  const dim = seat.folded || showdownLoser
  const label = seat.lastAction ? ACTION_TAG[seat.lastAction.type] ?? seat.lastAction.type : null

  return (
    <>
      {/* Aposta na frente do assento, rumo ao pote */}
      {seat.bet > 0 && (
        <div
          className="poker-ficha absolute z-conteudo flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-line bg-void/85 py-0.5 pl-1 pr-2 font-mono text-[11.5px] text-foreground"
          style={betPos}
        >
          <BetChip amount={seat.bet} bigBlind={table.stake.bigBlind} />
          {formatMoneyShort(seat.bet, table.stake.currency)}
        </div>
      )}

      <div
        className={cn('absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center', isMe ? 'z-conteudo' : '')}
        style={style}
      >
        {/* As cartas: atrás do avatar pros outros, grandes e à frente pra mim */}
        {seat.hasCards && !isMe && (
          <div className={cn('-mb-3', dim && 'opacity-60')}>
            <CardRow
              codes={cards ?? ['?', '?']}
              size={phone ? 'xs' : 'sm'}
              faceDown={!cards}
              dim={dim}
              highlightCodes={highlight}
              overlap
              // Viradas pra baixo: voam do baralho, uma pessoa de cada vez.
              // Viradas pra cima (showdown): chegam de costas e viram.
              enter={cards ? 'flip' : 'fly'}
              staggerMs={cards ? 140 : 90}
              baseDelayMs={cards ? 0 : dealOrder * 130}
            />
          </div>
        )}

        <div className="relative">
          {seat.toAct && table.deadline && <TimerRing deadline={table.deadline} total={table.timerMs} />}
          <UserAvatar
            userId={seat.userId}
            src={resolveAssetUrl(member?.avatar ?? seat.avatar)}
            name={seat.displayName}
            ringColor={member?.profileColor ?? undefined}
            frame={member?.avatarFrame}
            className={cn(
              'h-12 w-12 border-2 border-void transition-opacity',
              phone && 'h-10 w-10',
              seat.toAct && 'poker-vez',
              won && 'poker-vencedor',
              (seat.folded || seat.sittingOut || !seat.connected) && 'opacity-50'
            )}
          />
          {seat.isButton && <DealerChip className="absolute -right-1.5 -top-1.5" />}
          {seat.allIn && !result && (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-destructive px-1.5 font-mono text-[11px] font-bold leading-4 text-destructive-foreground">
              ALL-IN
            </span>
          )}
        </div>

        <div
          className={cn(
            'mt-1 min-w-[88px] max-w-[140px] rounded-brutal border bg-void/90 px-2 py-1 text-center',
            seat.toAct ? 'border-acid/60' : won ? 'border-burn/60' : 'border-line'
          )}
        >
          <p className="truncate text-[11.5px] leading-tight text-foreground">
            {seat.displayName}
            {seat.sittingOut && <span className="text-muted-foreground"> · fora</span>}
            {!seat.connected && !seat.sittingOut && <span className="text-muted-foreground"> · caiu</span>}
          </p>
          <p className={cn('font-mono text-xs leading-tight', won ? 'text-burn' : 'text-foreground')}>
            {fmt(seat.stack)}
          </p>
          {seat.toAct && table.deadline && <Countdown deadline={table.deadline} />}
          {!seat.toAct && label && !result && (
            <p className="text-[11px] leading-tight text-muted-foreground">
              {label}
              {seat.lastAction && seat.lastAction.amount > 0 && seat.lastAction.type !== 'call' && (
                <> {formatMoneyShort(seat.lastAction.amount, table.stake.currency)}</>
              )}
            </p>
          )}
          {won && (
            <p className="font-mono text-[11.5px] font-bold leading-tight text-burn">+{fmt(seat.won ?? 0)}</p>
          )}
          {result?.hands[String(index)] && !won && (
            <p className="truncate text-[11px] leading-tight text-muted-foreground">{result.hands[String(index)].label}</p>
          )}
          {result?.hands[String(index)] && won && (
            <p className="truncate text-[11px] leading-tight text-acid-text">{result.hands[String(index)].label}</p>
          )}
        </div>

        {isMe && seat.folded && seat.inHand && (
          <p className="mt-1 text-[11px] text-muted-foreground">você desistiu</p>
        )}
      </div>
    </>
  )
}

/** As duas cartas de quem está olhando, no rodapé. Marca as que entraram na mão vencedora. */
function HeroCards({ table, seat, phone }: { table: TableView; seat: SeatView; phone: boolean }) {
  const result = table.result
  const won = (seat.won ?? 0) > 0
  const mine = result ? result.hands[String(seat.index)]?.cards ?? null : null
  const lost = !!result?.showdown && !won
  return (
    <CardRow
      codes={seat.cards ?? []}
      size={phone ? 'md' : 'lg'}
      dim={seat.folded || lost}
      highlightCodes={won ? mine : null}
      enter="slide"
      staggerMs={120}
      baseDelayMs={200}
      className="-my-1"
    />
  )
}

/** Anel que esvazia até o prazo. A animação é CSS; o React só a arma. */
function TimerRing({ deadline, total }: { deadline: number; total: number }) {
  const remaining = Math.max(0, deadline - Date.now())
  const elapsed = Math.max(0, total - remaining)
  return (
    <svg
      key={deadline}
      className="poker-anel pointer-events-none absolute -inset-1.5 h-[calc(100%+12px)] w-[calc(100%+12px)]"
      viewBox="0 0 36 36"
      aria-hidden
    >
      <circle cx="18" cy="18" r="16.5" fill="none" stroke="hsl(var(--border-strong))" strokeWidth="2" />
      <circle
        className="poker-anel-arco"
        cx="18"
        cy="18"
        r="16.5"
        pathLength={1}
        fill="none"
        stroke={remaining < total * 0.3 ? 'hsl(var(--destructive))' : 'hsl(var(--acid))'}
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{ animationDuration: `${total}ms`, animationDelay: `-${elapsed}ms` }}
      />
    </svg>
  )
}

function Countdown({ deadline }: { deadline: number }) {
  const now = useTicker(250)
  const secs = Math.max(0, Math.ceil((deadline - now) / 1000))
  return (
    <p className={cn('font-mono text-[11px] leading-tight', secs <= 5 ? 'text-destructive' : 'text-acid-text')}>{secs}s</p>
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
  onAct
}: {
  table: TableView
  legal: LegalActions
  busy: boolean
  fmt: (v: number) => string
  onAct: (type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin', amount?: number) => void
}) {
  const range = legal.raise ?? legal.bet
  const isBet = !!legal.bet
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
      const r = Math.max(range.min, Math.min(range.max, roundTo(v, step)))
      // Arredondar pra baixo do mínimo não vale; acima do máximo também não.
      return Math.max(range.min, Math.min(range.max, r))
    },
    [range, step]
  )

  const call = legal.call ?? 0
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
    // Sem repetidos e sem nada fora da faixa (vira o mínimo/máximo).
    const seen = new Set<number>()
    return list
      .map((p) => ({ ...p, value: clamp(p.value) }))
      .filter((p) => (seen.has(p.value) ? false : (seen.add(p.value), true)))
  }, [range, isBet, table.pot, table.currentBet, potAfterCall, clamp])

  // Atalhos: F desiste, C passa/paga, A all-in, Enter confirma a aposta.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && target.getAttribute('type') !== 'range') return
      if (e.ctrlKey || e.metaKey || e.altKey || busy) return
      const k = e.key.toLowerCase()
      if (k === 'f' && legal.fold) onAct('fold')
      else if (k === 'c') {
        if (legal.check) onAct('check')
        else if (legal.call !== null) onAct('call')
      } else if (k === 'a' && legal.allin !== null) onAct('allin')
      else if (k === 'enter' && range) onAct(isBet ? 'bet' : 'raise', amount)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [legal, range, isBet, amount, busy, onAct])

  const allInOnly = !!range && range.min === range.max

  return (
    <div className="flex flex-col gap-2">
      {range && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setAmount(p.value)}
                className={cn(
                  'rounded-brutal border px-2 py-0.5 font-mono text-[11.5px] transition-colors',
                  amount === p.value
                    ? 'border-acid/60 bg-acid/10 text-acid'
                    : 'border-line text-muted-foreground hover:border-acid/40 hover:text-foreground'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex min-w-[220px] flex-1 items-center gap-2">
            <button
              type="button"
              aria-label="Menos"
              disabled={allInOnly || amount <= range.min}
              onClick={() => setAmount((a) => clamp(a - step))}
              className="rounded-brutal border border-line p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <input
              type="range"
              className="poker-regua flex-1"
              min={range.min}
              max={range.max}
              step={step}
              value={amount}
              disabled={allInOnly}
              onChange={(e) => setAmount(clamp(Number(e.target.value)))}
              aria-label="Valor da aposta"
            />
            <button
              type="button"
              aria-label="Mais"
              disabled={allInOnly || amount >= range.max}
              onClick={() => setAmount((a) => clamp(a + step))}
              className="rounded-brutal border border-line p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <span className="w-24 text-right font-mono text-sm text-foreground">{fmt(amount)}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="destructive"
          size="sm"
          disabled={busy || !legal.fold}
          onClick={() => onAct('fold')}
          className="justify-center"
        >
          Desistir <kbd className="ml-1.5 hidden rounded border border-destructive/40 px-1 font-mono text-[11px] sm:inline">F</kbd>
        </Button>
        {legal.check ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => onAct('check')} className="justify-center">
            Passar <kbd className="ml-1.5 hidden rounded border border-line-strong px-1 font-mono text-[11px] sm:inline">C</kbd>
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || legal.call === null}
            onClick={() => onAct('call')}
            className="justify-center"
          >
            Pagar <span className="ml-1 font-mono">{fmt(call)}</span>
            {legal.call !== null && legal.call >= (table.seats[table.mySeat ?? -1]?.stack ?? Infinity) && (
              <span className="ml-1 text-[11px]">(all-in)</span>
            )}
          </Button>
        )}
        {range ? (
          <Button size="sm" disabled={busy} onClick={() => onAct(isBet ? 'bet' : 'raise', amount)} className="justify-center">
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : amount >= range.max ? (
              <>All-in <span className="ml-1 font-mono">{fmt(amount)}</span></>
            ) : isBet ? (
              <>Apostar <span className="ml-1 font-mono">{fmt(amount)}</span></>
            ) : (
              <>Aumentar p/ <span className="ml-1 font-mono">{fmt(amount)}</span></>
            )}
          </Button>
        ) : legal.allin !== null ? (
          <Button size="sm" disabled={busy} onClick={() => onAct('allin')} className="justify-center">
            All-in <span className="ml-1 font-mono">{fmt(legal.allin)}</span>
          </Button>
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}

function WaitingLine({ table, me }: { table: TableView; me: SeatView }) {
  const acting = table.toAct !== null ? table.seats[table.toAct] : null
  let text: string
  if (table.result) text = 'Próxima mão daqui a pouco.'
  else if (me.sittingOut) text = 'Você está sentado fora. "Voltar" entra na próxima mão.'
  else if (!me.inHand) text = table.street ? 'Você entra na próxima mão.' : 'Esperando a mão começar.'
  else if (me.folded) text = 'Você desistiu desta mão.'
  else if (acting) text = `Vez de ${acting.displayName.split(/\s+/)[0]}…`
  else if (table.street === 'showdown' || table.street === 'done') text = 'Showdown.'
  else text = 'A mesa está correndo…'
  return <p className="text-center text-xs text-muted-foreground">{text}</p>
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
    <div className="absolute inset-0 z-dialogo flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="card-gradient w-full max-w-sm rounded-brutal border-2 border-acid-dark p-4"
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
          <CardRow codes={e.board} size="xs" />
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
          <CardRow codes={e.cards} size="xs" />
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

function SmallButton({
  children,
  icon,
  onClick,
  tone = 'default'
}: {
  children: React.ReactNode
  icon?: React.ReactNode
  onClick: () => void
  tone?: 'default' | 'danger'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded-brutal border px-2 py-1 text-[11.5px] transition-colors',
        tone === 'danger'
          ? 'border-destructive bg-destructive/15 text-destructive'
          : 'border-line text-muted-foreground hover:border-acid/50 hover:text-foreground'
      )}
    >
      {icon}
      {children}
    </button>
  )
}

/** Rótulo da categoria, pra quem precisa fora da mesa (saguão). */
export function categoryLabel(category: HandCategory | null | undefined): string | null {
  return category ? CATEGORY_LABEL[category] : null
}

export { CURRENCY_LABEL, PlayingCard }
