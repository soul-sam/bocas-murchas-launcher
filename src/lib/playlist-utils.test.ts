import test from 'node:test'
import assert from 'node:assert/strict'
import { shuffled } from './playlist-utils.ts'

test('embaralha uma cópia e deixa a lista da tela intacta', () => {
  const original = [1, 2, 3, 4, 5]
  let i = 0
  const sorte = [0.1, 0.9, 0.4, 0.7]
  const result = shuffled(original, () => sorte[i++ % sorte.length])

  assert.deepEqual(original, [1, 2, 3, 4, 5])
  assert.deepEqual([...result].sort(), [1, 2, 3, 4, 5])
  assert.notDeepEqual(result, original)
})

test('lista vazia e de um item passam direto', () => {
  assert.deepEqual(shuffled([]), [])
  assert.deepEqual(shuffled(['so']), ['so'])
})
