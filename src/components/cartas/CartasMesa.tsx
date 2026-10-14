import * as React from 'react'
import { AppWindow, ArrowLeft, BookOpen, ChevronDown, ChevronUp, DoorOpen, Eye, History, Loader2, Play, Plus, RotateCcw, Trash2, Trophy, Undo2 } from 'lucide-react'
import { MurchosIcon } from '@/lib/bocas-icons'
import { UserAvatar } from '@/components/ui/avatar'
import { Hint } from '@/components/ui/tooltip'
import { resolveAssetUrl } from '@/lib/api'
import { CARTAS_SPEED_LABEL, stakeLabel, tableKind, type CartasAck, type CartasSeatView, type CartasTableView } from '@/lib/api-cartas'
import { useAuth } from '@/lib/auth-context'
import { useCartas } from '@/lib/cartas-context'
import { useLayout } from '@/lib/layout-context'
import { useMembers } from '@/lib/members-context'
import { useSpeakingIds } from '@/lib/voice-context'
import { isPopout, isWeb } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { BRAND_MASK_STYLE } from '@/components/poker/PokerGlyphs'
import { Countdown, TimerRing } from '@/components/poker/PokerTable'
import { type CardSize } from '@/components/poker/PlayingCard'
import {
  PLATEIA_VISIBLE,
  Plateia,
  ReactionApiContext,
  ReactionButton,
  ReactionLayer,
  type ReactionApi,
  type ReactionGeometry,
  type ReactionTarget
} from '@/components/poker/PokerReactions'
import '@/components/poker/poker.css'
import './cartas.css'

/**
 * A MESA DE CARTAS — a casca que o truco e a cacheta dividem, no mesmo
 * desenho da mesa de pôquer (o trilho com filete, o feltro na cor do tema, a
 * marca bordada, as placas de vidro, o anel do relógio, a plateia e as
 * reações). Cada jogo entra com o que é dele:
 *
 *   - `center`: o meio da mesa (no truco, a vira e as cartas da vaza; na
 *     cacheta, o monte e o lixo). Recebe o `MesaCtx` com as medidas;
 *   - `seatExtra`: o que aparece em cada assento além do avatar e do nome
 *     (cartas viradas atrás do avatar, vidas, a faixa da jogada);
 *   - `heroCards`: as SUAS cartas, grandes, em cima da sua placa;
 *   - `actions`: a barra de ação no rodapé;
 *   - `log`: o histórico.
 *
 * O MEU LUGAR FICA SEMPRE EMBAIXO, e a roda gira A PARTIR DELE no sentido em
 * que o jogo anda — no sentido HORÁRIO da tela, igual ao pôquer: o próximo a
 * jogar senta à minha esquerda. No truco 2x2 o parceiro fica em frente.
 *
 * Tudo que voa (cartas saindo do baralho) usa `--deck-x/--deck-y` da área e
 * `--seat-x/--seat-y` do destino, em % — as mesmas variáveis do poker.css.
 */

// ---------------------------------------------------------------------------
// Medidas
// ---------------------------------------------------------------------------

interface Geometry {
  cx: number
  cy: number
  rx: number
  ry: number
  rail: [number, number, number, number]
  clampX: [number, number]
}

const GEO_DESKTOP: Geometry = { cx: 50, cy: 47, rx: 40.5, ry: 34, rail: [12, 8, 18, 8], clampX: [10, 90] }
const GEO_PHONE: Geometry = { cx: 50, cy: 43, rx: 38, ry: 31, rail: [10, 4, 30, 4], clampX: [15, 85] }

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
  // Horário a partir de mim (90° = embaixo): 90, 90+360/n, ...
  return Array.from({ length: n }, (_, k) => (90 + (360 / n) * k) % 360)
}

export interface MesaLayout {
  w: number
  h: number
  phone: boolean
  /** Monitor grande: tudo um degrau acima. */
  big: boolean
  geo: Geometry
  avatarPx: number
  /** Cartas dos outros assentos (viradas atrás do avatar). */
  seatCard: CardSize
  /** As cartas do meio (vaza, lixo, vira). */
  centerCard: CardSize
  /** As minhas. */
  heroCard: CardSize
  /** Topo das minhas cartas, em px (o miolo da mesa termina antes disso). */
  heroTop: number
  /** Onde o feltro começa e termina, em px. */
  feltTop: number
  feltBottom: number
}

