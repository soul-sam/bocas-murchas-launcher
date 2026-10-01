import * as React from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { cn, formatClock } from '@/lib/utils'

/**
 * AS PEÇAS DA SOBREPOSIÇÃO — o vocabulário visual que as telas dela dividem.
 *
 * A janela é outra árvore React, sem providers (ver src/overlay.tsx), então
 * NADA aqui pode importar de contexto, de api ou de componente do app: arrastar
 * qualquer um deles traria a árvore autenticada inteira pra dentro de uma
 * janela que não tem login. Por isso o anel de nível e a barra de pool são
 * cópias enxutas dos do launcher (LevelRing, BetPopover), e não imports.
 *
 * A linguagem é a do launcher: superfície chapada, borda de 1px, raio 6 nas
 * peças e 10 nos cartões, verde ácido pra estado/ação, dourado (`burn`) pra
 * murchos e tempo, mono pra número. Gamificação aqui é INFORMAÇÃO — nível, XP,
 * sequência, odds, quanto volta — e não enfeite.
 */

// ============================================
// FORMATAÇÃO
// ============================================

/** 1200 -> 1,2k. Cópia enxuta do formatCompact de lib/api-gamification. */
export function compact(value: number): string {
  if (value < 1000) return String(Math.round(value))
  return `${(value / 1000).toFixed(1).replace(/\.0$/, '').replace('.', ',')}k`
}

/**
 * "2:41" até a janela de aposta fechar; null quando já fechou (ou quando o
 * servidor ainda não disse quando fecha). O `now` vem do relógio único da
 * janela — ver useOverlayClock.
 */
export function countdown(closesAt: number, now: number): string | null {
  if (!closesAt) return null
  const left = Math.round((closesAt - now) / 1000)
  return left > 0 ? formatClock(left) : null
}

/** 0..1 do tempo que sobra de uma janela de `total` ms. */
export function windowLeft(closesAt: number, now: number, total: number): number {
  if (!closesAt) return 0
  return Math.max(0, Math.min(1, (closesAt - now) / total))
}

/** ["Ana", "Bia", "Cris"] -> "Ana, Bia e Cris". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
}

/** "agora", "3 min", "1 h". */
export function ago(at: number, now: number): string {
  const min = Math.floor((now - at) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h`
}

/**
 * "Control+Shift+1" -> "Ctrl+Shift+1".
 *
 * Cópia enxuta do `formatAccelerator` de components/social/HotkeyRecorder, e
 * sem os espaços que ele põe em volta do "+": o gomo da roda tem 7rem, e
 * "Ctrl + Shift + 1" não cabe.
 */
export function shortKey(accelerator: string): string {
  return accelerator.replace('Control', 'Ctrl').replace('Super', 'Win').replace('Return', 'Enter')
}

// ============================================
// NÍVEL, XP E A LOGO
// ============================================

/**
 * Anel de XP — o mesmo desenho do LevelRing do launcher, só que redondo, porque
 * a logo da sobreposição é uma medalha.
 *
 * `pathLength=100` deixa o `dasharray` em porcentagem direta. `mirrored` faz o
 * arco CRESCER PELA ESQUERDA: a logo fora de partida vive metade escondida atrás
 * da borda direita, e um arco que começasse pelo topo no sentido do relógio
 * gastaria os primeiros 50% do nível justamente na metade que ninguém vê.
 */
export function XpRing({
  progress,
  size,
  stroke = 3,
  mirrored = false,
  className,
  children
}: {
  /** 0..1 — quanto do nível atual já foi. */
  progress: number
  size: number
  stroke?: number
  mirrored?: boolean
  className?: string
  children?: React.ReactNode
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0))
  const radius = (size - stroke) / 2

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg
        className="pointer-events-none absolute inset-0"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--border-strong))"
          strokeWidth={stroke}
        />
        {/* Sem XP no nível, nada: `round` desenharia uma bolinha no topo. */}
        {clamped > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--acid))"
            strokeWidth={stroke}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${clamped * 100} 100`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)' }}
          />
        )}
      </svg>
      {children}
    </div>
  )
}

/** A medalha: a logo da casa dentro do anel de XP. */
export function Medallion({
  progress,
  size,
  mirrored,
  className
}: {
  progress: number
  size: number
  mirrored?: boolean
  className?: string
}) {
  return (
    <XpRing progress={progress} size={size} mirrored={mirrored} className={className}>
      <div className="absolute inset-[5px] flex items-center justify-center rounded-full bg-void">
        <img
          src="bocas-murchas-transp.png"
          alt=""
          draggable={false}
          className="h-[74%] w-[74%] select-none object-contain"
        />
      </div>
    </XpRing>
  )
}

