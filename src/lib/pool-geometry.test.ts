import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aim, BALL_R, clampOffset, FOOT_SPOT, HEAD_LINE_X, TABLE_H, TABLE_W } from './pool-geometry.ts'

test('constantes iguais às da API', () => {
  assert.deepEqual({ TABLE_W, TABLE_H, BALL_R, HEAD_LINE_X, FOOT_SPOT }, { TABLE_W: 2.54, TABLE_H: 1.27, BALL_R: 0.028575, HEAD_LINE_X: 0.635, FOOT_SPOT: { x: 1.905, y: 0.635 } })
})
test('mira acha a bola na frente e o ponto de contato a 2R', () => {
  const r = aim({ x: 1, y: 0.6 }, 0, [{ id: 3, x: 1.5, y: 0.6 }])
  assert.equal(r.kind, 'ball'); assert.equal(r.ballId, 3)
  assert.ok(Math.abs(r.cx - (1.5 - 2 * BALL_R)) < 1e-9)
  assert.ok(Math.abs(r.targetDir!.x - 1) < 1e-9)
})
test('mira com corte: direção da alvo segue a normal do contato', () => {
  const r = aim({ x: 1, y: 0.6 }, 0, [{ id: 3, x: 1.5, y: 0.6 + BALL_R }])
  assert.equal(r.ballId, 3)
  assert.ok(r.targetDir!.y > 0 && r.targetDir!.x > 0)
})
test('sem bola: para na tabela', () => {
  const r = aim({ x: 1, y: 0.6 }, Math.PI / 2, [])
  assert.equal(r.kind, 'cushion')
  assert.ok(Math.abs(r.cy - (TABLE_H - BALL_R)) < 1e-9)
})
test('clampOffset limita o offset ao raio 0,6', () => {
  const big = clampOffset(1, 1)
  assert.ok(Math.abs(Math.hypot(big.x, big.y) - 0.6) < 1e-9)
  assert.deepEqual(clampOffset(0.1, -0.2), { x: 0.1, y: -0.2 })
})
