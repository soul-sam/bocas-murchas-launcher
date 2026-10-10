/**
 * Roda com `npm run test:policy` (node --test, sem framework).
 *
 * O que esta sendo garantido aqui e o requisito central: quem NAO esta
 * assistindo nao assina o video nem o audio da tela de ninguem.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldSubscribe,
  encoderProfile,
  pickFocus,
  hasViewers,
  screenPublishPlan,
  SCREEN_QUALITY
} from './screen-share-policy.ts'

const video = (source: 'screen_share' | 'camera' | 'unknown') => ({ source, kind: 'video' as const })
const audio = (source: 'screen_share_audio' | 'microphone' | 'unknown') => ({ source, kind: 'audio' as const })

test('nao assiste: nada da tela e assinado', () => {
  const ctx = { watching: false, hidden: false }
  assert.equal(shouldSubscribe(video('screen_share'), ctx), false)
  assert.equal(shouldSubscribe(audio('screen_share_audio'), ctx), false)
})

test('nao assiste: microfone e camera continuam chegando', () => {
  const ctx = { watching: false, hidden: false }
  assert.equal(shouldSubscribe(audio('microphone'), ctx), true)
  assert.equal(shouldSubscribe(video('camera'), ctx), true)
})

test('assistindo com a janela visivel: video e audio da tela', () => {
  const ctx = { watching: true, hidden: false }
  assert.equal(shouldSubscribe(video('screen_share'), ctx), true)
  assert.equal(shouldSubscribe(audio('screen_share_audio'), ctx), true)
})

test('assistindo com a janela minimizada: corta o video, mantem o audio', () => {
  const ctx = { watching: true, hidden: true }
  assert.equal(shouldSubscribe(video('screen_share'), ctx), false)
  assert.equal(shouldSubscribe(audio('screen_share_audio'), ctx), true)
})

test('ensurdecido: nenhum audio chega, imagem continua', () => {
  const ctx = { watching: true, hidden: false, deafened: true }
  assert.equal(shouldSubscribe(audio('microphone'), ctx), false)
  assert.equal(shouldSubscribe(audio('screen_share_audio'), ctx), false)
  assert.equal(shouldSubscribe(audio('unknown'), ctx), false)
  assert.equal(shouldSubscribe(video('screen_share'), ctx), true)
  assert.equal(shouldSubscribe(video('camera'), ctx), true)
})

test('fonte desconhecida: audio sim, video nao', () => {
  const ctx = { watching: false, hidden: false }
  assert.equal(shouldSubscribe(audio('unknown'), ctx), true)
  assert.equal(shouldSubscribe(video('unknown'), ctx), false)
})

test('perfil do encoder: jogo prioriza fluidez, texto prioriza nitidez', () => {
  assert.deepEqual(encoderProfile('game'), { degradationPreference: 'balanced' })
  assert.deepEqual(encoderProfile('text'), { degradationPreference: 'maintain-resolution' })
})

test('publicacao da tela: VP9 numa camada, sem simulcast, com VP8 de reserva', () => {
  for (const quality of Object.keys(SCREEN_QUALITY) as Array<keyof typeof SCREEN_QUALITY>) {
    for (const content of ['game', 'text'] as const) {
      const plan = screenPublishPlan(quality, content)
      const preset = SCREEN_QUALITY[quality]
      assert.equal(plan.publish.videoCodec, 'vp9')
      assert.equal(plan.publish.scalabilityMode, 'L1T3')
      // Simulcast prendia quem assiste na camada baixa (476×268 a 15 fps).
      assert.equal(plan.publish.simulcast, false)
      assert.equal(plan.publish.backupCodec, true)
      // Sem screenShareEncoding o SDK cai no h1080fps15 (15 fps fixos).
      assert.deepEqual(plan.publish.screenShareEncoding, {
        maxBitrate: preset.maxBitrate,
        maxFramerate: preset.frameRate
      })
      assert.equal(plan.capture.resolution.frameRate, preset.frameRate)
      // 'detail' com VP9 trava em 5 fps no Chrome — texto tambem vai 'motion'.
      assert.equal(plan.capture.contentHint, 'motion')
      assert.equal(
        plan.publish.degradationPreference,
        content === 'text' ? 'maintain-resolution' : 'balanced'
      )
    }
  }
})

test('foco: prefere a tela de outra pessoa e respeita a escolha atual', () => {
  const feeds = [
    { identity: 'me', isLocal: true },
    { identity: 'ana', isLocal: false },
    { identity: 'bia', isLocal: false }
  ]
  assert.equal(pickFocus(feeds, null), 'ana')
  assert.equal(pickFocus(feeds, 'bia'), 'bia')
  assert.equal(pickFocus(feeds, 'sumiu'), 'ana')
  assert.equal(pickFocus([{ identity: 'me', isLocal: true }], null), 'me')
  assert.equal(pickFocus([], 'ana'), null)
})

test('espectadores: qualquer camada ligada em qualquer codec conta', () => {
  assert.equal(hasViewers({}), false)
  assert.equal(hasViewers({ subscribedQualities: [] }), false)
  assert.equal(
    hasViewers({ subscribedQualities: [{ enabled: false }, { enabled: false }] }),
    false
  )
  assert.equal(
    hasViewers({ subscribedQualities: [{ enabled: false }, { enabled: true }] }),
    true
  )
  assert.equal(
    hasViewers({
      subscribedQualities: [{ enabled: false }],
      subscribedCodecs: [{ qualities: [{ enabled: false }] }, { qualities: [{ enabled: true }] }]
    }),
    true
  )
  assert.equal(
    hasViewers({ subscribedCodecs: [{ qualities: [{ enabled: false }, { enabled: false }] }] }),
    false
  )
})
