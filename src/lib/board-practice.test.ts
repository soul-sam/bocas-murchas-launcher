import assert from 'node:assert/strict'
import { test } from 'node:test'
import { practiceHeadline, practiceTurnLabel } from './board-practice.ts'

test('fim de treino: nomeia o lado vencedor pela cor das peças', () => {
  assert.equal(practiceHeadline('chess', null, { winner: 'black', reason: 'checkmate' }, 'mate'), 'Pretas vencem por mate')
  assert.equal(practiceHeadline('draughts', 'br', { winner: 'white', reason: 'no-moves' }, 'sem lances'), 'Brancas vencem por sem lances')
})

test('fim de treino: na dama americana quem abre são as pretas', () => {
  assert.equal(practiceHeadline('draughts', 'us', { winner: 'white', reason: 'no-moves' }, 'sem lances'), 'Pretas vencem por sem lances')
})

test('fim de treino: empate', () => {
  assert.equal(practiceHeadline('chess', null, { winner: null, reason: 'stalemate' }, 'afogamento'), 'Empate por afogamento')
})

test('vez: diz a cor de quem joga', () => {
  assert.equal(practiceTurnLabel('chess', null, 'white'), 'Vez das brancas')
  assert.equal(practiceTurnLabel('draughts', 'us', 'white'), 'Vez das pretas')
})