export interface SeatSlot {
  index: number
  seat: CartasSeatView | null
  /** Posição do centro do avatar, em % da área. */
  pos: [number, number]
  /** 0 = eu (embaixo); cresce no sentido horário. */
  slot: number
}

export interface MesaCtx {
  table: CartasTableView
  layout: MesaLayout
  rotated: SeatSlot[]
  /** Centro do avatar de um lugar, em %. */
  posOf: (seat: number) => [number, number]
  /** Ponto no caminho do lugar até o centro da mesa: t=0 no avatar, t=1 no centro. Em %. */
  toward: (seat: number, t: number) => [number, number]
}

function computeLayout(w: number, h: number, phone: boolean, heroSeated: boolean, heroRows: number): MesaLayout {
  const geo = phone ? GEO_PHONE : GEO_DESKTOP
  const big = !phone && w >= 1400 && h >= 860
  const seatCard: CardSize = phone ? 'xs' : big ? 'ms' : 'sm'
  const centerCard: CardSize = phone ? 'sm' : big ? 'lg' : h >= 640 && w >= 1000 ? 'ml' : 'md'
  const heroCard: CardSize = phone ? 'md' : big ? 'xl' : h >= 620 ? 'lg' : 'ml'
  const heroCardH = Math.round(({ xs: 24, sm: 42, ms: 52, md: 64, ml: 80, lg: 92, xl: 110 }[heroCard] * 7) / 5)
  const plateH = phone ? 58 : 70
  const heroTop = heroSeated ? h - 4 - plateH - heroCardH * Math.max(1, heroRows) + 10 : h
  return {
    w,
    h,
    phone,
    big,
    geo,
    avatarPx: phone ? 44 : 56,
    seatCard,
    centerCard,
    heroCard,
    heroTop,
    feltTop: (h * geo.rail[0]) / 100 + 18,
    feltBottom: h - (h * geo.rail[2]) / 100 - 18
  }
}

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

/** Variáveis de um assento pro CSS (posição e o que as animações usam). */
export function seatVars(pos: [number, number], avatarPx: number): React.CSSProperties {
  return {
    ['--seat-x' as string]: pos[0],
    ['--seat-y' as string]: pos[1],
    ['--avatar' as string]: `${avatarPx}px`
  } as React.CSSProperties
}

/** Cor de cada dupla no truco: verde-ácido x brasa. */
export const TEAM_TONE: Record<0 | 1, string> = { 0: 'cartas-dupla--a', 1: 'cartas-dupla--b' }
export const TEAM_NAME: Record<0 | 1, string> = { 0: 'Nós', 1: 'Eles' }

// ---------------------------------------------------------------------------
// A tela
// ---------------------------------------------------------------------------

export interface CartasMesaProps {
  table: CartasTableView
  /** O meio da mesa. */
  center?: (ctx: MesaCtx) => React.ReactNode
  /** O que vai em cada assento dos outros, além do avatar e do nome. */
  seatCards?: (seat: CartasSeatView, ctx: MesaCtx, pos: [number, number]) => React.ReactNode
  /** Linha de baixo da placa (vidas, jogada, "mão"). */
  seatInfo?: (seat: CartasSeatView) => React.ReactNode
  /** O que fica no canto da placa (dealer). */
  dealerSeat?: number | null
  /** As MINHAS cartas, em cima da minha placa. */
  heroCards?: (ctx: MesaCtx) => React.ReactNode
  /** Quantas fileiras as minhas cartas ocupam (a cacheta pode ter 2 no celular). */
  heroRows?: number
  /** De onde as cartas saem voando (o maço do jogo), em %. Sem isto: logo acima do centro. */
  deckAt?: (ctx: MesaCtx) => [number, number]
  /** Placar/realce por cima de tudo, fora do feltro (ex.: tentos do truco). */
  overlay?: (ctx: MesaCtx) => React.ReactNode
  /** A barra de ação (só pra quem está sentado e jogando). */
  actions?: React.ReactNode
  /** Linha de estado à esquerda do rodapé. */
  status?: React.ReactNode
  /** O histórico. */
  log?: React.ReactNode
  onOpenRules: () => void
  /** Erro vindo de uma jogada do jogo, pra mesma faixa de aviso. */
  error?: string | null
  onError?: (message: string | null) => void
}

