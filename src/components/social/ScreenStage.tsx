import * as React from 'react'
import type { Track } from 'livekit-client'
import {
  Maximize2,
  Minimize2,
  MonitorX,
  Radio,
  Volume2,
  VolumeX,
  Eye
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVoice, type ScreenShareFeed, type ScreenShareInfo } from '@/lib/voice-context'

/**
 * Palco do compartilhamento de tela.
 *
 * O que estava faltando (e era a reclamacao): quem compartilha nao via NADA.
 * Nem qual janela foi parar no ar, nem se ainda estava no ar, nem em que
 * qualidade. Agora a propria transmissao aparece no palco como a de qualquer
 * um, com selo de "VOCE" e o botao de parar em cima dela.
 *
 * Com mais de uma tela no ar, o palco vira "foco + fila": uma grande e as
 * outras em miniatura. Grade 2x2 dividindo o espaco igualmente e bonita em
 * captura de tela e inutil na pratica — ninguem le codigo ou joga olhando um
 * retangulo de 300px.
 */

// ============================================
// VIDEO
// ============================================

interface VideoStats {
  width: number
  height: number
  fps: number | null
}

/**
 * Resolucao e taxa de quadros do que esta REALMENTE chegando.
 *
 * Nao da pra confiar no preset escolhido: o SFU derruba a qualidade sozinho
 * quando a rede aperta, e o encoder reduz a resolucao quando a CPU nao da
 * conta. Sem esse numero na tela, "ta ruim aqui" vira adivinhacao.
 *
 * A contagem usa requestVideoFrameCallback, que so acorda quando um quadro
 * NOVO e pintado — um `setInterval` lendo o elemento contaria os quadros da
 * tela, nao os do video, e mostraria 60fps numa transmissao travada.
 */
function useVideoStats(ref: React.RefObject<HTMLVideoElement>, enabled: boolean): VideoStats | null {
  const [stats, setStats] = React.useState<VideoStats | null>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    let handle = 0
    let frames = 0
    let windowStart = performance.now()
    let cancelled = false

    type FrameCapable = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number
      cancelVideoFrameCallback?: (handle: number) => void
    }
    const video = el as FrameCapable

    const sample = (): void => {
      if (cancelled) return

      frames += 1
      const now = performance.now()
      const elapsed = now - windowStart

      if (elapsed >= 1_000) {
        setStats({
          width: video.videoWidth,
          height: video.videoHeight,
          fps: Math.round((frames * 1_000) / elapsed)
        })
        frames = 0
        windowStart = now
      }

      handle = video.requestVideoFrameCallback?.(sample) ?? 0
    }

    if (video.requestVideoFrameCallback) {
      handle = video.requestVideoFrameCallback(sample)
    } else {
      // Sem a API: pelo menos a resolucao, que ja diz muito.
      const timer = setInterval(() => {
        setStats({ width: video.videoWidth, height: video.videoHeight, fps: null })
      }, 2_000)
      return () => clearInterval(timer)
    }

    return () => {
      cancelled = true
      if (handle) video.cancelVideoFrameCallback?.(handle)
    }
  }, [ref, enabled])

  return stats
}

/**
 * Anexa uma faixa de video do LiveKit a um <video> real.
 *
 * Exportado porque o VoiceStage tambem precisa dele pros cards de webcam —
 * duplicar o attach/detach seria a forma mais facil de vazar um <video> preso
 * a uma faixa que ja saiu do ar.
 */
export function VideoSurface({
  track,
  onStats,
  className
}: {
  track: Track
  onStats?: (stats: VideoStats | null) => void
  className?: string
}) {
  const ref = React.useRef<HTMLVideoElement>(null)
  const stats = useVideoStats(ref, !!onStats)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    track.attach(el)
    return () => {
      track.detach(el)
    }
  }, [track])

  React.useEffect(() => {
    onStats?.(stats)
  }, [stats, onStats])

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      // Sem isso o proprio compartilhamento volta pelos alto-falantes e
      // microfona. O audio de quem transmite chega pela faixa de audio da
      // call, que e anexada separadamente no voice-context.
      muted
      className={cn('h-full w-full bg-black object-contain', className)}
    />
  )
}

// ============================================
// PALCO
// ============================================

function qualityLabel(stats: VideoStats | null, info: ScreenShareInfo | null): string | null {
  if (stats && stats.width > 0) {
    const resolution = `${stats.width}×${stats.height}`
    return stats.fps ? `${resolution} · ${stats.fps}fps` : resolution
  }
  if (info) return info.quality.replace('p', 'p ')
  return null
}

