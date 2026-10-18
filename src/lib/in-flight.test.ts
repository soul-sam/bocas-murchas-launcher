import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInFlight } from './in-flight.ts'

const deferred = <T>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

test('duas chamadas iguais no ar: uma execução só', async () => {
  const share = createInFlight()
  let runs = 0
  const d = deferred<{ n: number }>()
  const run = () => {
    runs++
    return d.promise
  }
  const a = share('/x', run)
  const b = share('/x', run)
  d.resolve({ n: 1 })
  assert.deepEqual(await a, { n: 1 })
  assert.deepEqual(await b, { n: 1 })
  assert.equal(runs, 1)
})

test('quem pega carona recebe cópia: mexer num não mexe no outro', async () => {
  const share = createInFlight()
  const d = deferred<number[]>()
  const a = share('/x', () => d.promise)
  const b = share('/x', () => d.promise)
  d.resolve([3, 1, 2])
  const ra = await a
  const rb = await b
  rb.sort()
  assert.deepEqual(ra, [3, 1, 2])
})

test('terminou: a próxima chamada vai ao servidor de novo (não é cache)', async () => {
  const share = createInFlight()
  let runs = 0
  const run = async () => ++runs
  assert.equal(await share('/x', run), 1)
  assert.equal(await share('/x', run), 2)
})

test('chaves diferentes não se misturam', async () => {
  const share = createInFlight()
  let runs = 0
  const run = async () => ++runs
  await Promise.all([share('/a', run), share('/b', run)])
  assert.equal(runs, 2)
})

test('erro chega pros dois e libera a chave', async () => {
  const share = createInFlight()
  const d = deferred<number>()
  const a = share('/x', () => d.promise)
  const b = share('/x', () => d.promise)
  d.reject(new Error('caiu'))
  await assert.rejects(a, /caiu/)
  await assert.rejects(b, /caiu/)
  assert.equal(await share('/x', async () => 7), 7)
})
