/**
 * BUFFER ROLANTE DA CALL — os últimos ~30 segundos, sempre à mão.
 *
 * ------------------------------------------------------------------
 * A DECISÃO QUE MANDA NO ARQUIVO
 * ------------------------------------------------------------------
 * "Guardar os últimos 30s" parece pedir UM `MediaRecorder` com `timeslice`
 * curto e uma fila de pedaços. Não funciona: num webm, os pedaços depois do
 * primeiro NÃO são decodificáveis sozinhos — o cabeçalho está no primeiro, e
 * jogar fora os pedaços velhos joga fora o começo do arquivo. Dá pra grudar
 * o cabeçalho num recorte do meio e às vezes toca, mas a duração vem quebrada
 * e depende do player. Não vale um acervo em cima disso.
 *
 * A alternativa segura seria guardar PCM cru num anel e montar um WAV na
 * hora: 30s mono a 48kHz dá ~2,9 MB por clipe. Sobreviveria, mas é cem vezes
 * o tamanho do mesmo áudio em opus, e o disco é de uma VPS.
 *
 * Então: TRÊS gravadores sobrepostos na mesma mistura, defasados em
 * `WINDOW_MS / SLOTS`, cada um vivendo `WINDOW_MS` e recomeçando. Em qualquer
 * instante, o mais velho deles está rodando há pelo menos
 * `WINDOW_MS - WINDOW_MS/SLOTS` — com 30s e 3 gravadores, no mínimo 20
 * segundos. Clipar é parar esse e pegar o arquivo dele: um webm inteiro,
 * válido, com duração certa, sem remendo.
 *
 * O preço é a duração variar entre 20 e 30 segundos. É um preço bom: ninguém
 * vai reclamar que o clipe pegou 23s em vez de 30, e todo mundo reclamaria de
 * um arquivo que não toca.
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
 * memória, é descartado a cada ciclo e morre inteiro quando a call acaba —
 * `destroy()` é chamado ao sair. O upload só existe depois de um clique
 * deliberado, e ainda passa por uma tela de confirmação.
 */

/** Quanto tempo cada gravador vive antes de recomeçar. */
const WINDOW_MS = 30_000

/** Gravadores sobrepostos. Três dá piso de 20s; dois dariam 15s. */
const SLOTS = 3

const STAGGER_MS = WINDOW_MS / SLOTS

/** Opus a 64 kbps: voz limpa, ~240 KB por clipe de 30s. */
const AUDIO_BITS = 64_000

/** Da melhor pra pior. Vazio no fim = deixa o navegador escolher. */
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', '']

function pickMime(): string {
  for (const mime of MIME_CANDIDATES) {
    if (!mime) return ''
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) return mime
  }
  return ''
}

interface Slot {
  recorder: MediaRecorder | null
  chunks: Blob[]
  startedAt: number
  timer: number | null
  /** Preenchido quando alguém clipou este slot e espera o arquivo. */
  waiting: ((blob: Blob) => void) | null
}

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
  /** Há quanto tempo o gravador mais velho está rodando. */
  bufferedMs: () => number
  /** Pega os últimos segundos. Null se ainda não há gravador maduro. */
  capture: () => Promise<Capture | null>
  destroy: () => void
}