function FocusedFeed({
  feed,
  info,
  onStop,
  volume,
  onVolume
}: {
  feed: ScreenShareFeed
  info: ScreenShareInfo | null
  onStop: () => void
  volume: number
  onVolume: (value: number) => void
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [stats, setStats] = React.useState<VideoStats | null>(null)
  const [fullscreen, setFullscreen] = React.useState(false)

  // O ESC do navegador sai da tela cheia sem passar pelo nosso botao; sem
  // ouvir o evento o icone ficaria mostrando "sair" pra sempre.
  React.useEffect(() => {
    const handle = (): void => {
      setFullscreen(document.fullscreenElement === containerRef.current)
    }
    document.addEventListener('fullscreenchange', handle)
    return () => document.removeEventListener('fullscreenchange', handle)
  }, [])

  const toggleFullscreen = React.useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
      return
    }
    void containerRef.current?.requestFullscreen().catch(() => {})
  }, [])

  const label = qualityLabel(stats, feed.isLocal ? info : null)
  const muted = volume === 0

  return (
    <div
      ref={containerRef}
      onDoubleClick={toggleFullscreen}
      className={cn(
        'group relative min-h-0 flex-1 overflow-hidden rounded-brutal border-2 bg-black',
        feed.isLocal ? 'border-burn/70' : 'border-acid-dark'
      )}
    >
      <VideoSurface track={feed.track} onStats={setStats} />

      {/* Faixa de identificacao — some no hover pra nao atrapalhar a leitura */}
      <div className="pointer-events-none absolute left-2 top-2 flex max-w-[calc(100%-6rem)] items-center gap-1.5 rounded-brutal bg-void/90 px-2 py-1 transition-opacity group-hover:opacity-40">
        <Radio
          className={cn(
            'h-3 w-3 shrink-0 animate-pulse',
            feed.isLocal ? 'text-burn' : 'text-destructive'
          )}
        />
        <span className="truncate font-mono text-[10px] uppercase tracking-widest text-dirty-white">
          {feed.isLocal ? 'você está transmitindo' : feed.name}
        </span>
        {feed.isLocal && info && (
          <span className="hidden truncate border-l border-[#2a2a2a] pl-1.5 font-mono text-[10px] text-muted-foreground sm:block">
            {info.sourceName}
          </span>
        )}
        {label && (
          <span className="shrink-0 border-l border-[#2a2a2a] pl-1.5 font-mono text-[10px] text-acid">
            {label}
          </span>
        )}
        {feed.isLocal && info && !info.withAudio && (
          <VolumeX className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="sem áudio" />
        )}
      </div>

      {/* Controles do feed */}
      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {!feed.isLocal && (
          <div className="flex items-center gap-1.5 rounded-brutal bg-void/90 px-2 py-1.5">
            <button
              type="button"
              title={muted ? `Voltar a ouvir ${feed.name}` : `Mutar ${feed.name}`}
              onClick={() => onVolume(muted ? 1 : 0)}
              className={cn(
                'shrink-0 transition-colors',
                muted ? 'text-destructive' : 'text-muted-foreground hover:text-acid'
              )}
            >
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={volume}
              onChange={(event) => onVolume(Number(event.target.value))}
              onDoubleClick={(event) => {
                // Sem isso o duplo clique tambem cai no container e joga o
                // video em tela cheia enquanto a pessoa so queria resetar.
                event.stopPropagation()
                onVolume(1)
              }}
              title={`Volume de ${feed.name}: ${Math.round(volume * 100)}%`}
              aria-label={`Volume de ${feed.name}`}
              className={cn('mini-slider w-20', muted && 'is-muted')}
            />
          </div>
        )}

        {feed.isLocal && (
          <button
            type="button"
            onClick={onStop}
            title="Parar de compartilhar"
            className="flex items-center gap-1.5 rounded-brutal bg-void/90 px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-destructive transition-colors hover:bg-destructive/20"
          >
            <MonitorX className="h-3.5 w-3.5" />
            Parar
          </button>
        )}

        <button
          type="button"
          onClick={toggleFullscreen}
          title={fullscreen ? 'Sair da tela cheia' : 'Tela cheia (ou 2 cliques)'}
          className="rounded-brutal bg-void/90 p-1.5 text-muted-foreground transition-colors hover:text-acid"
        >
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}

function FeedThumb({ feed, onClick }: { feed: ScreenShareFeed; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={feed.isLocal ? 'Sua transmissão' : `Ver a tela de ${feed.name}`}
      className={cn(
        'group relative aspect-video w-32 shrink-0 overflow-hidden rounded-brutal border-2 bg-black transition-all lg:w-full',
        'border-[#1a1a1a] opacity-70 hover:border-acid/50 hover:opacity-100'
      )}
    >
      <VideoSurface track={feed.track} />

      <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-void to-transparent px-1.5 pb-1 pt-3">
        <Radio
          className={cn(
            'h-2.5 w-2.5 shrink-0',
            feed.isLocal ? 'text-burn' : 'text-destructive'
          )}
        />
        <span className="truncate font-mono text-[9px] uppercase tracking-widest text-dirty-white">
          {feed.isLocal ? 'você' : feed.name}
        </span>
      </span>
    </button>
  )
}

export function ScreenStage({
  feeds,
  focusedIdentity,
  onFocus
}: {
  feeds: ScreenShareFeed[]
  focusedIdentity: string | null
  onFocus: (identity: string) => void
}) {
  const voice = useVoice()

  const focused = feeds.find((f) => f.identity === focusedIdentity) ?? feeds[0]
  const others = feeds.filter((f) => f.identity !== focused?.identity)

  if (!focused) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
      <FocusedFeed
        // A chave remonta o painel ao trocar de foco: sem isso a resolução da
        // tela anterior ficava escrita por cerca de um segundo em cima da nova.
        key={focused.identity}
        feed={focused}
        info={voice.shareInfo}
        onStop={() => void voice.stopScreenShare()}
        volume={voice.userVolume(focused.identity)}
        onVolume={(value) => voice.setUserVolume(focused.identity, value)}
      />

      {others.length > 0 && (
        <div className="flex shrink-0 gap-2 overflow-x-auto lg:w-40 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
          <p className="hidden items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground lg:flex">
            <Eye className="h-3 w-3" />
            {others.length} {others.length === 1 ? 'outra tela' : 'outras telas'}
          </p>

          {others.map((feed) => (
            <FeedThumb
              key={feed.identity}
              feed={feed}
              onClick={() => onFocus(feed.identity)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
