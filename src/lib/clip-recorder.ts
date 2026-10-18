/**
 * BUFFER ROLANTE DA CALL — os últimos 30 segundos, sempre à mão.
 *
 * ------------------------------------------------------------------
 * A DECISÃO QUE MANDA NO ARQUIVO
 * ------------------------------------------------------------------
 * Guardar PCM, codificar só ao clipar.
 *
 * A versão anterior mantinha TRÊS `MediaRecorder` sobrepostos na mesma
 * mistura, defasados em 10 s, porque um webm só é decodificável a partir do
 * primeiro pedaço (o cabeçalho mora nele) — então "os últimos 30 s" de um
 * gravador único não existiam como arquivo. Funcionava, mas eram três
 * codificadores opus rodando a call inteira: medido em out/2026, ~7,5% de um
 * núcleo sem parar, mesmo no mudo (docs/memory-audit-2026-10.md).
 *
 * Agora um AudioWorklet (clip-ring.worklet.js) guarda o PCM da mistura num
 * anel de 30 s — Int16 estéreo, ~5,8 MB a 48 kHz — e o custo contínuo é só
 * copiar amostras. Ao clipar, o anel é copiado, o WebCodecs codifica em opus
 * numa passada (bem mais rápido que tempo real) e lib/webm-opus.ts monta o
 * .webm. O arquivo que sobe é o mesmo opus a 64 kbps de antes (~240 KB por
 * 30 s); o PCM nunca sai da máquina. De brinde, o clipe passa a ter sempre
 * 30 s (antes variava entre 20 e 30) e duração certa no cabeçalho.
 *
 * Sem WebCodecs (não deveria acontecer no Electron), sai WAV, que o
 * servidor também aceita — maior, mas o clipe não se perde.
 *
 * ------------------------------------------------------------------
 * O QUE ENTRA NA MISTURA
 * ------------------------------------------------------------------
 * A faixa de áudio de cada pessoa da call e o seu microfone JÁ PROCESSADO (a
 * mesma que os outros ouvem, depois do ganho e do portão de ruído). Não passa
 * pelo `<audio>` de ninguém, então o volume individual que você ajustou não
 * muda o clipe: quem estava baixo pra você não fica inaudível pra todo mundo.
 *
 * ------------------------------------------------------------------
 * PRIVACIDADE
 * ------------------------------------------------------------------
 * Nada sai desta máquina enquanto ninguém aperta o botão. O buffer vive em
 * memória, é sobrescrito continuamente e morre inteiro quando a call acaba —
 * `destroy()` é chamado ao sair. O upload só existe depois de um clique
 * deliberado, e ainda passa por uma tela de confirmação.
 */
import workletUrl from './clip-ring.worklet.js?url'
import { muxWebmOpus, wavFromPcm, type OpusPacket } from './webm-opus'

/** Tamanho do anel (tem que bater com WINDOW_SECONDS do worklet). */
const WINDOW_MS = 30_000

/** Opus a 64 kbps: voz limpa, ~240 KB por clipe de 30s. */
const AUDIO_BITS = 64_000

/** Opus só trabalha a 48 kHz (o OpusHead registra a taxa original). */
const OPUS_RATE = 48_000

/** Atraso padrão do libopus (6,5 ms), usado se o encoder não informar. */
const DEFAULT_PRE_SKIP = 312

/** Quanto PCM vai por AudioData ao codificar: 100 ms. */
const ENCODE_SLICE = OPUS_RATE / 10

export interface Capture {
  blob: Blob
  durationMs: number
  mimeType: string
}

export interface ClipRecorder {
  /** Passa a misturar o áudio desta pessoa. Chamar de novo troca a faixa. */
  add: (key: string, stream: MediaStream) => void
  remove: (key: string) => void
  /** Quantas faixas estão na mistura. Zero = não há o que clipar. */
  size: () => number
  /** Quanto áudio o anel já tem (até 30 s). */
  bufferedMs: () => number
  /** Pega os últimos segundos. Null se ainda não há áudio. */
  capture: () => Promise<Capture | null>
  destroy: () => void
}

