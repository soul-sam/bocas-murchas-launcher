import test from 'node:test'
import assert from 'node:assert/strict'
import { coherentSupremeColors, supremeColorSample, deriveUseSame, needsColors, ownedNameColors, recentSounds, syncUseSame } from './supreme-shop.ts'

test('cor e tema supremos pedem 2 cores', () => {
  assert.equal(needsColors('namecolor:supremo', 1), true)
  assert.equal(needsColors('theme:supremo', 2), false)
  assert.equal(needsColors('frame:supreme', 0), false)
})

test('só cores de nome possuídas e válidas', () => {
  const items = [
    { id: 'a', name: 'A', type: 'nameColor', owned: true, data: { color: '#ff0000' } },
    { id: 'b', name: 'B', type: 'nameColor', owned: false, data: { color: '#00ff00' } },
    { id: 'c', name: 'C', type: 'nameColor', owned: true, data: { color: 'red' } },
    { id: 'd', name: 'D', type: 'title', owned: true, data: { color: '#000000' } }
  ]
  assert.deepEqual(ownedNameColors(items).map((c) => c.id), ['a'])
})

test('mesmo áudio e recentes', () => {
  assert.equal(deriveUseSame({ joinSoundUrl: '/x', leaveSoundUrl: '/x' }), true)
  assert.equal(deriveUseSame({ joinSoundUrl: '/x', leaveSoundUrl: '/y' }), false)
  assert.equal(deriveUseSame({ joinSoundUrl: null, leaveSoundUrl: null }), false)
  const mk = (id: string, inUse: boolean) => ({ id, url: id, label: id, durationMs: 1, brokenAt: null, inUse })
  const st = { joinSoundUrl: null, leaveSoundUrl: null, sounds: [mk('1', true), mk('2', false), mk('3', false), mk('4', false), mk('5', false)] }
  assert.deepEqual(recentSounds(st).map((s) => s.id), ['2', '3', '4'])
})

test('hex repetido (qualquer caixa) conta uma vez', () => {
  const items = [
    { id: 'a', name: 'A', type: 'nameColor', owned: true, data: { color: '#FF0000' } },
    { id: 'b', name: 'B', type: 'nameColor', owned: true, data: { color: '#ff0000' } }
  ]
  assert.equal(ownedNameColors(items).length, 1)
})

test('syncUseSame acompanha o estado e mantém marcado sem áudios', () => {
  assert.equal(syncUseSame({ joinSoundUrl: '/x', leaveSoundUrl: '/y' }, true), false)
  assert.equal(syncUseSame({ joinSoundUrl: '/x', leaveSoundUrl: '/x' }, false), true)
  assert.equal(syncUseSame({ joinSoundUrl: null, leaveSoundUrl: null }, true), true)
  assert.equal(syncUseSame({ joinSoundUrl: null, leaveSoundUrl: null }, false), false)
  assert.equal(syncUseSame({ joinSoundUrl: null, leaveSoundUrl: '/y' }, true), false)
})

test('tema supremo: cada cor vale sozinha (dela ou o padrão dela)', () => {
  const owned = new Set(['#fc344c', '#1f8bff'])
  // comprou, usou com o padrão e trocou só a Cor 1: a Cor 2 padrão continua
  assert.equal(coherentSupremeColors({ c1: '#FC344C', c2: '#8B5CF6' }, owned), null)
  assert.equal(coherentSupremeColors({ c1: '#FF6FD8', c2: '#8B5CF6' }, owned), null)
  assert.equal(coherentSupremeColors({ c1: '#FC344C', c2: '#1F8BFF' }, owned), null)
  // só a que não é dela volta pro padrão
  assert.deepEqual(coherentSupremeColors({ c1: '#FC344C', c2: '#000000' }, owned), { c1: '#FC344C', c2: '#8B5CF6' })
  assert.deepEqual(coherentSupremeColors({ c1: '#000000', c2: '#1F8BFF' }, owned), { c1: '#FF6FD8', c2: '#1F8BFF' })
  assert.deepEqual(coherentSupremeColors({ c1: '#000000', c2: '#111111' }, new Set()), { c1: '#FF6FD8', c2: '#8B5CF6' })
})

test('amostra da Cor Suprema: gradiente atual, senão 2 primeiras cores, senão rosa→roxo', () => {
  const cores = [{ id: 'a', name: 'A', color: '#FC344C' }, { id: 'b', name: 'B', color: '#1F8BFF' }]
  assert.deepEqual(supremeColorSample('#111111,#222222', cores), ['#111111', '#222222'])
  assert.deepEqual(supremeColorSample(null, cores), ['#FC344C', '#1F8BFF'])
  assert.deepEqual(supremeColorSample('lixo', cores.slice(0, 1)), ['#FF6FD8', '#8B5CF6'])
})
