import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveUseSame, needsColors, ownedNameColors, recentSounds } from './supreme-shop.ts'

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
