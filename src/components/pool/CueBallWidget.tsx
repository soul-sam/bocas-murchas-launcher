import * as React from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLayout } from '@/lib/layout-context'
import { cn } from '@/lib/utils'

interface Props {
  sx: number
  sy: number
  onChange: (sx: number, sy: number) => void
  onCenter: () => void
  disabled?: boolean
  size?: number
}

const LIMIT = 0.6

/** Ponto de impacto na branca. sy > 0 = acima do centro (bola segue); sx > 0 = direita. */
export function CueBallWidget({ sx, sy, onChange, onCenter, disabled, size }: Props): JSX.Element {
  const { isPhone } = useLayout()
  const px = size ?? (isPhone ? 96 : 128)
  const ref = React.useRef<HTMLDivElement>(null)
  const dragging = React.useRef<number | null>(null)
  const live = React.useRef({ onChange, disabled })
  live.current = { onChange, disabled }

  const half = px / 2
  const emit = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // círculo inteiro = raio 1; tela Y cresce para baixo, sy cresce para cima
    live.current.onChange(((e.clientX - r.left) / r.width - 0.5) * 2, -((e.clientY - r.top) / r.height - 0.5) * 2)
  }

  React.useEffect(() => {
    if (disabled) dragging.current = null
  }, [disabled])

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={ref}
        aria-label="Ponto de impacto na bola branca"
        className={cn(
          'relative touch-none select-none rounded-full border border-line bg-card',
          disabled ? 'opacity-50' : 'cursor-crosshair',
        )}
        style={{ width: px, height: px }}
        onPointerDown={(e) => {
          if (live.current.disabled) return
          dragging.current = e.pointerId
          e.currentTarget.setPointerCapture(e.pointerId)
          emit(e)
        }}
        onPointerMove={(e) => { if (dragging.current === e.pointerId && !live.current.disabled) emit(e) }}
        onPointerUp={(e) => {
          if (dragging.current !== e.pointerId) return
          dragging.current = null
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
        }}
        onPointerCancel={() => { dragging.current = null }}
      >
        {/* círculo-limite do raio 0,6 */}
        <div
          className="pointer-events-none absolute rounded-full border border-foreground"
          style={{ opacity: 0.25, width: px * LIMIT, height: px * LIMIT, left: half - (px * LIMIT) / 2, top: half - (px * LIMIT) / 2 }}
        />
        <div
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-acid ring-1 ring-background"
          style={{ left: half + sx * half, top: half - sy * half }}
        />
      </div>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onCenter}>
        <RotateCcw className="h-3.5 w-3.5" /> Centralizar
      </Button>
      <p className="max-w-[10rem] text-center text-[11px] leading-tight text-muted-foreground">
        Cima: bola segue · Baixo: bola volta · Lados: efeito na tabela
      </p>
    </div>
  )
}
