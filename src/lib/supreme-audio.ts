export const SUPREME_CLIP_SEC = 2
export const TARGET_RATE = 48000

export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0].slice()
  const out = new Float32Array(channels[0].length)
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length
  return out
}

export function sliceWindow(samples: Float32Array, sampleRate: number, startSec: number, durSec: number): Float32Array {
  const len = Math.min(samples.length, Math.round(durSec * sampleRate))
  const maxStart = samples.length - len
  const start = Math.max(0, Math.min(maxStart, Math.round(startSec * sampleRate)))
  return samples.slice(start, start + len)
}

export function applyFades(samples: Float32Array, sampleRate: number, fadeMs: number): Float32Array {
  const out = samples.slice()
  const n = Math.min(Math.floor(out.length / 2), Math.round((fadeMs / 1000) * sampleRate))
  for (let i = 0; i < n; i++) {
    const g = i / n
    out[i] *= g
    out[out.length - 1 - i] *= g
  }
  return out
}

export function normalizePeak(samples: Float32Array, targetDb: number): Float32Array {
  let peak = 0
  for (const s of samples) peak = Math.max(peak, Math.abs(s))
  if (peak === 0) return samples.slice()
  const gain = 10 ** (targetDb / 20) / peak
  return samples.map((s) => s * gain)
}

export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const w = (o: number, s: string) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE')
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  w(36, 'data'); v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buf
}
