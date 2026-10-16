import * as React from 'react'
import { Grab, Hand, Pointer, ThumbsUp, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Hint } from '@/components/ui/tooltip'
import type { TrucoSignalEvent, TrucoVariant } from '@/lib/api-cartas'
import { useCartas } from '@/lib/cartas-context'
import { Glyph } from '@/lib/cosmetic-glyphs'
import type { IconComponent } from '@/lib/icon-component'
import { cn } from '@/lib/utils'

/**
 * OS SINAIS DO TRUCO — a piscada pro parceiro, feita na frente de todo mundo.
 *
 * Na mesa de verdade o sinal é público: o parceiro tem que ver e o
 * adversário pode pegar. Aqui é igual — quem joga manda, a sala inteira vê
 * o gesto no assento (e o que ele quer dizer, que todo truqueiro conhece). Dá
 * pra emendar vários: "zap e três", "copas, pode trucar". A sequência aparece
 * em fila do lado do avatar e entra no histórico.
 *
 * O servidor só conhece os ids (lib/cartas/signals.ts na API); o gesto, o
 * recado e o desenho moram aqui. Desenho é traço no grid de 24, como os da
 * casa (cosmetic-glyphs): cara pros gestos de rosto, mão pros de mão.
 */

type Art = React.ReactNode

/** O rosto de todos os gestos de cara. */
const FACE = <circle cx="12" cy="12" r="8.5" />
const EYES = <path d="M9 10.5h.01M15 10.5h.01" />

const ART = {
  // Piscou: um olho fechado.
  zap: (
    <>
      {FACE}
      <path d="M9 10.5h.01M13.5 11q1.5-1.6 3 0M9 14.5q3 2.5 6 0" />
    </>
  ),
  // Ergueu as sobrancelhas: testa alta e boca de susto.
  copas: (
    <>
      {FACE}
      <path d="M7.5 7.5q1.5-1.5 3 0M13.5 7.5q1.5-1.5 3 0M9 10.5h.01M15 10.5h.01" />
      <circle cx="12" cy="15.5" r="1.2" />
    </>
  ),
  // Entortou a boca.
  espadilha: (
    <>
      {FACE}
      {EYES}
      <path d="M8.5 16l7-2.5" />
    </>
  ),
  // Mostrou a língua.
  'pica-fumo': (
    <>
      {FACE}
      {EYES}
      <path d="M8.5 14h7M10.5 14v1.5a1.5 1.5 0 0 0 3 0V14" />
    </>
  ),
  // Mordeu o lábio: os dentes em cima da boca.
  tres: (
    <>
      {FACE}
      {EYES}
      <path d="M8.5 15.5q3.5 1.6 7 0M10.2 13.6h3.6v1.6h-3.6Z" />
    </>
  ),
  // Biquinho: olhos fechados e o beijo.
  dois: (
    <>
      {FACE}
      <path d="M7.5 10.5q1.5 1.2 3 0M13.5 10.5q1.5 1.2 3 0M11.5 13.5q1.8.8 0 1.6q1.8.8 0 1.6" />
    </>
  ),
  // Abriu a boca.
  as: (
    <>
      {FACE}
      {EYES}
      <path d="M9 13.5h6q0 3.5-3 3.5t-3-3.5Z" />
    </>
  ),
  // Franziu a testa.
  figura: (
    <>
      {FACE}
      <path d="M7.5 7.8l3 1.3M16.5 7.8l-3 1.3M9 11h.01M15 11h.01M9.5 15.5h5" />
    </>
  ),
  // Fechou os olhos.
  nada: (
    <>
      {FACE}
      <path d="M7.5 10.5h3M13.5 10.5h3M10 15.5h4" />
    </>
  ),
  // Coçou o nariz: o dedo encostando no meio da cara.
  truca: (
    <>
      {FACE}
      <path d="M9 9.5h.01M15 9.5h.01M12 10.5v2.5M10 16h4M20.5 21.5l-6.5-7" />
    </>
  ),
  // Olhou pra porta: os olhos todos de um lado, e a saída.
  corre: (
    <>
      <circle cx="10" cy="12" r="7.5" />
      <path d="M11 10.5h.01M15 10.5h.01M9 15h4M19.5 9.5l2 2.5-2 2.5" />
    </>
  ),
  // Bateu na mesa: o punho, o tampo e o tremor.
  torna: (
    <path d="M7.5 8.5h9v7h-9ZM10.5 8.5v2.5M13.5 8.5v2.5M3.5 19.5h17M4.5 14.5l1.5 1.5M19.5 14.5 18 16M12 3.5v2" />
  ),
  // Sorriso de canto, com a sobrancelha levantada.
  blefe: (
    <>
      {FACE}
      <path d="M13.5 7.2q1.5-1.4 3 0M9 10.5h.01M15 10.5h.01M9 15.5q4 .8 6.5-2" />
    </>
  )
} satisfies Record<string, Art>

