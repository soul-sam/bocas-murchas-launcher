/**
 * QUEM ESTÁ FALANDO — medido aqui, não perguntado pro servidor.
 *
 * ------------------------------------------------------------------
 * O QUE ESTAVA ERRADO
 * ------------------------------------------------------------------
 * O anel de "está falando" vinha inteiro do `ActiveSpeakersChanged` do
 * LiveKit, que é a lista de DOMINANTES calculada pelo SFU a partir do nível
 * de áudio que cada cliente carimba no RTP. Isso tem três defeitos, e são
 * exatamente os três sintomas que a galera relatou:
 *
 *  - DEMORA. A decisão é do servidor, com janela de suavização própria, e
 *    ainda volta pela rede. Meio segundo é normal; numa conexão ruim, mais.
 *    Quem fala uma frase curta acende o anel quando já parou de falar.
 *  - NÃO CAPTA. A lista é dos dominantes, e é LIMITADA. Com duas pessoas
 *    falando alto, a terceira — falando baixo, ou só concordando — nunca
 *    entra na lista. O anel dela simplesmente não acende.
 *  - VAI E VOLTA. Entre uma atualização e outra o estado congela, então o
 *    anel pisca fora de sincronia com a voz que se ouve.
 *
 * ------------------------------------------------------------------
 * O QUE ESTE MÓDULO FAZ
 * ------------------------------------------------------------------
 * Mede o nível de CADA faixa de áudio direto no Web Audio, aqui na máquina,
 * a cada 60ms. É a mesma coisa que o medidor do microfone já fazia pra você
 * — só que agora vale pra todo mundo na sala.
 *
 * Vantagens que não são teoria: o anel acende na primeira sílaba (a decisão
 * não sai da máquina), acende pra TODO MUNDO que estiver falando ao mesmo
 * tempo (não existe lista limitada), e continua funcionando se o servidor
 * estiver com atraso.
 *
 * O SEU PRÓPRIO áudio entra pela mesma porta, medindo a faixa PROCESSADA (a
 * que os outros recebem, depois do ganho e do portão de ruído). Assim o seu
 * anel conta a verdade: portão fechado é silêncio pros outros, e portanto
 * silêncio aqui. Sem exceção, sem caminho separado.
 *
 * A leitura NÃO passa pelo `<audio>`: é uma derivação da faixa, então mexer
 * no volume de alguém (ou mutar só pra você) não apaga o anel dela — você
 * continua vendo que a pessoa está falando, que é o que se quer saber.
 */

/**
 * Acima disto é voz. Em dBFS, sobre a média quadrática de ~11ms de áudio.
 *
 * −55 é baixo de propósito: fala normal fica entre −35 e −20, e ruído de
 * fundo com supressão ligada fica abaixo de −65. O espaço entre os dois é
 * grande, e errar pra baixo (acender pra quem falou baixinho) é muito melhor
 * do que errar pra cima, que é o defeito que estamos consertando.
 */
const SPEAK_DB = -55

/**
 * Depois que a voz cai, quanto o anel fica aceso.
 *
 * Sem isso ele apagaria entre sílabas e no meio de cada respiração — o anel
 * viraria um estroboscópio. 220ms é a mesma ordem do `HOLD_MS` do portão de
 * ruído (lib/audio-processor), pelo mesmo motivo.
 */
const HOLD_MS = 220

/**
 * De quanto em quanto se mede.
 *
 * 60ms é imperceptível pra quem olha (três quadros a 50fps) e ~10x mais
 * rápido que a atualização do servidor. Custa uma leitura de 512 amostras
 * por pessoa — troco, comparado a decodificar o áudio dela.
 */
const TICK_MS = 60

/** Janela da medição. 512 amostras a 48kHz ≈ 11ms. */
const FFT_SIZE = 512

interface Watched {
  source: MediaStreamAudioSourceNode
  analyser: AnalyserNode
  // `<ArrayBuffer>` explícito: o `getFloatTimeDomainData` do lib.dom não
  // aceita um Float32Array que possa estar sobre SharedArrayBuffer.
  buffer: Float32Array<ArrayBuffer>
  /** Última vez, em ms, que esta faixa passou do limiar. */
  lastAbove: number
}