export function createClipRecorder(): ClipRecorder {
  let ctx: AudioContext | null = null
  let destination: MediaStreamAudioDestinationNode | null = null
  let destroyed = false

  const sources = new Map<string, MediaStreamAudioSourceNode>()
  const slots: Slot[] = []
  const mimeType = pickMime()

  const audioContext = (): AudioContext | null => {
    if (ctx && ctx.state !== 'closed') return ctx
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
      destination = ctx.createMediaStreamDestination()
      return ctx
    } catch {
      return null
    }
  }

  const startSlot = (slot: Slot): void => {
    if (destroyed || !destination) return
    try {
      const recorder = new MediaRecorder(destination.stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: AUDIO_BITS
      })

      slot.chunks = []
      slot.recorder = recorder
      slot.startedAt = performance.now()

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) slot.chunks.push(event.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(slot.chunks, { type: mimeType || 'audio/webm' })
        slot.chunks = []

        const waiting = slot.waiting
        slot.waiting = null
        if (waiting) waiting(blob)

        // Recomeça sozinho: o buffer não pode ter buraco. Mesmo o ciclo
        // normal (sem clipe) passa por aqui.
        if (!destroyed) startSlot(slot)
      }

      recorder.start()

      // Ciclo normal: viveu `WINDOW_MS`, para e recomeça pelo `onstop`.
      slot.timer = window.setTimeout(() => {
        slot.timer = null
        if (slot.recorder?.state === 'recording') slot.recorder.stop()
      }, WINDOW_MS)
    } catch {
      // Sem MediaRecorder utilizável: o resto da call continua funcionando,
      // só não dá pra clipar. `bufferedMs` devolve 0 e a UI se desabilita.
      slot.recorder = null
    }
  }

  const ensureRunning = (): void => {
    if (destroyed || slots.length > 0) return
    if (!audioContext()) return

    for (let i = 0; i < SLOTS; i++) {
      const slot: Slot = { recorder: null, chunks: [], startedAt: 0, timer: null, waiting: null }
      slots.push(slot)
      // Defasagem: é ela que garante que sempre exista um gravador maduro.
      window.setTimeout(() => {
        if (!destroyed) startSlot(slot)
      }, i * STAGGER_MS)
    }
  }

  const oldest = (): Slot | null => {
    const now = performance.now()
    let best: Slot | null = null
    let bestAge = -1
    for (const slot of slots) {
      if (slot.recorder?.state !== 'recording') continue
      const age = now - slot.startedAt
      if (age > bestAge) {
        bestAge = age
        best = slot
      }
    }
    return best
  }

  return {
    add(key, stream) {
      if (destroyed) return
      const audio = audioContext()
      if (!audio || !destination) return
      if (stream.getAudioTracks().length === 0) return

      // Contexto nasce suspenso sem gesto do usuário; sem resume o grafo não
      // roda e o clipe sai em silêncio absoluto.
      if (audio.state === 'suspended') void audio.resume().catch(() => {})

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
        const source = audio.createMediaStreamSource(stream)
        source.connect(destination)
        sources.set(key, source)
      } catch {
        // Faixa que morreu entre o evento e aqui. Fica de fora da mistura.
        return
      }

      ensureRunning()
    },

    remove(key) {
      const source = sources.get(key)
      if (!source) return
      try {
        source.disconnect()
      } catch {
        // Idem.
      }
      sources.delete(key)
    },

    size: () => sources.size,

    bufferedMs() {
      const slot = oldest()
      if (!slot) return 0
      return Math.min(WINDOW_MS, performance.now() - slot.startedAt)
    },

    capture() {
      const slot = oldest()
      if (!slot || !slot.recorder) return Promise.resolve(null)

      const durationMs = Math.min(WINDOW_MS, performance.now() - slot.startedAt)

      return new Promise<Capture | null>((resolve) => {
        // Já tem alguém esperando este slot (dois cliques colados): o segundo
        // recebe o mesmo arquivo em vez de brigar pelo `onstop`.
        const previous = slot.waiting
        slot.waiting = (blob) => {
          previous?.(blob)
          resolve(blob.size > 0 ? { blob, durationMs, mimeType: blob.type } : null)
        }

        if (slot.timer !== null) {
          window.clearTimeout(slot.timer)
          slot.timer = null
        }

        if (slot.recorder?.state === 'recording') slot.recorder.stop()
        else resolve(null)
      })
    },

    destroy() {
      destroyed = true
      for (const slot of slots) {
        if (slot.timer !== null) window.clearTimeout(slot.timer)
        slot.timer = null
        slot.waiting = null
        try {
          if (slot.recorder?.state === 'recording') slot.recorder.stop()
        } catch {
          // Gravador já parado.
        }
        slot.recorder = null
        slot.chunks = []
      }
      slots.length = 0

      for (const source of sources.values()) {
        try {
          source.disconnect()
        } catch {
          // Idem.
        }
      }
      sources.clear()

      destination = null
      void ctx?.close().catch(() => {})
      ctx = null
    }
  }
}