function glyph(art: Art): IconComponent {
  return function SignalGlyph({ className }: { className?: string }) {
    return <Glyph art={art} className={className} />
  }
}

export type SignalGroup = 'carta' | 'recado'

export interface SignalDef {
  id: string
  group: SignalGroup
  /** O gesto, no passado ("piscou"), como aparece no histórico. */
  gesto: string
  /** Curto, pro chip no assento e o histórico. */
  curto: string
  /** O nome no painel. */
  titulo: string
  /** O que quer dizer. Carta muda com a variante (manilha fixa no mineiro). */
  recado: (variant: TrucoVariant) => string
  Icon: IconComponent
}

const manilha = (mineiro: string, naipe: string) => (v: TrucoVariant) => (v === 'mineiro' ? mineiro : `manilha de ${naipe}`)
const fixo = (texto: string) => () => texto

/** O catálogo, na ordem do painel. Os ids casam com TRUCO_SIGNALS da API. */
export const TRUCO_SIGNALS: readonly SignalDef[] = [
  { id: 'zap', titulo: 'Zap', group: 'carta', gesto: 'piscou', curto: 'zap', recado: manilha('zap — 4 de paus', 'paus (zap)'), Icon: glyph(ART.zap) },
  { id: 'copas', titulo: 'Copas', group: 'carta', gesto: 'ergueu as sobrancelhas', curto: 'copas', recado: manilha('copas — 7 de copas', 'copas'), Icon: glyph(ART.copas) },
  { id: 'espadilha', titulo: 'Espadilha', group: 'carta', gesto: 'entortou a boca', curto: 'espadilha', recado: manilha('espadilha — ás de espadas', 'espadas'), Icon: glyph(ART.espadilha) },
  { id: 'pica-fumo', titulo: 'Pica-fumo', group: 'carta', gesto: 'mostrou a língua', curto: 'pica-fumo', recado: manilha('pica-fumo — 7 de ouros', 'ouros (pica-fumo)'), Icon: glyph(ART['pica-fumo']) },
  { id: 'tres', titulo: 'Três', group: 'carta', gesto: 'mordeu o lábio', curto: 'três', recado: fixo('tenho três'), Icon: glyph(ART.tres) },
  { id: 'dois', titulo: 'Dois', group: 'carta', gesto: 'fez biquinho', curto: 'dois', recado: fixo('tenho dois'), Icon: glyph(ART.dois) },
  { id: 'as', titulo: 'Ás', group: 'carta', gesto: 'abriu a boca', curto: 'ás', recado: fixo('tenho ás'), Icon: glyph(ART.as) },
  { id: 'figura', titulo: 'Só figura', group: 'carta', gesto: 'franziu a testa', curto: 'figura', recado: fixo('só figura (rei, valete, dama)'), Icon: glyph(ART.figura) },
  { id: 'nada', titulo: 'Nada', group: 'carta', gesto: 'fechou os olhos', curto: 'nada', recado: fixo('não tenho nada'), Icon: glyph(ART.nada) },
  { id: 'truca', titulo: 'Pode trucar', group: 'recado', gesto: 'coçou o nariz', curto: 'truca', recado: fixo('pode trucar'), Icon: glyph(ART.truca) },
  { id: 'segura', titulo: 'Segura', group: 'recado', gesto: 'mostrou a palma', curto: 'segura', recado: fixo('segura, não pede'), Icon: Hand },
  { id: 'corre', titulo: 'Corre', group: 'recado', gesto: 'olhou pra porta', curto: 'corre', recado: fixo('corre'), Icon: glyph(ART.corre) },
  { id: 'torna', titulo: 'Torna', group: 'recado', gesto: 'bateu na mesa', curto: 'torna', recado: fixo('torna — sobe'), Icon: glyph(ART.torna) },
  { id: 'primeira', titulo: 'Faço a 1ª', group: 'recado', gesto: 'levantou um dedo', curto: 'faço a 1ª', recado: fixo('faço a primeira'), Icon: Pointer },
  { id: 'mata', titulo: 'Mata essa', group: 'recado', gesto: 'fechou o punho', curto: 'mata', recado: fixo('mata essa — joga a maior'), Icon: Grab },
  { id: 'deixa', titulo: 'Deixa comigo', group: 'recado', gesto: 'fez joinha', curto: 'deixa', recado: fixo('deixa comigo'), Icon: ThumbsUp },
  { id: 'blefe', titulo: 'Blefando', group: 'recado', gesto: 'deu um sorriso de canto', curto: 'blefe', recado: fixo('tô blefando'), Icon: glyph(ART.blefe) }
]

export const SIGNAL_BY_ID: ReadonlyMap<string, SignalDef> = new Map(TRUCO_SIGNALS.map((s) => [s.id, s]))

