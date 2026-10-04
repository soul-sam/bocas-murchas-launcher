import * as React from 'react'
import { Loader2, Minus, Plus, TrendingDown, TrendingUp } from 'lucide-react'
import { BetIcon, MurchosIcon } from '@/lib/bocas-icons'
import { cn } from '@/lib/utils'
import { countdown, groupBonusPreview, useSendLock, windowLeft } from './parts'

/**
 * A APOSTA — quanto, e em quem, sem teclado.
 *
 * A janela da sobreposição é `focusable: false` (ver OverlayPage): ela nunca
 * recebe tecla, então não existe campo pra digitar o valor. A primeira versão
 * resolvia isso com cinco fichas fixas (10, 50, 100, 250, 500) — e entre 100 e
 * o teto a pessoa só tinha 250 ou o máximo. "Só consigo apostar 250 ou o máx."
 *
 * Agora o valor é CONTÍNUO, de 10 em 10, e há quatro jeitos de chegar nele,
 * todos de mouse:
 *
 *   - a RÉGUA, arrastando ou clicando no ponto;
 *   - os botões − e +, que repetem segurando e aceleram depois de um tanto;
 *   - a roda do mouse em cima do valor;
 *   - as fichas rápidas, pra quem já sabe quanto — a última é sempre o seu
 *     limite (o teto da aposta ou tudo que você tem, o que for menor).
 *
 * Escolher o valor NÃO aposta: o botão grande confirma. A versão anterior
 * disparava a aposta no toque da ficha pra economizar um clique, e isso vale
 * pouco perto de mandar 500 sem querer no meio de uma luta. Dinheiro de
 * verdade pede dois toques — é o mesmo desenho que a aposta em si mesmo já
 * tinha, e agora os dois formulários são um só.
 *
 * Cor: o VALOR é dourado (murchos), o LADO é verde ou vermelho. Separar os
 * dois deixa claro o que cada botão mexe.
 */

/** Passo da régua, dos botões e da roda. A aposta mínima do sistema é 10. */
const STEP = 10
/** Segurar o botão: espera isto, depois repete neste ritmo. */
const HOLD_DELAY_MS = 450
const HOLD_REPEAT_MS = 70
/** Depois de tantas repetições segurando, o passo vira este. */
const HOLD_FAST_AFTER = 12
const HOLD_FAST_STEP = 50
/** Fichas rápidas. O mínimo e o limite entram sozinhos. */
const PRESETS = [50, 100, 250, 500, 1000, 2500] as const
/** Primeira aposta da janela: nem o mínimo (tímido) nem o teto (afobado). */
const DEFAULT_AMOUNT = 50
/**
 * O último valor escolhido, pra próxima aposta já nascer nele. Vive enquanto a
 * janela vive — minimizar a sobreposição zera, o que é o certo pra "o de agora
 * há pouco".
 */
let lastAmount: number | null = null

export type BetSide = 'win' | 'loss'
export type BetMode = { kind: 'target' } | { kind: 'self'; multiplier: number }

/** Prende em [min, max] e arredonda pro passo. O mínimo e o limite são exatos. */
export function snapAmount(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || max <= min) return min
  const snapped = min + Math.round((value - min) / STEP) * STEP
  return Math.max(min, Math.min(max, snapped))
}

/**
 * As fichas que cabem no intervalo. A última é SEMPRE o limite: é ela que diz
 * "daqui não passa" sem precisar de texto.
 */
export function quickAmounts(min: number, limit: number): number[] {
  const middle = PRESETS.filter((v) => v > min && v < limit)
  // Teto alto (sobe até 5000) traria seis fichas do meio. Saem as pequenas do
  // meio, e não as pontas: o 50 é o valor de sempre e as grandes são o motivo
  // de o teto ter subido.
  while (middle.length > 4) middle.splice(1, 1)
  const unique = [...new Set([min, ...middle, limit])]
  // Até cinco: mais que isso o botão deixa de ser alvo no meio de uma luta.
  // Sai o mínimo primeiro — a régua já começa nele.
  while (unique.length > 5) unique.shift()
  return unique
}

