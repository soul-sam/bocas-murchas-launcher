import * as React from 'react'
import { Play, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  TRIM_MIN_MS,
  buildPeaks,
  formatTrimTime,
  getAudioContext,
  playRegion,
  type RegionPlayback
} from '@/lib/audio-trim'

/**
 * CORTADOR DE ÁUDIO — forma de onda com duas alças.
 *
 * Existe porque o soundboard aceita 8 segundos e a piada mora no meio de um
 * vídeo de três minutos. Antes desta tela, arquivo comprido era recusado com
 * um "máximo 8s" e a pessoa tinha que ir cortar em outro programa — que é
 * pedir pra ninguém subir som nenhum.
 *
 * O desenho é canvas porque são centenas de barrinhas que se redesenham a cada
 * quadro enquanto a alça é arrastada; o mesmo em <div> seria um reflow do
 * painel inteiro por pixel de arrasto. As ALÇAS, essas, são DOM de verdade —
 * precisam de foco, de anel de foco e de seta do teclado, e nada disso existe
 * dentro de um canvas.
 *
 * O que se ouve aqui é o que vai ser salvo: mesmo buffer, mesmas rampas de
 * entrada e saída (ver lib/audio-trim).
 */

const HEIGHT = 76
const BAR = 2
const GAP = 1

/** Passo das setas do teclado na alça. Shift multiplica por 10. */
const NUDGE_MS = 50

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

export interface TrimRange {
  startMs: number
  endMs: number
}

