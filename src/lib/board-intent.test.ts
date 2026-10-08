import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clearPremoves,
  EMPTY_INTENT,
  failPending,
  isStaleView,
  PREMOVE_LIMIT,
  queuePremove,
  reconcile,
  startMove,
  type Intent,
  type TableLike
} from './board-intent.ts'

/** Vista de uma partida de xadrez em que eu sou as brancas. */
function view(over: Partial<TableLike> = {}): TableLike {
  return {
    id: 't1',
    phase: 'playing',
    result: null,
    mySide: 'white',
    turn: 'white',
    moves: [],
    legalMoves: ['e2e4', 'g1f3', 'd2d4'],
    ...over
  }
}

const ready = (over: Partial<Intent> = {}): Intent => ({ ...EMPTY_INTENT, tableId: 't1', ...over })

test('mesa nova zera tudo e avisa que a fila caiu', () => {
  const r = reconcile(ready({ premoves: ['g1f3'] }), view({ id: 't2' }))
  assert.deepEqual(r.intent, { ...EMPTY_INTENT, tableId: 't2' })
  assert.equal(r.cancelled, true)
  assert.equal(r.send, null)
})

test('meu lance: entra como pendente, e o servidor confirmando limpa', () => {
  const started = startMove(ready(), view(), 'e2e4', 'drag')
  assert.ok(started)
  assert.deepEqual(started.pending, { move: 'e2e4', ply: 0, how: 'drag' })
  const r = reconcile(started, view({ turn: 'black', moves: ['e2e4'], legalMoves: [] }))
  assert.equal(r.intent.pending, null)
  assert.deepEqual(r.intent.lastLocal, { move: 'e2e4', ply: 0, how: 'drag' })
})

test('meu lance: recusa fora da vez, com outro no ar ou ilegal', () => {
  assert.equal(startMove(ready(), view({ turn: 'black' }), 'e2e4', 'click'), null)
  const pending = startMove(ready(), view(), 'e2e4', 'click')!
  assert.equal(startMove(pending, view(), 'd2d4', 'click'), null)
  assert.equal(startMove(ready(), view(), 'e2e5', 'click'), null)
})

test('pré-lance sai na hora em que a vez volta, se for legal', () => {
  const queued = ready({ premoves: ['g1f3', 'f1c4'] })
  const r = reconcile(queued, view({ moves: ['e2e4', 'e7e5'], legalMoves: ['g1f3', 'f1c4', 'd2d4'] }))
  assert.equal(r.send, 'g1f3')
  assert.deepEqual(r.intent.pending, { move: 'g1f3', ply: 2, how: 'premove' })
  assert.deepEqual(r.intent.premoves, ['f1c4'])
  assert.equal(r.cancelled, false)
})

test('a mesma vista chegando duas vezes (broadcast e ack) não manda o pré-lance de novo', () => {
  const first = reconcile(ready({ premoves: ['g1f3'] }), view({ moves: ['e2e4', 'e7e5'], legalMoves: ['g1f3'] }))
  const again = reconcile(first.intent, view({ moves: ['e2e4', 'e7e5'], legalMoves: ['g1f3'] }))
  assert.equal(first.send, 'g1f3')
  assert.equal(again.send, null)
  assert.deepEqual(again.intent.pending, first.intent.pending)
})

