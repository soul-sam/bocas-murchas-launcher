import test from 'node:test'
import assert from 'node:assert/strict'
import { countByActivity, countPokerPlayers, onlineLabel } from './game-hall.ts'

test('conta quem tem atividade naquele jogo, em qualquer fase', () => {
  const activities = {
    a: { game: 'lol', phase: 'lobby' },
    b: { game: 'lol', phase: 'in-progress' },
    c: { game: 'minecraft', phase: 'in-progress' }
  }
  assert.equal(countByActivity(activities, 'lol'), 2)
  assert.equal(countByActivity(activities, 'minecraft'), 1)
})

test('jogo desconhecido e entrada malformada não contam', () => {
  const activities = {
    a: { game: 'valorant' },
    b: null,
    c: undefined,
    d: {}
  }
  assert.equal(countByActivity(activities, 'lol'), 0)
  assert.equal(countByActivity({}, 'lol'), 0)
})

test('poker conta pessoas, não assentos: quem está em duas mesas conta uma vez', () => {
  const tables = [
    { players: [{ userId: 'a' }, { userId: 'b' }] },
    { players: [{ userId: 'a' }, { userId: 'c' }] },
    { players: [] }
  ]
  assert.equal(countPokerPlayers(tables), 3)
  assert.equal(countPokerPlayers([]), 0)
})

test('rótulo de online', () => {
  assert.equal(onlineLabel(0), 'Ninguém agora')
  assert.equal(onlineLabel(1), '1 online')
  assert.equal(onlineLabel(7), '7 online')
})
