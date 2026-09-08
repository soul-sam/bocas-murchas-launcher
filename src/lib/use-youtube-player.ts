import * as React from 'react'
import {
  YT_STATE,
  parsePlayerMessage,
  sendPlayerCommand,
  sendPlayerListening,
  youtubeEmbedUrl,
  type YtCommand,
  type YtPlayerState
} from './youtube'

/**
 * O MOTOR DO PLAYER DO YOUTUBE — a parte que obedece ao servidor.
 *
 * Isto nasceu dentro do WatchStage e saiu de lá quando a música apareceu: o
 * modo música precisa do MESMO player (mesmo aperto de mão, mesma sincronia,
 * mesma correção de deriva) desenhado de outro jeito — sem imagem, num canto,
 * sobrevivendo a trocar de tela. Duplicar trezentas linhas de sincronia era
 * garantir que um dos dois lados ficaria com o bug que o outro já consertou.
 *
 * O que fica AQUI: falar com o iframe e manter o player local igual ao que o
 * servidor manda. O que fica em quem chama: onde o iframe aparece na tela, que
 * controles existem e o que cada clique manda pro servidor.
 *
 * Como não dá pra carregar o SDK do YouTube (CSP: script-src 'self'), a
 * conversa com o iframe é postMessage cru — o mesmo protocolo que o SDK usa
 * por baixo. Ver lib/youtube.ts.
 *
 * SINCRONIA: em toda mudança de estado do servidor, o player pula pra posição
 * esperada (se estiver a mais de 1s dela) e dá play/pause conforme o caso. A
 * cada 5s, enquanto toca, confere de novo e corrige se a deriva passar de 2s —
 * buffering de um lado e não do outro acumula segundos em poucos minutos.
 *
 * FIM DA FAIXA: só UMA pessoa avisa o servidor (senão cinco players mandariam
 * cinco `watch:next`). Quem é essa pessoa é decisão de quem chama — o hook só
 * recebe `isDriver` e chama `onEnded` uma vez por vídeo.
 */

/** Acima disso, em mudança de estado, o player pula pra posição certa. */
const APPLY_TOLERANCE_SEC = 1
/** Acima disso, na checagem periódica, corrige a deriva. */
const DRIFT_TOLERANCE_SEC = 2
const DRIFT_CHECK_MS = 5_000
/** Tentativas do aperto de mão `listening` (a cada 500ms) antes de desistir. */
const HANDSHAKE_TRIES = 30

export interface YoutubePlayerInput {
  videoId: string
  /** O que o SERVIDOR diz. O player local persegue este valor, não o contrário. */
  playing: boolean
  /**
   * Onde a faixa deveria estar AGORA (s), pelo relógio do servidor.
   *
   * É lida por ref, então NÃO precisa ser estável — e é por isso que existe o
   * `syncKey` logo abaixo: a identidade desta função não pode servir de
   * gatilho, senão um `() => …` inline reaplicaria a sessão a cada render.
   */
  expectedPosition: () => number
  /**
   * Muda quando o servidor mandou algo novo (na prática, `updatedAt` da
   * sessão). É ISTO que faz o player reaplicar — nem antes, nem a cada render.
   */
  syncKey: number
  /** 0..100, só desta máquina. */
  volume: number
  muted: boolean
  /** Se EU sou quem avisa o servidor que a faixa acabou. */
  isDriver: boolean
  onEnded: () => void
  /** Enquanto alguém arrasta a barra, a correção de deriva fica quieta. */
  scrubbing?: boolean
}

export interface YoutubePlayer {
  /** Vai no `<iframe ref=…>`. */
  iframeRef: React.MutableRefObject<HTMLIFrameElement | null>
  /** Vai no `src`. Já vem memoizado pelo videoId. */
  iframeSrc: string
  /** Vai no `onLoad`. É o gatilho do aperto de mão. */
  onIframeLoad: () => void
  /** Serve de `key` do iframe: vídeo novo tem que ser iframe novo. */
  videoId: string

  ready: boolean
  /**
   * Código do erro do player, não um booleano: "não deu pra tocar" manda a
   * pessoa tentar de novo pra sempre, enquanto cada código pede uma atitude
   * diferente (ver playerErrorInfo em lib/youtube.ts).
   */
  errorCode: number | null
  playerState: YtPlayerState
  currentTime: number
  duration: number
  /** Título que o próprio player informou. Reserva pra quando o nosso falta. */
  playerTitle: string | null

  /** Posição real do player, sem passar por estado do React. */
  timeRef: React.MutableRefObject<number>
  /** Obriga o player a obedecer ao servidor agora. */
  applySession: () => void
  /** Pula LOCALMENTE (quem chama decide se avisa o servidor). */
  seekLocal: (positionSec: number) => void
}

