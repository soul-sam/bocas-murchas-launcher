/**
 * Processamento do microfone antes de ir pro LiveKit.
 *
 * O LiveKit publica o que o getUserMedia entrega, e o getUserMedia só sabe
 * ligar e desligar os filtros do Chromium (eco, ruído, ganho automático). Dois
 * pedidos da galera não cabem aí:
 *
 *   - "meu mic é baixo demais / alto demais" — precisa de um GANHO manual,
 *     porque o ganho automático do Chromium nivela, mas não sobe um mic que já
 *     chega fraco e deixa quem grita estourando;
 *   - "para de transmitir meu ventilador / teclado / a TV do quarto" — a
 *     redução de ruído do Chromium limpa o fundo enquanto a pessoa fala, mas
 *     não fecha o canal quando ela para. Um NOISE GATE fecha: abaixo do limiar
 *     não sai nada, e com DTX ligado o Opus para até de mandar pacote.
 *
 * POR QUE DOIS RAMOS DE DETECÇÃO (e não um RMS só):
 *
 * O gate decidia pelo RMS de TODO o espectro, e ruído de corpo — cadeira
 * rangendo, mesa batendo, e o caso que a galera reportou rindo, flatulência —
 * é energia quase inteira abaixo de 200 Hz. Num RMS de banda cheia esse tipo
 * de estouro passa fácil do limiar, o gate abre, e o que era pra ficar em casa
 * vai pro ar em alta fidelidade.
 *
 * Agora a decisão sai da BANDA DA VOZ (300–3400 Hz, a mesma do telefone: é
 * onde vive a inteligibilidade da fala). E um segundo analisador mede só o
 * grave, pra pegar o caso em que o estouro é tão forte que vaza energia na
 * banda da voz: se o grave DOMINA a voz por mais que LOW_DOMINANCE_DB, não é
 * fala e o gate fica fechado.
 *
 * O sinal transmitido também ganhou um passa-alta em 100 Hz. Fala não perde
 * nada de inteligível ali (fundamental de voz masculina grave começa perto de
 * 85 Hz, mas quem carrega a informação são os harmônicos acima de 300), e é o
 * que faz o ronco de fundo sumir mesmo nos momentos em que o gate está aberto
 * porque a pessoa está falando.
 *
 * A conta erra pra ABERTO de propósito, como o resto deste arquivo: um limiar
 * que fecha na hora errada deixa a pessoa muda sem ela saber, e isso é pior
 * que um ruído passar.
 *
 * O grafo:
 *
 *   getUserMedia → source → ganho → passa-alta → atraso → gate → destino
 *                                 │                              ↑
 *                                 └→ ramo de deteccao            │
 *                                     ├ voz (300–3400 Hz) ───────┘
 *                                     └ grave (< 160 Hz)
 *
 * O SINAL QUE VAI PRO AR passa por um passa-alta; a DECISAO de abrir o gate
 * sai de dois analisadores em ramos filtrados, que nunca chegam ao destino.
 * Ver "por que dois ramos" mais abaixo.
 *
 * O destino é um MediaStreamAudioDestinationNode: a faixa que sai dele é o que
 * vira LocalAudioTrack no LiveKit. Pro resto do app é um microfone comum.
 *
 * O gate é decidido no thread principal por um timer, não num AudioWorklet.
 * Worklet seria o "certo", mas a CSP do renderer só aceita script de 'self'
 * (nada de blob:), e um arquivo solto em public/ pra isso é mais infra do que
 * o problema merece. O timer funciona porque o launcher SEMPRE tem um
 * WebSocket aberto (e um WebRTC durante a call), e o Chromium não estrangula
 * timer de página com conexão em tempo real — mesmo com a janela na bandeja.
 * Se um dia estrangular, a guarda de "tick atrasado" abre o gate em vez de
 * deixar a pessoa muda: errar pra aberto é o erro barato.
 */

