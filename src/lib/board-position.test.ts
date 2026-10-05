import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parsePosition,
  squareName,
  squareIndex,
  movableSquares,
  movesFrom,
  moveEnds,
  clockNow,
  formatClock
} from './board-position.ts'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const START_DRAUGHTS = '.b.b.b.b' + 'b.b.b.b.' + '.b.b.b.b' + '........' + '........' + 'w.w.w.w.' + '.w.w.w.w' + 'w.w.w.w. w'

test('FEN inicial: 32 peças, a8 torre preta, e1 rei branco, e4 vazio', () => {
  const board = parsePosition('chess', START_FEN)
  assert.equal(board.length, 64)
  assert.equal(board.filter(Boolean).length, 32)
  assert.deepEqual(board[squareIndex('a8')], { side: 'black', kind: 'r' })
  assert.deepEqual(board[squareIndex('e1')], { side: 'white', kind: 'k' })
  assert.equal(board[squareIndex('e4')], null)
})

test('posição inicial de dama: 24 peças, a1 pedra branca', () => {
  const board = parsePosition('draughts', START_DRAUGHTS)
  assert.equal(board.length, 64)
  assert.equal(board.filter(Boolean).length, 24)
  assert.deepEqual(board[squareIndex('a1')], { side: 'white', kind: 'man' })
})

test('dama: W vira king branca, B king preta', () => {
  const pos = 'W' + '.'.repeat(62) + 'B w'
  const board = parsePosition('draughts', pos)
  assert.deepEqual(board[0], { side: 'white', kind: 'king' })
  assert.deepEqual(board[63], { side: 'black', kind: 'king' })
})

test('squareName e squareIndex vão e voltam', () => {
  assert.equal(squareName(0), 'a8')
  assert.equal(squareName(63), 'h1')
  assert.equal(squareName(squareIndex('e4')), 'e4')
  assert.equal(squareIndex('a8'), 0)
  assert.equal(squareIndex('h1'), 63)
})

test('movableSquares junta as origens', () => {
  assert.deepEqual(movableSquares(['e2e4', 'e2e3', 'g1f3']), new Set(['e2', 'g1']))
})

test('movesFrom: UCI', () => {
  assert.deepEqual(movesFrom(['e2e4', 'e2e3', 'g1f3'], 'e2'), [
    { move: 'e2e4', to: 'e4' },
    { move: 'e2e3', to: 'e3' }
  ])
})

test('movesFrom: promoção devolve quatro entradas com o mesmo to', () => {
  const list = movesFrom(['e7e8q', 'e7e8r', 'e7e8b', 'e7e8n', 'a1a2'], 'e7')
  assert.equal(list.length, 4)
  assert.ok(list.every((m) => m.to === 'e8'))
})

test('movesFrom: dama simples e captura múltipla', () => {
  assert.deepEqual(movesFrom(['c3-d4', 'c3xe5xg7', 'a3-b4'], 'c3'), [
    { move: 'c3-d4', to: 'd4' },
    { move: 'c3xe5xg7', to: 'g7' }
  ])
})

test('moveEnds entende as duas notações', () => {
  assert.deepEqual(moveEnds('c3xe5xg7'), { from: 'c3', to: 'g7' })
  assert.deepEqual(moveEnds('c3-d4'), { from: 'c3', to: 'd4' })
  assert.deepEqual(moveEnds('e7e8q'), { from: 'e7', to: 'e8' })
})

test('clockNow: rodando desconta do lado da vez', () => {
  const out = clockNow({ white: 60000, black: 50000 }, 1000, true, 'black', 4000)
  assert.deepEqual(out, { white: 60000, black: 47000 })
})

test('clockNow: parado devolve como veio', () => {
  const out = clockNow({ white: 60000, black: 50000 }, 1000, false, 'white', 9000)
  assert.deepEqual(out, { white: 60000, black: 50000 })
})

test('clockNow: nunca fica negativo', () => {
  const out = clockNow({ white: 2000, black: 50000 }, 0, true, 'white', 10000)
  assert.equal(out.white, 0)
})

test('formatClock', () => {
  assert.equal(formatClock(182000), '3:02')
  assert.equal(formatClock(9400), '0:09.4')
  assert.equal(formatClock(0), '0:00.0')
})
