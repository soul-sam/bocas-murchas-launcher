import * as React from 'react'
import { cn } from '@/lib/utils'

interface Props {
  power: number
  onChange: (p: number) => void
  onRelease: () => void
  onCancel: () => void
  disabled?: boolean
  vertical?: boolean
  /** Pega o foco quando fica habilitada (Espaço funciona sem clicar), se ninguém estiver digitando. */
  focusOnEnable?: boolean
  /** Dica embaixo da barra (some no celular, onde a linha de controles é estreita). */
  hint?: boolean
}

const CANCEL_BELOW = 0.02
const KEY_PERIOD_MS = 1200
const MIN_TRAVEL_PX = 8
const FULL_AT = 0.7

/** Barra de força: arraste para baixo para carregar, solte para tacar; voltar ao topo cancela. */
export function PowerBar({ power, onChange, onRelease, onCancel, disabled, vertical = true, focusOnEnable, hint = true }: Props): JSX.Element {
  const trackRef = React.useRef<HTMLDivElement>(null)
  const live = React.useRef({ onChange, onRelease, onCancel, disabled, vertical, power })
  live.current = { onChange, onRelease, onCancel, disabled, vertical, power }
  const dragging = React.useRef<number | null>(null)
  const keyRaf = React.useRef<number | null>(null)
  // força mais recente emitida (o prop só chega no próximo render)
  const lastP = React.useRef(0)
  // posição (px) onde o arrasto começou e se já andou o bastante para valer como gesto
  const startPos = React.useRef(0)
  const travelled = React.useRef(false)

  const emit = (p: number) => { lastP.current = p; live.current.onChange(p) }

  const posOf = (e: React.PointerEvent): number => (live.current.vertical ? e.clientY : e.clientX)

  // força relativa ao ponto onde o dedo encostou: um toque simples não carrega nada
  const fromEvent = (e: React.PointerEvent): number => {
    const el = trackRef.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    const size = live.current.vertical ? r.height : r.width
    // 70% da barra já é força máxima: quem começa no meio ainda chega no 100%
    return Math.min(1, Math.max(0, (posOf(e) - startPos.current) / (FULL_AT * size)))
  }

  const stopKey = React.useCallback(() => {
    if (keyRaf.current != null) cancelAnimationFrame(keyRaf.current)
    keyRaf.current = null
  }, [])
  React.useEffect(() => stopKey, [stopKey])
  React.useEffect(() => {
    if (disabled) {
      const was = dragging.current != null || keyRaf.current != null
      stopKey()
      dragging.current = null
      if (was) live.current.onCancel()
    }
  }, [disabled, stopKey])

  React.useEffect(() => {
    if (disabled || !focusOnEnable) return
    const a = document.activeElement as HTMLElement | null
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return
    trackRef.current?.focus({ preventScroll: true })
  }, [disabled, focusOnEnable])

  const finish = (shoot: boolean) => {
    const c = live.current
    if (shoot && lastP.current > CANCEL_BELOW) c.onRelease(); else c.onCancel()
  }

  const startKey = () => {
    if (keyRaf.current != null) return
    const t0 = performance.now()
    const tick = (now: number) => {
      const ph = ((now - t0) / KEY_PERIOD_MS) % 2 // ping-pong 0..1..0
      emit(ph <= 1 ? ph : 2 - ph)
      keyRaf.current = requestAnimationFrame(tick)
    }
    keyRaf.current = requestAnimationFrame(tick)
  }

  const pct = Math.round(power * 100)
  return (
    <div className={cn('flex select-none flex-col gap-2', vertical && 'items-center')}>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Força da tacada"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-disabled={disabled}
        className={cn(
          'relative touch-none overflow-hidden rounded-md border border-line bg-card outline-none focus-visible:ring-2 focus-visible:ring-acid',
          vertical ? 'h-48 w-8' : 'h-8 w-full',
          disabled ? 'opacity-50' : 'cursor-pointer',
        )}
        onPointerDown={(e) => {
          if (live.current.disabled) return
          dragging.current = e.pointerId
          startPos.current = posOf(e)
          travelled.current = false
          e.currentTarget.setPointerCapture(e.pointerId)
          emit(0)
        }}
        onPointerMove={(e) => {
          if (dragging.current !== e.pointerId || live.current.disabled) return
          if (Math.abs(posOf(e) - startPos.current) >= MIN_TRAVEL_PX) travelled.current = true
          emit(fromEvent(e))
        }}
        onPointerUp={(e) => {
          if (dragging.current !== e.pointerId) return
          dragging.current = null
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
          finish(travelled.current)
        }}
        onPointerCancel={(e) => {
          if (dragging.current !== e.pointerId) return
          dragging.current = null
          finish(false)
        }}
        onKeyDown={(e) => {
          if (e.code !== 'Space' || live.current.disabled || dragging.current != null) return
          e.preventDefault()
          if (!e.repeat) startKey()
        }}
        onKeyUp={(e) => {
          if (e.code !== 'Space' || keyRaf.current == null) return
          e.preventDefault()
          stopKey()
          finish(true)
        }}
        onBlur={() => {
          if (keyRaf.current != null) { stopKey(); finish(false) }
        }}
      >
        <div
          className="absolute bg-acid"
          style={vertical ? { left: 0, right: 0, top: 0, height: `${pct}%` } : { top: 0, bottom: 0, left: 0, width: `${pct}%` }}
        />
      </div>
      {hint && (
        <p className="max-w-[10rem] text-center text-[11px] leading-tight text-muted-foreground">
          Segure e arraste para baixo · solte para tacar
        </p>
      )}
    </div>
  )
}
