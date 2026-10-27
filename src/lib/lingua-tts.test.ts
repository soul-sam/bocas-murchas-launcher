import test from 'node:test'
import assert from 'node:assert/strict'
import { VOICE_LANG, pickVoice } from './lingua-tts.ts'
import { VOICE_BCP47, buildInstallArgs, voiceCapabilityName } from '../../electron/main/services/lingua-voice-args.ts'

test('pickVoice: casa o lang exato', () => {
  const v = pickVoice([{ lang: 'ja-JP', name: 'Haruka' }], 'ja')
  assert.equal(v?.name, 'Haruka')
})

test('pickVoice: cai pro prefixo (en-GB serve pra en)', () => {
  const v = pickVoice([{ lang: 'en-GB', name: 'George' }], 'en')
  assert.equal(v?.lang, 'en-GB')
})

test('pickVoice: exato vence prefixo', () => {
  const v = pickVoice([{ lang: 'en-GB', name: 'George' }, { lang: 'en-US', name: 'David' }], 'en')
  assert.equal(v?.name, 'David')
})

test('pickVoice: prefere Natural/Online', () => {
  const v = pickVoice(
    [{ lang: 'fr-FR', name: 'Hortense' }, { lang: 'fr-FR', name: 'Microsoft Denise Online (Natural)' }],
    'fr'
  )
  assert.match(v?.name ?? '', /Natural/)
})

test('pickVoice: sem voz -> null; outra língua não casa', () => {
  assert.equal(pickVoice([], 'zh'), null)
  assert.equal(pickVoice([{ lang: 'es-ES', name: 'Helena' }], 'de'), null)
})

test('VOICE_LANG do renderer bate com o mapa do main', () => {
  assert.deepEqual(VOICE_LANG, VOICE_BCP47)
})

test('buildInstallArgs: monta a capability certa', () => {
  const args = buildInstallArgs('ja')
  assert.ok(args)
  assert.match(args[2], /Language\.TextToSpeech~~~ja-JP~0\.0\.1\.0/)
  assert.match(args[2], /-Verb RunAs -Wait/)
  assert.equal(voiceCapabilityName('zh-CN'), 'Language.TextToSpeech~~~zh-CN~0.0.1.0')
})

test('buildInstallArgs: rejeita valor fora das 7 línguas (sem injeção)', () => {
  assert.equal(buildInstallArgs("ja'; calc; '"), null)
  assert.equal(buildInstallArgs('xx'), null)
  assert.equal(buildInstallArgs('__proto__'), null)
  assert.equal(voiceCapabilityName('ja-JP; calc'), null)
})
