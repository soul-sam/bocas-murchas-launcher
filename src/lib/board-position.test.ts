import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parsePosition,
  squareName,
  squareIndex,
  movableSquares,
  movesFrom,
  moveEnds,
  capturedSquares,
  clockNow,
  formatClock,
  formatMove,
  material,
  START_POSITION
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

test('posição inicial embutida bate com a do servidor (64 casas, 32 e 24 peças)', () => {
  assert.equal(parsePosition('chess', START_POSITION.chess).filter(Boolean).length, 32)
  assert.equal(START_POSITION.draughts.length, 66)
  assert.equal(parsePosition('draughts', START_POSITION.draughts).filter(Boolean).length, 24)
})

test('material: nada capturado no início; brancas sem a dama e um peão = pretas +10', () => {
  const start = material('chess', START_POSITION.chess)
  assert.deepEqual(start.captured, { white: [], black: [] })
  assert.equal(start.advantage, 0)

  // Brancas perderam a dama (d1) e o peão de e2; pretas, o cavalo de b8.
  const pos = 'r1bqkbnr/pppppppp/8/8/8/8/PPPP1PPP/RNB1KBNR w KQkq - 0 1'
  const m = material('chess', pos)
  assert.deepEqual(m.captured.white, ['n'])
  assert.deepEqual(m.captured.black, ['q', 'p'])
  assert.equal(m.advantage, 3 - 10)
})

test('material: promoção não vira peça capturada negativa', () => {
  // Duas damas brancas, nenhum peão branco.
  const pos = 'rnbqkbnr/pppppppp/8/8/8/8/8/RNBQKBNQ w KQkq - 0 1'
  const m = material('chess', pos)
  assert.deepEqual(m.captured.black, ['r', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'])
  assert.equal(m.captured.white.length, 0)
})

test('material na dama: pedras que faltam e dama vale 2', () => {
  const pos = 'W' + '.'.repeat(62) + 'b w'
  const m = material('draughts', pos)
  assert.equal(m.captured.white.length, 11)
  assert.equal(m.captured.black.length, 11)
  assert.equal(m.advantage, 1)
})

test('formatMove: UCI vira "e2–e4" e promoção em português', () => {
  assert.equal(formatMove('chess', 'e2e4'), 'e2–e4')
  assert.equal(formatMove('chess', 'e7e8q'), 'e7–e8=D')
  assert.equal(formatMove('chess', 'a7a8n'), 'a7–a8=C')
  assert.equal(formatMove('draughts', 'c3xe5xg7'), 'c3xe5xg7')
})

test('capturedSquares: captura dupla lê as peças da posição de antes, na ordem dos saltos', () => {
  const before = parsePosition('draughts', '.'.repeat(64))
  before[squareIndex('c3')] = { side: 'white', kind: 'man' }
  before[squareIndex('d4')] = { side: 'black', kind: 'man' }
  before[squareIndex('f6')] = { side: 'black', kind: 'king' }
  assert.deepEqual(capturedSquares(before, 'c3xe5xg7'), [
    { square: 'd4', piece: { side: 'black', kind: 'man' }, hop: 0 },
    { square: 'f6', piece: { side: 'black', kind: 'king' }, hop: 1 }
  ])
  assert.deepEqual(capturedSquares(before, 'c3-d4'), [])
  assert.deepEqual(capturedSquares(before, 'e2e4'), [])
})

test('capturedSquares: dama voadora come a peça longe no meio da diagonal', () => {
  const before = parsePosition('draughts', '.'.repeat(64))
  before[squareIndex('a1')] = { side: 'white', kind: 'king' }
  before[squareIndex('e5')] = { side: 'black', kind: 'man' }
  assert.deepEqual(capturedSquares(before, 'a1xg7'), [{ square: 'e5', piece: { side: 'black', kind: 'man' }, hop: 0 }])
})
