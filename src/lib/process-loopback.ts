// Vai como arquivo (ver assetsInlineLimit no electron.vite.config.ts):
// embutido viraria data: URL, e o CSP (default-src 'self') barra.
import workletUrl from './process-loopback.worklet.js?url'

/**
 * SOM DO SISTEMA SEM O LAUNCHER — a faixa que vai pra call.
 *
 * O loopback comum (`audio: 'loopback'` no getDisplayMedia) captura a mistura
 * final da placa de som, launcher incluso: quem transmitia a tela com som
 * devolvia pra call as vozes da call, o soundboard e os avisos. A medicao e o
 * que foi tentado antes estao em lib/launcher-silence.ts.
 *
 * Agora o som vem do bm-loopback.exe, que usa a captura por processo do
 * Windows excluindo o AudioService do Chromium (onde TODO som do launcher
 * toca). Medido: tom tocado pelo processo excluido some da captura (−238 dB,
 * zero digital); o mesmo tom de outro processo chega inteiro.
 *
 *   bm-loopback.exe → stdout → main → IPC → aqui → AudioWorklet → faixa
 *
 * A faixa nao e tocada localmente (nao ligamos no ctx.destination): ela so
 * existe pra ser publicada como ScreenShareAudio.
 *
 * O AudioContext usa a taxa PADRAO do dispositivo e o helper captura nessa
 * taxa: forcar sampleRate no AudioContext ja deixou voz robotizada aqui.
 */

export interface LoopbackCapture {
  track: MediaStreamTrack
  stop: () => void
}

/**
 * `null` = nao da (navegador, Windows antigo, helper ausente ou falhou). Quem
 * chama cai no loopback comum do getDisplayMedia.
 */
export async function startProcessLoopbackCapture(): Promise<LoopbackCapture | null> {
  const api = window.bocas?.screen?.loopback
  if (!api) return null

  const ctx = new AudioContext({ latencyHint: 'interactive' })
  let unsubscribe: (() => void) | null = null
  let stopped = false

  const stop = (): void => {
    if (stopped) return
    stopped = true
    unsubscribe?.()
    void api.stop()
    void ctx.close()
  }

  try {
    await ctx.audioWorklet.addModule(workletUrl)
    const player = new AudioWorkletNode(ctx, 'bm-loopback-player', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2]
    })
    const destination = ctx.createMediaStreamDestination()
    destination.channelCount = 2
    player.connect(destination)

    // O pipe corta onde quiser: um pedaco pode terminar no meio de um quadro
    // (8 bytes = 2 canais × float32). O resto fica guardado pro proximo.
    let carry = new Uint8Array(0)
    unsubscribe = api.onPcm((chunk) => {
      let bytes: Uint8Array
      if (carry.length) {
        bytes = new Uint8Array(carry.length + chunk.length)
        bytes.set(carry)
        bytes.set(chunk, carry.length)
      } else {
        bytes = chunk
      }
      const usable = bytes.length - (bytes.length % 8)
      carry = bytes.slice(usable)
      if (usable === 0) return
      // slice = buffer novo e alinhado, que pode ser transferido sem copia.
      const buffer = bytes.slice(0, usable).buffer
      player.port.postMessage(buffer, [buffer])
    })

    const result = await api.start(ctx.sampleRate)
    if (!result.ok) {
      console.warn('[loopback] captura por processo indisponivel:', result.error)
      stop()
      return null
    }
    await ctx.resume()

    const track = destination.stream.getAudioTracks()[0]
    if (!track) {
      stop()
      return null
    }
    return { track, stop }
  } catch (err) {
    console.warn('[loopback] falha ao montar a captura', err)
    stop()
    return null
  }
}
