import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Anel de nível em volta do avatar.
 *
 * É um <rect> arredondado, não um círculo: o avatar da casa é quadrado com
 * canto de 4px, e um círculo em volta de um quadrado parece adesivo colado.
 * `pathLength="100"` normaliza o perímetro pra o dasharray virar porcentagem
 * direta, sem calcular perímetro de retângulo com canto.
 *
 * O número do nível fica numa etiqueta no canto de baixo, por cima do anel.
 */
export function LevelRing({
  level,
  progress,
  size = 64,
  stroke = 3,
  className,
  children
}: {
  level: number
  /** 0..1 — quanto do nível atual já foi. */
  progress: number
  /** Lado total do anel em px (o avatar vai dentro, menor). */
  size?: number
  stroke?: number
  className?: string
  children: React.ReactNode
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0))
  const inset = stroke / 2
  const side = size - stroke

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg
        className="pointer-events-none absolute inset-0"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        <rect
          x={inset}
          y={inset}
          width={side}
          height={side}
          rx={6}
          fill="none"
          stroke="#1a1a1a"
          strokeWidth={stroke}
        />
        <rect
          x={inset}
          y={inset}
          width={side}
          height={side}
          rx={6}
          fill="none"
          stroke="#6AFF00"
          strokeWidth={stroke}
          strokeLinecap="square"
          pathLength={100}
          strokeDasharray={`${clamped * 100} 100`}
          // Começa no topo, no meio, e corre no sentido do relógio.
          strokeDashoffset={-12.5}
          style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)' }}
        />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">{children}</div>

      <span
        title={`Nível ${level}`}
        className={cn(
          'absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-brutal border border-acid-dark bg-void px-1.5',
          'font-mono text-[9px] font-bold leading-4 text-acid'
        )}
      >
        {level}
      </span>
    </div>
  )
}

/** Anelzinho sem etiqueta, pra caber na barra lateral. */
export function LevelBadge({ level, className }: { level: number; className?: string }) {
  return (
    <span
      className={cn(
        'rounded-full border border-acid-dark bg-void px-1 font-mono text-[9px] font-bold leading-4 text-acid',
        className
      )}
      title={`Nível ${level}`}
    >
      {level}
    </span>
  )
}
