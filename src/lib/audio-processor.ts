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
 * O grafo:
 *
 *   getUserMedia → source → ganho → analisador → atraso → gate → destino
 *                                       ↑                   ↑
 *                                   mede o RMS         sobe/desce o ganho
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
  /** Ajusta ganho e limiar ao vivo, sem republicar nada. */
  update: (patch: Partial<Pick<MicProcessorOptions, 'inputGain' | 'noiseGateThreshold'>>) => void
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

  // 1024 amostras a 48k = ~21ms de janela: curto pra reagir, longo o bastante
  // pra uma vogal grave não oscilar em volta do limiar.
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  analyser.smoothingTimeConstant = 0

  const lookahead = ctx.createDelay(0.1)
  lookahead.delayTime.value = LOOKAHEAD_S

  const gate = ctx.createGain()
  gate.gain.value = 1

  const destination = ctx.createMediaStreamDestination()

  source.connect(inputGain)
  inputGain.connect(analyser)
  analyser.connect(lookahead)
  lookahead.connect(gate)
  gate.connect(destination)

  const processedTrack = destination.stream.getAudioTracks()[0]

  // --- estado do gate -------------------------------------------------------

  let threshold = options.noiseGateThreshold
  let open = true
  let lastAboveAt = performance.now()
  let lastTickAt = performance.now()
  let forceOpenUntil = 0
  let levelDb = GATE_OFF_DB
  let meter = 0
  let destroyed = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const samples = new Float32Array(analyser.fftSize)

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

    analyser.getFloatTimeDomainData(samples)
    let sum = 0
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
    const rms = Math.sqrt(sum / samples.length)
    levelDb = rms > 0 ? Math.max(GATE_OFF_DB, 20 * Math.log10(rms)) : GATE_OFF_DB

    // Medidor com queda suave: o valor instantâneo pisca demais pra ler.
    const instant = dbToMeter(levelDb)
    meter = instant >= meter ? instant : Math.max(instant, meter - 6)

    if (threshold <= GATE_OFF_DB) {
      openGate()
    } else {
      // Timer estrangulado: não dá pra decidir com 1 leitura por segundo.
      // Abre e segura aberto até os ticks voltarem ao normal.
      if (sinceLast > LATE_TICK_MS) forceOpenUntil = now + 1_000

      if (levelDb >= threshold || now < forceOpenUntil) {
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
      analyser.disconnect()
      lookahead.disconnect()
      gate.disconnect()
      void ctx.close().catch(() => {})
    }
  }
}

function clampGain(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(3, value)) : 1
}
