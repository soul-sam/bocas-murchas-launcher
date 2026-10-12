import test from 'node:test'
import assert from 'node:assert/strict'
import { parseGradient, gradientStyle } from './name-gradient.ts'

test('lê o par salvo pela API', () => {
  assert.deepEqual(parseGradient('#FC344C,#1F8BFF'), ['#FC344C', '#1F8BFF'])
  assert.equal(parseGradient('#FC344C'), null)
  assert.equal(parseGradient(''), null)
  assert.equal(parseGradient(undefined), null)
})

test('estilo do gradiente expõe as duas cores e o fundo', () => {
  const s = gradientStyle(['#FC344C', '#1F8BFF']) as Record<string, string>
  assert.equal(s['--fx-c'], '#FC344C')
  assert.equal(s['--fx-c2'], '#1F8BFF')
  assert.match(s.backgroundImage, /linear-gradient\(90deg, #FC344C, #1F8BFF, #FC344C\)/)
})
