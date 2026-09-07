import * as React from 'react'
import { cn } from '@/lib/utils'
import { dbToMeter, GATE_OFF_DB } from '@/lib/audio-processor'

/**
 * Barra de nível do microfone.
 *
 * Lê o nível por requestAnimationFrame e escreve DIRETO no DOM. Passar por
 * setState seria 60 renders por segundo dentro do diálogo de configurações —
 * e o React re-renderizaria a aba inteira junto, sliders e tudo.
 *
 * Verde quando o gate está aberto (transmitindo), cinza quando fechado. O
 * marcador vertical é o limiar: o que fica à esquerda dele não sai.
 */
export function MicMeter({
  getLevel,
  isOpen,
  threshold,
  className
}: {
  /** 0..100 — ver MicProcessor.getLevel. */
  getLevel: () => number
  isOpen: () => boolean
  /** Limiar em dBFS; GATE_OFF_DB (-100) esconde o marcador. */
  threshold: number
  className?: string
}) {
  const barRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    let frame = 0
    let lastOpen: boolean | null = null

    const draw = (): void => {
      const bar = barRef.current
      if (bar) {
        bar.style.transform = `scaleX(${getLevel() / 100})`

        // Só mexe na classe quando o estado muda: trocar className todo frame
        // força o navegador a recalcular estilo à toa.
        const open = isOpen()
        if (open !== lastOpen) {
          lastOpen = open
          bar.classList.toggle('bg-acid', open)
          bar.classList.toggle('shadow-[0_0_8px_rgb(var(--neon-rgb)/0.3)]', open)
          bar.classList.toggle('bg-surface-strong', !open)
        }
      }
      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [getLevel, isOpen])

  const gateOn = threshold > GATE_OFF_DB
  const markerPercent = dbToMeter(threshold)

  return (
    <div
      className={cn(
        'relative h-3 w-full overflow-hidden rounded-brutal border border-line bg-void',
        className
      )}
      role="meter"
      aria-label="Nível do microfone"
    >
      <div
        ref={barRef}
        className="h-full w-full origin-left bg-surface-strong transition-none"
        style={{ transform: 'scaleX(0)' }}
      />

      {gateOn && (
        <div
          aria-hidden
          className="absolute inset-y-0 w-0.5 bg-burn shadow-[0_0_6px_rgba(242,183,5,0.8)]"
          style={{ left: `calc(${markerPercent}% - 1px)` }}
        />
      )}
    </div>
  )
}