test('o segundo pré-lance espera a vez seguinte', () => {
  let intent = ready({ premoves: ['g1f3', 'f1c4'] })
  intent = reconcile(intent, view({ moves: ['e2e4', 'e7e5'], legalMoves: ['g1f3', 'f1c4'] })).intent
  // O servidor aceitou g1f3: vez das pretas, nada sai.
  const waiting = reconcile(intent, view({ turn: 'black', moves: ['e2e4', 'e7e5', 'g1f3'], legalMoves: [] }))
  assert.equal(waiting.send, null)
  assert.deepEqual(waiting.intent.premoves, ['f1c4'])
  // As pretas jogaram: f1c4 sai.
  const next = reconcile(waiting.intent, view({ moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'], legalMoves: ['f1c4'] }))
  assert.equal(next.send, 'f1c4')
  assert.deepEqual(next.intent.premoves, [])
})

test('pré-lance que não vale mais cancela a fila inteira', () => {
  const r = reconcile(ready({ premoves: ['c4f7', 'e1g1'] }), view({ moves: ['x', 'y'], legalMoves: ['d2d4'] }))
  assert.equal(r.send, null)
  assert.deepEqual(r.intent.premoves, [])
  assert.equal(r.cancelled, true)
})

test('pré-lance com o meu lance ainda no ar espera ele voltar', () => {
  const intent = ready({ pending: { move: 'e2e4', ply: 0, how: 'click' }, premoves: ['g1f3'] })
  const r = reconcile(intent, view())
  assert.equal(r.send, null)
  assert.deepEqual(r.intent.premoves, ['g1f3'])
})

test('servidor com outro lance no lugar do meu: fila cai', () => {
  const intent = ready({ pending: { move: 'e2e4', ply: 0, how: 'click' }, premoves: ['g1f3'] })
  const r = reconcile(intent, view({ turn: 'black', moves: ['d2d4'], legalMoves: [] }))
  assert.equal(r.intent.pending, null)
  assert.deepEqual(r.intent.premoves, [])
  assert.equal(r.cancelled, true)
})

test('fim de partida limpa lance pendente e fila', () => {
  const intent = ready({ pending: { move: 'e2e4', ply: 0, how: 'click' }, premoves: ['g1f3'] })
  const r = reconcile(intent, view({ phase: 'finished', result: { winner: 'black', reason: 'resign', xp: { white: 0, black: 0 } } }))
  assert.equal(r.intent.pending, null)
  assert.deepEqual(r.intent.premoves, [])
  assert.equal(r.cancelled, true)
})

test('pré-lance só entra na vez do outro (ou com o meu lance no ar), até o limite', () => {
  assert.equal(queuePremove(ready(), view(), 'g1f3'), null)
  const theirs = view({ turn: 'black', legalMoves: [] })
  const one = queuePremove(ready(), theirs, 'g1f3')!
  assert.deepEqual(one.premoves, ['g1f3'])
  const withPending = ready({ pending: { move: 'e2e4', ply: 0, how: 'drag' } })
  assert.deepEqual(queuePremove(withPending, view(), 'g1f3')!.premoves, ['g1f3'])
  const full = ready({ premoves: new Array(PREMOVE_LIMIT).fill('a2a3') })
  assert.equal(queuePremove(full, theirs, 'g1f3'), null)
  assert.equal(queuePremove(ready(), view({ mySide: null, turn: 'black' }), 'g1f3'), null)
})

test('recusa do servidor tira o lance da tela e a fila junto', () => {
  const intent = ready({ pending: { move: 'e2e4', ply: 0, how: 'click' }, premoves: ['g1f3'], lastLocal: { move: 'e2e4', ply: 0, how: 'click' } })
  const failed = failPending(intent, 'e2e4')
  assert.equal(failed.pending, null)
  assert.deepEqual(failed.premoves, [])
  assert.equal(failPending(intent, 'd2d4'), intent)
  assert.deepEqual(clearPremoves(intent).premoves, [])
})

test('vista velha (fora de ordem) é reconhecida', () => {
  const now = { id: 't1', phase: 'playing' as const, moves: ['e2e4', 'e7e5'] }
  assert.equal(isStaleView(now, { ...now, moves: ['e2e4'] }), true)
  assert.equal(isStaleView(now, { ...now, phase: 'pending', moves: [] }), true)
  assert.equal(isStaleView(now, { ...now }), false)
  assert.equal(isStaleView(now, { ...now, phase: 'finished' }), false)
  assert.equal(isStaleView(now, { ...now, id: 't2', moves: [] }), false)
  assert.equal(isStaleView(null, now), false)
})

test('startMove livre (bilhar): sem lista de lances, só a vez e nada no ar', () => {
  const pool = view({ legalMoves: [] })
  assert.equal(startMove(ready(), pool, '{"t":"place","x":0.5,"y":0.6}', 'click'), null)
  const started = startMove(ready(), pool, '{"t":"place","x":0.5,"y":0.6}', 'click', true)
  assert.ok(started?.pending)
  assert.equal(startMove(ready(), view({ legalMoves: [], turn: 'black' }), 'x', 'click', true), null)
  assert.equal(startMove(started!, pool, 'y', 'click', true), null)
})
