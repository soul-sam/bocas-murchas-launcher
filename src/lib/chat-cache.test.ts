import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendCapped, overCap } from './chat-cache.ts'

const msgs = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `m${from + i}` }))

test('mensagem nova entra no fim', () => {
  const out = appendCapped(msgs(2), { id: 'x' }, 10)
  assert.deepEqual(out.map((m) => m.id), ['m0', 'm1', 'x'])
})

test('mensagem repetida devolve a mesma lista', () => {
  const list = msgs(3)
  assert.equal(appendCapped(list, { id: 'm1' }, 10), list)
})

test('passou do teto: corta o começo e mantém as mais novas', () => {
  const out = appendCapped(msgs(500), { id: 'nova' }, 500)
  assert.equal(out.length, 500)
  assert.equal(out[0].id, 'm1')
  assert.equal(out[499].id, 'nova')
})

test('canal aberto o dia inteiro não cresce além do teto', () => {
  let list: readonly { id: string }[] = []
  for (let i = 0; i < 5_000; i++) list = appendCapped(list, { id: `n${i}` }, 500)
  assert.equal(list.length, 500)
  assert.equal(list[499].id, 'n4999')
})

test('overCap lista só quem passa do teto', () => {
  assert.deepEqual(overCap({ a: msgs(100), b: msgs(101), c: [] }, 100), ['b'])
})
