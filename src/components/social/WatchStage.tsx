import * as React from 'react'
import {
  ChevronUp,
  ExternalLink,
  ListPlus,
  ListVideo,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  SkipForward,
  Square,
  Tv,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { useVoice } from '@/lib/voice-context'
import { useWatch, type WatchAck, type WatchSession } from '@/lib/watch-context'
import { openExternal } from '@/lib/rich-text'
import {
  YT_STATE,
  parsePlayerMessage,
  playerErrorInfo,
  sendPlayerCommand,
  sendPlayerListening,
  youtubeEmbedUrl,
  youtubeWatchUrl,
  type YtCommand,
  type YtPlayerState
} from '@/lib/youtube'

/**
 * Palco do "assistir junto".
 *
 * O vídeo toca no player embutido do YouTube, um por pessoa; o que é
 * compartilhado é só o controle remoto (ver lib/watch-context). Este
 * componente faz a ponte: lê o estado do servidor e obriga o player local a
 * obedecer, e transforma cada clique nos NOSSOS controles em evento pro
 * servidor. O player não tem controles próprios (controls=0) justamente pra
 * não existir um jeito de pausar "só pra mim" sem querer.
 *
 * Como não dá pra carregar o SDK do YouTube (CSP: script-src 'self'), a
 * conversa com o iframe é postMessage cru — o mesmo protocolo que o SDK usa
 * por baixo. Ver lib/youtube.ts.
 *
 * SINCRONIA: em toda mudança de estado do servidor, o player pula pra posição
 * esperada (se estiver a mais de 1s dela) e dá play/pause conforme o caso. A
 * cada 5s, enquanto toca, confere de novo e corrige se a deriva passar de 2s
 * — buffering de um lado e não do outro acumula segundos em poucos minutos.
 *
 * FIM DO VÍDEO: só UMA pessoa avisa o servidor (senão cinco players mandariam
 * cinco `watch:next`). É quem trouxe o vídeo, se ainda está na call; senão o
 * primeiro da lista em ordem de identidade, que é igual em todas as máquinas.
 *
 * QUANDO O PLAYER ERRA: o `onError` guarda o código e o palco vira uma tela
 * com o motivo em português e o botão de abrir no YouTube — cada código pede
 * uma atitude diferente (ver playerErrorInfo em lib/youtube.ts). Vídeo que o
 * dono bloqueou (101/150) ou que foi removido (100) não tem contorno; já o 153
 * é bug NOSSO e a correção mora no processo principal
 * (electron/main/services/embed-referer.ts).
 */

/** Acima disso, em mudança de estado, o player pula pra posição certa. */
const APPLY_TOLERANCE_SEC = 1
/** Acima disso, na checagem periódica, corrige a deriva. */
const DRIFT_TOLERANCE_SEC = 2
const DRIFT_CHECK_MS = 5_000
/** Tentativas do aperto de mão `listening` (a cada 500ms) antes de desistir. */
const HANDSHAKE_TRIES = 30
const VOLUME_KEY = 'bocas:watch-volume'

function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

function loadVolume(): number {
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY)
    const value = raw === null ? NaN : Number(raw)
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 70
  } catch {
    return 70
  }
}

function saveVolume(volume: number): void {
  try {
    window.localStorage.setItem(VOLUME_KEY, String(volume))
  } catch {
    /* sem storage, sem memória de volume — não é o fim do mundo */
  }
}

// ============================================
// FORMULÁRIO DE LINK
// ============================================