/** A etiqueta do nível — a mesma do LevelBadge do launcher. */
export function LevelTag({ level, className }: { level: number; className?: string }) {
  return (
    <span
      className={cn(
        'rounded-full border border-acid-dark bg-void px-1.5 font-mono text-[11px] font-bold leading-4 text-acid',
        className
      )}
    >
      {level}
    </span>
  )
}

/** Barra de XP do nível atual. */
export function XpBar({ progress, className }: { progress: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0)) * 100
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-line-strong', className)}>
      <div
        className="h-full rounded-full bg-acid transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ============================================
// PEÇAS DE TELA
// ============================================

/** Título de seção. É h3 de propósito: mono caixa-alta espaçada é rótulo de SEÇÃO. */
export function SectionTitle({
  children,
  aside
}: {
  children: React.ReactNode
  aside?: React.ReactNode
}) {
  return (
    <h3 className="mb-1.5 flex items-center justify-between gap-2 font-mono text-[11px] font-normal uppercase tracking-widest text-muted-foreground">
      <span>{children}</span>
      {aside}
    </h3>
  )
}

/** Pastilha de informação: murchos, sequência, fila, tempo. */
export function Chip({
  tone = 'neutral',
  className,
  children
}: {
  tone?: 'neutral' | 'burn' | 'acid' | 'danger'
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] leading-4',
        tone === 'neutral' && 'border-line bg-surface-raised/60 text-muted-foreground',
        tone === 'burn' && 'border-burn/40 bg-burn/10 text-burn',
        tone === 'acid' && 'border-acid-dark/60 bg-acid/10 text-acid-text',
        tone === 'danger' && 'border-destructive/40 bg-destructive/10 text-destructive',
        className
      )}
    >
      {children}
    </span>
  )
}

export function IconButton({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-brutal text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
    >
      {children}
    </button>
  )
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <p className="py-1 text-[11.5px] leading-snug text-muted-foreground">{children}</p>
}

/**
 * Barra de pool, vitória × derrota.
 *
 * Segunda cópia da de components/social/BetPopover.tsx, e de propósito — ver o
 * cabeçalho do arquivo. O meio fica como divisória de 2px: com a pool vazia
 * (50/50 apagado) a barra ainda lê como "duas metades", e não como uma faixa
 * lisa que parece quebrada.
 */
export function PoolBar({
  pool,
  thick,
  className
}: {
  pool: { win: number; loss: number }
  thick?: boolean
  className?: string
}) {
  const win = Math.max(0, pool?.win ?? 0)
  const loss = Math.max(0, pool?.loss ?? 0)
  const total = win + loss
  const winPct = total > 0 ? Math.round((win / total) * 100) : 50

  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between text-[11.5px]">
        <span className="flex items-center gap-1 text-acid-text">
          <TrendingUp className="h-3 w-3" aria-hidden />
          <span className="font-mono font-semibold">{compact(win)}</span>
          <span className="text-muted-foreground">vitória</span>
        </span>
        <span className="flex items-center gap-1 text-destructive">
          <span className="text-muted-foreground">derrota</span>
          <span className="font-mono font-semibold">{compact(loss)}</span>
          <TrendingDown className="h-3 w-3" aria-hidden />
        </span>
      </div>
      <div className={cn('flex w-full gap-0.5 overflow-hidden rounded-full bg-surface-raised', thick ? 'h-2' : 'h-1.5')}>
        <div
          className={cn(
            'h-full rounded-l-full transition-[width] duration-500',
            total > 0 ? 'bg-acid' : 'bg-acid/30'
          )}
          style={{ width: `${winPct}%` }}
        />
        <div
          className={cn(
            'h-full rounded-r-full transition-[width] duration-500',
            total > 0 ? 'bg-destructive' : 'bg-destructive/30'
          )}
          style={{ width: `${100 - winPct}%` }}
        />
      </div>
    </div>
  )
}

/** Faixa que esvazia até a aposta fechar. */
export function WindowBar({ fraction, className }: { fraction: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100
  return (
    <div className={cn('h-1 w-full overflow-hidden rounded-full bg-surface-raised', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-1000 ease-linear',
          pct < 25 ? 'bg-destructive' : 'bg-burn'
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/**
 * Trava do botão de aposta. O resultado volta como aviso no próximo retrato, e
 * a linha inteira é trocada quando a aposta entra — mas se der ERRO (saldo,
 * janela fechada) o componente continua o mesmo e o botão ficaria preso pra
 * sempre. Soltar depois de uns segundos devolve a tentativa sem abrir a porta
 * pra aposta em dobro num clique nervoso.
 */
export function useSendLock(ms = 3_500): [boolean, () => void] {
  const [locked, setLocked] = React.useState(false)

  React.useEffect(() => {
    if (!locked) return
    const timer = setTimeout(() => setLocked(false), ms)
    return () => clearTimeout(timer)
  }, [locked, ms])

  return [locked, React.useCallback(() => setLocked(true), [])]
}
