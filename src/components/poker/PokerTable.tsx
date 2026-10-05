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
import { BRAND_MASK_STYLE, ChipStack, DealerChip } from './PokerGlyphs'
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
 * Geometria: os outros assentos ficam numa elipse que acompanha a borda do
 * trilho (o avatar monta na beirada da mesa); o meu lugar não está na
 * elipse, está ancorado no pé da área. Tudo em % da área, e cada assento
 * publica `--seat-x`/`--seat-y` pra que as animações (cartas saindo do
 * baralho, fichas indo pro pote, pote indo pro vencedor) acertem o destino
 * sem medir nada.
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
  /** Onde fica a mesa comunitária (centro das cartas), o pote e a faixa do resultado. */
  boardY: number
  potY: number
  resultY: number
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
  resultY: 65,
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
  resultY: 59,
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

/** Onde a aposta de um assento para: a 40% do caminho até o pote (a minha um pouco mais, pra ficar acima das cartas). */
function betPositionFor(pos: [number, number], geo: Geometry, hero = false): [number, number] {
  const k = hero ? 0.55 : 0.42
  return [pos[0] + (50 - pos[0]) * 0.4, pos[1] + (geo.potY + 6 - pos[1]) * k]
}

export function PokerTable({
  onOpenRules,
  onOpenCash
}: {
  onOpenRules: (category?: HandCategory | null) => void
  /** Mesa valendo: abre o caixa pra depositar (quem quebrou e está sem saldo). */
  onOpenCash?: () => void
}) {
  const { table, leaveTable, act, sit, stand, topUp, sitOut, show, closeTable, seatedAt } = usePoker()
  const { user } = useAuth()
  const { isPhone } = useLayout()
  const [sitAt, setSitAt] = React.useState<number | null>(null)
  const [topUpOpen, setTopUpOpen] = React.useState(false)
  const [confirmStand, setConfirmStand] = React.useState(false)
  const [logOpen, setLogOpen] = React.useState(false)
  const [logShown, setLogShown] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  /** Mão em que a pessoa mandou o aviso de "quebrou" embora (volta na próxima). */
  const [bustDismissedFor, setBustDismissedFor] = React.useState<string | null>(null)

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

  const geo = isPhone ? GEOMETRY_PHONE : GEOMETRY_DESKTOP
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
  const positions = seatPositions(table.maxSeats, geo, isPhone)
  // O meu lugar não está na elipse: as cartas ficam logo acima da beirada de
  // baixo do trilho (é daí que as animações partem e chegam).
  const heroPos: [number, number] = [50, 100 - geo.rail[2] - 3]
  const rotated = table.seats.map((seat, index) => {
    const slot = (index - anchor + table.maxSeats) % table.maxSeats
    const pos: [number, number] = slot === 0 && table.mySeat !== null ? heroPos : positions[slot]
    return { index, seat, pos, slot }
  })
  const dealing = table.seats.filter((s) => s?.hasCards).length

  const ghosts = useGhosts(table, rotated, geo)

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
            {table.spectators > 0 && (
              <>
                {' '}
                · <Users className="inline h-3 w-3" aria-hidden /> <span className="font-mono">{table.spectators}</span>
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
          <div className="poker-area relative min-h-0 flex-1 overflow-hidden" style={areaStyle}>
            {/* A mesa: trilho, filete e feltro */}
            <div
              className="poker-mesa"
              style={{ top: `${geo.rail[0]}%`, right: `${geo.rail[1]}%`, bottom: `${geo.rail[2]}%`, left: `${geo.rail[3]}%` }}
            >
              <div className="poker-felt">
                <span aria-hidden className="poker-marca" style={BRAND_MASK_STYLE} />
              </div>
            </div>

            <Deck size={isPhone ? 'xs' : 'sm'} />

            <Board table={table} fmt={fmt} geo={geo} phone={isPhone} />

            {ghosts.map((g) => (
              <Ghost key={g.id} ghost={g} table={table} geo={geo} />
            ))}

            {rotated.map(({ index, seat, pos, slot }) =>
              index === table.mySeat && seat ? (
                <HeroSeat
                  key={index}
                  table={table}
                  seat={seat}
                  pos={pos}
                  dealOrder={slot}
                  dealing={dealing}
                  fmt={fmt}
                  phone={isPhone}
                  geo={geo}
                  myTurn={myTurn}
                  onOpenRules={onOpenRules}
                />
              ) : (
                <SeatSpot
                  key={index}
                  table={table}
                  index={index}
                  seat={seat}
                  pos={pos}
                  dealOrder={slot}
                  dealing={dealing}
                  canSit={canSitHere}
                  onSit={() => setSitAt(index)}
                  fmt={fmt}
                  phone={isPhone}
                  geo={geo}
                />
              )
            )}

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
                </div>

                {/* Direita: a aposta. */}
                <div className="min-w-0 flex-1">
                  <ActionBar
                    table={table}
                    legal={myTurn ? table.legal : null}
                    busy={busy}
                    fmt={fmt}
                    phone={isPhone}
                    onAct={(type, amount) => void run(() => act(table.id, type, amount))}
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
// O baralho, a mesa comunitária, o pote e o resultado
// ---------------------------------------------------------------------------

/** O baralho no lugar do crupiê: três cartas viradas, um fio fora do lugar. */
function Deck({ size }: { size: 'xs' | 'sm' }) {
  return (
    <div className="poker-baralho" aria-hidden>
      <div className="relative" style={{ width: size === 'xs' ? 24 : 42, height: size === 'xs' ? 34 : 59 }}>
        <PlayingCard faceDown size={size} style={{ transform: 'translate(-2px, 3px) rotate(-4deg)', opacity: 0.85 }} />
        <PlayingCard faceDown size={size} style={{ transform: 'translate(-1px, 1.5px) rotate(-1.5deg)', opacity: 0.92 }} />
        <PlayingCard faceDown size={size} />
      </div>
    </div>
  )
}

function Board({ table, fmt, geo, phone }: { table: TableView; fmt: (v: number) => string; geo: Geometry; phone: boolean }) {
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

  // Só as cartas NOVAS saem do baralho e viram: a partir de quantas já
  // estavam na mesa. Mão nova zera a conta (o handId muda).
  const shownRef = React.useRef({ handId: table.handId, count: 0 })
  if (shownRef.current.handId !== table.handId) shownRef.current = { handId: table.handId, count: 0 }
  const staggerFrom = Math.min(shownRef.current.count, table.board.length)
  React.useEffect(() => {
    shownRef.current = { handId: table.handId, count: table.board.length }
  }, [table.handId, table.board.length])

  // A soma das apostas da rodada ainda não está no pote: mostra "+ 150 na mesa".
  const onTable = table.seats.reduce((sum, s) => sum + (s?.bet ?? 0), 0)

  const style = {
    left: '50%',
    top: `${geo.boardY}%`,
    ['--seat-x' as string]: 50,
    ['--seat-y' as string]: geo.boardY
  } as React.CSSProperties

  return (
    <>
      {/* O pote */}
      <div className="absolute left-1/2 z-[6] -translate-x-1/2 -translate-y-1/2" style={{ top: `${geo.potY}%` }}>
        {table.street === null ? (
          <p className="whitespace-nowrap rounded-full bg-void/50 px-3 py-1 text-center text-xs text-foreground/80">
            {table.status === 'waiting'
              ? table.seats.filter((s) => s && !s.sittingOut && s.stack > 0).length < 2
                ? 'Esperando mais alguém sentar'
                : 'A mão começa já'
              : 'Mesa fechada'}
          </p>
        ) : (
          !result && (
            <div className="flex flex-col items-center gap-1">
              {streetLabel && <p className="text-[11.5px] font-medium leading-none text-foreground/60">{streetLabel}</p>}
              <div key={pulse} className={cn('poker-pote', pulse > 0 && 'poker-pote-pulso')}>
                <ChipStack amount={Math.max(table.pot, table.stake.bigBlind)} bigBlind={table.stake.bigBlind} size={phone ? 16 : 20} />
                <span>
                  <span className="mr-1.5 font-sans text-[11.5px] font-medium text-foreground/70">Pote</span>
                  {fmt(table.pot)}
                </span>
              </div>
              {onTable > 0 && (
                <p className="rounded-full bg-void/40 px-2 text-[11px] leading-4 text-foreground/70">
                  + <span className="font-mono">{fmt(onTable)}</span> na mesa
                </p>
              )}
            </div>
          )
        )}
      </div>

      {/* As cinco cartas */}
      <div className="absolute z-[6] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5" style={style}>
        {table.street !== null && (
          <CardRow
            codes={table.board}
            size={phone ? 'sm' : 'md'}
            slots={5}
            gap={phone ? 5 : 8}
            highlightCodes={winningCards}
            enter="fly-flip"
            staggerMs={170}
            staggerFrom={staggerFrom}
          />
        )}
      </div>

      {result && <ResultBanner table={table} fmt={fmt} geo={geo} />}
    </>
  )
}

function ResultBanner({ table, fmt, geo }: { table: TableView; fmt: (v: number) => string; geo: Geometry }) {
  const result = table.result!
  const name = (seat: number): string => table.seats[seat]?.displayName?.split(/\s+/)[0] ?? '?'
  return (
    <div className="poker-faixa min-w-[220px] max-w-[85%] px-4 py-2 text-center" style={{ top: `${geo.resultY}%` }}>
      {result.pots.map((pot, i) => (
        <p key={i} className="text-sm leading-snug text-foreground">
          <span className="font-semibold text-burn">{pot.winners.map(name).join(' e ')}</span>{' '}
          {pot.winners.length > 1 ? 'dividem' : 'leva'} <span className="font-mono font-semibold text-burn">{fmt(pot.amount)}</span>
          {pot.label ? <span className="text-foreground/70"> com {pot.label}</span> : null}
          {result.pots.length > 1 && (
            <span className="text-muted-foreground"> ({i === 0 ? 'pote principal' : `pote lateral ${i}`})</span>
          )}
        </p>
      ))}
      {!result.showdown && <p className="text-[11.5px] text-muted-foreground">todo mundo desistiu</p>}
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
  rotated: Array<{ index: number; seat: SeatView | null; pos: [number, number] }>,
  geo: Geometry
): GhostSpec[] {
  const [ghosts, setGhosts] = React.useState<GhostSpec[]>([])
  const prevRef = React.useRef<TableView | null>(null)
  // `rotated` nasce novo a cada render: como dependência, o efeito rodava de
  // novo a cada pintura (o próprio `setGhosts` pinta) e a limpeza cancelava
  // o timer que tira os fantasmas — eles ficavam pra sempre (visíveis com
  // "reduzir movimento", que tira a animação que os apagava).
  const rotatedRef = React.useRef(rotated)
  rotatedRef.current = rotated
  const geoRef = React.useRef(geo)
  geoRef.current = geo
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
    const posOf = (index: number): [number, number] =>
      rotatedRef.current.find((r) => r.index === index)?.pos ?? [50, 50]

    for (const seat of table.seats) {
      if (!seat) continue
      const before = prev.seats[seat.index]
      if (!before) continue
      // Rodada fechou: o que estava na frente de cada um vai pro meio.
      if (before.bet > 0 && seat.bet === 0 && !prev.result) {
        born.push({ id: ++ghostSeq, kind: 'bet', pos: betPositionFor(posOf(seat.index), geoRef.current), amount: before.bet })
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
      timersRef.current.delete(timer)
      const ids = new Set(born.map((b) => b.id))
      setGhosts((g) => g.filter((x) => !ids.has(x.id)))
    }, 1_300)
    timersRef.current.add(timer)
  }, [table])

  return ghosts
}

function Ghost({ ghost, table, geo }: { ghost: GhostSpec; table: TableView; geo: Geometry }) {
  const atSeat = {
    ['--x' as string]: `${ghost.pos[0]}%`,
    ['--y' as string]: `${ghost.pos[1]}%`,
    ['--seat-x' as string]: ghost.pos[0],
    ['--seat-y' as string]: ghost.pos[1]
  } as React.CSSProperties

  if (ghost.kind === 'bet') {
    return (
      <div className="poker-fantasma poker-fantasma--pote poker-valor" style={atSeat} aria-hidden>
        <ChipStack amount={ghost.amount ?? 0} bigBlind={table.stake.bigBlind} size={16} />
        {formatMoneyShort(ghost.amount ?? 0, table.stake.currency)}
      </div>
    )
  }
  if (ghost.kind === 'win') {
    // Nasce no pote e vai até o assento (que fica em --seat-x/--seat-y).
    const atPot = { ...atSeat, ['--x' as string]: '50%', ['--y' as string]: `${geo.potY}%` } as React.CSSProperties
    return (
      <div className="poker-fantasma poker-fantasma--vencedor poker-pote shadow-[0_0_24px_hsl(var(--burn)/0.45)]" style={atPot} aria-hidden>
        <ChipStack amount={ghost.amount ?? 0} bigBlind={table.stake.bigBlind} size={20} />
        +{formatMoneyShort(ghost.amount ?? 0, table.stake.currency)}
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
  dealOrder,
  dealing,
  canSit,
  onSit,
  fmt,
  phone,
  geo
}: {
  table: TableView
  index: number
  seat: SeatView | null
  pos: [number, number]
  /** Posição na roda a partir de mim: define a ordem (e o atraso) das cartas dadas. */
  dealOrder: number
  /** Quantos receberam cartas nesta mão (o ritmo de uma carta por pessoa). */
  dealing: number
  canSit: boolean
  onSit: () => void
  fmt: (v: number) => string
  phone: boolean
  geo: Geometry
}) {
  const { byId } = useMembers()
  const avatarPx = phone ? 44 : 56
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
  const betPos = betPositionFor(pos, geo)
  // O botão do dealer fica do lado do assento que olha pro centro.
  const dealerSide = pos[0] <= 50 ? 'right' : 'left'

  return (
    <>
      {/* Aposta na frente do assento, rumo ao pote */}
      {seat.bet > 0 && (
        <div
          className="poker-ficha poker-valor absolute z-[7]"
          style={{ left: `${betPos[0]}%`, top: `${betPos[1]}%` }}
        >
          <ChipStack amount={seat.bet} bigBlind={table.stake.bigBlind} size={phone ? 14 : 16} />
          {formatMoneyShort(seat.bet, table.stake.currency)}
        </div>
      )}

      <div className={cn('poker-assento', seat.toAct && 'z-[8]')} style={vars}>
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
                size={phone ? 'xs' : 'sm'}
                faceDown={!cards}
                dim={dim}
                highlightCodes={highlight}
                fan
                // Viradas pra baixo: saem do baralho, uma carta por pessoa,
                // na ordem da mesa. Viradas pra cima (showdown): viram no lugar.
                enter={cards ? 'flip' : 'fly'}
                staggerMs={cards ? 140 : dealing * 110}
                baseDelayMs={cards ? 0 : dealOrder * 110}
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
  dealOrder,
  dealing,
  fmt,
  phone,
  geo,
  myTurn,
  onOpenRules
}: {
  table: TableView
  seat: SeatView
  pos: [number, number]
  dealOrder: number
  dealing: number
  fmt: (v: number) => string
  phone: boolean
  geo: Geometry
  myTurn: boolean
  onOpenRules: (category?: HandCategory | null) => void
}) {
  const { byId } = useMembers()
  const member = byId[seat.userId]
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
  const betPos = betPositionFor(pos, geo, true)
  const avatarPx = phone ? 44 : 56
  const vars = seatVars(pos, avatarPx)

  return (
    <>
      {seat.bet > 0 && (
        <div className="poker-ficha poker-valor absolute z-[7]" style={{ left: `${betPos[0]}%`, top: `${betPos[1]}%` }}>
          <ChipStack amount={seat.bet} bigBlind={table.stake.bigBlind} size={phone ? 14 : 16} />
          {formatMoneyShort(seat.bet, table.stake.currency)}
        </div>
      )}

      <div className="poker-assento z-[9]" style={{ ...vars, bottom: 4, top: 'auto', transform: 'translateX(-50%)' }}>
        {/* As SUAS cartas: grandes, em leque, saindo do baralho e virando ao pousar. */}
        {seat.hasCards && seat.cards && (
          <div className={cn('poker-heroi-cartas relative z-[2] -mb-2', myTurn && inHand && 'poker-heroi-cartas--vez')}>
            <CardRow
              codes={seat.cards}
              size={phone ? 'md' : 'lg'}
              dim={dim}
              highlightCodes={won ? mine : null}
              fan
              spread
              enter="fly-flip"
              staggerMs={dealing * 110}
              baseDelayMs={dealOrder * 110}
            />
            {seat.folded && seat.inHand && (
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-void/85 px-2.5 py-0.5 text-[11.5px] font-medium text-foreground/80">
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
  onAct
}: {
  table: TableView
  /** As jogadas possíveis AGORA; null quando não é a minha vez (botões apagados, mas no lugar). */
  legal: LegalActions | null
  busy: boolean
  fmt: (v: number) => string
  phone: boolean
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
  const off = !legal || busy
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
              onClick={() => setAmount(p.value)}
              className={cn('poker-preset', amount === p.value && 'poker-preset--ativo')}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex min-w-[200px] flex-1 items-center gap-2">
          <button
            type="button"
            aria-label="Menos"
            disabled={!range || allInOnly || amount <= range.min}
            onClick={() => setAmount((a) => clamp(a - step))}
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
            value={amount}
            disabled={!range || allInOnly}
            onChange={(e) => setAmount(clamp(Number(e.target.value)))}
            aria-label="Valor da aposta"
          />
          <button
            type="button"
            aria-label="Mais"
            disabled={!range || allInOnly || amount >= range.max}
            onClick={() => setAmount((a) => clamp(a + step))}
            className="poker-preset flex h-[26px] w-[26px] items-center justify-center !px-0"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
          <span className="w-24 text-right font-mono text-sm font-semibold text-foreground">{range ? fmt(amount) : ''}</span>
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
            className={cn('poker-botao poker-botao--check', phone && 'poker-botao--compacto')}
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
          <button
            type="button"
            className={cn('poker-botao', amount >= range.max ? 'poker-botao--allin' : 'poker-botao--raise', phone && 'poker-botao--compacto')}
            disabled={off}
            onClick={() => onAct(isBet ? 'bet' : 'raise', amount)}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : amount >= range.max ? (
              <>
                All-in <span className="font-mono">{fmt(amount)}</span>
              </>
            ) : isBet ? (
              <>
                Apostar <span className="font-mono">{fmt(amount)}</span>
              </>
            ) : (
              <>
                {phone ? 'Aumentar' : 'Aumentar p/'} <span className="font-mono">{fmt(amount)}</span>
              </>
            )}
            {!phone && <kbd>⏎</kbd>}
          </button>
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
