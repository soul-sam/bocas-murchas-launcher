/**
 * CORTAR ÁUDIO NO CLIENTE.
 *
 * O servidor não tem ffmpeg (está escrito em routes/sounds.routes.ts: a
 * duração vem daqui justamente por isso). Então quem corta é o launcher, com
 * WebAudio, e o que sobe é um arquivo já do tamanho certo.
 *
 * O corte sai em WAV PCM 16 bits. Não é o formato mais magro, mas é o único
 * que dá pra escrever em JavaScript puro sem carregar um encoder: 8s em 48 kHz
 * estéreo dão 1,5 MB, e o limite do servidor é 4 MB (routes/sounds.routes.ts).
 * Arquivo que já cabe inteiro sobe como veio — mp3 continua mp3, e ninguém
 * paga reencode por nada.
 */

/** Trecho menor que isso é clique, não som. */
export const TRIM_MIN_MS = 200

/**
 * Teto do arquivo de ENTRADA — o que o servidor aceita é o de saída (4 MB).
 *
 * Decodificar gasta memória de verdade: um mp3 vira float32, e um minuto de
 * 48 kHz estéreo ocupa 23 MB de RAM. 15 MB de mp3 já são uns 15 minutos de
 * música, que é bem mais do que alguém procura pra tirar 8 segundos.
 */
export const MAX_SOURCE_BYTES = 15_000_000

/** Acima disso a decodificação custa mais RAM do que a piada vale. */
export const MAX_SOURCE_MS = 10 * 60 * 1000

/**
 * Teto da taxa de amostragem na exportação.
 *
 * Nada de soundboard precisa de 96 kHz, e a conta do WAV é linear: dobrar a
 * taxa dobra o arquivo. 48 kHz mantém 8s abaixo de 1,6 MB.
 */
const RENDER_MAX_RATE = 48_000

/** Corte seco estala. Uma rampa curta nas pontas mata o clique sem comer som. */
const FADE_MS = 5

let shared: AudioContext | null = null

/**
 * Um AudioContext pro app inteiro.
 *
 * Chromium limita quantos dá pra abrir (uns 6); um por arquivo escolhido
 * esgotaria a cota de quem fica trocando o arquivo no diálogo até achar o som
 * certo.
 */
export function getAudioContext(): AudioContext {
  if (!shared || shared.state === 'closed') shared = new AudioContext()
  return shared
}

export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(
      `Arquivo de ${(file.size / 1_000_000).toFixed(1)} MB — passa do limite de ${
        MAX_SOURCE_BYTES / 1_000_000
      } MB pra cortar aqui.`
    )
  }

  const bytes = await file.arrayBuffer()

  let buffer: AudioBuffer
  try {
    // `decodeAudioData` esvazia o ArrayBuffer que recebe — por isso ele não é
    // reaproveitado depois daqui.
    buffer = await getAudioContext().decodeAudioData(bytes)
  } catch {
    throw new Error('Não consegui ler esse áudio. Tenta mp3, ogg, wav ou m4a.')
  }

  if (buffer.duration * 1000 > MAX_SOURCE_MS) {
    throw new Error(
      `Áudio de ${Math.round(buffer.duration / 60)} min. Corta num editor antes — aqui vai até ${
        MAX_SOURCE_MS / 60_000
      } min.`
    )
  }

  return buffer
}

/**
 * Amplitude máxima por coluna do desenho, já normalizada.
 *
 * Normalizar é o que faz gravação baixinha aparecer: sem isso, um áudio a −20
 * dB vira uma linha reta e ninguém acha o trecho olhando. O piso evita que
 * silêncio puro vire ruído amplificado.
 */
export function buildPeaks(buffer: AudioBuffer, bins: number): Float32Array {
  const peaks = new Float32Array(Math.max(1, bins))
  const channels = Math.min(buffer.numberOfChannels, 2)
  const perBin = buffer.length / peaks.length

  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c)
    for (let b = 0; b < peaks.length; b++) {
      const from = Math.floor(b * perBin)
      const to = Math.min(data.length, Math.floor((b + 1) * perBin))
      // Uma coluna pode cobrir milhares de amostras num arquivo de minutos.
      // Ler 256 delas desenha a mesma silhueta por uma fração do custo.
      const step = Math.max(1, Math.floor((to - from) / 256))
      let max = 0
      for (let i = from; i < to; i += step) {
        const v = Math.abs(data[i])
        if (v > max) max = v
      }
      if (max > peaks[b]) peaks[b] = max
    }
  }

  let loudest = 0
  for (const p of peaks) if (p > loudest) loudest = p
  if (loudest > 0.02) {
    for (let i = 0; i < peaks.length; i++) peaks[i] = Math.min(1, peaks[i] / loudest)
  }

  return peaks
}

