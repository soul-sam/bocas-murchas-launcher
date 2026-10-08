import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aim, aimPath, BALL_R, clampOffset, FOOT_SPOT, HEAD_LINE_X, inPocket, TABLE_H, TABLE_W, trace } from './pool-geometry.ts'

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

// --- linha-guia ---------------------------------------------------------------
test('aimPath: tacada cheia tem fantasma, alvo indo até a tabela e sem tangente', () => {
  const p = aimPath({ x: 1, y: 0.6 }, 0, [{ id: 0, x: 1, y: 0.6 }, { id: 3, x: 1.5, y: 0.6 }])
  assert.equal(p.cue.kind, 'ball')
  assert.equal(p.cue.ballId, 3)
  assert.ok(p.ghost && Math.abs(p.ghost.x - (1.5 - 2 * BALL_R)) < 1e-9)
  assert.ok(p.target)
  assert.equal(p.target!.kind, 'cushion')
  const end = p.target!.points[p.target!.points.length - 1]
  assert.ok(Math.abs(end.x - (TABLE_W - BALL_R)) < 1e-9)
  assert.equal(p.tangent, null)
})
test('aimPath: com corte a tangente existe e a alvo sai pela linha dos centros', () => {
  const p = aimPath({ x: 1, y: 0.6 }, 0, [{ id: 3, x: 1.5, y: 0.6 + BALL_R }])
  assert.ok(p.tangent && p.tangent.y < 0)
  assert.ok(p.target && p.target.dir.y > 0)
})
test('aimPath: sem bola no caminho a branca bate na tabela e segue refletida', () => {
  const p = aimPath({ x: 1, y: 0.6 }, Math.PI / 2, [], 2)
  // começo, tabela de baixo, tabela de cima, (e para por comprimento ou terceira tabela)
  assert.ok(p.cue.points.length >= 3)
  assert.ok(Math.abs(p.cue.points[1].y - (TABLE_H - BALL_R)) < 1e-9)
  assert.ok(Math.abs(p.cue.points[2].y - BALL_R) < 1e-9)
  assert.equal(p.ghost, null)
})
test('aimPath: mirando na caçapa do canto a linha para na caçapa', () => {
  const p = aimPath({ x: 0.3, y: 0.3 }, Math.atan2(-0.3, -0.3), [])
  assert.equal(p.cue.kind, 'pocket')
  assert.equal(p.cue.pocket, 0)
})
test('trace: bola na frente da alvo encerra o caminho dela', () => {
  const t = trace({ x: 1, y: 0.6 }, { x: 1, y: 0 }, [{ id: 7, x: 1.3, y: 0.6 }], 0, 0, 3)
  assert.equal(t.kind, 'ball')
  assert.equal(t.ballId, 7)
})
test('inPocket', () => {
  assert.ok(inPocket(0.01, 0.01))
  assert.ok(!inPocket(1, 0.6))
})
