import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyPresenceJoin, applyPresenceLeave } from './presence-diff.ts'

const a = { id: 'a', name: 'Ana' }
const b = { id: 'b', name: 'Bia' }

test('chegou alguém novo: entra no fim', () => {
  assert.deepEqual(applyPresenceJoin([a], b), [a, b])
})

test('chegou de novo (outra janela, dado novo): substitui, sem duplicar', () => {
  const out = applyPresenceJoin([a, b], { id: 'a', name: 'Ana Nova' })
  assert.deepEqual(out, [{ id: 'a', name: 'Ana Nova' }, b])
})

test('saiu: some da lista', () => {
  assert.deepEqual(applyPresenceLeave([a, b], 'a'), [b])
})

test('saiu quem nem estava: mesma lista (sem re-render)', () => {
  const list = [a, b]
  assert.equal(applyPresenceLeave(list, 'z'), list)
})