export interface MicProcessorOptions {
  /** undefined = padrão do sistema. */
  deviceId?: string
  echoCancellation: boolean
  noiseSuppression: boolean
  autoGainControl: boolean
  /** Multiplicador linear, 0..3 (1 = como veio do mic). */
  inputGain: number
  /** Limiar em dBFS, -100..0. -100 desliga o gate. */
  noiseGateThreshold: number
  /**
   * Corta estouro de baixa frequência (ruído de corpo, mesa, cadeira).
   * Ligado por padrão; desligue se sua voz está sendo cortada.
   */
  rumbleFilter: boolean
}

export interface MicProcessor {
  /** A faixa processada — publique esta no LiveKit. */
  readonly processedTrack: MediaStreamTrack
  /** A mesma faixa embrulhada num stream, pra <audio srcObject>. */
  readonly processedStream: MediaStream
  /** Nível atual, 0..100, já suavizado pra desenhar. Barato de chamar. */
  getLevel: () => number
  /** Nível em dBFS (-100..0), pra comparar com o limiar. */
  getLevelDb: () => number
  /** Gate aberto (transmitindo) ou fechado (silêncio). */
  isOpen: () => boolean
  /** Ajusta ganho, limiar e o corte de grave ao vivo, sem republicar nada. */
  update: (
    patch: Partial<
      Pick<MicProcessorOptions, 'inputGain' | 'noiseGateThreshold' | 'rumbleFilter'>
    >
  ) => void
  destroy: () => void
}

/** Valor do slider que significa "sem gate". Combina com o mínimo do slider. */
export const GATE_OFF_DB = -100

/** De quanto em quanto o gate decide. 10ms = folga pra abrir antes da 1ª sílaba. */
const TICK_MS = 10

/** Depois que a voz cai abaixo do limiar, quanto esperar antes de fechar. */
const HOLD_MS = 250

/** Rampas: abrir rápido (senão come o começo da palavra), fechar devagar (senão estala). */
const ATTACK_S = 0.010
const RELEASE_S = 0.080

/**
 * Lookahead. A decisão é tomada no sinal cru e aplicada num sinal atrasado
 * por este tanto — assim, quando o gate abre, o ataque da palavra ainda não
 * passou por ele. 12ms de latência a mais numa call que já tem 100+ não se
 * percebe; a primeira consoante cortada se percebe em toda frase.
 */
const LOOKAHEAD_S = 0.012

/** Tick mais atrasado que isso = o Chromium estrangulou o timer. */
const LATE_TICK_MS = 200

/** Faixa do medidor: abaixo de -60 dBFS é "nada" pra fins de desenho. */
const METER_FLOOR_DB = -60

/**
 * Passa-alta no sinal QUE VAI PRO AR. 100 Hz tira ronco de mesa, ventilador e
 * ruído de corpo sem tocar no que faz a fala ser entendida.
 */
const HIGHPASS_HZ = 100

/**
 * Banda usada pra DECIDIR se é voz. É a banda do telefone: 300–3400 Hz atende
 * um século de evidência de que dá pra entender qualquer pessoa só com isso.
 */
const VOICE_BAND_HZ = 1_100
const VOICE_BAND_Q = 0.7

/** O ramo do grave, pra comparar com a banda da voz. */
const LOW_BAND_HZ = 160

/**
 * Quanto o grave pode passar da banda da voz antes de "isso não é fala".
 *
 * Fala normal tem o grave perto da voz (a fundamental é forte), então a
 * diferença fica pequena; um estouro de baixa frequência deixa o grave 20 dB
 * ou mais acima. 14 dB é folgado de propósito: voz muito grave em mic
 * encostado na boca chega a uns 10 dB, e cortar essa pessoa seria pior que
 * deixar passar um ruído.
 */
const LOW_DOMINANCE_DB = 14

/** Converte dBFS em 0..100 pro medidor e pro marcador do limiar. */
export function dbToMeter(db: number): number {
  const ratio = (db - METER_FLOOR_DB) / (0 - METER_FLOOR_DB)
  return Math.round(Math.max(0, Math.min(1, ratio)) * 100)
}

