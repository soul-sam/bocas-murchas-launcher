import * as React from 'react'
import { resolveAssetUrl } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * GLIFOS DO FUTEBOL — a bola da Arena e o escudo dos times.
 *
 * A bola é traço 2 em viewBox 24, como os ícones da casa (lib/bocas-icons):
 * o pentágono do meio e os cinco gomos indo até a borda. Nada de emoji (ver a
 * regra da casa: o ⚽ do sistema muda de cara em cada máquina).
 */

const BOLA = [
  'M12 8.6l3.2 2.3-1.2 3.8h-4l-1.2-3.8Z',
  'M12 8.6V3M15.2 10.9l5.3-1.7M14 14.7l3.3 4.5M10 14.7l-3.3 4.5M8.8 10.9 3.5 9.2'
]

export const FutebolIcon = React.forwardRef<
  SVGSVGElement,
  React.SVGProps<SVGSVGElement> & { strokeWidth?: number | string }
>(function FutebolIcon({ className, strokeWidth = 2, ...props }, ref) {
  const labelled = Boolean(props['aria-label'] || props['aria-labelledby'])
  return (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden={labelled ? undefined : true}
      role={labelled ? 'img' : undefined}
      className={className}
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      {BOLA.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
})

/**
 * Escudo do time (PNG da ESPN). Sem escudo, ou se a imagem falhar, a sigla
 * num quadrado com a cor do time — nunca um buraco quebrado na tabela.
 */
export function Escudo({
  src,
  sigla,
  cor,
  className
}: {
  src: string | null | undefined
  sigla: string
  cor?: string | null
  className?: string
}) {
  const [falhou, setFalhou] = React.useState(false)
  React.useEffect(() => setFalhou(false), [src])
  if (src && !falhou) {
    return (
      <img
        src={resolveAssetUrl(src)}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setFalhou(true)}
        className={cn('h-6 w-6 shrink-0 object-contain', className)}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-brutal border border-line bg-surface-raised font-mono text-[11px] leading-none text-foreground',
        className
      )}
      style={cor ? { borderColor: `#${cor}` } : undefined}
    >
      {(sigla || '?').slice(0, 3)}
    </span>
  )
}
