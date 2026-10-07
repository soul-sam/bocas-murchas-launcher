import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createReplayPlayer } from './pool-replay.ts'

const replay = {
  duration: 1,
  frames: [{ t: 0, b: [[0, 1000, 600]] }, { t: 0.5, b: [[0, 1500, 600]] }, { t: 1, b: [[0, 1500, 600], [3, 2000, 600]] }],
  events: [{ t: 0.5, k: 'hit', a: 0, b: 3, v: 2 }, { t: 0.9, k: 'pocket', a: 3, pocket: 2 }]
} as const
const start = [{ id: 0, x: 1, y: 0.6 }, { id: 3, x: 1.6, y: 0.6 }]

test('interpola entre amostras e mantém bola parada onde estava', () => {
  const p = createReplayPlayer(replay as never, start)
  const m = p.at(0.25)
  assert.ok(Math.abs(m.get(0)!.x - 1.25) < 1e-9)
  assert.ok(Math.abs(m.get(3)!.x - 1.6) < 1e-9)
  assert.ok(Math.abs(p.at(0.75).get(3)!.x - 1.8) < 1e-9)
})
test('eventos saem uma vez', () => {
  const p = createReplayPlayer(replay as never, start)
  assert.equal(p.eventsBetween(0, 0.5).length, 1)
  assert.equal(p.eventsBetween(0.5, 1).length, 1)
  assert.equal(p.eventsBetween(1, 2).length, 0)
})
