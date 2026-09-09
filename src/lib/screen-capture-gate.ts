import { Track, type Room, type LocalVideoTrack } from 'livekit-client'
import { hasViewers, CAPTURE_IDLE_GRACE_MS, type SubscribedQualityLike } from './screen-share-policy'

/**
 * Para a CAPTURA da tela quando ninguem esta assistindo.
 *
 * O que ja acontecia antes: com `dynacast` o SFU avisa quem transmite que
 * nenhuma camada tem assinante e o livekit-client desliga os encodings — o
 * encoder H.264 fica ocioso. O que NAO parava: o `getDisplayMedia` por baixo.
 * O capturador (WGC) continua entregando 1080p a 60 fps pro processo do
 * renderer, com copia de textura e memoria de quadro, pra um encoder que joga
 * tudo fora. Num jogo em tela cheia isso e GPU e barramento gastos pra
 * ninguem.
 *
 * Aqui, depois de `CAPTURE_IDLE_GRACE_MS` sem espectador, a faixa publicada e
 * TROCADA (`replaceTrack`) por um canvas de 0 fps — que nunca produz quadro —
 * e o SDK para a faixa de captura real. A publicacao continua no ar: pros
 * outros a tela segue "transmitindo" e o card com "Assistir" continua la.
 * Quando alguem clica, o SFU manda o sinal inverso, a captura e readquirida
 * (o main do Electron entrega a MESMA fonte sem abrir seletor) e a faixa
 * volta pro lugar. Custo pra quem assiste: um flash preto de ~300 ms.
 *
 * So o VIDEO. O sinal do SFU nao cobre audio, e o audio da tela continua indo
 * pra quem minimizou o launcher pra jogar ouvindo o amigo — a captura de
 * loopback e barata (WASAPI, sem encoder pesado).
 *
 * Se o SDK nao expuser `engine` (mudou por dentro) ou o servidor nunca
 * mandar o sinal, nada acontece: a captura fica ligada como antes.
 */

export type CaptureState = 'live' | 'idle'

export interface CaptureGateOptions {
  room: Room
  /** Id da fonte (`screen:...` / `window:...`) pra readquirir sem seletor. */
  sourceId: string
  resolution: { width: number; height: number; frameRate: number }
  contentHint: 'motion' | 'detail'
  onStateChange?: (state: CaptureState) => void
  /**
   * A fonte sumiu enquanto a captura estava parada (janela fechada) — quem
   * chama encerra a transmissao, como o SDK faria se a faixa tivesse morrido
   * ao vivo.
   */
  onLost?: () => void
  graceMs?: number
}

export interface CaptureGate {
  readonly state: CaptureState
  destroy: () => void
}

type QualityUpdate = SubscribedQualityLike & { trackSid: string }

interface EngineLike {
  on: (event: 'subscribedQualityUpdate', fn: (update: QualityUpdate) => void) => unknown
  off: (event: 'subscribedQualityUpdate', fn: (update: QualityUpdate) => void) => unknown
}

function screenPublication(room: Room) {
  return room.localParticipant.getTrackPublication(Track.Source.ScreenShare)
}

/** Faixa de video que nunca entrega quadro: canvas com captureStream(0). */
function createIdleTrack(width: number, height: number): MediaStreamTrack {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  // 0 = so quando requestFrame() for chamado — e nunca chamamos.
  const stream = canvas.captureStream(0)
  return stream.getVideoTracks()[0]
}

export function createCaptureGate(options: CaptureGateOptions): CaptureGate {
  const engine = (options.room as unknown as { engine?: EngineLike }).engine
  const graceMs = options.graceMs ?? CAPTURE_IDLE_GRACE_MS

  let state: CaptureState = 'live'
  /** Ultimo veredito do SFU. Comeca "tem" porque a faixa nasce ao vivo. */
  let wanted = true
  let timer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false
  /** Trocas de faixa sao serializadas: pausar e retomar nao podem se cruzar. */
  let queue: Promise<void> = Promise.resolve()

  const setState = (next: CaptureState): void => {
    if (state === next) return
    state = next
    options.onStateChange?.(next)
  }

  const pause = async (): Promise<void> => {
    if (destroyed || state === 'idle') return
    const publication = screenPublication(options.room)
    const video = publication?.videoTrack as LocalVideoTrack | undefined
    if (!video) return
    const idle = createIdleTrack(options.resolution.width, options.resolution.height)
    // `false` = "nao e faixa do usuario": o SDK PARA a faixa antiga (a
    // captura real) ao trocar, e vai parar esta quando a proxima entrar.
    await video.replaceTrack(idle, false)
    setState('idle')
  }

  const resume = async (): Promise<void> => {
    if (destroyed || state === 'live') return
    const publication = screenPublication(options.room)
    const video = publication?.videoTrack as LocalVideoTrack | undefined
    if (!video) return

    let track: MediaStreamTrack
    try {
      // So video: o audio da tela nunca saiu do ar.
      await window.bocas.screen.selectSource(options.sourceId, false)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: options.resolution.width },
          height: { ideal: options.resolution.height },
          frameRate: options.resolution.frameRate
        },
        audio: false
      })
      const first = stream.getVideoTracks()[0]
      if (!first) throw new Error('sem faixa de video')
      track = first
    } catch (err) {
      await window.bocas.screen.cancelSelection().catch(() => {})
      console.warn('[screen] nao consegui readquirir a captura, encerrando', err)
      options.onLost?.()
      return
    }

    if (destroyed || screenPublication(options.room)?.videoTrack !== video) {
      track.stop()
      return
    }

    track.contentHint = options.contentHint
    await video.replaceTrack(track, false)
    setState('live')
  }

  const schedule = (job: () => Promise<void>): void => {
    queue = queue.then(job).catch((err) => {
      console.warn('[screen] troca de captura falhou', err)
    })
  }

  const clearTimer = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  const handleUpdate = (update: QualityUpdate): void => {
    if (destroyed) return
    const publication = screenPublication(options.room)
    if (!publication || update.trackSid !== publication.trackSid) return

    const viewers = hasViewers(update)
    if (viewers === wanted) return
    wanted = viewers
    clearTimer()

    if (viewers) {
      schedule(resume)
      return
    }
    timer = setTimeout(() => {
      timer = null
      schedule(pause)
    }, graceMs)
  }

  if (engine && typeof engine.on === 'function') {
    engine.on('subscribedQualityUpdate', handleUpdate)
  } else {
    console.warn('[screen] room.engine indisponivel: captura nao pausa sem espectador')
  }

  return {
    get state() {
      return state
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      clearTimer()
      engine?.off?.('subscribedQualityUpdate', handleUpdate)
    }
  }
}