export async function createMicProcessor(options: MicProcessorOptions): Promise<MicProcessor> {
  const raw = await navigator.mediaDevices.getUserMedia({
    audio: {
      // deviceId "ideal", não "exact": mic desplugado cai pro padrão em vez
      // de derrubar a entrada na call — igual o LiveKit fazia.
      ...(options.deviceId ? { deviceId: options.deviceId } : {}),
      echoCancellation: options.echoCancellation,
      noiseSuppression: options.noiseSuppression,
      autoGainControl: options.autoGainControl,
      channelCount: 1,
      sampleRate: 48_000
    }
  })

  // 48k é o que o Opus quer; o Chromium reamostra o mic se ele vier em 44.1k.
  let ctx: AudioContext
  try {
    ctx = new AudioContext({ sampleRate: 48_000, latencyHint: 'interactive' })
  } catch {
    ctx = new AudioContext({ latencyHint: 'interactive' })
  }

  const source = ctx.createMediaStreamSource(raw)

  const inputGain = ctx.createGain()
  inputGain.gain.value = clampGain(options.inputGain)

  /**
   * Passa-alta no caminho do ar. Q baixo (0.7) de propósito: um Q alto faria
   * um pico de ressonância em cima de 100 Hz, ou seja, REFORÇARIA exatamente
   * a faixa que a gente quer tirar.
   */
  const highpass = ctx.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = HIGHPASS_HZ
  highpass.Q.value = 0.7

  /**
   * Analisadores de DECISÃO, em ramos que morrem aqui — nada deles chega ao
   * destino. Ligados no ganho de entrada (sinal cru, antes do passa-alta):
   * o ramo do grave precisa ver o grave pra poder compará-lo com a voz.
   *
   * 1024 amostras a 48k = ~21ms de janela: curto pra reagir, longo o bastante
   * pra uma vogal grave não oscilar em volta do limiar.
   */
  const voiceBand = ctx.createBiquadFilter()
  voiceBand.type = 'bandpass'
  voiceBand.frequency.value = VOICE_BAND_HZ
  voiceBand.Q.value = VOICE_BAND_Q

  const voiceAnalyser = ctx.createAnalyser()
  voiceAnalyser.fftSize = 1024
  voiceAnalyser.smoothingTimeConstant = 0

  const lowBand = ctx.createBiquadFilter()
  lowBand.type = 'lowpass'
  lowBand.frequency.value = LOW_BAND_HZ
  lowBand.Q.value = 0.7

  const lowAnalyser = ctx.createAnalyser()
  lowAnalyser.fftSize = 1024
  lowAnalyser.smoothingTimeConstant = 0

  const lookahead = ctx.createDelay(0.1)
  lookahead.delayTime.value = LOOKAHEAD_S

  const gate = ctx.createGain()
  gate.gain.value = 1

  const destination = ctx.createMediaStreamDestination()

  // Caminho do ar.
  source.connect(inputGain)
  inputGain.connect(highpass)
  highpass.connect(lookahead)
  lookahead.connect(gate)
  gate.connect(destination)

  // Ramos de deteccao (sem saida).
  inputGain.connect(voiceBand)
  voiceBand.connect(voiceAnalyser)
  inputGain.connect(lowBand)
  lowBand.connect(lowAnalyser)

  const processedTrack = destination.stream.getAudioTracks()[0]

  // --- estado do gate -------------------------------------------------------

  let threshold = options.noiseGateThreshold
  let rumbleFilter = options.rumbleFilter
  let open = true
  let lastAboveAt = performance.now()
  let lastTickAt = performance.now()
  let forceOpenUntil = 0
  let levelDb = GATE_OFF_DB
  let meter = 0
  let destroyed = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const voiceSamples = new Float32Array(voiceAnalyser.fftSize)
  const lowSamples = new Float32Array(lowAnalyser.fftSize)

  /** RMS de uma janela, em dBFS. */
  const readDb = (node: AnalyserNode, buffer: Float32Array<ArrayBuffer>): number => {
    node.getFloatTimeDomainData(buffer)
    let sum = 0
    for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
    const rms = Math.sqrt(sum / buffer.length)
    return rms > 0 ? Math.max(GATE_OFF_DB, 20 * Math.log10(rms)) : GATE_OFF_DB
  }

  const rampTo = (target: number, seconds: number): void => {
    const now = ctx.currentTime
    const param = gate.gain
    // O setValueAtTime ancora a rampa no valor de agora; sem ele o
    // linearRamp partiria do último evento agendado, que pode estar no passado.
    param.cancelScheduledValues(now)
    param.setValueAtTime(param.value, now)
    param.linearRampToValueAtTime(target, now + seconds)
  }

  const openGate = (): void => {
    if (open) return
    open = true
    rampTo(1, ATTACK_S)
  }

  const closeGate = (): void => {
    if (!open) return
    open = false
    rampTo(0, RELEASE_S)
  }

  const tick = (): void => {
    if (destroyed) return

    const now = performance.now()
    const sinceLast = now - lastTickAt
    lastTickAt = now

    // A decisao (e o medidor) saem da BANDA DA VOZ: e o que o limiar do
    // slider passou a significar, e o que faz estouro de grave nao abrir nada.
    levelDb = readDb(voiceAnalyser, voiceSamples)
    const lowDb = readDb(lowAnalyser, lowSamples)
    // Grave dominando a voz = ruido de corpo, nao fala.
    const rumble = rumbleFilter && lowDb - levelDb > LOW_DOMINANCE_DB

    // Medidor com queda suave: o valor instantâneo pisca demais pra ler.
    const instant = dbToMeter(levelDb)
    meter = instant >= meter ? instant : Math.max(instant, meter - 6)

    if (threshold <= GATE_OFF_DB) {
      openGate()
    } else {
      // Timer estrangulado: não dá pra decidir com 1 leitura por segundo.
      // Abre e segura aberto até os ticks voltarem ao normal.
      if (sinceLast > LATE_TICK_MS) forceOpenUntil = now + 1_000

      if ((levelDb >= threshold && !rumble) || now < forceOpenUntil) {
        lastAboveAt = now
        openGate()
      } else if (open && now - lastAboveAt >= HOLD_MS) {
        closeGate()
      }
    }

    timer = setTimeout(tick, TICK_MS)
  }

  // Contexto pode nascer suspenso; sem resume o grafo não roda e a faixa sai muda.
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {})

  tick()

  return {
    processedTrack,
    processedStream: destination.stream,
    getLevel: () => meter,
    getLevelDb: () => levelDb,
    isOpen: () => open,
    update: (patch) => {
      if (patch.inputGain !== undefined) {
        // Rampa curta em vez de pulo: mexer no slider não pode estalar no ouvido dos outros.
        const now = ctx.currentTime
        inputGain.gain.cancelScheduledValues(now)
        inputGain.gain.setValueAtTime(inputGain.gain.value, now)
        inputGain.gain.linearRampToValueAtTime(clampGain(patch.inputGain), now + 0.03)
      }
      if (patch.noiseGateThreshold !== undefined) {
        threshold = Math.max(GATE_OFF_DB, Math.min(0, patch.noiseGateThreshold))
      }
      if (patch.rumbleFilter !== undefined) {
        rumbleFilter = patch.rumbleFilter
      }
    },
    destroy: () => {
      if (destroyed) return
      destroyed = true
      if (timer) clearTimeout(timer)
      // Parar as faixas cruas apaga o LED do mic; fechar o contexto solta o
      // dispositivo — sem isso alguns headsets ficam "ocupados" pra próxima call.
      for (const track of raw.getTracks()) track.stop()
      processedTrack.stop()
      source.disconnect()
      inputGain.disconnect()
      highpass.disconnect()
      voiceBand.disconnect()
      voiceAnalyser.disconnect()
      lowBand.disconnect()
      lowAnalyser.disconnect()
      lookahead.disconnect()
      gate.disconnect()
      void ctx.close().catch(() => {})
    }
  }
}

function clampGain(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(3, value)) : 1
}
