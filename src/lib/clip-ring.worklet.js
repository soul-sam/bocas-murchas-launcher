/**
 * ANEL DOS ÚLTIMOS 30 s DA CALL, no thread de áudio.
 *
 * Recebe a mistura (todas as faixas ligadas na entrada) e guarda o PCM em
 * Int16 estéreo, sobrescrevendo o mais velho. Não codifica nada: o custo
 * contínuo é copiar 128 quadros a cada ~2,7 ms. A codificação (opus) só
 * acontece quando alguém clipa — ver clip-recorder.ts.
 *
 * Mensagens:
 *   recebe 'snapshot' → devolve { left, right, frames } (Int16Array, do mais
 *   velho pro mais novo, transferidos), sem parar de gravar.
 *
 * JS puro de propósito: é carregado por addModule() a partir de uma URL, sem
 * passar pelo TypeScript (mesmo esquema de process-loopback.worklet.js).
 */
const WINDOW_SECONDS = 30

class ClipRing extends AudioWorkletProcessor {
  constructor() {
    super()
    this.capacity = Math.ceil(sampleRate * WINDOW_SECONDS)
    this.left = new Int16Array(this.capacity)
    this.right = new Int16Array(this.capacity)
    this.write = 0
    this.filled = 0

    this.port.onmessage = (e) => {
      if (e.data !== 'snapshot') return
      const frames = this.filled
      const left = new Int16Array(frames)
      const right = new Int16Array(frames)
      // O mais velho começa em `write` quando o anel já deu a volta.
      const start = frames < this.capacity ? 0 : this.write
      const head = Math.min(frames, this.capacity - start)
      left.set(this.left.subarray(start, start + head))
      right.set(this.right.subarray(start, start + head))
      if (head < frames) {
        left.set(this.left.subarray(0, frames - head), head)
        right.set(this.right.subarray(0, frames - head), head)
      }
      this.port.postMessage({ left, right, frames }, [left.buffer, right.buffer])
    }
  }

  process(inputs) {
    const input = inputs[0]
    // Sem ninguém ligado a entrada vem vazia: grava silêncio, pra linha do
    // tempo não encolher.
    const l = input && input[0]
    const r = (input && input[1]) || l
    const n = l ? l.length : 128

    for (let i = 0; i < n; i++) {
      const a = l ? l[i] : 0
      const b = r ? r[i] : 0
      this.left[this.write] = a >= 1 ? 32767 : a <= -1 ? -32768 : (a * 32767) | 0
      this.right[this.write] = b >= 1 ? 32767 : b <= -1 ? -32768 : (b * 32767) | 0
      this.write = this.write + 1 === this.capacity ? 0 : this.write + 1
    }
    this.filled = Math.min(this.capacity, this.filled + n)
    return true
  }
}

registerProcessor('bm-clip-ring', ClipRing)
