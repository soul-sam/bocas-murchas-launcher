import test from 'node:test'
import assert from 'node:assert/strict'
import { CHANGELOG, shouldShowChangelog } from './changelog.ts'

const comEntrada = CHANGELOG[0].version

test('shouldShowChangelog: instalação do zero não mostra novidades', () => {
  assert.equal(shouldShowChangelog(comEntrada, null), false)
  assert.equal(shouldShowChangelog(comEntrada, undefined), false)
})

test('shouldShowChangelog: mostra só quando a versão mudou e tem entrada', () => {
  assert.equal(shouldShowChangelog(comEntrada, '0.0.1'), true)
  assert.equal(shouldShowChangelog(comEntrada, comEntrada), false)
  assert.equal(shouldShowChangelog('999.999.999', '0.0.1'), false)
  assert.equal(shouldShowChangelog(null, '0.0.1'), false)
})
