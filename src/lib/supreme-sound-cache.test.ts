import test from 'node:test'
import assert from 'node:assert/strict'
import { createSoundCache } from './supreme-sound-cache.ts'

const flush = () => new Promise((r) => setTimeout(r, 0))

test('carrega uma vez e serve pronto', async () => {
  let loads = 0
  const cache = createSoundCache({ load: async () => { loads++; return { duration: 1 } as AudioBuffer }, report: () => {} })
  cache.preload('/a.wav', 'bia'); cache.preload('/a.wav', 'bia')
  assert.equal(cache.status('/a.wav'), 'loading')
  await flush()
  assert.equal(cache.status('/a.wav'), 'ready')
  assert.ok(cache.get('/a.wav'))
  assert.equal(loads, 1)
})

test('falha reporta UMA vez e não tenta de novo', async () => {
  const reports: string[] = []
  const cache = createSoundCache({ load: async () => { throw new Error('404') }, report: (o, u) => reports.push(`${o}:${u}`) })
  cache.preload('/x.wav', 'bia')
  await flush()
  cache.preload('/x.wav', 'bia')
  await flush()
  assert.equal(cache.status('/x.wav'), 'failed')
  assert.equal(cache.get('/x.wav'), null)
  assert.deepEqual(reports, ['bia:/x.wav'])
})

test('url desconhecida é missing', () => {
  const cache = createSoundCache({ load: async () => ({}) as AudioBuffer, report: () => {} })
  assert.equal(cache.status('/nada.wav'), 'missing')
})