interface Snapshot {
  left: Int16Array
  right: Int16Array
  frames: number
}

/** PCM do anel → planar float a 48 kHz (reamostra se o contexto não for 48k). */
async function toOpusRate(snap: Snapshot, rate: number): Promise<Float32Array[]> {
  const toFloat = (src: Int16Array): Float32Array<ArrayBuffer> => {
    const out = new Float32Array(src.length)
    for (let i = 0; i < src.length; i++) out[i] = src[i] / 32768
    return out
  }
  const left = toFloat(snap.left)
  const right = toFloat(snap.right)
  if (rate === OPUS_RATE) return [left, right]

  const length = Math.ceil((snap.frames * OPUS_RATE) / rate)
  const offline = new OfflineAudioContext(2, length, OPUS_RATE)
  const buffer = offline.createBuffer(2, snap.frames, rate)
  buffer.copyToChannel(left, 0)
  buffer.copyToChannel(right, 1)
  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()
  return [rendered.getChannelData(0), rendered.getChannelData(1)]
}

/** Codifica em opus pelo WebCodecs e embrulha em webm. Null se não houver suporte. */
async function encodeWebm(channels: Float32Array[], durationMs: number): Promise<Blob | null> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return null
  const config: AudioEncoderConfig = {
    codec: 'opus',
    sampleRate: OPUS_RATE,
    numberOfChannels: 2,
    bitrate: AUDIO_BITS
  }
  try {
    const support = await AudioEncoder.isConfigSupported(config)
    if (!support.supported) return null
  } catch {
    return null
  }

  const packets: OpusPacket[] = []
  let head: Uint8Array | undefined
  let failure: unknown = null
  let firstTs: number | null = null

  const encoder = new AudioEncoder({
    output: (chunk, metadata) => {
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      firstTs ??= chunk.timestamp
      packets.push({ data, timestampUs: chunk.timestamp - firstTs })
      const description = metadata?.decoderConfig?.description
      if (!head && description) {
        const bytes = ArrayBuffer.isView(description)
          ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
          : new Uint8Array(description)
        if (bytes.length >= 19 && String.fromCharCode(...bytes.subarray(0, 8)) === 'OpusHead') {
          head = bytes.slice()
        }
      }
    },
    error: (err) => {
      failure = err
    }
  })

  try {
    encoder.configure(config)
    const [left, right] = channels
    const total = left.length
    for (let at = 0; at < total; at += ENCODE_SLICE) {
      const n = Math.min(ENCODE_SLICE, total - at)
      const planar = new Float32Array(n * 2)
      planar.set(left.subarray(at, at + n), 0)
      planar.set(right.subarray(at, at + n), n)
      const frame = new AudioData({
        format: 'f32-planar',
        sampleRate: OPUS_RATE,
        numberOfFrames: n,
        numberOfChannels: 2,
        timestamp: Math.round((at / OPUS_RATE) * 1e6),
        data: planar
      })
      encoder.encode(frame)
      frame.close()
    }
    await encoder.flush()
  } catch (err) {
    failure ??= err
  } finally {
    if (encoder.state !== 'closed') encoder.close()
  }
  if (failure || packets.length === 0) return null

  const preSkip = head ? new DataView(head.buffer, head.byteOffset).getUint16(10, true) : DEFAULT_PRE_SKIP
  const bytes = muxWebmOpus({ packets, channels: 2, durationMs, preSkip, opusHead: head })
  return new Blob([bytes], { type: 'audio/webm;codecs=opus' })
}

