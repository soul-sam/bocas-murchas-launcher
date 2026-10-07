import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildHistory,
  checkSquare,
  describeChessMove,
  displayPosition,
  forceChessMove,
  forceDraughtsMove,
  moveSound,
  premoveMoves,
  readChess,
  writeChess
} from './board-local.ts'
import { parsePosition, squareIndex, START_POSITION } from './board-position.ts'

const START = START_POSITION.chess
const dests = (fen: string, from: string, side: 'white' | 'black'): string[] =>
  premoveMoves(readChess(fen), from, side)
    .map((m) => m.move)
    .sort()

test('readChess/writeChess vão e voltam (casas, vez e roque)', () => {
  const fen = 'r3k2r/pp3ppp/8/3pP3/8/8/PPP2PPP/R3K2R w KQkq d6 0 12'
  const back = writeChess(readChess(fen))
  assert.equal(back.split(' ').slice(0, 4).join(' '), 'r3k2r/pp3ppp/8/3pP3/8/8/PPP2PPP/R3K2R w KQkq d6')
})

test('pré-lance do cavalo: casas vazias e peça minha (recaptura)', () => {
  assert.deepEqual(dests(START, 'g1', 'white'), ['g1e2', 'g1f3', 'g1h3'])
  assert.deepEqual(dests(START, 'b8', 'black'), ['b8a6', 'b8c6', 'b8d7'])
})

test('pré-lance: peça do outro lado não pré-joga', () => {
  assert.deepEqual(dests(START, 'g8', 'white'), [])
})

test('pré-lance do bispo: peça minha é recaptura e fecha a diagonal; depois de e4 ela abre', () => {
  assert.deepEqual(dests(START, 'f1', 'white'), ['f1e2', 'f1g2'])
  const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
  assert.deepEqual(dests(afterE4, 'f1', 'white'), ['f1a6', 'f1b5', 'f1c4', 'f1d3', 'f1e2', 'f1g2'])
})

test('pré-lance de linha atravessa peça do adversário e para NA minha (recaptura)', () => {
  // Torre branca em a1, cavalo preto em a5, peão branco em a7.
  const fen = '4k3/P7/8/n7/8/8/8/R3K3 w - - 0 1'
  assert.deepEqual(dests(fen, 'a1', 'white'), [
    'a1a2', 'a1a3', 'a1a4', 'a1a5', 'a1a6', 'a1a7', 'a1b1', 'a1c1', 'a1d1', 'a1e1'
  ])
})

test('pré-lance de recaptura: peão toma de volta na casa do peão meu', () => {
  // d4 branco, e5 preto: pré-lance c3xd4 vale enquanto d4 ainda é meu.
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/3P4/2P5/PP3PPP/RNBQKBNR b KQkq - 0 2'
  assert.ok(dests(fen, 'c3', 'white').includes('c3d4'))
  assert.ok(dests(fen, 'd1', 'white').includes('d1d4'))
  assert.ok(!dests(fen, 'd1', 'white').includes('d1d5'))
})

test('pré-lance do peão: frente, duas casas no começo e as duas diagonais mesmo vazias', () => {
  assert.deepEqual(dests(START, 'e2', 'white'), ['e2d3', 'e2e3', 'e2e4', 'e2f3'])
  // Peça minha na frente barra o avanço (e as duas casas): empurrar nunca recaptura.
  assert.deepEqual(dests('4k3/8/8/8/8/4N3/4P3/4K3 w - - 0 1', 'e2', 'white'), ['e2d3', 'e2f3'])
})

test('pré-lance do peão na sétima: um lance por peça, na ordem dama, cavalo, torre, bispo', () => {
  const moves = premoveMoves(readChess('8/4P3/8/8/8/8/8/k3K3 w - - 0 1'), 'e7', 'white')
  assert.deepEqual(
    moves.filter((m) => m.to === 'e8').map((m) => m.move),
    ['e7e8q', 'e7e8n', 'e7e8r', 'e7e8b']
  )
  assert.equal(moves.length, 12)
})

test('pré-lance de roque: só com o direito, a torre no canto e sem peça minha no meio', () => {
  const both = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'
  assert.ok(dests(both, 'e1', 'white').includes('e1g1'))
  assert.ok(dests(both, 'e1', 'white').includes('e1c1'))
  assert.ok(!dests('r3k2r/8/8/8/8/8/8/R3K2R w Qkq - 0 1', 'e1', 'white').includes('e1g1'))
  assert.ok(!dests('r3k2r/8/8/8/8/8/8/R3KB1R w KQkq - 0 1', 'e1', 'white').includes('e1g1'))
  // Peça do adversário no caminho pode sair: o pré-lance vale.
  assert.ok(dests('r3k2r/8/8/8/8/8/8/R3Kb1R w KQkq - 0 1', 'e1', 'white').includes('e1g1'))
  assert.ok(dests(both, 'e8', 'black').includes('e8c8'))
})

test('forceChessMove: roque leva a torre e tira o direito', () => {
  const board = forceChessMove(readChess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), 'e1g1')
  assert.deepEqual(board.squares[squareIndex('g1')], { side: 'white', kind: 'k' })
  assert.deepEqual(board.squares[squareIndex('f1')], { side: 'white', kind: 'r' })
  assert.equal(board.squares[squareIndex('h1')], null)
  assert.equal(board.castling, 'kq')
})