/** Dois sinais com menos que isto entre eles são a mesma frase. */
export const SIGNAL_CHAIN_GAP_MS = 3_000
/** A fila no assento some depois disto sem sinal novo. */
const SIGNAL_SHOW_MS = 6_500
/** O sinal mais novo mostra o nome por este tempo. */
const SIGNAL_LABEL_MS = 2_400
/** O apagar da fila, no fim. */
const SIGNAL_FADE_MS = 500

/**
 * Agrupa em frases: os sinais da mesma pessoa sem pausa longa entre eles —
 * mesmo que outra pessoa tenha sinalizado no meio. As frases saem na ordem
 * do primeiro sinal de cada uma.
 */
export function signalChains(signals: readonly TrucoSignalEvent[]): TrucoSignalEvent[][] {
  const chains: TrucoSignalEvent[][] = []
  const open = new Map<number, TrucoSignalEvent[]>()
  for (const s of signals) {
    if (!SIGNAL_BY_ID.has(s.signal)) continue
    const chain = open.get(s.seat)
    const prev = chain?.[chain.length - 1]
    if (chain && prev && s.at - prev.at < SIGNAL_CHAIN_GAP_MS) {
      chain.push(s)
      continue
    }
    const fresh = [s]
    chains.push(fresh)
    open.set(s.seat, fresh)
  }
  return chains
}

/** Acorda a tela nos pontos em que a fila muda (o nome recolhe, a fila some). */
function useSignalClock(latestAt: number | null): number {
  const [, tick] = React.useReducer((x: number) => x + 1, 0)
  const now = Date.now()
  React.useEffect(() => {
    if (latestAt === null) return
    const left = [latestAt + SIGNAL_LABEL_MS, latestAt + SIGNAL_SHOW_MS - SIGNAL_FADE_MS, latestAt + SIGNAL_SHOW_MS].map((t) => t - Date.now()).filter((ms) => ms > 0)
    if (left.length === 0) return
    const t = setTimeout(tick, Math.min(...left) + 20)
    return () => clearTimeout(t)
  })
  return now
}

/**
 * A fila de sinais de um assento, do lado do avatar. `side` diz pra que lado
 * ela cresce (a ponta nova fica sempre à direita: lê-se na ordem).
 */
export function SeatSignals({
  seat,
  variant,
  side,
  compact,
  mine
}: {
  seat: number
  variant: TrucoVariant
  side: 'left' | 'right'
  compact?: boolean
  /** O meu assento: sem o nome (eu sei o que mandei) e mais curta no celular. */
  mine?: boolean
}) {
  const { signals } = useCartas()
  const ofSeat = React.useMemo(() => signals.filter((s) => s.seat === seat), [signals, seat])
  const chain = React.useMemo(() => {
    const chains = signalChains(ofSeat)
    return chains[chains.length - 1] ?? []
  }, [ofSeat])
  const last = chain[chain.length - 1] ?? null
  const now = useSignalClock(last ? receivedAt(last) : null)
  if (!last || now - receivedAt(last) > SIGNAL_SHOW_MS) return null

  const max = compact ? (mine ? 3 : 4) : 6
  const shown = chain.slice(-max)
  const hidden = chain.length - shown.length
  const age = now - receivedAt(last)
  const fresh = age < SIGNAL_LABEL_MS

  return (
    <div
      className={cn(
        'truco-sinais absolute top-1/2 z-[30] flex -translate-y-1/2 items-center',
        side === 'right' ? 'left-full ml-2' : 'right-full mr-2',
        compact && 'truco-sinais--compacto',
        age > SIGNAL_SHOW_MS - SIGNAL_FADE_MS && 'truco-sinais--saindo'
      )}
      aria-live="polite"
    >
      {hidden > 0 && <span className="truco-sinal-mais">+{hidden}</span>}
      {shown.map((s, k) => {
        const def = SIGNAL_BY_ID.get(s.signal)!
        const newest = k === shown.length - 1
        return (
          <span
            key={s.id}
            className={cn('truco-sinal', newest && fresh && 'truco-sinal--novo')}
            title={`${def.gesto} — ${def.recado(variant)}`}
          >
            <def.Icon className="truco-sinal-icone" />
            {newest && fresh && !mine && <span className="truco-sinal-nome">{def.curto}</span>}
          </span>
        )
      })}
    </div>
  )
}

/** A hora em que o sinal chegou AQUI (o `at` é do relógio do servidor, que pode estar fora do meu). */
function receivedAt(s: TrucoSignalEvent): number {
  return s.localAt ?? s.at
}

// ---------------------------------------------------------------------------
// O painel
// ---------------------------------------------------------------------------

