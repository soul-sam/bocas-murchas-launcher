import test from 'node:test'
import assert from 'node:assert/strict'
import { YT_EMBED_ORIGIN, isDeadVideoError, parsePlayerMessage, parseYouTubeUrl } from './youtube.ts'

const ID = 'dQw4w9WgXcQ'

test('parseYouTubeUrl aceita os formatos que a galera cola', () => {
  for (const input of [
    ID,
    `https://www.youtube.com/watch?v=${ID}`,
    `youtube.com/watch?v=${ID}&t=42`,
    `https://youtu.be/${ID}`,
    `https://m.youtube.com/shorts/${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`
  ]) {
    assert.deepEqual(parseYouTubeUrl(input), { videoId: ID }, input)
  }
})

test('parseYouTubeUrl devolve null pra qualquer outra coisa', () => {
  for (const input of [
    '',
    '   ',
    'https://vimeo.com/123',
    `https://evil.com/watch?v=${ID}`,
    `https://youtube.com.evil.com/watch?v=${ID}`,
    'https://youtube.com/watch?v=curto',
    'https://youtube.com/channel/abc'
  ]) {
    assert.equal(parseYouTubeUrl(input), null, input)
  }
})

function msg(origin: string, data: unknown): MessageEvent {
  return { origin, data } as MessageEvent
}

/** Regra de seguranca: mensagem de outra origem ou de outro embed e ignorada. */
test('parsePlayerMessage só aceita a origem do player e o id esperado', () => {
  const ok = JSON.stringify({ event: 'onReady', id: 'p1' })
  assert.deepEqual(parsePlayerMessage(msg(YT_EMBED_ORIGIN, ok), 'p1'), { event: 'onReady', id: 'p1' })
  assert.equal(parsePlayerMessage(msg('https://evil.com', ok), 'p1'), null)
  assert.equal(parsePlayerMessage(msg(YT_EMBED_ORIGIN, ok), 'outro'), null)
  assert.equal(parsePlayerMessage(msg(YT_EMBED_ORIGIN, '{quebrado'), 'p1'), null)
  assert.equal(parsePlayerMessage(msg(YT_EMBED_ORIGIN, { event: 'x' }), 'p1'), null)
})

/** Erro "morto" tira faixa da playlist sem volta: 5 e 153 NAO podem entrar. */
test('isDeadVideoError separa vídeo morto de engasgo', () => {
  for (const code of [2, 100, 101, 150]) assert.equal(isDeadVideoError(code), true, String(code))
  for (const code of [5, 153, 0, null, undefined]) assert.equal(isDeadVideoError(code), false, String(code))
})