export function AudioTrimmer({
  buffer,
  range,
  maxDurationMs,
  volume,
  onChange
}: {
  buffer: AudioBuffer
  range: TrimRange
  /** Teto do trecho. As alças não deixam passar disso. */
  maxDurationMs: number
  /** Volume da escuta, pra bater com o do soundboard. */
  volume: number
  onChange: (range: TrimRange) => void
}) {
  const trackRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)

  const [width, setWidth] = React.useState(0)
  const [dragging, setDragging] = React.useState<'start' | 'end' | 'move' | null>(null)
  const [playheadMs, setPlayheadMs] = React.useState<number | null>(null)

  const totalMs = buffer.duration * 1000
  const lengthMs = range.endMs - range.startMs

  // O arrasto lê a faixa ATUAL. Os ouvintes de ponteiro são registrados uma vez
  // por arrasto: sem a ref, cada movimento usaria a faixa do render em que o
  // arrasto começou e a alça andaria sozinha de volta.
  const rangeRef = React.useRef(range)
  rangeRef.current = range

  // --- largura ------------------------------------------------------------
  React.useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width))
    })
    observer.observe(track)
    setWidth(Math.round(track.getBoundingClientRect().width))
    return () => observer.disconnect()
  }, [])

  const columns = width > 0 ? Math.max(1, Math.floor(width / (BAR + GAP))) : 0
  const peaks = React.useMemo(
    () => (columns > 0 ? buildPeaks(buffer, columns) : new Float32Array(0)),
    [buffer, columns]
  )

  // --- desenho ------------------------------------------------------------
  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width === 0 || peaks.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // As cores saem das variáveis do tema (globals.css): canvas não herda
    // classe do Tailwind, e cor fixa aqui quebraria os cinco temas.
    const css = getComputedStyle(canvas)
    const token = (name: string, alpha?: number): string => {
      const value = css.getPropertyValue(name).trim()
      return alpha === undefined ? `hsl(${value})` : `hsl(${value} / ${alpha})`
    }
    const selectedColor = token('--acid')
    const restColor = token('--muted-foreground', 0.45)
    const headColor = token('--foreground')

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(HEIGHT * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, HEIGHT)

    const middle = HEIGHT / 2
    for (let i = 0; i < peaks.length; i++) {
      const at = ((i + 0.5) / peaks.length) * totalMs
      const selected = at >= range.startMs && at <= range.endMs
      // Piso de 2px: coluna de silêncio vira um ponto na linha do meio, o que
      // mostra ONDE está o silêncio em vez de abrir um buraco no desenho.
      const bar = Math.max(2, peaks[i] * (HEIGHT - 8))
      ctx.fillStyle = selected ? selectedColor : restColor
      ctx.fillRect(i * (BAR + GAP), middle - bar / 2, BAR, bar)
    }

    if (playheadMs !== null && totalMs > 0) {
      ctx.fillStyle = headColor
      ctx.fillRect(clamp((playheadMs / totalMs) * width, 0, width - 2), 0, 2, HEIGHT)
    }
  }, [peaks, width, totalMs, range.startMs, range.endMs, playheadMs])

  // --- escuta -------------------------------------------------------------
  const playbackRef = React.useRef<RegionPlayback | null>(null)
  const frameRef = React.useRef(0)

  const stop = React.useCallback(() => {
    playbackRef.current?.stop()
    playbackRef.current = null
    cancelAnimationFrame(frameRef.current)
    setPlayheadMs(null)
  }, [])

  // Mexeu na faixa com o som no ar? Para. Continuar tocando o trecho antigo
  // enquanto a alça mostra outro é mentir sobre o que vai ser salvo.
  React.useEffect(() => {
    if (playbackRef.current) stop()
  }, [range.startMs, range.endMs, stop])

  React.useEffect(() => stop, [stop])

  const play = (): void => {
    if (playbackRef.current) {
      stop()
      return
    }

    const { startMs, endMs } = rangeRef.current
    const playback = playRegion(buffer, startMs, endMs, volume, () => {
      // `onended` também dispara no stop() — e aí playbackRef já está limpa.
      if (!playbackRef.current) return
      playbackRef.current = null
      cancelAnimationFrame(frameRef.current)
      setPlayheadMs(null)
    })
    playbackRef.current = playback

    const tick = (): void => {
      if (!playbackRef.current) return
      // A régua é a do AudioContext, não a do performance.now(): é ela que
      // conta o som que está saindo pela placa.
      const elapsed = (getAudioContext().currentTime - playback.startedAt) * 1000
      setPlayheadMs(Math.min(endMs, startMs + elapsed))
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
  }

  // --- arrasto ------------------------------------------------------------
  const grabRef = React.useRef(0)

  const msAt = (clientX: number): number => {
    const track = trackRef.current
    if (!track || totalMs === 0) return 0
    const rect = track.getBoundingClientRect()
    return clamp((clientX - rect.left) / rect.width, 0, 1) * totalMs
  }

  const moveStart = (ms: number): void => {
    const { endMs } = rangeRef.current
    onChange({
      startMs: clamp(ms, Math.max(0, endMs - maxDurationMs), endMs - TRIM_MIN_MS),
      endMs
    })
  }

  const moveEnd = (ms: number): void => {
    const { startMs } = rangeRef.current
    onChange({
      startMs,
      endMs: clamp(ms, startMs + TRIM_MIN_MS, Math.min(totalMs, startMs + maxDurationMs))
    })
  }

  const dragTo = (kind: 'start' | 'end' | 'move', ms: number): void => {
    if (kind === 'start') return moveStart(ms)
    if (kind === 'end') return moveEnd(ms)
    const { startMs, endMs } = rangeRef.current
    const span = endMs - startMs
    const next = clamp(ms - grabRef.current, 0, Math.max(0, totalMs - span))
    onChange({ startMs: next, endMs: next + span })
  }

  // Reatribuída a cada render, então o ouvinte de `pointermove` — registrado
  // uma vez por arrasto — sempre chama a versão nova.
  const dragMoveRef = React.useRef<(clientX: number) => void>(() => {})
  dragMoveRef.current = (clientX) => {
    if (dragging) dragTo(dragging, msAt(clientX))
  }

  const beginDrag = (kind: 'start' | 'end' | 'move', event: React.PointerEvent): void => {
    event.preventDefault()
    const ms = msAt(event.clientX)
    const { startMs, endMs } = rangeRef.current
    // Arrastar a faixa segura o ponto onde a mão pegou; clicar FORA dela
    // centraliza, porque não há ponto pego — e uma faixa que pula com a borda
    // grudada no cursor parece que escapou.
    grabRef.current =
      kind === 'move' && ms >= startMs && ms <= endMs ? ms - startMs : (endMs - startMs) / 2
    setDragging(kind)
    if (kind === 'move') dragTo(kind, ms)
  }

  React.useEffect(() => {
    if (!dragging) return
    const move = (event: PointerEvent): void => dragMoveRef.current(event.clientX)
    const done = (): void => setDragging(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', done)
    window.addEventListener('pointercancel', done)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', done)
      window.removeEventListener('pointercancel', done)
    }
  }, [dragging])

  const nudge = (kind: 'start' | 'end', event: React.KeyboardEvent): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = (event.shiftKey ? NUDGE_MS * 10 : NUDGE_MS) * (event.key === 'ArrowLeft' ? -1 : 1)
    const { startMs, endMs } = rangeRef.current
    if (kind === 'start') moveStart(startMs + step)
    else moveEnd(endMs + step)
  }

  const pct = (ms: number): string => `${totalMs > 0 ? (ms / totalMs) * 100 : 0}%`
  const playing = playheadMs !== null
  const whole = lengthMs >= totalMs - 1

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'relative select-none rounded-brutal border border-line bg-void/60 px-2 py-2',
          dragging === 'move' && 'cursor-grabbing'
        )}
      >
        <div ref={trackRef} className="relative" style={{ height: HEIGHT }}>
          <canvas
            ref={canvasRef}
            onPointerDown={(e) => beginDrag('move', e)}
            style={{ height: HEIGHT }}
            className="block w-full cursor-pointer"
          />

          {/* A faixa escolhida. Pega o clique antes do canvas pra poder ser
              arrastada inteira sem recentralizar debaixo do cursor. */}
          <div
            onPointerDown={(e) => beginDrag('move', e)}
            role="presentation"
            style={{ left: pct(range.startMs), width: pct(lengthMs) }}
            className={cn(
              'absolute inset-y-0 border-x-2 border-acid bg-acid/10',
              dragging === 'move' ? 'cursor-grabbing' : 'cursor-grab'
            )}
          />

          <Handle
            label="Início do trecho"
            position={pct(range.startMs)}
            valueMs={range.startMs}
            maxMs={totalMs}
            active={dragging === 'start'}
            onGrab={(e) => beginDrag('start', e)}
            onKeyDown={(e) => nudge('start', e)}
          />
          <Handle
            label="Fim do trecho"
            position={pct(range.endMs)}
            valueMs={range.endMs}
            maxMs={totalMs}
            active={dragging === 'end'}
            onGrab={(e) => beginDrag('end', e)}
            onKeyDown={(e) => nudge('end', e)}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={play}
          className={cn(
            'flex h-8 shrink-0 items-center gap-1.5 rounded-brutal border px-2.5 text-[11.5px] transition-colors',
            playing
              ? 'border-acid bg-acid/10 text-acid'
              : 'border-line text-foreground hover:border-acid/50 hover:bg-acid/5'
          )}
        >
          {playing ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {playing ? 'parar' : 'ouvir trecho'}
        </button>

        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground">
          {whole ? 'arquivo inteiro' : `${formatTrimTime(range.startMs)} → ${formatTrimTime(range.endMs)}`}
        </span>

        <span className="shrink-0 font-mono text-[11.5px] text-acid-text">
          {formatTrimTime(lengthMs)}
        </span>
      </div>
    </div>
  )
}