export function CartasMesa({
  table,
  center,
  seatCards,
  seatInfo,
  dealerSeat,
  heroCards,
  heroRows = 1,
  deckAt,
  overlay,
  actions,
  status,
  log,
  onOpenRules,
  error: outerError,
  onError
}: CartasMesaProps) {
  const { leaveTable, sit, stand, start, closeTable, seatedAt, reactions, popOut, bringBack, react, reactionSoundsMuted, setReactionSoundsMuted } =
    useCartas()
  const { user } = useAuth()
  const { isPhone } = useLayout()
  const [innerError, setInnerError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [confirmStand, setConfirmStand] = React.useState(false)
  const [logShown, setLogShown] = React.useState(true)
  const [logOpen, setLogOpen] = React.useState(false)
  const [reactOpen, setReactOpen] = React.useState(false)
  const [reactTarget, setReactTarget] = React.useState<ReactionTarget | null>(null)
  const areaRef = React.useRef<HTMLDivElement>(null)
  const area = useAreaSize(areaRef)
  const error = outerError ?? innerError
  const setError = onError ?? setInnerError

  React.useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 4_500)
    return () => clearTimeout(t)
  }, [error, setError])

  const me = table.mySeat !== null ? table.seats[table.mySeat] : null
  const inMatch = !!me?.inMatch
  const isOwner = table.createdById === user?.id || user?.role === 'admin'
  const canSitHere = table.mySeat === null && (!seatedAt || seatedAt.id === table.id) && table.status === 'waiting' && !table.playing
  const watchers = table.watchers ?? []
  const myTurn = me !== null && table.playing && table.toAct.includes(me.index)

  const layout = React.useMemo(
    () => computeLayout(area.w, area.h, isPhone, table.mySeat !== null, heroRows),
    [area.w, area.h, isPhone, table.mySeat, heroRows]
  )
  const geo = layout.geo

  const anchor = table.mySeat ?? 0
  const angles = seatAngles(table.maxSeats, isPhone)
  const heroPos: [number, number] = [50, 100 - geo.rail[2] - 2]
  const rotated: SeatSlot[] = table.seats.map((seat, index) => {
    const slot = (index - anchor + table.maxSeats) % table.maxSeats
    // Horário: o slot k é o k-ésimo depois de mim no sentido do jogo.
    const deg = angles[slot] ?? 90
    const rad = (deg * Math.PI) / 180
    const x = geo.cx + geo.rx * Math.cos(rad)
    const y = geo.cy + geo.ry * Math.sin(rad)
    const pos: [number, number] =
      slot === 0 && table.mySeat !== null ? heroPos : [Math.min(geo.clampX[1], Math.max(geo.clampX[0], x)), y]
    return { index, seat, pos, slot }
  })
  const posOf = (seat: number): [number, number] => rotated.find((r) => r.index === seat)?.pos ?? [50, 50]
  const centerY = table.mySeat !== null && area.h > 0 ? Math.min(geo.cy, ((layout.feltTop + layout.heroTop) / 2 / area.h) * 100) : geo.cy
  const toward = (seat: number, t: number): [number, number] => {
    const [x, y] = posOf(seat)
    return [x + (50 - x) * t, y + (centerY - y) * t]
  }
  const ctx: MesaCtx = { table, layout, rotated, posOf, toward }

  const run = async (fn: () => Promise<CartasAck>, after?: () => void): Promise<void> => {
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

  const reactionGeometry = React.useMemo<ReactionGeometry>(() => {
    const bySeat = new Map(rotated.map((r) => [r.index, r.pos] as const))
    return {
      seatPos: (seat) => bySeat.get(seat) ?? null,
      watcherPos: (userId) => {
        const i = Math.min(PLATEIA_VISIBLE - 1, Math.max(0, watchers.findIndex((w) => w.userId === userId)))
        const w = area.w || 1000
        const h = area.h || 600
        return [100 - ((isPhone ? 30 : 36) + i * (isPhone ? 16 : 20)) * (100 / w), (isPhone ? 30 : 34) * (100 / h)]
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, table.mySeat, table.maxSeats, watchers.map((w) => w.userId).join(','), area.w, area.h, isPhone])

  const reactionApi = React.useMemo<ReactionApi>(
    () => ({ react, reactionSoundsMuted, setReactionSoundsMuted }),
    [react, reactionSoundsMuted, setReactionSoundsMuted]
  )

  const deck = deckAt?.(ctx) ?? [50, centerY - 8]
  const areaStyle = {
    ['--deck-x' as string]: deck[0],
    ['--deck-y' as string]: deck[1],
    ['--centro-y' as string]: centerY
  } as React.CSSProperties

  const kind = tableKind(table)

  return (
    <ReactionApiContext.Provider value={reactionApi}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="relative z-conteudo flex shrink-0 items-center gap-2 border-b border-line/50 bg-void/40 px-2 py-1.5 backdrop-blur-sm sm:px-3">
          <button type="button" onClick={leaveTable} className="poker-topo-botao">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Saguão
          </button>
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-sm font-semibold leading-tight text-foreground">{table.name}</p>
            <p className="truncate text-[11.5px] leading-tight text-muted-foreground">
              {kind} · {stakeLabel(table.stake.amount)} · {CARTAS_SPEED_LABEL[table.speed]}
              {table.game === 'cacheta' && <> · {table.startPoints} pontos</>}
              {table.matchNumber > 0 && (
                <>
                  {' '}
                  · partida <span className="font-mono">{table.matchNumber}</span>
                </>
              )}
            </p>
          </div>
          {!isPhone && log && (
            <Hint label={logShown ? 'Esconder o histórico' : 'Mostrar o histórico'} side="bottom">
              <button
                type="button"
                onClick={() => setLogShown((v) => !v)}
                aria-pressed={logShown}
                aria-label="Histórico"
                className={cn('poker-topo-botao hidden lg:inline-flex', logShown && 'text-foreground')}
              >
                <History className="h-3.5 w-3.5" aria-hidden />
              </button>
            </Hint>
          )}
          {!isPhone &&
            !isWeb() &&
            (isPopout() ? (
              <Hint label="Voltar pro launcher" description="Fecha esta janela e abre a mesa de volta na janela principal." side="bottom">
                <button type="button" onClick={() => void bringBack()} aria-label="Voltar pro launcher" className="poker-topo-botao">
                  <Undo2 className="h-3.5 w-3.5" aria-hidden />
                  <span className="hidden md:inline">Voltar pro launcher</span>
                </button>
              </Hint>
            ) : (
              <Hint label="Abrir em outra janela" description="A mesa vai pra uma janela própria, pra jogar num monitor e usar o launcher no outro." side="bottom">
                <button type="button" onClick={() => void popOut(table.game, table.id)} aria-label="Abrir em outra janela" className="poker-topo-botao">
                  <AppWindow className="h-3.5 w-3.5" aria-hidden />
                  <span className="hidden lg:inline">Outra janela</span>
                </button>
              </Hint>
            ))}
          <Hint label="Colinha e regras" description={table.game === 'truco' ? 'A ordem das cartas, as manilhas e quanto vale cada grito.' : 'Os jogos que valem, o curinga e como bater.'} side="bottom">
            <button type="button" onClick={onOpenRules} aria-label="Colinha" className="poker-topo-botao">
              <BookOpen className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Colinha</span>
            </button>
          </Hint>
          {isOwner && (
            <Hint label="Fechar a mesa" description="Todo mundo levanta. Só sem partida rolando." side="bottom">
              <button
                type="button"
                disabled={busy || table.playing}
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
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <div ref={areaRef} className="poker-area cartas-area relative min-h-0 flex-1 overflow-hidden" style={areaStyle}>
              <div
                className="poker-mesa"
                style={{ top: `${geo.rail[0]}%`, right: `${geo.rail[1]}%`, bottom: `${geo.rail[2]}%`, left: `${geo.rail[3]}%` }}
              >
                <div className="poker-felt">
                  <span aria-hidden className="poker-marca" style={BRAND_MASK_STYLE} />
                </div>
              </div>

              {area.w > 0 && center?.(ctx)}

              {!table.playing && (
                <MesaCentro
                  table={table}
                  topY={centerY}
                  busy={busy}
                  canStart={table.canStart || (user?.role === 'admin' && table.status === 'waiting')}
                  onStart={() => void run(() => start(table.id))}
                />
              )}

              {rotated.map(({ index, seat, pos, slot }) =>
                slot === 0 && table.mySeat !== null && seat ? (
                  <HeroPlate
                    key={index}
                    table={table}
                    seat={seat}
                    pos={pos}
                    layout={layout}
                    dealer={dealerSeat === index}
                    info={seatInfo?.(seat)}
                    cards={area.w > 0 ? heroCards?.(ctx) : null}
                  />
                ) : (
                  <SeatPlate
                    key={index}
                    table={table}
                    index={index}
                    seat={seat}
                    pos={pos}
                    layout={layout}
                    dealer={dealerSeat === index}
                    canSit={canSitHere}
                    onSit={() => void run(() => sit(table.id, index))}
                    info={seat ? seatInfo?.(seat) : null}
                    cards={seat && area.w > 0 ? seatCards?.(seat, ctx, pos) : null}
                  />
                )
              )}

              {area.w > 0 && overlay?.(ctx)}

              <ReactionLayer reactions={reactions} geometry={reactionGeometry} />

              <div className="absolute right-2 top-2 z-[17]">
                <Plateia watchers={watchers} compact={isPhone} />
              </div>

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
            </div>

            <footer className={cn('poker-dock shrink-0 px-3 py-2', myTurn && 'poker-dock--vez')}>
              {me ? (
                <div className={cn('flex gap-3', isPhone ? 'flex-col' : 'flex-row items-end')}>
                  <div className={cn('flex min-w-0 flex-col gap-1.5', isPhone ? '' : 'w-[240px] shrink-0 xl:w-[280px]')}>
                    <div className="flex flex-wrap items-center gap-1.5">
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
                        {confirmStand
                          ? inMatch && table.playing
                            ? table.game === 'truco'
                              ? 'Abandonar? Sua dupla perde'
                              : 'Abandonar? Você sai do jogo'
                            : 'Levantar mesmo?'
                          : 'Levantar'}
                      </button>
                      {table.stake.amount > 0 && (
                        <span className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
                          <MurchosIcon className="h-3.5 w-3.5 text-burn" aria-hidden />
                          {table.playing ? (
                            <>
                              bolo <span className="font-mono text-foreground">{table.pot.toLocaleString('pt-BR')}</span>
                            </>
                          ) : (
                            <>
                              casa <span className="font-mono text-foreground">{table.stake.amount.toLocaleString('pt-BR')}</span> ao começar
                            </>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex min-h-[18px] flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">{status}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    {inMatch && table.playing ? (
                      actions
                    ) : (
                      <p className="py-2 text-center text-xs text-muted-foreground">
                        {table.playing
                          ? 'Partida rolando — você entra na próxima.'
                          : table.outcome
                            ? 'Partida encerrada. Quem abriu a mesa começa a próxima.'
                            : 'Esperando a partida começar.'}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="py-1 text-center text-xs text-muted-foreground">
                  {canSitHere
                    ? table.seats.some((s) => s === null)
                      ? 'Você está assistindo. Clique num lugar vazio pra sentar.'
                      : 'Mesa cheia. Você está assistindo.'
                    : table.playing
                      ? 'Partida rolando. Você está assistindo.'
                      : seatedAt && seatedAt.id !== table.id
                        ? `Você está sentado em "${seatedAt.name}". Levante de lá pra sentar aqui.`
                        : 'Você está assistindo.'}
                </p>
              )}
            </footer>
          </div>

          {log && (
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
                    Histórico
                    {logOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                  </button>
                  {logOpen && <div className="max-h-40 overflow-y-auto">{log}</div>}
                </>
              ) : (
                <>
                  <h4 className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-xs font-semibold text-foreground">
                    <History className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    Histórico
                  </h4>
                  <div className="min-h-0 flex-1 overflow-y-auto">{log}</div>
                </>
              )}
            </aside>
          )}
        </div>
      </div>
    </ReactionApiContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// O meio sem partida: "Começar", a espera, o resultado da última
// ---------------------------------------------------------------------------

function MesaCentro({
  table,
  topY,
  busy,
  canStart,
  onStart
}: {
  table: CartasTableView
  topY: number
  busy: boolean
  canStart: boolean
  onStart: () => void
}) {
  const { byId } = useMembers()
  const seated = table.seats.filter((s) => s !== null).length
  const missing = Math.max(0, table.needed - seated)
  const creator =
    table.seats.find((s) => s?.userId === table.createdById)?.displayName ?? byId[table.createdById]?.displayName ?? 'quem abriu a mesa'
  const first = creator.split(/\s+/)[0]
  const outcome = table.outcome
  const again = !!outcome

  const need =
    table.game === 'truco'
      ? missing > 0
        ? `${missing === 1 ? 'Falta 1' : `Faltam ${missing}`} pra fechar ${table.maxSeats === 4 ? 'as duplas' : 'o 1x1'}.`
        : table.maxSeats === 4
          ? 'Duplas fechadas: lugares em frente jogam juntos.'
          : 'Mesa fechada no 1x1.'
      : missing > 0
        ? 'Precisa de pelo menos duas pessoas sentadas.'
        : `${seated} na mesa${table.stake.amount > 0 ? ` — cada um casa ${table.stake.amount.toLocaleString('pt-BR')}` : ''}.`

  let body: React.ReactNode
  if (table.status === 'closed') {
    body = <p className="poker-espera">Mesa fechada</p>
  } else if (canStart) {
    body = (
      <div className="flex flex-col items-center gap-1.5">
        <button type="button" className="poker-comecar" disabled={busy || missing > 0} onClick={onStart}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : again ? (
            <RotateCcw className="h-4 w-4" aria-hidden />
          ) : (
            <Play className="h-4 w-4" aria-hidden />
          )}
          {again ? 'Nova partida' : 'Começar o jogo'}
        </button>
        <p className="poker-espera !py-0.5 text-[11.5px]">{need}</p>
      </div>
    )
  } else {
    body = (
      <p className="poker-espera">
        {missing > 0 ? (
          need
        ) : (
          <>
            Esperando <span className="font-semibold text-foreground">{first}</span> {again ? 'puxar a revanche' : 'começar o jogo'}
            <span className="poker-reticencias" aria-hidden />
          </>
        )}
      </p>
    )
  }

  return (
    <div className="absolute left-1/2 z-[12] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3" style={{ top: `${topY}%` }}>
      {outcome && <Vitoria table={table} />}
      {body}
    </div>
  )
}

/** A placa do fim da partida: quem levou e quanto. */
function Vitoria({ table }: { table: CartasTableView }) {
  const outcome = table.outcome!
  const { user } = useAuth()
  const mine = table.mySeat !== null && outcome.winners.includes(table.mySeat)
  const lost = table.mySeat !== null && !mine && table.seats[table.mySeat]?.userId === user?.id
  const who =
    outcome.names.length === 0
      ? 'Ninguém'
      : outcome.names.length === 1
        ? outcome.names[0]
        : `${outcome.names.slice(0, -1).join(', ')} e ${outcome.names[outcome.names.length - 1]}`
  return (
    <div className={cn('cartas-vitoria', mine && 'cartas-vitoria--minha', lost && 'cartas-vitoria--perdi')} key={outcome.matchId}>
      <Trophy className="h-6 w-6 text-burn" aria-hidden />
      <p className="text-[12px] font-medium text-muted-foreground">{mine ? 'Você ganhou!' : lost ? 'Não foi dessa vez' : 'Fim de partida'}</p>
      <p className="max-w-[320px] truncate text-base font-semibold text-foreground">
        {who} {outcome.names.length > 1 ? 'levaram' : 'levou'}
      </p>
      {outcome.share > 0 && (
        <p className="flex items-center gap-1 font-mono text-lg font-bold text-burn">
          +{outcome.share.toLocaleString('pt-BR')}
          <MurchosIcon className="h-4 w-4" aria-hidden />
          {outcome.winners.length > 1 && <span className="font-sans text-[11px] font-medium text-muted-foreground">cada</span>}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Os assentos
// ---------------------------------------------------------------------------

function SeatPlate({
  table,
  index,
  seat,
  pos,
  layout,
  dealer,
  canSit,
  onSit,
  info,
  cards
}: {
  table: CartasTableView
  index: number
  seat: CartasSeatView | null
  pos: [number, number]
  layout: MesaLayout
  dealer: boolean
  canSit: boolean
  onSit: () => void
  info?: React.ReactNode
  cards?: React.ReactNode
}) {
  const { byId } = useMembers()
  const speakingIds = useSpeakingIds()
  const avatarPx = layout.avatarPx
  const vars = seatVars(pos, avatarPx)

  if (!seat) {
    // No 2x2 o lugar vazio já diz de que lado fica: em frente é parceiro.
    const side =
      table.game === 'truco' && table.maxSeats === 4 && table.mySeat !== null
        ? index % 2 === table.mySeat % 2
          ? 'parceiro'
          : 'adversário'
        : null
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
        {side && <span className="mt-1 text-[11px] text-muted-foreground">{side}</span>}
      </div>
    )
  }

  const member = byId[seat.userId]
  const toAct = table.playing && table.toAct.includes(seat.index)
  const won = !table.playing && !!table.outcome?.winners.includes(seat.index)
  const away = !seat.connected
  const dealerSide = pos[0] <= 50 ? 'right' : 'left'

  return (
    <div className={cn('poker-assento', toAct && 'z-[8]')} style={vars}>
      <div className="relative" style={{ width: avatarPx, height: avatarPx }}>
        {cards}
        <div
          className={cn(
            'relative z-[1] h-full w-full rounded-full',
            seat.team !== null && TEAM_TONE[seat.team],
            seat.team !== null && 'cartas-dupla-anel',
            toAct && 'poker-vez',
            won && 'poker-vencedor'
          )}
        >
          <UserAvatar
            userId={seat.userId}
            speaking={speakingIds.has(seat.userId)}
            src={resolveAssetUrl(member?.avatar ?? seat.avatar)}
            name={seat.displayName}
            ringColor={member?.profileColor ?? undefined}
            frame={member?.avatarFrame}
            frameColor={member?.profileColor}
            className={cn('poker-avatar h-full w-full border-2 border-void transition-opacity', away && 'opacity-50')}
            style={{ width: avatarPx, height: avatarPx }}
          />
          {toAct && table.deadline && <TimerRing deadline={table.deadline} total={table.timerMs} />}
        </div>
        {dealer && (
          <span className={cn('cartas-dealer absolute top-0 z-[3]', dealerSide === 'right' ? '-right-3' : '-left-3')} title="Quem deu as cartas">
            D
          </span>
        )}
      </div>

      <div
        className={cn(
          'poker-placa -mt-1.5',
          layout.phone && 'min-w-[84px] max-w-[110px] px-2',
          toAct && 'poker-placa--vez',
          won && 'poker-placa--vencedor',
          away && !won && 'poker-placa--fora'
        )}
      >
        <p className="truncate text-[12px] font-semibold leading-tight text-foreground">{seat.displayName}</p>
        {toAct && table.deadline ? (
          <Countdown deadline={table.deadline} />
        ) : away ? (
          <span className="poker-jogada poker-jogada--blind">caiu</span>
        ) : seat.auto && table.playing ? (
          <span className="poker-jogada poker-jogada--blind">no automático</span>
        ) : null}
        {info}
        {seat.wins > 0 && <WinsTag wins={seat.wins} />}
      </div>
    </div>
  )
}

function WinsTag({ wins, corner = 'cima' }: { wins: number; corner?: 'cima' | 'baixo' }) {
  return (
    <span
      className={cn(
        'absolute -right-2 flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full border border-burn/60 bg-void px-1 font-mono text-[11px] font-bold leading-none text-burn',
        corner === 'cima' ? '-top-2' : '-bottom-2'
      )}
      title={`${wins} ${wins === 1 ? 'vitória' : 'vitórias'} nesta mesa`}
    >
      <Trophy className="h-2.5 w-2.5" aria-hidden />
      {wins}
    </span>
  )
}

function HeroPlate({
  table,
  seat,
  pos,
  layout,
  dealer,
  info,
  cards
}: {
  table: CartasTableView
  seat: CartasSeatView
  pos: [number, number]
  layout: MesaLayout
  dealer: boolean
  info?: React.ReactNode
  cards?: React.ReactNode
}) {
  const { byId } = useMembers()
  const speakingIds = useSpeakingIds()
  const member = byId[seat.userId]
  const toAct = table.playing && table.toAct.includes(seat.index)
  const won = !table.playing && !!table.outcome?.winners.includes(seat.index)
  const avatarPx = layout.avatarPx
  const vars = seatVars(pos, avatarPx)

  return (
    <div className="poker-assento z-[9]" style={{ ...vars, bottom: 4, top: 'auto', transform: 'translateX(-50%)' }}>
      {cards && <div className="relative z-[2] -mb-2">{cards}</div>}
      <div
        className={cn(
          'poker-placa flex min-w-[220px] max-w-[340px] items-center gap-3 px-3 py-2 text-left',
          layout.phone && 'min-w-[200px]',
          toAct && 'poker-placa--vez',
          won && 'poker-placa--vencedor'
        )}
      >
        <div
          className={cn(
            'relative shrink-0 rounded-full',
            seat.team !== null && TEAM_TONE[seat.team],
            seat.team !== null && 'cartas-dupla-anel',
            toAct && 'poker-vez',
            won && 'poker-vencedor'
          )}
          style={{ width: avatarPx, height: avatarPx }}
        >
          <UserAvatar
            userId={seat.userId}
            speaking={speakingIds.has(seat.userId)}
            src={resolveAssetUrl(member?.avatar ?? seat.avatar)}
            name={seat.displayName}
            ringColor={member?.profileColor ?? undefined}
            frame={member?.avatarFrame}
            frameColor={member?.profileColor}
            className="poker-avatar border-2 border-void"
            style={{ width: avatarPx, height: avatarPx }}
          />
          {toAct && table.deadline && <TimerRing deadline={table.deadline} total={table.timerMs} />}
        </div>
        {/* No meio da borda direita: os cantos de cima ficam embaixo das minhas cartas. */}
        {dealer && (
          <span className="cartas-dealer absolute -right-2.5 top-1/2 z-[3] -translate-y-1/2" title="Quem deu as cartas">
            D
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-[12.5px] font-semibold leading-tight text-foreground">
            <span className="truncate">{seat.displayName}</span>
            {toAct && table.deadline && <Countdown deadline={table.deadline} inline />}
          </p>
          <div className="mt-0.5 flex min-h-[18px] flex-wrap items-center gap-1.5">{info}</div>
        </div>
        {seat.wins > 0 && <WinsTag wins={seat.wins} corner="baixo" />}
      </div>
    </div>
  )
}

/** Uma linha do histórico, no estilo do pôquer. */
export function LogLine({ children, tone }: { children: React.ReactNode; tone?: 'forte' | 'fraco' }) {
  return (
    <p
      className={cn(
        'px-3 py-1 text-[11.5px] leading-snug',
        tone === 'forte' ? 'font-semibold text-foreground' : tone === 'fraco' ? 'text-muted-foreground/70' : 'text-muted-foreground'
      )}
    >
      {children}
    </p>
  )
}

/** Primeiro nome de quem está num lugar. */
export function firstName(table: CartasTableView, seat: number | null | undefined): string {
  if (seat === null || seat === undefined) return 'alguém'
  return table.seats[seat]?.displayName.split(/\s+/)[0] ?? 'alguém'
}

export { Eye }
