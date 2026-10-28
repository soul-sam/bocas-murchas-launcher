import test from 'node:test'
import assert from 'node:assert/strict'
import { VOICE_LANG, pickVoice } from './lingua-tts.ts'
import {
  VOICE_BCP47,
  buildInstallArgs,
  installErrorCode,
  voiceCapabilityName
} from '../../electron/main/services/lingua-voice-args.ts'

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

test('pickVoice zh: prefere zh-CN; tradicional nunca serve de fallback', () => {
  const tw = { lang: 'zh-TW', name: 'HanHan' }
  const hk = { lang: 'zh-HK', name: 'Danny' }
  const cn = { lang: 'zh-CN', name: 'Huihui' }
  assert.equal(pickVoice([tw, hk, cn], 'zh')?.name, 'Huihui')
  assert.equal(pickVoice([tw, hk], 'zh'), null)
  assert.equal(pickVoice([{ lang: 'zh-Hant-TW', name: 'X' }, { lang: 'zh-MO', name: 'Y' }], 'zh'), null)
  assert.equal(pickVoice([tw, { lang: 'zh-Hans', name: 'Hans' }], 'zh')?.name, 'Hans')
})

test('VOICE_LANG do renderer bate com o mapa do main', () => {
  assert.deepEqual(VOICE_LANG, VOICE_BCP47)
})

test('buildInstallArgs: monta a capability certa', () => {
  const args = buildInstallArgs('ja')
  assert.ok(args)
  assert.match(args[2], /^try \{ \$p = Start-Process /)
  assert.match(args[2], /-Verb RunAs -Wait -PassThru -ErrorAction Stop/)
  assert.match(args[2], /exit \$p\.ExitCode \} catch \{ exit 1 \}$/)
  assert.match(args[2], /System32\\WindowsPowerShell\\v1\.0\\powershell\.exe/)
  // O script da janela elevada vai em base64 (sem aspas pra escapar).
  const b64 = args[2].match(/-EncodedCommand ([A-Za-z0-9+/=]+)'/)
  assert.ok(b64)
  const script = Buffer.from(b64[1], 'base64').toString('utf16le')
  assert.match(script, /Get-WindowsCapability -Online -Name 'Language\.TextToSpeech~~~ja-JP~0\.0\.1\.0'/)
  assert.match(script, /if \(\$cap\.State -ne 'Installed'\) \{ Add-WindowsCapability/)
  assert.match(script, /NAO FECHE ESTA JANELA/)
  assert.match(script, /exit 0[\s\S]*\} catch \{[\s\S]*exit 1/)
  assert.equal(voiceCapabilityName('zh-CN'), 'Language.TextToSpeech~~~zh-CN~0.0.1.0')
})

test('buildInstallArgs: rejeita valor fora das 7 línguas (sem injeção)', () => {
  assert.equal(buildInstallArgs("ja'; calc; '"), null)
  assert.equal(buildInstallArgs('xx'), null)
  assert.equal(buildInstallArgs('__proto__'), null)
  assert.equal(voiceCapabilityName('ja-JP; calc'), null)
})

test('installErrorCode: janela fechada no meio vira window_closed', () => {
  assert.equal(installErrorCode(3221225786), 'window_closed')
  assert.equal(installErrorCode(-1073741510), 'window_closed')
  assert.equal(installErrorCode(1), 'exit_1')
  assert.equal(installErrorCode(null), 'exit_null')
})