function UrlForm({
  onSubmit,
  onQueue,
  placeholder = 'Cola um link do YouTube…',
  submitLabel = 'Assistir',
  compact,
  autoFocus
}: {
  onSubmit: (url: string) => Promise<WatchAck>
  /** Quando existe, aparece o segundo botão "+ fila". */
  onQueue?: (url: string) => Promise<WatchAck>
  placeholder?: string
  submitLabel?: string
  compact?: boolean
  autoFocus?: boolean
}) {
  const [value, setValue] = React.useState('')
  const [busy, setBusy] = React.useState<'set' | 'queue' | null>(null)

  const run = async (kind: 'set' | 'queue'): Promise<void> => {
    const url = value.trim()
    if (!url || busy) return
    setBusy(kind)
    try {
      const ack = await (kind === 'queue' && onQueue ? onQueue(url) : onSubmit(url))
      if (ack.ok) setValue('')
    } finally {
      setBusy(null)
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void run('set')
      }}
      className={cn('flex w-full items-center gap-1.5', compact ? 'max-w-md' : 'max-w-xl')}
    >
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        spellCheck={false}
        className={cn(
          'min-w-0 flex-1 rounded-brutal border-2 border-[#1a1a1a] bg-void px-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-acid/60 focus:outline-none',
          compact ? 'h-7' : 'h-9 px-3'
        )}
      />
      <button
        type="submit"
        disabled={!value.trim() || busy !== null}
        className={cn(
          'flex shrink-0 items-center gap-1.5 rounded-brutal border-2 border-acid bg-acid/10 font-mono text-[10px] uppercase tracking-widest text-acid transition-colors hover:bg-acid/20 disabled:cursor-not-allowed disabled:opacity-40',
          compact ? 'h-7 px-2' : 'h-9 px-3'
        )}
      >
        {busy === 'set' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
        {submitLabel}
      </button>
      {onQueue && (
        <button
          type="button"
          onClick={() => void run('queue')}
          disabled={!value.trim() || busy !== null}
          title="Botar na fila (toca depois desse)"
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-brutal border-2 border-[#1a1a1a] font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-acid/50 hover:text-acid disabled:cursor-not-allowed disabled:opacity-40',
            compact ? 'h-7 px-2' : 'h-9 px-3'
          )}
        >
          {busy === 'queue' ? <Loader2 className="h-3 w-3 animate-spin" /> : <ListPlus className="h-3 w-3" />}
          fila
        </button>
      )}
    </form>
  )
}

// ============================================
// PALCO
// ============================================

export function WatchStage({
  collapsed,
  onExpand,
  onClose
}: {
  /** Uma tela compartilhada está em foco: vira uma barra, mas o vídeo continua. */
  collapsed: boolean
  onExpand: () => void
  /** Fecha SÓ pra mim — a sessão da sala continua. */
  onClose: () => void
}) {
  const watch = useWatch()
  const session = watch.current

  if (!session) {
    return <EmptyWatch collapsed={collapsed} onClose={onClose} />
  }

  return <Player session={session} collapsed={collapsed} onExpand={onExpand} onClose={onClose} />
}

