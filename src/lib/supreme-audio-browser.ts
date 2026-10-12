import { SUPREME_CLIP_SEC, TARGET_RATE, applyFades, encodeWav, mixToMono, normalizePeak, sliceWindow } from './supreme-audio'

/**
 * Decodifica num OfflineAudioContext de propósito: um AudioContext comum
 * rodando segura o PC acordado e já causou voz robotizada quando a taxa foi
 * forçada (ver memória "Call mutada e energia").
 */
export async function decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, 1, TARGET_RATE)
  return ctx.decodeAudioData(data.slice(0))
}

export function waveformPeaks(buffer: AudioBuffer, bars: number): number[] {
  const mono = mixToMono(Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)))
  const step = Math.max(1, Math.floor(mono.length / bars))
  return Array.from({ length: bars }, (_, b) => {
    let peak = 0
    for (let i = b * step; i < Math.min(mono.length, (b + 1) * step); i++) peak = Math.max(peak, Math.abs(mono[i]))
    return peak
  })
}

export async function renderSupremeClip(buffer: AudioBuffer, startSec: number): Promise<Blob> {
  const mono = mixToMono(Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)))
  const clip = sliceWindow(mono, buffer.sampleRate, startSec, SUPREME_CLIP_SEC)
  // Reamostra pra 48kHz mono.
  const frames = Math.max(1, Math.round((clip.length / buffer.sampleRate) * TARGET_RATE))
  const off = new OfflineAudioContext(1, frames, TARGET_RATE)
  const src = off.createBuffer(1, clip.length, buffer.sampleRate)
  src.copyToChannel(new Float32Array(clip), 0)
  const node = off.createBufferSource()
  node.buffer = src
  node.connect(off.destination)
  node.start()
  const rendered = (await off.startRendering()).getChannelData(0)
  const finished = normalizePeak(applyFades(rendered, TARGET_RATE, 30), -1)
  return new Blob([encodeWav(finished, TARGET_RATE)], { type: 'audio/wav' })
}
