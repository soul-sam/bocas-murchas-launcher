import { test } from 'node:test'
import assert from 'node:assert/strict'
import { col, IDENTITY, orthonormalize, roll, rotate, seeded } from './pool-roll.ts'

const R = 0.028575
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps

test('rolar meia volta pra direita vira o número pra baixo (polo em −z)', () => {
  const m = roll(IDENTITY, Math.PI * R, 0, R)
  const n = col(m, 2)
  assert.ok(close(n.z, -1, 1e-9), `z=${n.z}`)
})

test('rolar um quarto de volta pra direita leva o topo pra frente (+x)', () => {
  const m = roll(IDENTITY, (Math.PI / 2) * R, 0, R)
  const n = col(m, 2)
  assert.ok(close(n.x, 1) && close(n.z, 0), `${n.x},${n.y},${n.z}`)
})

test('rolar pra baixo (+y na tela) leva o topo pra +y', () => {
  const m = roll(IDENTITY, 0, (Math.PI / 2) * R, R)
  const n = col(m, 2)
  assert.ok(close(n.y, 1) && close(n.z, 0), `${n.x},${n.y},${n.z}`)
})

test('deslocamento nulo não muda nada; uma volta inteira volta à identidade', () => {
  assert.equal(roll(IDENTITY, 0, 0, R), IDENTITY)
  const m = roll(IDENTITY, 2 * Math.PI * R, 0, R)
  for (let i = 0; i < 9; i++) assert.ok(close(m[i], IDENTITY[i], 1e-9))
})

test('rotação preserva ortonormalidade e orthonormalize corrige derrapagem', () => {
  let m = IDENTITY
  for (let i = 0; i < 2000; i++) m = roll(m, 0.003, 0.001, R)
  const a = col(m, 0), b = col(m, 1)
  assert.ok(Math.abs(a.x * b.x + a.y * b.y + a.z * b.z) < 1e-6)
  const dirty = [1.001, 0, 0, 0.002, 1, 0, 0, 0, 0.999] as const
  const o = orthonormalize(dirty)
  const oa = col(o, 0), ob = col(o, 1), oc = col(o, 2)
  assert.ok(close(Math.hypot(oa.x, oa.y, oa.z), 1))
  assert.ok(close(oa.x * ob.x + oa.y * ob.y + oa.z * ob.z, 0))
  assert.ok(close(Math.hypot(oc.x, oc.y, oc.z), 1))
})

test('rotate em torno de z gira x pra y', () => {
  const m = rotate(IDENTITY, { x: 0, y: 0, z: 1 }, Math.PI / 2)
  const ex = col(m, 0)
  assert.ok(close(ex.x, 0) && close(ex.y, 1))
})

test('seeded é determinístico e ortonormal', () => {
  const a = seeded(5, 42), b = seeded(5, 42), c = seeded(6, 42)
  assert.deepEqual(a, b)
  assert.notDeepEqual(a, c)
  const n = col(a, 2)
  assert.ok(close(Math.hypot(n.x, n.y, n.z), 1))
})
