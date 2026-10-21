import test from 'node:test'
import assert from 'node:assert/strict'
import { cartaChance, daysUntil, loanInterest, loanTotalAtTerm, maxYield, parseLoanAmount, percentText } from './bank-math.ts'

// As mesmas regras do servidor (BANK em rules.ts da API).
const RULES = { dailyRate: 0.007, minDays: 3, lateFee: 0.1, chargeCap: 0.5 }

test('banco: juro simples por dia, com mínimo de 3 dias', () => {
  assert.equal(loanInterest(1000, 0, RULES), 21)
  assert.equal(loanInterest(1000, 3, RULES), 21)
  assert.equal(loanInterest(1000, 10, RULES), 70)
  assert.equal(loanInterest(1000, 9.2, RULES), 70) // dia começado conta
})

test('banco: prévia do total no fim do prazo bate com o servidor', () => {
  assert.equal(loanTotalAtTerm(1000, 7, RULES), 1049)
  assert.equal(loanTotalAtTerm(1000, 14, RULES), 1098)
  assert.equal(loanTotalAtTerm(1000, 28, RULES), 1196)
})

test('banco: encargo nunca passa do teto', () => {
  assert.equal(loanInterest(1000, 1000, RULES), 500)
})

test('banco: valor digitado só inteiro dentro da faixa', () => {
  assert.equal(parseLoanAmount('500', 100, 2000), 500)
  assert.equal(parseLoanAmount(' 100 ', 100, 2000), 100)
  assert.equal(parseLoanAmount('99', 100, 2000), null)
  assert.equal(parseLoanAmount('2001', 100, 2000), null)
  assert.equal(parseLoanAmount('1e3', 100, 2000), null)
  assert.equal(parseLoanAmount('12.5', 100, 2000), null)
  assert.equal(parseLoanAmount('', 100, 2000), null)
})

test('banco: textos curtos', () => {
  assert.equal(percentText(0.007), '0,7%')
  assert.equal(percentText(0.1), '10%')
  assert.equal(daysUntil(new Date(Date.UTC(2026, 9, 27)).toISOString(), Date.UTC(2026, 9, 20)), 7)
})

test('cdb: o teto de rendimento é 1% por semana, arredondado pra baixo', () => {
  assert.equal(maxYield(5000, 4, 0.01), 200)
  assert.equal(maxYield(3000, 2, 0.01), 60)
  assert.equal(maxYield(150, 2, 0.01), 2)
  assert.equal(maxYield(99, 4, 0.01), 0)
})

test('consórcio: um sorteio por semana entre quem ainda espera', () => {
  assert.equal(cartaChance(5), 0.2)
  assert.equal(cartaChance(1), 1)
  assert.equal(cartaChance(0), 0)
})
