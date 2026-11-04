import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TOP_CHECK_MS,
  TRANSITION_QUIET_MS,
  decideTop,
  inQuiet,
  quietAfterPhaseChange,
  sameRect
} from './overlay-policy.ts'

const base = { now: 100_000, lastCheckAt: 0, quietUntil: 0, visible: true, covered: false as boolean | null }

test('topo: ninguem por cima nao reafirma (antes era SetWindowPos a cada 1,5 s)', () => {
  assert.equal(decideTop(base), 'ok')
})

test('topo: alguem por cima reafirma', () => {
  assert.equal(decideTop({ ...base, covered: true }), 'reassert')
})

test('topo: sem como saber, mantem o comportamento antigo', () => {
  assert.equal(decideTop({ ...base, covered: null }), 'reassert')
})

test('topo: janela escondida volta mesmo sem ninguem por cima', () => {
  assert.equal(decideTop({ ...base, visible: false }), 'reassert')
})

test('topo: confere no maximo a cada TOP_CHECK_MS', () => {
  assert.equal(decideTop({ ...base, covered: true, lastCheckAt: base.now - TOP_CHECK_MS + 1 }), 'wait')
})

test('topo: no silencio da troca de fase nao mexe, nem coberta', () => {
  assert.equal(decideTop({ ...base, covered: true, quietUntil: base.now + 1 }), 'quiet')
  assert.equal(decideTop({ ...base, visible: false, quietUntil: base.now + 1 }), 'quiet')
})

test('silencio: comeco e fim de partida abrem; repeticao do mesmo estado nao', () => {
  const now = 1_000
  assert.equal(quietAfterPhaseChange(false, true, now, 0), now + TRANSITION_QUIET_MS)
  assert.equal(quietAfterPhaseChange(true, false, now, 0), now + TRANSITION_QUIET_MS)
  assert.equal(quietAfterPhaseChange(true, true, now, 0), 0)
  assert.equal(quietAfterPhaseChange(false, false, now, 7), 7)
})

test('silencio: nao encurta um silencio que ja vai mais longe', () => {
  const far = 1_000 + TRANSITION_QUIET_MS * 3
  assert.equal(quietAfterPhaseChange(false, true, 1_000, far), far)
})

test('silencio: acaba exatamente no prazo', () => {
  assert.equal(inQuiet(99, 100), true)
  assert.equal(inQuiet(100, 100), false)
})

test('retangulo igual nao precisa de setBounds', () => {
  assert.equal(sameRect({ x: 0, y: 0, width: 1920, height: 1079 }, { x: 0, y: 0, width: 1920, height: 1079 }), true)
  assert.equal(sameRect({ x: 0, y: 0, width: 1920, height: 1079 }, { x: 1920, y: 0, width: 1920, height: 1079 }), false)
})

test('retangulo: arredondamento do monitor a 125% conta como igual (medido 960 -> 963)', () => {
  const pedido = { x: -1536, y: -315, width: 1536, height: 960 }
  assert.equal(sameRect({ ...pedido, height: 963 }, pedido), true)
  assert.equal(sameRect({ ...pedido, height: 960 + 40 }, pedido), false)
})
