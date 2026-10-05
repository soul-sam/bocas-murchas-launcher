import test from 'node:test'
import assert from 'node:assert/strict'
import { parseBetAmount } from './board-bet.ts'

test('aposta: só dígitos, dentro do mínimo e do máximo', () => {
  assert.equal(parseBetAmount('10', 10, 100), 10)
  assert.equal(parseBetAmount(' 50 ', 10, 100), 50)
  assert.equal(parseBetAmount('100', 10, 100), 100)
})

test('aposta: vazio, abaixo do mínimo e acima do máximo viram null', () => {
  assert.equal(parseBetAmount('', 10, 100), null)
  assert.equal(parseBetAmount('  ', 10, 100), null)
  assert.equal(parseBetAmount('9', 10, 100), null)
  assert.equal(parseBetAmount('101', 10, 100), null)
})

test('aposta: decimal, notação científica, negativo e texto não passam', () => {
  assert.equal(parseBetAmount('12.5', 10, 100), null)
  assert.equal(parseBetAmount('1e1', 10, 100), null)
  assert.equal(parseBetAmount('-20', 10, 100), null)
  assert.equal(parseBetAmount('abc', 10, 100), null)
})

test('aposta: máximo abaixo do mínimo nunca aceita', () => {
  assert.equal(parseBetAmount('10', 10, 5), null)
  assert.equal(parseBetAmount('5', 10, 5), null)
})