export function createClipRecorder(): ClipRecorder {
  let ctx: AudioContext | null = null
  let ring: AudioWorkletNode | null = null
  let mix: GainNode | null = null
  let startedAt = 0
  let starting: Promise<void> | null = null
  let destroyed = false

  const sources = new Map<string, MediaStreamAudioSourceNode>()
  /** Faixas que chegaram antes do worklet carregar: ligam assim que ele subir. */
  const queued = new Map<string, MediaStream>()

  const connect = (key: string, stream: MediaStream): void => {
    if (!ctx || !mix) return
    const previous = sources.get(key)
    if (previous) {
      try {
        previous.disconnect()
      } catch {
        // Nó já solto: nada a desfazer.
      }
      sources.delete(key)
    }
    try {
      const source = ctx.createMediaStreamSource(stream)
      source.connect(mix)
      sources.set(key, source)
    } catch {
      // Faixa que morreu entre o evento e aqui. Fica de fora da mistura.
    }
  }

  const ensureRunning = (): void => {
    if (destroyed || starting) return
    starting = (async () => {
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctor) return
        // Sem sampleRate forçado: forçar a taxa já deixou a voz robotizada
        // em driver onboard (ver audio-processor.ts). Se não for 48k, o
        // capture reamostra.
        const audio = new Ctor({ latencyHint: 'playback' })
        ctx = audio
        await audio.audioWorklet.addModule(workletUrl)
        if (destroyed) return
        mix = audio.createGain()
        ring = new AudioWorkletNode(audio, 'bm-clip-ring', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          channelCount: 2,
          channelCountMode: 'explicit'
        })
        mix.connect(ring)
        // A saída é sempre silêncio; ligar no destino só garante que o
        // grafo puxe o worklet a cada quantum.
        ring.connect(audio.destination)
        startedAt = performance.now()
        // Contexto nasce suspenso sem gesto do usuário; sem resume o grafo
        // não roda e o anel fica em silêncio absoluto.
        if (audio.state === 'suspended') void audio.resume().catch(() => {})
        for (const [key, stream] of queued) connect(key, stream)
        queued.clear()
      } catch {
        // Sem worklet utilizável: o resto da call continua funcionando, só
        // não dá pra clipar. `bufferedMs` devolve 0 e a UI se desabilita.
        ring = null
      }
    })()
  }

  const snapshot = (): Promise<Snapshot | null> =>
    new Promise((resolve) => {
      const node = ring
      if (!node) {
        resolve(null)
        return
      }
      const timer = window.setTimeout(() => {
        node.port.onmessage = null
        resolve(null)
      }, 2_000)
      node.port.onmessage = (e: MessageEvent<Snapshot>) => {
        window.clearTimeout(timer)
        node.port.onmessage = null
        resolve(e.data)
      }
      node.port.postMessage('snapshot')
    })

  return {
    add(key, stream) {
      if (destroyed) return
      if (stream.getAudioTracks().length === 0) return
      if (ring) connect(key, stream)
      else queued.set(key, stream)
      ensureRunning()
    },

    remove(key) {
      queued.delete(key)
      const source = sources.get(key)
      if (!source) return
      try {
        source.disconnect()
      } catch {
        // Idem.
      }
      sources.delete(key)
    },

    size: () => sources.size + queued.size,

    bufferedMs() {
      if (!ring) return 0
      return Math.min(WINDOW_MS, performance.now() - startedAt)
    },

    async capture() {
      const rate = ctx?.sampleRate ?? OPUS_RATE
      const snap = await snapshot()
      if (!snap || snap.frames === 0) return null
      const durationMs = (snap.frames / rate) * 1000

      const channels = await toOpusRate(snap, rate)
      const webm = await encodeWebm(channels, durationMs)
      const blob = webm ?? new Blob([wavFromPcm(snap.left, snap.right, rate)], { type: 'audio/wav' })
      return { blob, durationMs, mimeType: blob.type }
    },

    destroy() {
      destroyed = true
      queued.clear()
      for (const source of sources.values()) {
        try {
          source.disconnect()
        } catch {
          // Idem.
        }
      }
      sources.clear()
      try {
        ring?.disconnect()
      } catch {
        // Idem.
      }
      ring = null
      mix = null
      void ctx?.close().catch(() => {})
      ctx = null
    }
  }
}
