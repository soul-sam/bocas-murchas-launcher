// Era escrito pra vitest, que nao esta instalado e nem estava no test:policy:
// o arquivo nunca rodou. Portado pro node:test igual aos vizinhos.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SCREEN_VOLUME_MAX,
  VOICE_VOLUME_MAX,
  clampScreenVolume,
  clampVoiceVolume,
  effectiveVolume
} from './participant-volume.ts'

test('tetos: voz vai até 300%, tela até 200%', () => {
  assert.equal(VOICE_VOLUME_MAX, 3)
  assert.equal(SCREEN_VOLUME_MAX, 2)
  assert.equal(clampVoiceVolume(5), 3)
  assert.equal(clampScreenVolume(5), 2)
  assert.equal(clampVoiceVolume(-1), 0)
  assert.equal(clampScreenVolume(NaN), 1)
})

test('effectiveVolume: ensurdecido zera', () => {
  assert.equal(effectiveVolume({ perUser: 2, master: 1, deafened: true, max: 3 }), 0)
})

test('effectiveVolume: multiplica pelo geral e respeita o teto da fonte', () => {
  assert.equal(effectiveVolume({ perUser: 3, master: 1, deafened: false, max: 3 }), 3)
  assert.equal(effectiveVolume({ perUser: 3, master: 0.5, deafened: false, max: 3 }), 1.5)
  assert.equal(effectiveVolume({ perUser: 3, master: 1, deafened: false, max: 2 }), 2)
})

test('effectiveVolume: sem ajuste vale 1', () => {
  assert.equal(effectiveVolume({ perUser: undefined, master: 1, deafened: false, max: 3 }), 1)
})
