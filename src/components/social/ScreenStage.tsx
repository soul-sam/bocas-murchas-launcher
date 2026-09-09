import * as React from 'react'
import type { Track } from 'livekit-client'
import {
  Maximize2,
  Minimize2,
  MonitorX,
  Radio,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  Play,
  Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVoice, type ScreenShareFeed, type ScreenShareInfo } from '@/lib/voice-context'
import { pickFocus } from '@/lib/screen-share-policy'

/**
 * Palco do compartilhamento de tela.
 *
 * ASSISTIR E OPCIONAL. Uma tela no ar vira um card com o nome de quem
 * transmite e um botao de assistir; o video so e pedido ao servidor depois do
 * clique (ver voice-context.watchScreen e lib/screen-share-policy). Antes,
 * o palco montava um <video> pra CADA tela no ar — a em foco e as
 * miniaturas — e a sala assinava tudo automaticamente: quem entrava na call
 * pra conversar enquanto jogava recebia e decodificava 1080p60 sem nunca ter
 * olhado pro launcher.
 *
 * Miniaturas nunca mostram video: sao so o nome e um botao de trocar. Uma
 * tela assistida por vez.
 *
 * A propria transmissao tambem e opcional de VER: quem compartilha ja esta
 * olhando pro monitor, e pintar a propria captura de 1080p60 dentro do
 * launcher era mais um consumidor de GPU em cima do jogo. O card diz o que
 * esta no ar e em que qualidade; a previa abre sob demanda.
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
 * Exportado porque o CallStage tambem precisa dele pros cards de webcam —
 * duplicar o attach/detach seria a forma mais facil de vazar um <video> preso
 * a uma faixa que ja saiu do ar.
 *
 * O detach no cleanup importa duas vezes: solta o elemento da faixa (senao o
 * LiveKit continua pintando num <video> orfao) e, com adaptiveStream, avisa o
 * SDK que nao ha mais elemento visivel.
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
      // Solta o MediaStream do elemento: sem isso o <video> desmontado segura
      // o ultimo quadro decodificado (e o buffer da GPU) ate o GC passar.
      el.srcObject = null
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

/** Card de "tem tela no ar" — sem video, sem assinatura, sem custo. */
function IdleCard({
  feed,
  info,
  onWatch
}: {
  feed: ScreenShareFeed
  info: ScreenShareInfo | null
  onWatch: () => void
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-4 text-center">
      <Radio
        className={cn('h-6 w-6 animate-pulse', feed.isLocal ? 'text-burn' : 'text-destructive')}
      />
      <div className="space-y-1">
        <p className="font-display text-base uppercase tracking-wide text-dirty-white">
          {feed.isLocal ? 'você está transmitindo' : `${feed.name} está transmitindo`}
        </p>
        {feed.isLocal && info && (
          <p className="font-mono text-[11.5px] text-muted-foreground">
            {info.sourceName} · {info.quality.replace('p', 'p ')}
            {!info.withAudio && ' · sem áudio'}
          </p>
        )}
        {!feed.isLocal && (
          <p className="text-[11.5px] text-muted-foreground">
            {feed.hasAudio ? 'com o som do jogo' : 'sem áudio'} · o vídeo só chega depois de
            você clicar
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onWatch}
        className="flex items-center gap-2 rounded-brutal border-2 border-acid bg-acid/10 px-4 py-2 font-mono text-[11.5px] uppercase tracking-widest text-acid transition-colors hover:bg-acid/20"
      >
        {feed.isLocal ? <Eye className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        {feed.isLocal ? 'Ver prévia' : 'Assistir'}
      </button>
    </div>
  )
}

const FocusedFeed = React.memo(function FocusedFeed({
  feed,
  info,
  onStop,
  onWatch,
  onUnwatch,
  volume,
  onVolume
}: {
  feed: ScreenShareFeed
  info: ScreenShareInfo | null
  onStop: () => void
  onWatch: () => void
  onUnwatch: () => void
  volume: number
  onVolume: (value: number) => void
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [stats, setStats] = React.useState<VideoStats | null>(null)
  const [fullscreen, setFullscreen] = React.useState(false)
  /**
   * Previa da PROPRIA transmissao. Estado local e sempre comeca fechado: nao
   * envolve rede (a faixa e local), so evita pintar 1080p60 no launcher
   * enquanto o jogo roda.
   */
  const [previewOpen, setPreviewOpen] = React.useState(false)

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

  const showingVideo = feed.isLocal ? previewOpen && !!feed.track : feed.watching && !!feed.track
  const connecting = !feed.isLocal && feed.watching && !feed.track
  const label = showingVideo ? qualityLabel(stats, feed.isLocal ? info : null) : null
  const muted = volume === 0

  const handleStopWatching = (): void => {
    if (feed.isLocal) setPreviewOpen(false)
    else onUnwatch()
    setStats(null)
  }

  return (
    <div
      ref={containerRef}
      onDoubleClick={showingVideo ? toggleFullscreen : undefined}
      className={cn(
        'group relative min-h-0 flex-1 overflow-hidden rounded-brutal border-2 bg-black',
        feed.isLocal ? 'border-burn/70' : 'border-acid-dark'
      )}
    >
      {showingVideo && feed.track && <VideoSurface track={feed.track} onStats={setStats} />}

      {connecting && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-[11.5px] text-muted-foreground">
            pedindo a tela de {feed.name}…
          </p>
        </div>
      )}

      {!showingVideo && !connecting && (
        <IdleCard
          feed={feed}
          info={info}
          onWatch={feed.isLocal ? () => setPreviewOpen(true) : onWatch}
        />
      )}

      {/* Faixa de identificacao — some no hover pra nao atrapalhar a leitura */}
      {showingVideo && (
        <div className="pointer-events-none absolute left-2 top-2 flex max-w-[calc(100%-6rem)] items-center gap-1.5 rounded-brutal bg-void/90 px-2 py-1 transition-opacity group-hover:opacity-40">
          <Radio
            className={cn(
              'h-3 w-3 shrink-0 animate-pulse',
              feed.isLocal ? 'text-burn' : 'text-destructive'
            )}
          />
          <span className="truncate text-[11.5px] text-dirty-white">
            {feed.isLocal ? 'você está transmitindo' : feed.name}
          </span>
          {feed.isLocal && info && (
            <span className="hidden truncate border-l border-line-strong pl-1.5 font-mono text-[11.5px] text-muted-foreground sm:block">
              {info.sourceName}
            </span>
          )}
          {label && (
            <span className="shrink-0 border-l border-line-strong pl-1.5 font-mono text-[11.5px] text-foreground">
              {label}
            </span>
          )}
          {feed.isLocal && info && !info.withAudio && (
            <VolumeX className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="sem áudio" />
          )}
        </div>
      )}

      {/* Controles do feed */}
      <div
        className={cn(
          'absolute right-2 top-2 flex items-center gap-1 transition-opacity focus-within:opacity-100 group-hover:opacity-100',
          showingVideo ? 'opacity-0' : 'opacity-100'
        )}
      >
        {!feed.isLocal && feed.watching && feed.hasAudio && (
          <div className="flex items-center gap-1.5 rounded-brutal bg-void/90 px-2 py-1.5">
            <button
              type="button"
              title={muted ? `Voltar a ouvir ${feed.name}` : `Mutar ${feed.name}`}
              onClick={() => onVolume(muted ? 1 : 0)}
              className={cn(
                'shrink-0 transition-colors',
                muted ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'
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

        {(showingVideo || connecting) && (
          <button
            type="button"
            onClick={handleStopWatching}
            title={feed.isLocal ? 'Fechar a prévia' : 'Parar de assistir (libera vídeo e rede)'}
            className="flex items-center gap-1.5 rounded-brutal bg-void/90 px-2 py-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            <EyeOff className="h-3.5 w-3.5" />
            {feed.isLocal ? 'Fechar' : 'Parar de ver'}
          </button>
        )}

        {feed.isLocal && (
          <button
            type="button"
            onClick={onStop}
            title="Parar de compartilhar"
            className="flex items-center gap-1.5 rounded-brutal bg-void/90 px-2 py-1.5 font-mono text-[11.5px] uppercase tracking-widest text-destructive transition-colors hover:bg-destructive/20"
          >
            <MonitorX className="h-3.5 w-3.5" />
            Parar
          </button>
        )}

        {showingVideo && (
          <button
            type="button"
            onClick={toggleFullscreen}
            title={fullscreen ? 'Sair da tela cheia' : 'Tela cheia (ou 2 cliques)'}
            className="rounded-brutal bg-void/90 p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </div>
  )
})

/**
 * Miniatura SEM video. Antes cada uma era um <video> vivo em cima de uma
 * faixa assinada; agora e um botao de trocar o foco — a assinatura so vem
 * com o "Assistir" do card grande.
 */
const FeedThumb = React.memo(function FeedThumb({
  feed,
  onClick
}: {
  feed: ScreenShareFeed
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={feed.isLocal ? 'Sua transmissão' : `Ver a tela de ${feed.name}`}
      className={cn(
        'group relative flex aspect-video w-32 shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-brutal border-2 bg-black transition-all lg:w-full',
        'border-line opacity-70 hover:border-acid/50 hover:opacity-100'
      )}
    >
      <Radio
        className={cn('h-3.5 w-3.5', feed.isLocal ? 'text-burn' : 'text-destructive')}
      />
      <span className="max-w-full truncate px-2 text-[11px] text-dirty-white">
        {feed.isLocal ? 'você' : feed.name}
      </span>
    </button>
  )
})

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

  const focusedId = pickFocus(feeds, focusedIdentity)
  const focused = feeds.find((f) => f.identity === focusedId)
  const others = feeds.filter((f) => f.identity !== focusedId)

  /**
   * Sair da visualizacao = soltar a assinatura, na hora.
   *
   * O cleanup roda quando o foco troca de pessoa E quando o palco desmonta
   * (aba de chat, assistir junto em foco, fim da call). O unwatch e por
   * identidade pra nao derrubar um "Assistir" que ja foi dado na proxima.
   */
  const unwatchScreen = voice.unwatchScreen
  React.useEffect(() => {
    if (!focusedId) return
    return () => unwatchScreen(focusedId)
  }, [focusedId, unwatchScreen])

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
        onWatch={() => voice.watchScreen(focused.identity)}
        onUnwatch={() => voice.unwatchScreen(focused.identity)}
        volume={voice.userVolume(focused.identity)}
        onVolume={(value) => voice.setUserVolume(focused.identity, value)}
      />

      {others.length > 0 && (
        <div className="flex shrink-0 gap-2 overflow-x-auto lg:w-40 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
          <p className="hidden items-center gap-1 text-[11px] text-muted-foreground lg:flex">
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
