import { test } from 'node:test'
import assert from 'node:assert/strict'
import { muxWebmOpus, opusHead, vintSize, wavFromPcm } from './webm-opus.ts'

const bytes = (...xs: number[]): Uint8Array => Uint8Array.from(xs)

/** Acha `needle` dentro de `hay`; -1 se não houver. */
function indexOf(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

function count(hay: Uint8Array, needle: Uint8Array): number {
  let n = 0
  for (let at = indexOf(hay, needle); at >= 0; at = indexOf(hay, needle, at + 1)) n++
  return n
}

test('vintSize usa o menor número de bytes e evita o valor reservado', () => {
  assert.deepEqual(vintSize(0), bytes(0x80))
  assert.deepEqual(vintSize(126), bytes(0xfe))
  // 127 = 0xFF em 1 byte seria "tamanho desconhecido": vai pra 2 bytes.
  assert.deepEqual(vintSize(127), bytes(0x40, 0x7f))
  assert.deepEqual(vintSize(300), bytes(0x41, 0x2c))
  assert.equal(vintSize(2 ** 21).length, 4)
})

test('OpusHead segue a RFC 7845', () => {
  const head = opusHead(2, 312)
  assert.equal(head.length, 19)
  assert.equal(new TextDecoder().decode(head.subarray(0, 8)), 'OpusHead')
  const view = new DataView(head.buffer)
  assert.equal(view.getUint8(8), 1)
  assert.equal(view.getUint8(9), 2)
  assert.equal(view.getUint16(10, true), 312)
  assert.equal(view.getUint32(12, true), 48_000)
  assert.equal(view.getUint8(18), 0)
})

test('webm tem cabeçalho EBML, faixa A_OPUS e duração', () => {
  const packets = Array.from({ length: 50 }, (_, i) => ({
    data: bytes(0xfc, i),
    timestampUs: i * 20_000
  }))
  const out = muxWebmOpus({ packets, channels: 2, durationMs: 1_000, preSkip: 312 })

  assert.deepEqual(out.subarray(0, 4), bytes(0x1a, 0x45, 0xdf, 0xa3))
  assert.ok(indexOf(out, new TextEncoder().encode('webm')) > 0)
  assert.ok(indexOf(out, new TextEncoder().encode('A_OPUS')) > 0)
  assert.ok(indexOf(out, new TextEncoder().encode('OpusHead')) > 0)

  // Duration: id 0x4489, tamanho 8, float64 1000.
  const at = indexOf(out, bytes(0x44, 0x89, 0x88))
  assert.ok(at > 0)
  assert.equal(new DataView(out.buffer, out.byteOffset + at + 3, 8).getFloat64(0), 1_000)

  // Um SimpleBlock por pacote, tudo num cluster só (1 s < 5 s).
  assert.equal(count(out, bytes(0x1f, 0x43, 0xb6, 0x75)), 1)
  assert.equal(count(out, bytes(0xa3, 0x86, 0x81)), 50)
})

test('clusters fecham a cada 5 s e o tempo do bloco é relativo ao cluster', () => {
  // 30 s de pacotes de 20 ms = 1500 pacotes → clusters em 0, 5, 10, 15, 20, 25 s.
  const packets = Array.from({ length: 1_500 }, (_, i) => ({
    data: bytes(0xfc),
    timestampUs: i * 20_000
  }))
  const out = muxWebmOpus({ packets, channels: 2, durationMs: 30_000, preSkip: 312 })
  assert.equal(count(out, bytes(0x1f, 0x43, 0xb6, 0x75)), 6)

  // Último bloco: 29,98 s no cluster de 25 s → relativo 4980 ms.
  const last = out.lastIndexOf(0xa3)
  const view = new DataView(out.buffer, out.byteOffset + last)
  assert.equal(view.getUint8(2), 0x81)
  assert.equal(view.getInt16(3), 4_980)
})

test('WAV de plano B tem cabeçalho e amostras intercaladas', () => {
  const wav = wavFromPcm(Int16Array.from([1, 2]), Int16Array.from([-1, -2]), 48_000)
  assert.equal(new TextDecoder().decode(wav.subarray(0, 4)), 'RIFF')
  assert.equal(wav.length, 44 + 8)
  const view = new DataView(wav.buffer)
  assert.equal(view.getUint32(24, true), 48_000)
  assert.deepEqual([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true)], [1, -1, 2])
})
