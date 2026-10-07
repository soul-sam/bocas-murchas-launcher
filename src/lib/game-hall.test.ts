import test from 'node:test'
import assert from 'node:assert/strict'
import { countBoardPeople, countByActivity, countPokerPlayers, onlineLabel } from './game-hall.ts'

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

const p = (userId: string) => ({ userId })
const mesa = (
  game: string,
  host: string,
  white: string | null,
  black: string | null,
  spectators = 0
) => ({
  game,
  host: p(host),
  white: white ? p(white) : null,
  black: black ? p(black) : null,
  spectators
})

test('tabuleiro: conta por jogo, duas mesas de xadrez e uma de dama', () => {
  const tables = [mesa('chess', 'a', 'a', 'b'), mesa('chess', 'c', null, null), mesa('draughts', 'd', 'd', 'e')]
  assert.equal(countBoardPeople(tables, 'chess'), 3)
  assert.equal(countBoardPeople(tables, 'draughts'), 2)
})

test('tabuleiro: mesa aberta só com o host conta 1', () => {
  assert.equal(countBoardPeople([mesa('chess', 'a', null, null)], 'chess'), 1)
})

test('tabuleiro: host que também é brancas não conta duas vezes; espectadores somam', () => {
  assert.equal(countBoardPeople([mesa('chess', 'a', 'a', 'b', 3)], 'chess'), 5)
})

test('tabuleiro: mesa encerrada não conta', () => {
  const done = { ...mesa('chess', 'a', 'a', 'b', 2), phase: 'finished' }
  const live = { ...mesa('chess', 'c', 'c', 'd'), phase: 'playing' }
  assert.equal(countBoardPeople([done, live], 'chess'), 2)
})

test('tabuleiro: jogo sem mesa conta 0', () => {
  assert.equal(countBoardPeople([mesa('chess', 'a', 'a', 'b')], 'draughts'), 0)
  assert.equal(countBoardPeople([], 'chess'), 0)
})

test('countBoardPeople conta mesas de bilhar', () => {
  const tables = [{ game: 'pool', host: { userId: 'a' }, white: { userId: 'a' }, black: { userId: 'b' }, spectators: 1 }]
  assert.equal(countBoardPeople(tables, 'pool'), 3)
})