/**
 * Uma alça.
 *
 * `role="slider"` não é enfeite: sem ele o trecho só existe pra quem tem mouse
 * preciso, e acertar 100ms arrastando num canvas de 300px é sorte. As setas
 * dão o ajuste fino que o arrasto não dá.
 */
function Handle({
  label,
  position,
  valueMs,
  maxMs,
  active,
  onGrab,
  onKeyDown
}: {
  label: string
  position: string
  valueMs: number
  maxMs: number
  active: boolean
  onGrab: (event: React.PointerEvent) => void
  onKeyDown: (event: React.KeyboardEvent) => void
}) {
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(maxMs)}
      aria-valuenow={Math.round(valueMs)}
      aria-valuetext={formatTrimTime(valueMs)}
      title={label}
      onPointerDown={(event) => {
        // `beginDrag` chama preventDefault (pra não selecionar texto), e isso
        // também engole o foco — que é justamente o que o teclado precisa.
        event.currentTarget.focus()
        onGrab(event)
      }}
      onKeyDown={onKeyDown}
      style={{ left: position }}
      className={cn(
        'absolute inset-y-0 -ml-2 flex w-4 cursor-ew-resize items-center justify-center rounded-brutal',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <span
        className={cn('h-full w-1.5 rounded-brutal bg-acid transition-transform', active && 'scale-x-150')}
      />
    </div>
  )
}
