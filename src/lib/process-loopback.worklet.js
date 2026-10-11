/**
 * Toca no grafo de audio o PCM que chega do bm-loopback (via main → IPC →
 * port). E um buffer de jitter: o IPC entrega em rajadas, o render thread
 * pede 128 quadros a cada ~2,7 ms.
 *
 * - Espera juntar PRIME antes de soltar som (e de novo depois de secar),
 *   pra nao picotar.
 * - Se acumular mais que MAX (main travou e depois despejou tudo), pula pro
 *   mais recente: atraso cresce e nunca volta, picote passa.
 *
 * JS puro de proposito: e carregado por addModule() a partir de uma URL, sem
 * passar pelo TypeScript. Ver process-loopback.ts.
 */
class LoopbackPlayer extends AudioWorkletProcessor {
  constructor() {
    super()
    const rate = sampleRate
    this.capacity = Math.ceil(rate) // 1 s por canal
    this.left = new Float32Array(this.capacity)
    this.right = new Float32Array(this.capacity)
    this.read = 0
    this.write = 0
    this.size = 0
    this.prime = Math.round(rate * 0.04)
    this.max = Math.round(rate * 0.2)
    this.primed = false

    this.port.onmessage = (e) => {
      const data = new Float32Array(e.data)
      const frames = data.length >> 1
      for (let i = 0; i < frames; i++) {
        this.left[this.write] = data[i * 2]
        this.right[this.write] = data[i * 2 + 1]
        this.write = (this.write + 1) % this.capacity
      }
      this.size += frames
      if (this.size > this.capacity) {
        // Transbordou o anel: o mais antigo foi sobrescrito.
        this.read = this.write
        this.size = this.capacity
      }
      if (this.size > this.max) {
        const skip = this.size - this.prime
        this.read = (this.read + skip) % this.capacity
        this.size -= skip
      }
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0]
    const l = out[0]
    const r = out[1] ?? out[0]
    const n = l.length

    if (!this.primed) {
      if (this.size < this.prime) return true
      this.primed = true
    }

    const take = Math.min(n, this.size)
    for (let i = 0; i < take; i++) {
      l[i] = this.left[this.read]
      r[i] = this.right[this.read]
      this.read = (this.read + 1) % this.capacity
    }
    this.size -= take
    if (take < n) this.primed = false // secou: o resto fica em silencio
    return true
  }
}

registerProcessor('bm-loopback-player', LoopbackPlayer)