/** Renderiza só o trecho escolhido, com as rampas das pontas já aplicadas. */
export async function renderTrim(
  buffer: AudioBuffer,
  startMs: number,
  endMs: number
): Promise<AudioBuffer> {
  const startSec = Math.max(0, startMs / 1000)
  const seconds = Math.max(0.01, (endMs - startMs) / 1000)

  const rate = Math.min(buffer.sampleRate, RENDER_MAX_RATE)
  const offline = new OfflineAudioContext(
    Math.min(buffer.numberOfChannels, 2),
    Math.max(1, Math.round(seconds * rate)),
    rate
  )

  const source = offline.createBufferSource()
  source.buffer = buffer

  const gain = offline.createGain()
  const fade = Math.min(FADE_MS / 1000, seconds / 4)
  gain.gain.setValueAtTime(0, 0)
  gain.gain.linearRampToValueAtTime(1, fade)
  gain.gain.setValueAtTime(1, Math.max(fade, seconds - fade))
  gain.gain.linearRampToValueAtTime(0, seconds)

  source.connect(gain).connect(offline.destination)
  source.start(0, startSec, seconds)

  return offline.startRendering()
}

/** AudioBuffer -> WAV PCM 16 bits. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels
  const frames = buffer.length
  const dataBytes = frames * channels * 2

  const out = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(out)

  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true) // tamanho do bloco fmt
  view.setUint16(20, 1, true) // 1 = PCM sem compressão
  view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * channels * 2, true) // bytes por segundo
  view.setUint16(32, channels * 2, true) // bytes por quadro
  view.setUint16(34, 16, true) // bits por amostra
  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)

  const tracks: Float32Array[] = []
  for (let c = 0; c < channels; c++) tracks.push(buffer.getChannelData(c))

  let offset = 44
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      // O negativo tem um passo a mais que o positivo em complemento de dois;
      // usar 0x8000 dos dois lados estouraria o pico positivo.
      const s = Math.max(-1, Math.min(1, tracks[c][i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([out], { type: 'audio/wav' })
}

/** O trecho escolhido virando arquivo, pronto pro upload. */
export async function trimToFile(
  buffer: AudioBuffer,
  originalName: string,
  startMs: number,
  endMs: number
): Promise<File> {
  const rendered = await renderTrim(buffer, startMs, endMs)
  const blob = encodeWav(rendered)
  const base = originalName.replace(/\.[^.]+$/, '') || 'som'
  return new File([blob], `${base}.wav`, { type: 'audio/wav' })
}

/** Quanto o WAV vai pesar, sem renderizar nada — pra avisar antes de subir. */
export function estimateWavBytes(buffer: AudioBuffer, durationMs: number): number {
  const rate = Math.min(buffer.sampleRate, RENDER_MAX_RATE)
  const channels = Math.min(buffer.numberOfChannels, 2)
  return 44 + Math.round((durationMs / 1000) * rate) * channels * 2
}

/** `5.4s` pra trecho curto, `1:05.4` quando passa do minuto. */
export function formatTrimTime(ms: number): string {
  const total = Math.max(0, ms) / 1000
  if (total < 60) return `${total.toFixed(1)}s`
  const minutes = Math.floor(total / 60)
  const seconds = total - minutes * 60
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`
}

export interface RegionPlayback {
  stop: () => void
  /** `currentTime` do contexto quando o trecho começou — pra mover o cursor. */
  startedAt: number
}

/**
 * Toca só o trecho, com as mesmas rampas do arquivo final.
 *
 * Por WebAudio e não por `<audio>`: webm gravado ao vivo não traz duração no
 * cabeçalho e recusa `currentTime`, e é justamente o formato que sai do clipe.
 * Tocando do buffer decodificado, o que se ouve aqui é exatamente o que vai
 * ser salvo.
 */
export function playRegion(
  buffer: AudioBuffer,
  startMs: number,
  endMs: number,
  volume: number,
  onEnded: () => void
): RegionPlayback {
  const ctx = getAudioContext()
  void ctx.resume()

  const seconds = Math.max(0.01, (endMs - startMs) / 1000)
  const source = ctx.createBufferSource()
  source.buffer = buffer

  const gain = ctx.createGain()
  const fade = Math.min(FADE_MS / 1000, seconds / 4)
  const level = Math.max(0, Math.min(1, volume))
  const at = ctx.currentTime

  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(level, at + fade)
  gain.gain.setValueAtTime(level, at + Math.max(fade, seconds - fade))
  gain.gain.linearRampToValueAtTime(0, at + seconds)

  source.connect(gain).connect(ctx.destination)
  source.onended = onEnded
  source.start(at, Math.max(0, startMs / 1000), seconds)

  return {
    startedAt: at,
    stop: () => {
      // `onended` dispara no stop também, e é ele quem avisa quem chamou.
      try {
        source.stop()
      } catch {
        // Já tinha terminado sozinho.
      }
    }
  }
}