export function BetComposer({
  mode,
  min,
  max,
  coins,
  bettors,
  pool,
  closesAt,
  now,
  windowMs,
  onBet,
  className
}: {
  mode: BetMode
  /** Aposta mínima do sistema. */
  min: number
  /** Teto pessoal desta aposta, vindo do servidor. */
  max: number
  coins: number
  /** Apostadores distintos já na partida — a prévia do bônus conta você a mais. */
  bettors: number
  /** Pra dizer, em cada lado, pra onde a galera está indo. Só na aposta no colega. */
  pool?: { win: number; loss: number }
  /** Epoch ms do fim da janela de aposta. */
  closesAt: number
  now: number
  /** Tamanho da janela de aposta, pra barra do botão. */
  windowMs: number
  onBet: (side: BetSide, amount: number) => void
  className?: string
}) {
  /** Até onde dá pra ir AGORA: o teto do servidor ou a carteira, o menor. */
  const limit = Math.min(max, coins)
  const canBet = limit >= min
  const walletBound = coins < max

  const [side, setSide] = React.useState<BetSide>('win')
  const [amount, setAmount] = React.useState(() =>
    snapAmount(lastAmount ?? DEFAULT_AMOUNT, min, Math.max(min, limit))
  )
  const [sending, lock] = useSendLock()

  // Os limites de agora, legíveis de dentro do timer de segurar e da roda do
  // mouse sem virar dependência — eles mudam a cada retrato.
  const boundsRef = React.useRef({ min, limit: Math.max(min, limit) })
  boundsRef.current = { min, limit: Math.max(min, limit) }

  const pick = React.useCallback((value: number) => {
    const next = snapAmount(value, boundsRef.current.min, boundsRef.current.limit)
    lastAmount = next
    setAmount(next)
  }, [])

  const stepBy = React.useCallback((delta: number) => {
    setAmount((current) => {
      const next = snapAmount(current + delta, boundsRef.current.min, boundsRef.current.limit)
      lastAmount = next
      return next
    })
  }, [])

  // O limite pode encolher com o formulário aberto (o saldo caiu numa outra
  // aposta): o valor escolhido não pode ficar acima dele.
  React.useEffect(() => {
    setAmount((current) => snapAmount(current, min, Math.max(min, limit)))
  }, [min, limit])

  const left = countdown(closesAt, now)
  const fraction = windowLeft(closesAt, now, windowMs)
  const chosen: BetSide = mode.kind === 'self' ? 'win' : side
  const payout = mode.kind === 'self' ? Math.round(amount * mode.multiplier) : amount * 2
  const bonus = groupBonusPreview(amount, bettors + 1)

  const total = (pool?.win ?? 0) + (pool?.loss ?? 0)
  const winShare = total > 0 ? Math.round(((pool?.win ?? 0) / total) * 100) : null

  const confirm = (): void => {
    if (sending || !canBet || !left) return
    lock()
    onBet(chosen, amount)
  }

  return (
    <div className={cn('ov-pop space-y-2', className)}>
      {mode.kind === 'self' ? (
        <div className="flex items-center justify-between rounded-brutal border border-acid-dark/60 bg-acid/10 px-2.5 py-1.5 text-[11.5px]">
          <span className="flex items-center gap-1.5 font-medium text-acid-text">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            sua vitória
          </span>
          <span
            className="font-mono font-bold tabular-nums text-burn"
            title="Quanto cada murcho apostado volta se você ganhar. Sai da sua winrate recente."
          >
            {mode.multiplier.toFixed(2).replace('.', ',')}x
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1" role="group" aria-label="Lado da aposta">
          <SideButton
            active={side === 'win'}
            tone="acid"
            share={winShare}
            onClick={() => setSide('win')}
            icon={<TrendingUp className="h-3.5 w-3.5" aria-hidden />}
          >
            vitória
          </SideButton>
          <SideButton
            active={side === 'loss'}
            tone="destructive"
            share={winShare === null ? null : 100 - winShare}
            onClick={() => setSide('loss')}
            icon={<TrendingDown className="h-3.5 w-3.5" aria-hidden />}
          >
            derrota
          </SideButton>
        </div>
      )}

      {!canBet ? (
        <p className="text-[11.5px] leading-snug text-destructive">
          Você não tem murchos pra apostar{mode.kind === 'self' ? ' em você' : ''} — o mínimo é{' '}
          <span className="font-mono">{min}</span>.
        </p>
      ) : (
        <>
          <AmountPicker amount={amount} min={min} limit={limit} onPick={pick} onStep={stepBy} />

          <QuickChips
            amount={amount}
            chips={quickAmounts(min, limit)}
            limit={limit}
            walletBound={walletBound}
            onPick={pick}
          />

          <div className="flex items-center justify-between gap-2 text-[11.5px] leading-tight text-muted-foreground">
            <p className="min-w-0 truncate">
              volta{' '}
              <span className="font-mono font-semibold tabular-nums text-acid-text">{payout}</span>
              {bonus > 0 ? (
                <span
                  className="text-burn"
                  title="Bônus de grupo: +15% por pessoa a mais apostando na partida, até 5. Sai do cofre da casa."
                >
                  {' '}
                  +{bonus} do grupo
                </span>
              ) : (
                <span title="Com mais alguém apostando na mesma partida, quem acerta ganha +15% por pessoa, até 5.">
                  {' '}
                  · +15% se mais alguém apostar
                </span>
              )}
            </p>
            <p className="shrink-0">
              fecha em{' '}
              <span className="font-mono tabular-nums text-foreground">{left ?? '0:00'}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={confirm}
            disabled={sending}
            className={cn(
              'relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-brutal px-3 py-2',
              'text-sm font-semibold transition-[filter] hover:brightness-110',
              'disabled:cursor-not-allowed disabled:opacity-60',
              chosen === 'win'
                ? 'bg-acid text-primary-foreground shadow-neon-2'
                : 'bg-destructive text-destructive-foreground'
            )}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <BetIcon className="h-4 w-4" aria-hidden />
            )}
            <span>
              Apostar <span className="font-mono tabular-nums">{amount}</span> em{' '}
              {mode.kind === 'self' ? 'mim' : chosen === 'win' ? 'vitória' : 'derrota'}
            </span>
            {/* A janela esvaziando, dentro do próprio botão: quem está com o
                mouse em cima dele vê quanto tempo ainda tem sem desviar o olho. */}
            <span
              aria-hidden
              className="absolute bottom-0 left-0 h-0.5 bg-current opacity-30 transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.round(fraction * 100)}%` }}
            />
          </button>
        </>
      )}
    </div>
  )
}