export function SignalButton({
  tableId,
  mySeat,
  variant,
  open,
  onOpenChange,
  compact,
  onError
}: {
  tableId: string
  mySeat: number
  variant: TrucoVariant
  open: boolean
  onOpenChange: (open: boolean) => void
  compact?: boolean
  onError: (message: string) => void
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Hint label="Sinais" description="Pisca pro parceiro — a mesa inteira vê. Dá pra emendar vários." side="top">
          <button type="button" aria-label="Sinais" aria-expanded={open} className={cn('poker-mini alvo-dedo', open && 'truco-sinais-botao--aberto')}>
            <Glyph art={ART.zap} className="h-3.5 w-3.5" />
            Sinais
            {!compact && <kbd className="font-mono text-[11px] opacity-70">S</kbd>}
          </button>
        </Hint>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        collisionPadding={10}
        className="w-[420px] max-w-[calc(100vw-20px)] p-0"
        // O foco fica na mesa: 1/2/3, T, A e C continuam jogando com o painel aberto.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SignalPanel tableId={tableId} mySeat={mySeat} variant={variant} onClose={() => onOpenChange(false)} onError={onError} />
      </PopoverContent>
    </Popover>
  )
}

function SignalPanel({
  tableId,
  mySeat,
  variant,
  onClose,
  onError
}: {
  tableId: string
  mySeat: number
  variant: TrucoVariant
  onClose: () => void
  onError: (message: string) => void
}) {
  const { sendSignal, signals } = useCartas()

  // A frase que estou montando: a minha fila mais recente, se ainda está viva.
  const chain = React.useMemo(() => {
    const chains = signalChains(signals.filter((s) => s.seat === mySeat))
    return chains[chains.length - 1] ?? []
  }, [signals, mySeat])
  const last = chain[chain.length - 1] ?? null
  const now = useSignalClock(last ? receivedAt(last) : null)
  const live = !!last && now - receivedAt(last) < SIGNAL_CHAIN_GAP_MS

  const send = async (id: string): Promise<void> => {
    const ack = await sendSignal(tableId, id)
    if (!ack.ok && !ack.throttled) onError(ack.error ?? 'Não deu pra mandar o sinal.')
  }

  const group = (g: SignalGroup, title: string) => (
    <section className="flex flex-col gap-1.5">
      <h3 className="px-0.5 text-[11px] font-semibold text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
        {TRUCO_SIGNALS.filter((s) => s.group === g).map((s) => (
          <button key={s.id} type="button" onClick={() => void send(s.id)} className="truco-sinal-opcao alvo-dedo" title={`${s.gesto} — ${s.recado(variant)}`}>
            <s.Icon className="h-5 w-5 shrink-0" />
            <span className="min-w-0 text-left">
              <span className="block truncate text-[12.5px] font-semibold leading-tight text-foreground">{s.titulo}</span>
              <span className="block truncate text-[11px] leading-tight text-muted-foreground">{s.gesto}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight text-foreground">Sinais</p>
          <p className="text-[11.5px] leading-tight text-muted-foreground">A mesa inteira vê — o parceiro e os adversários.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="flex min-h-[38px] items-center gap-1.5 border-b border-line/60 bg-void/40 px-3 py-1.5">
        {live ? (
          <>
            <span className="shrink-0 text-[11px] text-muted-foreground">Mandou:</span>
            <span className="flex min-w-0 flex-wrap items-center gap-1">
              {chain.map((s) => {
                const def = SIGNAL_BY_ID.get(s.signal)!
                return (
                  <span key={s.id} className="truco-sinal truco-sinal--painel" title={def.recado(variant)}>
                    <def.Icon className="truco-sinal-icone" />
                    <span className="truco-sinal-nome">{def.curto}</span>
                  </span>
                )
              })}
            </span>
          </>
        ) : (
          <span className="text-[11.5px] text-muted-foreground">Clique em vários seguidos pra emendar uma frase.</span>
        )}
      </div>

      <div className="flex max-h-[min(420px,60vh)] flex-col gap-3 overflow-y-auto p-2.5">
        {group('carta', 'O que eu tenho')}
        {group('recado', 'O recado')}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// No histórico
// ---------------------------------------------------------------------------

/** Os ícones da frase, em linha, pro histórico. */
export function SignalChainInline({ chain, variant }: { chain: readonly TrucoSignalEvent[]; variant: TrucoVariant }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {chain.map((s, k) => {
        const def = SIGNAL_BY_ID.get(s.signal)
        if (!def) return null
        return (
          <span key={s.id} className="inline-flex items-center gap-1" title={`${def.gesto} — ${def.recado(variant)}`}>
            {k > 0 && <span className="text-muted-foreground">·</span>}
            <def.Icon className="h-3.5 w-3.5 text-acid-text" />
            <span>{def.curto}</span>
          </span>
        )
      })}
    </span>
  )
}