export interface SpeakingDetector {
  /** Passa a medir esta pessoa. Chamar de novo troca a faixa. */
  watch: (identity: string, stream: MediaStream) => void
  unwatch: (identity: string) => void
  /** Verdadeiro se estamos medindo alguém — quem não está cai no sinal do servidor. */
  watching: (identity: string) => boolean
  isSpeaking: (identity: string) => boolean
  destroy: () => void
}

/**
 * `onChange` só é chamado quando o CONJUNTO muda — não a cada 60ms.
 *
 * É o que torna isto barato pro React: quem fala por três segundos gera dois
 * avisos (começou, parou), não cinquenta.
 */
export function createSpeakingDetector(onChange: () => void): SpeakingDetector {
  let ctx: AudioContext | null = null
  const watched = new Map<string, Watched>()
  const speaking = new Set<string>()
  let timer: number | null = null
  let destroyed = false

  const audioContext = (): AudioContext | null => {
    if (ctx && ctx.state !== 'closed') return ctx
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
      return ctx
    } catch {
      return null
    }
  }

  const readDb = (entry: Watched): number => {
    entry.analyser.getFloatTimeDomainData(entry.buffer)
    let sum = 0
    for (const sample of entry.buffer) sum += sample * sample
    const rms = Math.sqrt(sum / entry.buffer.length)
    return rms > 0 ? 20 * Math.log10(rms) : -Infinity
  }

  const tick = (): void => {
    if (destroyed) return
    const now = performance.now()
    let changed = false

    for (const [identity, entry] of watched) {
      if (readDb(entry) >= SPEAK_DB) entry.lastAbove = now

      const active = now - entry.lastAbove < HOLD_MS
      if (active && !speaking.has(identity)) {
        speaking.add(identity)
        changed = true
      } else if (!active && speaking.has(identity)) {
        speaking.delete(identity)
        changed = true
      }
    }

    if (changed) onChange()
    timer = window.setTimeout(tick, TICK_MS)
  }

  const stop = (identity: string): void => {
    const entry = watched.get(identity)
    if (!entry) return
    try {
      entry.source.disconnect()
      entry.analyser.disconnect()
    } catch {
      // Nó já desconectado (o contexto morreu antes): não há o que desfazer.
    }
    watched.delete(identity)
  }

  return {
    watch(identity, stream) {
      const audio = audioContext()
      if (!audio || destroyed) return
      if (stream.getAudioTracks().length === 0) return

      // Contexto nasce suspenso quando não houve gesto do usuário ainda. Sem
      // resume, o grafo não roda e TODO MUNDO aparece calado.
      if (audio.state === 'suspended') void audio.resume().catch(() => {})

      stop(identity)

      try {
        const source = audio.createMediaStreamSource(stream)
        const analyser = audio.createAnalyser()
        analyser.fftSize = FFT_SIZE
        // Sem suavização: quem suaviza é o HOLD, e em dois lugares a
        // suavização vira atraso — que é justamente o defeito de origem.
        analyser.smoothingTimeConstant = 0
        source.connect(analyser)

        // De propósito o analisador NÃO vai pro destino: quem toca o som é o
        // <audio> que o LiveKit anexou. Ligar aqui também tocaria tudo duas
        // vezes, uma delas sem o volume por pessoa.
        watched.set(identity, {
          source,
          analyser,
          buffer: new Float32Array(FFT_SIZE),
          lastAbove: 0
        })
      } catch {
        // Faixa que morreu entre o evento e aqui. Quem não é medido cai no
        // sinal do servidor, que é o comportamento antigo — pior, não quebrado.
        return
      }

      if (timer === null) tick()
    },

    unwatch(identity) {
      stop(identity)
      if (speaking.delete(identity)) onChange()
    },

    watching: (identity) => watched.has(identity),
    isSpeaking: (identity) => speaking.has(identity),

    destroy() {
      destroyed = true
      if (timer !== null) window.clearTimeout(timer)
      timer = null
      for (const identity of [...watched.keys()]) stop(identity)
      speaking.clear()
      void ctx?.close().catch(() => {})
      ctx = null
    }
  }
}
