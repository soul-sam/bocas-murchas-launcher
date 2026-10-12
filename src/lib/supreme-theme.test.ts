import test from 'node:test'
import assert from 'node:assert/strict'
import { SUPREME_BG, contrastRatio, ensureContrast, hexToHslTriplet, supremeThemeVars } from './supreme-theme.ts'

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

/** Tripleto "H S% L%" de volta pra hex, só pra conferir contraste. */
function tripletToHex(t: string): string {
  const [h, s, l] = t.split(' ').map((x) => parseFloat(x))
  const sat = s / 100
  const lig = l / 100
  const f = (n: number): number => {
    const k = (n + h / 30) % 12
    return lig - sat * Math.min(lig, 1 - lig) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
}

test('-text-hsl chega a 4,5:1 contra o fundo nos dois modos', () => {
  for (const mode of ['dark', 'light'] as const) {
    const v = supremeThemeVars({ mode, c1: '#FFF59D', c2: '#1F8BFF' })
    for (const k of ['--theme-c1-text-hsl', '--theme-c2-text-hsl']) {
      // tolerância pelo arredondamento do tripleto
      assert.ok(contrastRatio(tripletToHex(v[k]), SUPREME_BG[mode]) >= 4.4, `${mode} ${k}`)
    }
  }
})