test('forceChessMove: promoção vira a peça escolhida; torre que sai do canto perde o roque', () => {
  const promoted = forceChessMove(readChess('8/4P3/8/8/8/8/8/k3K2R w K - 0 1'), 'e7e8n')
  assert.deepEqual(promoted.squares[squareIndex('e8')], { side: 'white', kind: 'n' })
  const rook = forceChessMove(readChess('8/8/8/8/8/8/8/k3K2R w K - 0 1'), 'h1h5')
  assert.equal(rook.castling, '')
})

test('forceChessMove: en passant só tira o peão quando a casa bate com a do FEN', () => {
  const ep = forceChessMove(readChess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'), 'e5d6')
  assert.equal(ep.squares[squareIndex('d5')], null)
  // Pré-lance em diagonal vazia (sem en passant): nada some.
  const premove = forceChessMove(readChess('4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1'), 'e5d6')
  assert.deepEqual(premove.squares[squareIndex('d5')], { side: 'black', kind: 'p' })
})

test('forceChessMove sem peça na origem não muda nada', () => {
  const board = readChess(START)
  assert.equal(forceChessMove(board, 'e4e5'), board)
})

test('displayPosition: meu lance pendente entra de verdade; pré-lances por cima', () => {
  const { afterPending, shown } = displayPosition('chess', START, 'e2e4', ['g1f3', 'f1c4'])
  assert.equal(afterPending.split(' ')[0], 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR')
  assert.equal(afterPending.split(' ')[1], 'b')
  const squares = parsePosition('chess', shown)
  assert.deepEqual(squares[squareIndex('f3')], { side: 'white', kind: 'n' })
  assert.deepEqual(squares[squareIndex('c4')], { side: 'white', kind: 'b' })
  assert.equal(squares[squareIndex('g1')], null)
})

test('buildHistory: SAN igual à do servidor e confere o fim', () => {
  const moves = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1']
  const end = describeChessMove('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'e1g1')!
  const history = buildHistory('chess', moves, end.fen)
  assert.deepEqual(
    history.plies.map((p) => p.text),
    ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'O-O']
  )
  assert.equal(history.complete, true)
  assert.equal(history.plies[6].side, 'white')
  assert.equal(buildHistory('chess', moves, START).complete, false)
})

test('buildHistory: lance que não fecha com as regras marca incompleta', () => {
  const history = buildHistory('chess', ['e2e4', 'e2e4'], START)
  assert.equal(history.complete, false)
  assert.equal(history.plies.length, 1)
})

test('checkSquare: rei em xeque do lado da vez', () => {
  assert.equal(checkSquare('r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4'), 'e8')
  assert.equal(checkSquare(START), null)
})

test('moveSound: xeque, promoção, captura, roque e lance simples', () => {
  assert.equal(moveSound('chess', 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 'h5f7'), 'check')
  assert.equal(moveSound('chess', '8/4P3/8/8/8/8/8/k3K3 w - - 0 1', 'e7e8q'), 'promote')
  assert.equal(moveSound('chess', 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'e4d5'), 'capture')
  assert.equal(moveSound('chess', 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1'), 'castle')
  assert.equal(moveSound('chess', START, 'e2e4'), 'move')
  assert.equal(moveSound('chess', START, 'e2e5'), 'move')
})

const START_DAMA = START_POSITION.draughts

test('forceDraughtsMove: lance simples e captura', () => {
  const moved = forceDraughtsMove(START_DAMA, 'c3-d4')
  assert.equal(moved[squareIndex('c3')], '.')
  assert.equal(moved[squareIndex('d4')], 'w')
  assert.equal(moved.endsWith(' b'), true)
  // Pedra branca em d4 come a preta em e5 e para em f6.
  const pos = '.'.repeat(64).split('')
  pos[squareIndex('d4')] = 'w'
  pos[squareIndex('e5')] = 'b'
  const after = forceDraughtsMove(pos.join('') + ' w', 'd4xf6')
  assert.equal(after[squareIndex('e5')], '.')
  assert.equal(after[squareIndex('f6')], 'w')
})

test('forceDraughtsMove: captura em sequência, dama voadora e promoção', () => {
  const pos = '.'.repeat(64).split('')
  pos[squareIndex('a1')] = 'W'
  pos[squareIndex('c3')] = 'b'
  pos[squareIndex('f6')] = 'b'
  const after = forceDraughtsMove(pos.join('') + ' w', 'a1xd4xg7')
  // a1→d4 passa por c3; d4→g7 passa por e5 e f6: as duas pretas saem.
  assert.equal(after[squareIndex('c3')], '.')
  assert.equal(after[squareIndex('f6')], '.')
  assert.equal(after[squareIndex('g7')], 'W')
  assert.equal(after[squareIndex('a1')], '.')
})

test('forceDraughtsMove: pedra que termina na última fileira vira dama', () => {
  const pos = '.'.repeat(64).split('')
  pos[squareIndex('b7')] = 'w'
  const after = forceDraughtsMove(pos.join('') + ' w', 'b7-a8')
  assert.equal(after[squareIndex('a8')], 'W')
  assert.equal(moveSound('draughts', pos.join('') + ' w', 'b7-a8'), 'promote')
})

test('buildHistory da dama confere com a posição do servidor', () => {
  const moves = ['c3-d4', 'f6-e5', 'd4xf6']
  let position = START_DAMA
  for (const m of moves) position = forceDraughtsMove(position, m)
  const history = buildHistory('draughts', moves, position)
  assert.equal(history.complete, true)
  assert.deepEqual(history.plies.map((p) => p.side), ['white', 'black', 'white'])
})