function EmptyWatch({ collapsed, onClose }: { collapsed: boolean; onClose: () => void }) {
  const watch = useWatch()

  if (collapsed) {
    return (
      <div className="flex shrink-0 items-center gap-2 rounded-brutal border-2 border-[#1a1a1a] bg-void/60 px-2 py-1.5">
        <Tv className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <UrlForm onSubmit={watch.set} compact />
        {watch.feedback && (
          <span className="truncate font-mono text-[10px] text-destructive">{watch.feedback}</span>
        )}
        <button
          type="button"
          onClick={onClose}
          title="Fechar"
          className="ml-auto shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:text-dirty-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-brutal border-2 border-dashed border-[#1a1a1a] bg-void/40 p-6 text-center">
      <button
        type="button"
        onClick={onClose}
        title="Fechar"
        className="absolute right-2 top-2 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-void-light hover:text-dirty-white"
      >
        <X className="h-4 w-4" />
      </button>

      <Tv className="h-8 w-8 text-acid" />
      <div>
        <p className="title-brutal text-lg">Assistir junto</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Cola um link do YouTube: toca pra todo mundo na call, no mesmo segundo. Qualquer um
          pausa, pula e troca.
        </p>
      </div>

      <UrlForm onSubmit={watch.set} autoFocus />

      <p
        className={cn(
          'h-4 font-mono text-[10px] uppercase tracking-widest',
          watch.feedback ? 'text-destructive' : 'text-transparent'
        )}
      >
        {watch.feedback ?? '.'}
      </p>
    </div>
  )
}

// ============================================
// PLAYER
// ============================================

function Player({
  session,
  collapsed,
  onExpand,
  onClose
}: {
  session: WatchSession
  collapsed: boolean
  onExpand: () => void
  onClose: () => void
}) {
  const watch = useWatch()
  const { user } = useAuth()
  const { byId } = useMembers()
  const voice = useVoice()

  const containerRef = React.useRef<HTMLDivElement>(null)
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null)
  /**
   * Id que vai no aperto de mão e volta em toda mensagem do player. Um por
   * montagem: se algum dia houver dois embeds na tela, cada um só ouve o seu.
   */
  const playerId = React.useMemo(() => `watch-${Math.random().toString(36).slice(2, 10)}`, [])

  const [ready, setReady] = React.useState(false)
  /**
   * Codigo do erro do player, nao um booleano: "nao deu pra tocar" manda a
   * pessoa tentar de novo pra sempre, enquanto cada codigo pede uma atitude
   * diferente (trocar de video, abrir no YouTube, atualizar o launcher).
   */
  const [errorCode, setErrorCode] = React.useState<number | null>(null)
  const [playerState, setPlayerState] = React.useState<YtPlayerState>(YT_STATE.unstarted)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [duration, setDuration] = React.useState(0)
  const [playerTitle, setPlayerTitle] = React.useState<string | null>(null)
  const [volume, setVolume] = React.useState<number>(loadVolume)
  const [muted, setMuted] = React.useState(false)
  const [scrub, setScrub] = React.useState<number | null>(null)
  const [fullscreen, setFullscreen] = React.useState(false)
  const [queueOpen, setQueueOpen] = React.useState(false)
  /** Qual vídeo o iframe já terminou de carregar — gatilho do aperto de mão. */
  const [loadedVideoId, setLoadedVideoId] = React.useState<string | null>(null)

  // Refs espelhando o estado que os handlers de mensagem/intervalo precisam
  // ler sem ficar re-registrando a cada render.
  const sessionRef = React.useRef(session)
  sessionRef.current = session
  const readyRef = React.useRef(false)
  const timeRef = React.useRef(0)
  const stateRef = React.useRef<YtPlayerState>(YT_STATE.unstarted)
  const scrubbingRef = React.useRef(false)
  scrubbingRef.current = scrub !== null
  const endedHandledRef = React.useRef<string | null>(null)

  const send = React.useCallback(
    (func: YtCommand, args: unknown[] = []) => {
      sendPlayerCommand(iframeRef.current, playerId, func, args)
    },
    [playerId]
  )

  /**
   * Obriga o player a obedecer ao servidor. Chamado quando o estado muda e
   * quando o player fica pronto. Tolerância de 1s: um seek causa buffering e
   * ninguém quer isso a cada play/pause por 300ms de latência.
   */
  const applySession = React.useCallback(() => {
    if (!readyRef.current) return
    const current = sessionRef.current
    const expected = watch.expectedPosition(current)
    if (Math.abs(timeRef.current - expected) > APPLY_TOLERANCE_SEC) {
      send('seekTo', [expected, true])
      timeRef.current = expected
    }
    send(current.playing ? 'playVideo' : 'pauseVideo')
  }, [watch, send])

  /** Quem avisa o servidor que o vídeo acabou. Ver o cabeçalho do arquivo. */
  const isDriver = React.useMemo(() => {
    if (!user) return false
    const identities = voice.participants.map((p) => p.identity)
    const driver = identities.includes(session.hostUserId)
      ? session.hostUserId
      : [...identities].sort()[0]
    return driver === user.id
  }, [user, voice.participants, session.hostUserId])
  const isDriverRef = React.useRef(isDriver)
  isDriverRef.current = isDriver

  // --- mensagens do player ------------------------------------------------
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent): void => {
      if (event.source !== iframeRef.current?.contentWindow) return
      const message = parsePlayerMessage(event, playerId)
      if (!message) return

      const markReady = (): void => {
        if (readyRef.current) return
        readyRef.current = true
        setReady(true)
      }

      switch (message.event) {
        case 'onReady':
          markReady()
          break

        case 'initialDelivery':
        case 'infoDelivery': {
          markReady()
          const info = (message as { info?: Record<string, unknown> }).info
          if (!info || typeof info !== 'object') break

          if (typeof info.currentTime === 'number' && Number.isFinite(info.currentTime)) {
            timeRef.current = info.currentTime
            if (!scrubbingRef.current) setCurrentTime(info.currentTime)
          }
          if (typeof info.duration === 'number' && info.duration > 0) setDuration(info.duration)
          if (typeof info.playerState === 'number') {
            stateRef.current = info.playerState as YtPlayerState
            setPlayerState(info.playerState as YtPlayerState)
          }
          const videoData = info.videoData as { title?: unknown } | undefined
          if (videoData && typeof videoData.title === 'string' && videoData.title) {
            setPlayerTitle(videoData.title)
          }
          break
        }

        case 'onStateChange': {
          const state = (message as { info?: unknown }).info
          if (typeof state !== 'number') break
          stateRef.current = state as YtPlayerState
          setPlayerState(state as YtPlayerState)

          /**
           * Acabou. Se tem fila, próximo; senão o servidor precisa saber que
           * parou, ou quem entrar depois calcula uma posição além do fim e
           * vê um player travado na tela final.
           */
          if (state === YT_STATE.ended && isDriverRef.current) {
            const current = sessionRef.current
            if (!current.playing || endedHandledRef.current === current.videoId) break
            endedHandledRef.current = current.videoId
            if (current.queue && current.queue.length > 0) void watch.next()
            else void watch.pause(timeRef.current)
          }
          break
        }

        case 'onError': {
          const code = (message as { info?: unknown }).info
          if (typeof code !== 'number' || code <= 0) break
          /**
           * QUALQUER erro para o player, não só os de "não deixa embutir": o
           * player não volta a mandar `infoDelivery` depois de errar, então
           * insistir só deixaria o spinner girando pra sempre. O texto de cada
           * código sai de playerErrorInfo (lib/youtube.ts).
           */
          setErrorCode(code)
          break
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [playerId, watch])

  // --- aperto de mão --------------------------------------------------------
  /**
   * Vídeo novo = iframe novo (a `key` lá embaixo). Zera tudo e recomeça o
   * `listening` até o player responder. O `load` do iframe não basta como
   * gatilho único: o player termina de subir DEPOIS dele, e uma mensagem
   * mandada cedo demais se perde sem erro.
   */
  React.useEffect(() => {
    readyRef.current = false
    setReady(false)
    setErrorCode(null)
    setPlayerTitle(null)
    setDuration(0)
    setCurrentTime(0)
    timeRef.current = 0
    stateRef.current = YT_STATE.unstarted
    setPlayerState(YT_STATE.unstarted)
    endedHandledRef.current = null
  }, [session.videoId])

  React.useEffect(() => {
    if (loadedVideoId !== session.videoId) return

    let tries = 0
    const attempt = (): void => {
      if (readyRef.current || tries >= HANDSHAKE_TRIES) {
        clearInterval(timer)
        return
      }
      tries += 1
      sendPlayerListening(iframeRef.current, playerId)
    }
    attempt()
    const timer = setInterval(attempt, 500)
    return () => clearInterval(timer)
  }, [loadedVideoId, session.videoId, playerId])

  // Pronto: aplica volume guardado e cai na posição da sala.
  React.useEffect(() => {
    if (!ready) return
    send('setVolume', [volume])
    send(muted ? 'mute' : 'unMute')
    applySession()
    // Só na virada pra `ready`; volume/mute têm efeito próprio abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // --- servidor mandou, player obedece --------------------------------------
  React.useEffect(() => {
    applySession()
  }, [session.playing, session.positionSec, session.updatedAt, applySession])

  // Deriva: buffering de um lado só acumula segundos em poucos minutos.
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (!readyRef.current || scrubbingRef.current) return
      const current = sessionRef.current
      if (!current.playing || stateRef.current !== YT_STATE.playing) return
      const expected = watch.expectedPosition(current)
      if (Math.abs(timeRef.current - expected) > DRIFT_TOLERANCE_SEC) {
        send('seekTo', [expected, true])
        timeRef.current = expected
      }
    }, DRIFT_CHECK_MS)
    return () => clearInterval(timer)
  }, [watch, send])

  // --- volume (só meu) ------------------------------------------------------
  React.useEffect(() => {
    if (!ready) return
    send('setVolume', [volume])
    saveVolume(volume)
  }, [volume, ready, send])

  React.useEffect(() => {
    if (!ready) return
    send(muted ? 'mute' : 'unMute')
  }, [muted, ready, send])

  // --- tela cheia -----------------------------------------------------------
  React.useEffect(() => {
    const handle = (): void => setFullscreen(document.fullscreenElement === containerRef.current)
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

  // --- ações locais -> servidor ------------------------------------------
  const localPlaying = playerState === YT_STATE.playing || playerState === YT_STATE.buffering

  const togglePlay = React.useCallback(() => {
    const current = sessionRef.current
    // A sala diz "tocando" mas o meu player não está: autoplay barrado ou
    // player recém-carregado. Isso é problema MEU — resolve local, sem mandar
    // a sala inteira dar play de novo.
    if (
      current.playing &&
      stateRef.current !== YT_STATE.playing &&
      stateRef.current !== YT_STATE.buffering
    ) {
      applySession()
      return
    }
    if (current.playing) void watch.pause(timeRef.current)
    else void watch.play(timeRef.current)
  }, [watch, applySession])

  const commitSeek = React.useCallback(
    (value: number) => {
      setScrub(null)
      // Local na hora, pra barra não "voltar" enquanto o servidor responde; o
      // broadcast que volta cai dentro da tolerância e não pula de novo.
      send('seekTo', [value, true])
      timeRef.current = value
      setCurrentTime(value)
      void watch.seek(value)
    },
    [watch, send]
  )

  // --- derivados pra tela ---------------------------------------------------
  const host = byId[session.hostUserId]
  const hostName = host?.displayName ?? 'alguém'
  const title = session.title ?? playerTitle ?? 'Vídeo do YouTube'
  const shown = scrub ?? currentTime
  const sliderMax = duration > 0 ? duration : Math.max(shown + 1, 1)
  const queue = session.queue ?? []
  const iframeSrc = React.useMemo(() => youtubeEmbedUrl(session.videoId), [session.videoId])
  const blocked = errorCode !== null
  const errorInfo = playerErrorInfo(errorCode)

  /**
   * ESTRUTURA: o contêiner do vídeo é SEMPRE o primeiro filho, nos dois modos
   * — só as classes mudam (no modo barra ele vira 1px invisível, fora do
   * fluxo). O cabeçalho e os controles vêm depois no DOM e são postos no lugar
   * certo com `order`. Se o iframe mudasse de posição na árvore ao alternar
   * entre painel e barra, o React o remontaria e o vídeo recomeçaria do zero
   * pra essa pessoa (e o áudio sumiria enquanto a tela compartilhada estivesse
   * em foco, que é justamente quando a barra existe).
   */
  return (
    <div
      className={cn(
        collapsed
          ? 'relative flex shrink-0 items-center gap-2 rounded-brutal border-2 border-acid-dark/60 bg-void/60 px-2 py-1.5'
          : 'flex min-h-0 flex-1 flex-col gap-2'
      )}
    >
      {/* Vídeo */}
      <div
        ref={containerRef}
        aria-hidden={collapsed || undefined}
        className={cn(
          collapsed
            ? 'pointer-events-none absolute left-0 top-0 h-px w-px overflow-hidden opacity-0'
            : 'group relative order-2 min-h-0 flex-1 overflow-hidden rounded-brutal border-2 border-acid-dark bg-black'
        )}
      >
        <div className="absolute inset-0">
          <iframe
            key={session.videoId}
            ref={iframeRef}
            src={iframeSrc}
            title={title}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setLoadedVideoId(session.videoId)}
            className="h-full w-full border-0"
          />
        </div>

        {!collapsed && (
          <>
            {/*
              Véu por cima do iframe: pega o clique (play/pause pra sala, duplo
              = tela cheia) antes de chegar no player, que sem isso tocaria ou
              pausaria só aqui. É também o que impede o iframe de roubar o foco
              do teclado.
            */}
            {!blocked && (
              <button
                type="button"
                onClick={togglePlay}
                onDoubleClick={(event) => {
                  event.preventDefault()
                  toggleFullscreen()
                }}
                aria-label={session.playing ? 'Pausar' : 'Tocar'}
                className="absolute inset-0 flex items-center justify-center bg-transparent focus:outline-none"
              >
                {ready && !localPlaying && playerState !== YT_STATE.ended && (
                  <span className="rounded-full bg-void/80 p-4 text-acid shadow-[0_0_24px_rgba(106,255,0,0.35)] transition-transform group-hover:scale-110">
                    <Play className="h-8 w-8" />
                  </span>
                )}
                {ready && playerState === YT_STATE.ended && (
                  <span className="rounded-brutal bg-void/80 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    acabou
                  </span>
                )}
              </button>
            )}

            {!ready && !blocked && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-void/70">
                <Loader2 className="h-5 w-5 animate-spin text-acid" />
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  carregando o player…
                </p>
              </div>
            )}

            {blocked && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-void/90 p-4 text-center">
                <Tv className="h-6 w-6 text-burn" />
                <div>
                  <p className="text-sm text-foreground">{errorInfo?.title}</p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">{errorInfo?.body}</p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => openExternal(youtubeWatchUrl(session.videoId))}
                    className="flex items-center gap-1.5 rounded-brutal border-2 border-burn/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-burn transition-colors hover:bg-burn/10"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Abrir no YouTube
                  </button>
                  {queue.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void watch.next()}
                      className="flex items-center gap-1.5 rounded-brutal border-2 border-[#2a2a2a] px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-acid/50 hover:text-acid"
                    >
                      <SkipForward className="h-3 w-3" />
                      Próximo da fila
                    </button>
                  )}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={toggleFullscreen}
              title={fullscreen ? 'Sair da tela cheia' : 'Tela cheia (ou 2 cliques)'}
              className="absolute right-2 top-2 rounded-brutal bg-void/90 p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-acid focus:opacity-100 group-hover:opacity-100"
            >
              {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </>
        )}
      </div>

      {collapsed ? (
        <>
          <button
            type="button"
            onClick={togglePlay}
            title={session.playing ? 'Pausar pra todo mundo' : 'Dar play pra todo mundo'}
            className="shrink-0 rounded-brutal border border-[#1a1a1a] p-1 text-acid transition-colors hover:bg-acid/10"
          >
            {session.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>

          <Tv className="h-3.5 w-3.5 shrink-0 text-acid" />
          <span className="min-w-0 truncate text-xs text-foreground">{title}</span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {formatClock(shown)}
            {duration > 0 && ` / ${formatClock(duration)}`}
          </span>

          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            title={muted ? 'Voltar o som do vídeo' : 'Mutar o vídeo (só pra mim)'}
            className={cn(
              'ml-auto shrink-0 rounded-brutal p-1 transition-colors',
              muted ? 'text-destructive' : 'text-muted-foreground hover:text-acid'
            )}
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={onExpand}
            className="flex shrink-0 items-center gap-1 rounded-brutal border border-acid/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-acid transition-colors hover:bg-acid/10"
          >
            <ChevronUp className="h-3 w-3" />
            ver vídeo
          </button>

          <button
            type="button"
            onClick={onClose}
            title="Fechar só pra mim"
            className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:text-dirty-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          {/* Cabeçalho: o que é, quem trouxe */}
          <div className="order-1 flex shrink-0 items-center gap-2">
            <Tv className="h-3.5 w-3.5 shrink-0 text-acid" />
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              assistindo junto
            </span>
            <span className="min-w-0 truncate text-sm text-foreground" title={title}>
              {title}
            </span>

            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              <UserAvatar
                src={host?.avatar ?? undefined}
                name={hostName}
                ringColor={host?.profileColor}
                className="h-5 w-5"
              />
              <span className="hidden font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:inline">
                {hostName} trouxe
              </span>
            </span>

            <button
              type="button"
              onClick={() => openExternal(youtubeWatchUrl(session.videoId))}
              title="Abrir no YouTube"
              className="shrink-0 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-void-light hover:text-acid"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Fechar só pra mim (o vídeo continua pros outros)"
              className="shrink-0 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-void-light hover:text-dirty-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Controles: tudo aqui vale pra sala, menos o volume */}
          <div className="order-3 flex shrink-0 flex-col gap-1.5 rounded-brutal border-2 border-[#1a1a1a] bg-void/60 p-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                disabled={blocked}
                title={session.playing ? 'Pausar pra todo mundo' : 'Dar play pra todo mundo'}
                className="shrink-0 rounded-brutal border-2 border-acid bg-acid/10 p-1.5 text-acid transition-colors hover:bg-acid/20 disabled:opacity-40"
              >
                {session.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>

              <span className="w-12 shrink-0 text-right font-mono text-[10px] text-foreground">
                {formatClock(shown)}
              </span>

              <input
                type="range"
                min={0}
                max={sliderMax}
                step={1}
                value={Math.min(shown, sliderMax)}
                disabled={!ready || blocked}
                onPointerDown={() => setScrub(currentTime)}
                onChange={(event) => setScrub(Number(event.target.value))}
                onPointerUp={(event) => commitSeek(Number((event.target as HTMLInputElement).value))}
                onKeyUp={(event) => {
                  // Setas no teclado também são seek — e não passam pelo pointer.
                  if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
                    commitSeek(Number((event.target as HTMLInputElement).value))
                  }
                }}
                aria-label="Posição do vídeo"
                title="Arrasta pra pular (pra todo mundo)"
                className="mini-slider min-w-0 flex-1 disabled:opacity-40"
              />

              <span className="w-12 shrink-0 font-mono text-[10px] text-muted-foreground">
                {duration > 0 ? formatClock(duration) : '–:––'}
              </span>

              <span className="mx-1 hidden h-5 w-px bg-[#1a1a1a] sm:block" />

              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                title={muted ? 'Voltar o som (só meu)' : 'Mutar o vídeo (só pra mim)'}
                className={cn(
                  'shrink-0 transition-colors',
                  muted ? 'text-destructive' : 'text-muted-foreground hover:text-acid'
                )}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={muted ? 0 : volume}
                onChange={(event) => {
                  setVolume(Number(event.target.value))
                  if (muted) setMuted(false)
                }}
                aria-label="Volume do vídeo (só meu)"
                title={`Volume do vídeo: ${muted ? 0 : volume}% (só pra mim)`}
                className={cn('mini-slider hidden w-20 shrink-0 sm:block', muted && 'is-muted')}
              />

              <span className="mx-1 hidden h-5 w-px bg-[#1a1a1a] sm:block" />

              {queue.length > 0 && (
                <button
                  type="button"
                  onClick={() => void watch.next()}
                  title={`Próximo da fila: ${queue[0].title ?? queue[0].videoId}`}
                  className="shrink-0 rounded-brutal border-2 border-[#1a1a1a] p-1.5 text-muted-foreground transition-colors hover:border-acid/50 hover:text-acid"
                >
                  <SkipForward className="h-4 w-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setQueueOpen((open) => !open)}
                title={queueOpen ? 'Esconder a fila' : 'Trocar o vídeo ou botar outro na fila'}
                className={cn(
                  'flex shrink-0 items-center gap-1 rounded-brutal border-2 p-1.5 transition-colors',
                  queueOpen
                    ? 'border-acid bg-acid/10 text-acid'
                    : 'border-[#1a1a1a] text-muted-foreground hover:border-acid/50 hover:text-acid'
                )}
              >
                <ListVideo className="h-4 w-4" />
                {queue.length > 0 && (
                  <span className="font-mono text-[10px] tabular-nums">{queue.length}</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => void watch.stop()}
                title="Parar pra todo mundo"
                className="shrink-0 rounded-brutal border-2 border-destructive/60 p-1.5 text-destructive transition-colors hover:bg-destructive/15"
              >
                <Square className="h-4 w-4" />
              </button>
            </div>

            {(queueOpen || watch.feedback) && (
              <div className="flex flex-col gap-1.5 border-t border-[#1a1a1a] pt-1.5">
                {queueOpen && (
                  <>
                    <UrlForm
                      onSubmit={watch.set}
                      onQueue={watch.queueAdd}
                      submitLabel="Trocar"
                      placeholder="Outro link do YouTube…"
                      compact
                      autoFocus
                    />
                    {queue.length > 0 && (
                      <ol className="flex max-h-24 flex-col gap-0.5 overflow-y-auto">
                        {queue.map((item, index) => (
                          <li
                            key={`${item.videoId}-${index}`}
                            className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground"
                          >
                            <span className="w-4 shrink-0 text-right tabular-nums">{index + 1}.</span>
                            <span className="min-w-0 truncate text-foreground">
                              {item.title ?? item.videoId}
                            </span>
                            <span className="shrink-0 uppercase tracking-widest">
                              {byId[item.addedBy]?.displayName ?? '?'}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </>
                )}
                {watch.feedback && (
                  <p className="font-mono text-[10px] uppercase tracking-widest text-destructive">
                    {watch.feedback}
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
