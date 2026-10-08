import * as React from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLayout } from '@/lib/layout-context'
import { cn } from '@/lib/utils'
import { CUE_DOT_COLOR, cueBallSphereCss } from './draw'

interface Props {
  sx: number
  sy: number
  onChange: (sx: number, sy: number) => void
  onCenter: () => void
  disabled?: boolean
  size?: number
}

const LIMIT = 0.6

/**
 * Ponto de impacto na branca (o diagrama da bola do Side Pocket). sy > 0 =
 * acima do centro (bola segue); sx > 0 = direita. A bola é uma esfera de
 * verdade com a mira em cruz; o ponto vermelho é onde a sola do taco bate.
 */
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

  const sphere = React.useMemo(() => cueBallSphereCss(), [])
  const hint = sy > 0.2 ? 'Bola segue' : sy < -0.2 ? 'Bola volta' : Math.abs(sx) > 0.2 ? 'Efeito na tabela' : 'Tacada seca'

  return (
    <div className="pool-efeito">
      <div
        ref={ref}
        role="img"
        aria-label={`Ponto de impacto na bola branca: ${hint}`}
        className={cn('pool-efeito-bola', disabled && 'pool-efeito-bola--off')}
        style={{ width: px, height: px, background: sphere }}
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
        <span className="pool-efeito-cruz" aria-hidden />
        {/* círculo-limite do raio 0,6 */}
        <span
          className="pool-efeito-limite"
          aria-hidden
          style={{ width: px * LIMIT, height: px * LIMIT, left: half - (px * LIMIT) / 2, top: half - (px * LIMIT) / 2 }}
        />
        <span
          className="pool-efeito-ponto"
          aria-hidden
          style={{ left: half + sx * half, top: half - sy * half, background: CUE_DOT_COLOR }}
        />
      </div>
      <p className="pool-efeito-legenda" aria-hidden>
        {hint}
      </p>
      <Button type="button" variant="ghost" size="sm" disabled={disabled || (sx === 0 && sy === 0)} onClick={onCenter}>
        <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Centralizar
      </Button>
    </div>
  )
}
