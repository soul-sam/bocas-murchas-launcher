import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFades, encodeWav, mixToMono, normalizePeak, sliceWindow } from './supreme-audio.ts'

const rate = 1000

test('mixa canais pela média', () => {
  const out = mixToMono([Float32Array.from([1, 0]), Float32Array.from([0, 1])])
  assert.deepEqual([...out], [0.5, 0.5])
})

test('janela de 2s respeita o início e não estoura no fim', () => {
  const s = new Float32Array(3 * rate).map((_, i) => i)
  assert.equal(sliceWindow(s, rate, 0.5, 2).length, 2 * rate)
  assert.equal(sliceWindow(s, rate, 0.5, 2)[0], 500)
  // início perto do fim: recua pra caber
  assert.equal(sliceWindow(s, rate, 2.9, 2)[0], 1000)
  // áudio menor que 2s: devolve inteiro
  assert.equal(sliceWindow(new Float32Array(800), rate, 0, 2).length, 800)
})

test('fade zera as pontas', () => {
  const out = applyFades(new Float32Array(1000).fill(1), rate, 30)
  assert.equal(out[0], 0)
  assert.equal(out[999], 0)
  assert.equal(out[500], 1)
})

test('normaliza o pico em -1 dBFS e não divide silêncio', () => {
  const out = normalizePeak(Float32Array.from([0.1, -0.25, 0.2]), -1)
  const peak = Math.max(...[...out].map(Math.abs))
  assert.ok(Math.abs(peak - 10 ** (-1 / 20)) < 1e-6)
  assert.deepEqual([...normalizePeak(new Float32Array(3), -1)], [0, 0, 0])
})

test('WAV mono 16-bit com header correto', () => {
  const buf = encodeWav(new Float32Array(48000 * 2), 48000)
  const v = new DataView(buf)
  const str = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3))
  assert.equal(str(0), 'RIFF'); assert.equal(str(8), 'WAVE'); assert.equal(str(36), 'data')
  assert.equal(v.getUint16(22, true), 1)        // mono
  assert.equal(v.getUint32(24, true), 48000)
  assert.equal(v.getUint32(40, true), 48000 * 2 * 2)
  assert.equal(buf.byteLength, 44 + 48000 * 2 * 2)
})
