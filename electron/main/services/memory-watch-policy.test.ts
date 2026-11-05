import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LOW_FREE_MB,
  SNAPSHOT_COOLDOWN_MS,
  SYSTEM_SAMPLE_MS,
  parseSystemMem,
  parseTasklistCsv,
  shouldSampleSystem,
  shouldSnapshot
} from './memory-watch-policy.ts'

test('retrato: RAM folgada nao dispara', () => {
  assert.equal(shouldSnapshot(LOW_FREE_MB, 0, 1_000_000), false)
  assert.equal(shouldSnapshot(3000, 0, 1_000_000), false)
})

test('retrato: a queda real de 05/11 (429 MB) dispara na primeira vez', () => {
  assert.equal(shouldSnapshot(429, 0, 1_000_000), true)
})

test('retrato: respeita o intervalo e volta depois dele', () => {
  const t = 1_000_000
  assert.equal(shouldSnapshot(300, t, t + 30_000), false)
  assert.equal(shouldSnapshot(300, t, t + SNAPSHOT_COOLDOWN_MS), true)
})

test('retrato: freeMb invalido nao dispara', () => {
  assert.equal(shouldSnapshot(Number.NaN, 0, 1_000_000), false)
})

test('pool do kernel: primeira leitura e depois a cada intervalo', () => {
  assert.equal(shouldSampleSystem(0, 5), true)
  assert.equal(shouldSampleSystem(1000, 1000 + SYSTEM_SAMPLE_MS - 1), false)
  assert.equal(shouldSampleSystem(1000, 1000 + SYSTEM_SAMPLE_MS), true)
})

test('tasklist pt-BR: soma por nome, ordena, ignora lixo', () => {
  const csv = [
    '"System Idle Process","0","Services","0","8 K"',
    '"chrome.exe","100","Console","1","500.000 K"',
    '"chrome.exe","101","Console","1","524.288 K"',
    '"LeagueClientUx.exe","200","Console","1","1.048.576 K"',
    '"Memory Compression","300","Services","0","2.097.152 K"',
    'INFO: linha que nao e CSV',
    ''
  ].join('\r\n')
  const top = parseTasklistCsv(csv, 3)
  assert.deepEqual(top, [
    { name: 'Memory Compression', mb: 2048, count: 1 },
    { name: 'LeagueClientUx.exe', mb: 1024, count: 1 },
    { name: 'chrome.exe', mb: 1000, count: 2 }
  ])
})

test('tasklist ingles: separador de milhar com virgula', () => {
  const top = parseTasklistCsv('"a.exe","1","Console","1","1,048,576 K"')
  assert.deepEqual(top, [{ name: 'a.exe', mb: 1024, count: 1 }])
})

test('pool do kernel: le os bytes em MB', () => {
  const got = parseSystemMem(
    '{"PoolNonpagedBytes":1065992192,"PoolPagedBytes":745377792,"CommittedBytes":22990635008,"CommitLimit":31918514176}'
  )
  assert.deepEqual(got, { nonPagedMb: 1017, pagedMb: 711, commitMb: 21926, commitLimitMb: 30440 })
})

test('pool do kernel: campo faltando ou JSON quebrado -> null', () => {
  assert.equal(parseSystemMem('{"PoolNonpagedBytes":1}'), null)
  assert.equal(parseSystemMem('nao e json'), null)
})