// ============================================
// O VALOR
// ============================================

/**
 * O seletor de quantia: − e + em volta do número, e a régua embaixo.
 *
 * A régua é desenhada à mão, e não um `<input type="range">`: o controle nativo
 * precisa de foco pra responder a teclado (que não existe aqui) e desenha o
 * polegar do sistema, que destoa de tudo. Com ponteiro puro ela se comporta
 * igual ao arrasto da aba: ouvintes na `window` enquanto arrasta, porque um
 * mouse rápido sai do elemento antes do `pointerup`.
 */
function AmountPicker({
  amount,
  min,
  limit,
  onPick,
  onStep
}: {
  amount: number
  min: number
  limit: number
  onPick: (value: number) => void
  onStep: (delta: number) => void
}) {
  const boxRef = React.useRef<HTMLDivElement | null>(null)
  const trackRef = React.useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const onStepRef = React.useRef(onStep)
  onStepRef.current = onStep
  const hold = useHoldRepeat(onStep)

  /**
   * A roda do mouse em cima do valor anda de 10 em 10. Ouvinte NATIVO e não
   * passivo de propósito: o React registra `onWheel` como passivo, e sem o
   * `preventDefault` a roda também rolaria o painel inteiro por baixo da mão.
   */
  React.useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onWheel = (event: WheelEvent): void => {
      if (event.deltaY === 0) return
      event.preventDefault()
      onStepRef.current(event.deltaY < 0 ? STEP : -STEP)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const valueAt = (clientX: number): number => {
    const track = trackRef.current
    if (!track) return amount
    const rect = track.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)))
    return min + pct * (limit - min)
  }

  const startSlide = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    onPick(valueAt(event.clientX))
    setDragging(true)
    // Enquanto arrasta, a janela não pode largar o mouse: quem decide se ela
    // captura o ponteiro é o main, pelos retângulos publicados, e um arrasto
    // que sai 30px pra cima do painel perderia o polegar no meio do caminho.
    void window.bocas.overlay.setInteractive(true).catch(() => {})

    const onMove = (moveEvent: PointerEvent): void => onPick(valueAt(moveEvent.clientX))
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setDragging(false)
      void window.bocas.overlay.setInteractive(false).catch(() => {})
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const pct = limit > min ? ((amount - min) / (limit - min)) * 100 : 100
  const atMin = amount <= min
  const atMax = amount >= limit

  return (
    <div
      ref={boxRef}
      className="rounded-[10px] border border-line bg-void/60 px-2.5 pb-2 pt-2"
      title="Roda do mouse ajusta de 10 em 10"
    >
      <div className="flex items-center gap-2">
        <StepButton
          label="Menos 10 (segure pra correr)"
          muted={atMin}
          onPointerDown={hold.start(-1)}
          onPointerLeave={hold.stop}
        >
          <Minus className="h-4 w-4" aria-hidden />
        </StepButton>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
          <MurchosIcon className="h-4 w-4 shrink-0 text-burn" aria-hidden />
          <span
            aria-live="polite"
            className="font-mono text-[26px] font-bold leading-none tabular-nums text-foreground"
          >
            {amount}
          </span>
        </div>

        <StepButton
          label="Mais 10 (segure pra correr)"
          muted={atMax}
          onPointerDown={hold.start(1)}
          onPointerLeave={hold.stop}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </StepButton>
      </div>

      <div
        ref={trackRef}
        role="slider"
        aria-label="Valor da aposta"
        aria-valuemin={min}
        aria-valuemax={limit}
        aria-valuenow={amount}
        onPointerDown={startSlide}
        className={cn(
          'relative mt-2 h-5 cursor-pointer select-none touch-none',
          dragging && 'cursor-grabbing'
        )}
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-surface-raised">
          <div
            className={cn('h-full rounded-full bg-burn', !dragging && 'transition-[width] duration-150')}
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* Marcas nos quartos: referência pro olho, não parada pro polegar. */}
        {[25, 50, 75].map((mark) => (
          <span
            key={mark}
            aria-hidden
            className="absolute top-1/2 h-1.5 w-px -translate-y-1/2 bg-void/70"
            style={{ left: `${mark}%` }}
          />
        ))}
        <span
          aria-hidden
          className={cn(
            'absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-burn bg-void shadow-neon-1',
            dragging ? 'scale-110' : 'transition-[left] duration-150'
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/**
 * Segurar o − ou o + repete, e depois de um tanto anda de 50 em 50.
 *
 * O primeiro passo sai no `pointerdown` (e não no `click`) pra que segurar e
 * clicar sejam o mesmo gesto, sem passo em dobro. Soltar em qualquer lugar da
 * janela para — o dedo pode escorregar pra fora do botão.
 */
function useHoldRepeat(onStep: (delta: number) => void): {
  start: (direction: 1 | -1) => (event: React.PointerEvent) => void
  stop: () => void
} {
  const onStepRef = React.useRef(onStep)
  onStepRef.current = onStep
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const stop = React.useCallback((): void => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
  }, [])

  React.useEffect(() => stop, [stop])

  const start = React.useCallback(
    (direction: 1 | -1) =>
      (event: React.PointerEvent): void => {
        if (event.button !== 0) return
        event.preventDefault()
        stop()
        onStepRef.current(direction * STEP)
        let repeats = 0
        const tick = (): void => {
          repeats += 1
          onStepRef.current(direction * (repeats > HOLD_FAST_AFTER ? HOLD_FAST_STEP : STEP))
          timerRef.current = setTimeout(tick, HOLD_REPEAT_MS)
        }
        timerRef.current = setTimeout(tick, HOLD_DELAY_MS)
        window.addEventListener('pointerup', stop)
        window.addEventListener('pointercancel', stop)
      },
    [stop]
  )

  return { start, stop }
}

/**
 * Sem `disabled` de propósito: botão desabilitado não recebe `pointerdown`, e
 * aqui o limite é só visual — o passo já prende no mínimo e no teto.
 */
function StepButton({
  label,
  muted,
  onPointerDown,
  onPointerLeave,
  children
}: {
  label: string
  /** Chegou no fim: apaga, mas continua clicável (e inofensivo). */
  muted: boolean
  onPointerDown: (event: React.PointerEvent) => void
  onPointerLeave: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-disabled={muted}
      onPointerDown={onPointerDown}
      onPointerLeave={onPointerLeave}
      className={cn(
        'flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-brutal border transition-colors',
        muted
          ? 'border-line text-muted-foreground/50'
          : 'border-line bg-surface-raised/60 text-foreground hover:border-burn/60 hover:text-burn'
      )}
    >
      {children}
    </button>
  )
}

/** As fichas. A última é o limite e fica dourada mesmo sem estar escolhida. */
function QuickChips({
  amount,
  chips,
  limit,
  walletBound,
  onPick
}: {
  amount: number
  chips: number[]
  limit: number
  /** O limite é a carteira, não o teto do servidor. */
  walletBound: boolean
  onPick: (value: number) => void
}) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, chips.length)}, minmax(0, 1fr))` }}
    >
      {chips.map((value) => {
        const isLimit = value === limit
        const active = value === amount
        return (
          <button
            key={value}
            type="button"
            onClick={() => onPick(value)}
            aria-pressed={active}
            title={
              isLimit
                ? walletBound
                  ? 'Tudo que você tem'
                  : 'Seu teto nesta aposta — sobe a cada aposta feita'
                : undefined
            }
            className={cn(
              'rounded-brutal border py-1 font-mono text-xs tabular-nums transition-colors',
              active
                ? 'border-burn bg-burn/15 font-bold text-burn'
                : isLimit
                  ? 'border-burn/40 text-burn/80 hover:bg-burn/10'
                  : 'border-line text-muted-foreground hover:border-burn/50 hover:text-foreground'
            )}
          >
            {isLimit && walletBound && !active ? 'tudo' : value}
          </button>
        )
      })}
    </div>
  )
}

// ============================================
// O LADO
// ============================================

function SideButton({
  active,
  tone,
  share,
  onClick,
  icon,
  children
}: {
  active: boolean
  tone: 'acid' | 'destructive'
  /** Fatia da pool neste lado, em %. Null com a pool vazia. */
  share: number | null
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-brutal border px-2 py-1.5 text-xs font-medium transition-colors',
        active
          ? tone === 'acid'
            ? 'border-acid bg-acid/15 text-acid'
            : 'border-destructive bg-destructive/15 text-destructive'
          : 'border-line text-muted-foreground hover:border-line-strong hover:text-foreground'
      )}
    >
      {icon}
      {children}
      {share !== null && (
        <span
          className={cn('font-mono text-[11px] tabular-nums', active ? 'opacity-80' : 'opacity-60')}
          title="Quanto da pool está deste lado"
        >
          {share}%
        </span>
      )}
    </button>
  )
}
