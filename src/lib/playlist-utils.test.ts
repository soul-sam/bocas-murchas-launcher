import test from 'node:test'
import assert from 'node:assert/strict'
import { collectPages, playablePlaylists, shuffled, withSpotifyVideos } from './playlist-utils.ts'

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

test('playlist do Spotify salva de outra pessoa não aparece', () => {
  const list = [
    { id: 'minha', readable: true },
    { id: 'de-outro', readable: false },
    { id: 'api-antiga' }
  ]
  assert.deepEqual(
    playablePlaylists(list).map((p) => p.id),
    ['minha', 'api-antiga']
  )
})

test('collectPages lê todas as páginas e para no teto', async () => {
  const source = Array.from({ length: 120 }, (_, i) => i)
  const page = async (offset: number) => ({
    tracks: source.slice(offset, offset + 50),
    hasMore: offset + 50 < source.length
  })
  assert.equal((await collectPages(page, 500)).length, 120)
  assert.deepEqual(await collectPages(page, 60), source.slice(0, 60))
})

test('withSpotifyVideos resolve só as que faltam, de 50 em 50, e mantém a ordem', async () => {
  const wanted = Array.from({ length: 120 }, (_, i) => ({
    spotifyId: `s${i}`,
    videoId: i % 2 === 0 ? `ja${i}` : undefined
  }))
  const calls: number[] = []
  const { ready, quota } = await withSpotifyVideos(wanted, async (ids) => {
    calls.push(ids.length)
    return { tracks: ids.map((id) => ({ spotifyId: id, videoId: `v-${id}` })), failed: 0, quota: false }
  })
  assert.deepEqual(calls, [50, 10])
  assert.equal(quota, false)
  assert.deepEqual(
    ready.map((t) => t.spotifyId),
    wanted.map((t) => t.spotifyId)
  )
  assert.equal(ready[1].videoId, 'v-s1')
  assert.equal(ready[0].videoId, 'ja0')
})

test('withSpotifyVideos para na cota e toca o que já tinha vídeo', async () => {
  const wanted = Array.from({ length: 120 }, (_, i) => ({ spotifyId: `s${i}`, videoId: i < 5 ? 'x' : undefined }))
  let calls = 0
  const result = await withSpotifyVideos(wanted, async (ids) => {
    calls++
    return { tracks: [{ spotifyId: ids[0], videoId: 'novo' }], failed: 0, quota: true }
  })
  assert.equal(calls, 1)
  assert.equal(result.quota, true)
  assert.equal(result.ready.length, 6)
})