export function useYoutubePlayer(input: YoutubePlayerInput): YoutubePlayer {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null)
  /**
   * Id que vai no aperto de mão e volta em toda mensagem do player. Um por
   * montagem: com dois embeds na tela (o palco do vídeo e o da música), cada
   * um só ouve o seu.
   */
  const playerId = React.useMemo(() => `yt-${Math.random().toString(36).slice(2, 10)}`, [])

  const [ready, setReady] = React.useState(false)
  const [errorCode, setErrorCode] = React.useState<number | null>(null)
  const [playerState, setPlayerState] = React.useState<YtPlayerState>(YT_STATE.unstarted)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [duration, setDuration] = React.useState(0)
  const [playerTitle, setPlayerTitle] = React.useState<string | null>(null)
  /** Qual vídeo o iframe já terminou de carregar — gatilho do aperto de mão. */
  const [loadedVideoId, setLoadedVideoId] = React.useState<string | null>(null)

  /**
   * Toda a entrada num ref, atualizada a cada render.
   *
   * Os handlers de mensagem e os intervalos precisam ler o valor de AGORA sem
   * se re-registrar a cada render — e re-registrar o listener de `message` no
   * meio de um aperto de mão perde a resposta do player.
   */
  const inputRef = React.useRef(input)
  inputRef.current = input

  const readyRef = React.useRef(false)
  const timeRef = React.useRef(0)
  const stateRef = React.useRef<YtPlayerState>(YT_STATE.unstarted)
  const endedHandledRef = React.useRef<string | null>(null)

  const send = React.useCallback(
    (func: YtCommand, args: unknown[] = []) => {
      sendPlayerCommand(iframeRef.current, playerId, func, args)
    },
    [playerId]
  )

  /**
   * Obriga o player a obedecer ao servidor. Tolerância de 1s: um seek causa
   * buffering e ninguém quer isso a cada play/pause por 300ms de latência.
   */
  const applySession = React.useCallback(() => {
    if (!readyRef.current) return
    const { expectedPosition, playing } = inputRef.current
    const expected = expectedPosition()
    if (Math.abs(timeRef.current - expected) > APPLY_TOLERANCE_SEC) {
      send('seekTo', [expected, true])
      timeRef.current = expected
    }
    send(playing ? 'playVideo' : 'pauseVideo')
  }, [send])

  const seekLocal = React.useCallback(
    (positionSec: number) => {
      send('seekTo', [positionSec, true])
      timeRef.current = positionSec
      setCurrentTime(positionSec)
    },
    [send]
  )

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
            if (!inputRef.current.scrubbing) setCurrentTime(info.currentTime)
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
           * Acabou. Uma vez por vídeo e só pro motorista — o resto da sala
           * recebe a troca pelo broadcast do servidor.
           */
          if (state === YT_STATE.ended) {
            const { isDriver, playing, videoId, onEnded } = inputRef.current
            if (!isDriver || !playing) break
            if (endedHandledRef.current === videoId) break
            endedHandledRef.current = videoId
            onEnded()
          }
          break
        }

        case 'onError': {
          const code = (message as { info?: unknown }).info
          if (typeof code !== 'number' || code <= 0) break
          /**
           * QUALQUER erro para o player, não só os de "não deixa embutir": o
           * player não volta a mandar `infoDelivery` depois de errar, então
           * insistir só deixaria o spinner girando pra sempre.
           */
          setErrorCode(code)
          break
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [playerId])

  // --- aperto de mão --------------------------------------------------------
  /**
   * Vídeo novo = iframe novo (a `key` de quem desenha). Zera tudo e recomeça o
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
  }, [input.videoId])

  React.useEffect(() => {
    if (loadedVideoId !== input.videoId) return

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
  }, [loadedVideoId, input.videoId, playerId])

  // Pronto: aplica volume guardado e cai na posição da sala.
  React.useEffect(() => {
    if (!ready) return
    send('setVolume', [inputRef.current.volume])
    send(inputRef.current.muted ? 'mute' : 'unMute')
    applySession()
    // Só na virada pra `ready`; volume/mute têm efeito próprio abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // --- servidor mandou, player obedece --------------------------------------
  React.useEffect(() => {
    applySession()
  }, [input.playing, input.syncKey, applySession])

  // Deriva: buffering de um lado só acumula segundos em poucos minutos.
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (!readyRef.current || inputRef.current.scrubbing) return
      if (!inputRef.current.playing || stateRef.current !== YT_STATE.playing) return
      const expected = inputRef.current.expectedPosition()
      if (Math.abs(timeRef.current - expected) > DRIFT_TOLERANCE_SEC) {
        send('seekTo', [expected, true])
        timeRef.current = expected
      }
    }, DRIFT_CHECK_MS)
    return () => clearInterval(timer)
  }, [send])

  // --- volume (só meu) ------------------------------------------------------
  React.useEffect(() => {
    if (!ready) return
    send('setVolume', [input.volume])
  }, [input.volume, ready, send])

  React.useEffect(() => {
    if (!ready) return
    send(input.muted ? 'mute' : 'unMute')
  }, [input.muted, ready, send])

  const iframeSrc = React.useMemo(() => youtubeEmbedUrl(input.videoId), [input.videoId])
  const onIframeLoad = React.useCallback(() => setLoadedVideoId(input.videoId), [input.videoId])

  return {
    iframeRef,
    iframeSrc,
    onIframeLoad,
    videoId: input.videoId,
    ready,
    errorCode,
    playerState,
    currentTime,
    duration,
    playerTitle,
    timeRef,
    applySession,
    seekLocal
  }
}
