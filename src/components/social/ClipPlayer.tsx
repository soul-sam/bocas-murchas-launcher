import * as React from 'react'
import { Loader2, Pause, Play } from 'lucide-react'
import { formatClipDuration } from '@/lib/api-clips'
import { cn } from '@/lib/utils'

/**
 * TOCADOR DE CLIPE — botão, barra e tempo.
 *
 * Um `<audio controls>` do Chromium tem 54px de altura, fundo próprio e um
 * menu de três pontinhos com "baixar" e "velocidade". Dentro de um card de
 * chat isso é um corpo estranho que ignora o tema inteiro. Aqui são três
 * elementos nossos em cima de um `<audio>` escondido.
 *
 * A DURAÇÃO VEM DE FORA, do banco, e não do arquivo. Webm gravado ao vivo não
 * carrega duração no cabeçalho — `audio.duration` volta `Infinity` até tocar
 * até o fim, e a barra ficaria parada em zero durante a primeira escuta.
 */
export function ClipPlayer({
  src,
  durationMs,
  onFirstPlay,
  compact
}: {
  src: string
  durationMs: number
  /** Contar a escuta acontece uma vez por montagem, não a cada replay. */
  onFirstPlay?: () => void
  compact?: boolean
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null)
  const countedRef = React.useRef(false)

  const [playing, setPlaying] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [positionMs, setPositionMs] = React.useState(0)
  const [broken, setBroken] = React.useState(false)

  const total = Math.max(1, durationMs)
  const progress = Math.min(100, (positionMs / total) * 100)

  const toggle = (): void => {
    const audio = audioRef.current
    if (!audio || broken) return

    if (playing) {
      audio.pause()
      return
    }

    setLoading(true)
    void audio
      .play()
      .then(() => {
        if (!countedRef.current) {
          countedRef.current = true
          onFirstPlay?.()
        }
      })
      .catch(() => setBroken(true))
      .finally(() => setLoading(false))
  }

  const seek = (event: React.MouseEvent<HTMLDivElement>): void => {
    const audio = audioRef.current
    if (!audio || broken) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const target = (ratio * total) / 1000
    // `Infinity` é o que o webm ao vivo devolve; nesse caso o navegador aceita
    // o seek mesmo assim, e a barra segue a nossa conta.
    try {
      audio.currentTime = target
      setPositionMs(target * 1000)
    } catch {
      // Arquivo que ainda não carregou o suficiente pra buscar. Ignora: o
      // clique seguinte funciona.
    }
  }

  return (
    <div className={cn('flex items-center gap-2', compact ? 'gap-1.5' : 'gap-2')}>
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setPositionMs(0)
        }}
        onTimeUpdate={(e) => setPositionMs(e.currentTarget.currentTime * 1000)}
        onError={() => setBroken(true)}
        className="hidden"
      />

      <button
        type="button"
        onClick={toggle}
        disabled={broken}
        aria-label={playing ? 'Pausar' : 'Tocar'}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-brutal border-2 transition-colors',
          compact ? 'h-7 w-7' : 'h-9 w-9',
          broken
            ? 'cursor-not-allowed border-line-strong text-muted-foreground'
            : 'border-acid text-acid hover:bg-acid/15'
        )}
      >
        {loading ? (
          <Loader2 className={cn('animate-spin', compact ? 'h-3 w-3' : 'h-4 w-4')} />
        ) : playing ? (
          <Pause className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
        ) : (
          <Play className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
        )}
      </button>

      <div
        onClick={seek}
        role="presentation"
        className={cn(
          'min-w-0 flex-1 overflow-hidden rounded-brutal border border-line bg-void/60',
          compact ? 'h-1.5' : 'h-2',
          !broken && 'cursor-pointer'
        )}
      >
        <div
          className="h-full bg-acid transition-[width] duration-150"
          style={{ width: `${broken ? 0 : progress}%` }}
        />
      </div>

      <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">
        {broken ? 'sumiu' : formatClipDuration(playing || positionMs > 0 ? positionMs : durationMs)}
      </span>
    </div>
  )
}
