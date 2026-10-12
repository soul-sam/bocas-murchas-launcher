import test from 'node:test'
import assert from 'node:assert/strict'
import { contrastRatio, ensureContrast, hexToHslTriplet, supremeThemeVars } from './supreme-theme.ts'

test('contraste conhecido', () => {
  assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.01)
})

test('cor clara num tema claro é escurecida até 3:1', () => {
  const out = ensureContrast('#FFF59D', '#F7F5FA', 3)
  assert.ok(contrastRatio(out, '#F7F5FA') >= 3, out)
})

test('cor que já passa não muda', () => {
  assert.equal(ensureContrast('#1F8BFF', '#0A0A0F', 3).toLowerCase(), '#1f8bff')
})

test('variáveis do tema saem das duas cores e do modo', () => {
  const dark = supremeThemeVars({ mode: 'dark', c1: '#FC344C', c2: '#1F8BFF' })
  assert.equal(dark['--theme-c1'], '#FC344C')
  assert.equal(dark['--theme-c2'], '#1F8BFF')
  const light = supremeThemeVars({ mode: 'light', c1: '#FFF59D', c2: '#B4F07A' })
  assert.ok(contrastRatio(light['--theme-c1'], '#F7F5FA') >= 3)
  assert.ok(contrastRatio(light['--theme-c2'], '#F7F5FA') >= 3)
})

test('tripletos HSL batem com o hex', () => {
  assert.equal(hexToHslTriplet('#FF0000'), '0 100% 50%')
  assert.equal(hexToHslTriplet('#0B0910'), '257 28% 4.9%')
  assert.equal(hexToHslTriplet('#F7F5FA'), '264 33% 97.1%')
  const v = supremeThemeVars({ mode: 'dark', c1: '#FF0000', c2: '#00FF00' })
  assert.equal(v['--theme-c1-hsl'], hexToHslTriplet(v['--theme-c1']))
  assert.equal(v['--theme-c2-rgb'], '0 255 0')
})

test('texto do tema tem 4,5:1 e o rótulo do botão é legível', () => {
  const light = supremeThemeVars({ mode: 'light', c1: '#FFF59D', c2: '#B4F07A' })
  assert.ok(contrastRatio(light['--theme-c1'], '#F7F5FA') >= 3)
  for (const k of ['--theme-c1', '--theme-c2']) {
    const on = light[`${k}-on-hsl`] === '0 0% 4%' ? '#0a0a0a' : '#ffffff'
    assert.ok(contrastRatio(on, light[k]) >= 4.5, k)
  }
})
