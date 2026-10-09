import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAmount, rawAmount, resolvePreAction, samePreAction } from './poker-turn.ts'

const facing = { fold: true, check: false, call: 150 }
const free = { fold: true, check: true, call: null }

test('pré: "passar ou desistir" passa sem aposta e desiste com aposta', () => {
  assert.deepEqual(resolvePreAction({ kind: 'check-fold' }, free, 0), { type: 'check' })
  assert.deepEqual(resolvePreAction({ kind: 'check-fold' }, facing, 300), { type: 'fold' })
})

test('pré: "passar" só passa; veio aposta, a marca cai', () => {
  assert.deepEqual(resolvePreAction({ kind: 'check' }, free, 0), { type: 'check' })
  assert.equal(resolvePreAction({ kind: 'check' }, facing, 300), null)
})

test('pré: "pagar 300" paga os mesmos 300 e cai se alguém subiu', () => {
  assert.deepEqual(resolvePreAction({ kind: 'call', amount: 300 }, facing, 300), { type: 'call' })
  assert.equal(resolvePreAction({ kind: 'call', amount: 300 }, facing, 900), null)
  // A aposta foi embora (todo mundo antes passou): passa.
  assert.deepEqual(resolvePreAction({ kind: 'call', amount: 300 }, free, 0), { type: 'check' })
})

test('pré: "pagar qualquer" paga o que vier, ou passa', () => {
  assert.deepEqual(resolvePreAction({ kind: 'call-any' }, facing, 2_000), { type: 'call' })
  assert.deepEqual(resolvePreAction({ kind: 'call-any' }, free, 0), { type: 'check' })
  assert.equal(resolvePreAction({ kind: 'call-any' }, { fold: true, check: false, call: null }, 500), null)
})

test('pré: igualdade de marcas compara o valor do "pagar"', () => {
  assert.equal(samePreAction({ kind: 'call', amount: 300 }, { kind: 'call', amount: 300 }), true)
  assert.equal(samePreAction({ kind: 'call', amount: 300 }, { kind: 'call', amount: 900 }), false)
  assert.equal(samePreAction({ kind: 'check' }, { kind: 'check' }), true)
  assert.equal(samePreAction({ kind: 'check' }, null), false)
})

test('valor digitado em murchos: ponto de milhar, k e vírgula', () => {
  assert.equal(parseAmount('1.250', 'murchos'), 1_250)
  assert.equal(parseAmount('1250', 'murchos'), 1_250)
  assert.equal(parseAmount(' 2k ', 'murchos'), 2_000)
  assert.equal(parseAmount('2,5k', 'murchos'), 2_500)
  assert.equal(parseAmount('abc', 'murchos'), null)
  assert.equal(parseAmount('', 'murchos'), null)
})

test('valor digitado em reais vira centavos', () => {
  assert.equal(parseAmount('12,50', 'brl'), 1_250)
  assert.equal(parseAmount('12.5', 'brl'), 1_250)
  assert.equal(parseAmount('1.250,00', 'brl'), 125_000)
  assert.equal(parseAmount('4', 'brl'), 400)
  assert.equal(parseAmount('1.2.3', 'brl'), null)
})

test('valor cru pra editar: sem símbolo, na moeda da mesa', () => {
  assert.equal(rawAmount(1_250, 'murchos'), '1250')
  assert.equal(rawAmount(1_250, 'brl'), '12,50')
  assert.equal(rawAmount(40, 'brl'), '0,40')
})
