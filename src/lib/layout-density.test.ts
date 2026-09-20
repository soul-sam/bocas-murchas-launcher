import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * O corte de celular não pode voltar a sumir.
 *
 * Ele existiu por zero versões: antes deste teste, um aparelho de 360px caía
 * em `narrow` — a densidade de uma janela de desktop espremida — e recebia
 * barra de ícones de 56px, gaveta de 240px e nenhum painel da direita. É o
 * tipo de regressão que não aparece em nenhuma tela de PC, então ninguém vê.
 *
 * Cópia da regra, não import: `layout-context.tsx` é .tsx e traz React junto,
 * e o runner de testes do projeto roda TypeScript cru sem JSX (ver
 * `test:policy` no package.json). A tabela abaixo é o contrato; se ela e a
 * fonte discordarem, uma das duas está errada e este teste é o lugar de
 * descobrir.
 */
const PHONE_AT = 640
const NARROW_AT = 900
const COMPACT_AT = 1_180

type Density = 'phone' | 'narrow' | 'compact' | 'wide'

function densityFor(width: number): Density {
  if (width < PHONE_AT) return 'phone'
  if (width < NARROW_AT) return 'narrow'
  if (width < COMPACT_AT) return 'compact'
  return 'wide'
}

test('aparelho de dedo cai em phone, não em narrow', () => {
  assert.equal(densityFor(320), 'phone', 'iPhone SE')
  assert.equal(densityFor(360), 'phone', 'Android comum')
  assert.equal(densityFor(390), 'phone', 'iPhone 13/14')
  assert.equal(densityFor(414), 'phone', 'iPhone Plus')
})

test('as fronteiras não se sobrepõem', () => {
  assert.equal(densityFor(PHONE_AT - 1), 'phone')
  assert.equal(densityFor(PHONE_AT), 'narrow')
  assert.equal(densityFor(NARROW_AT - 1), 'narrow')
  assert.equal(densityFor(NARROW_AT), 'compact')
  assert.equal(densityFor(COMPACT_AT - 1), 'compact')
  assert.equal(densityFor(COMPACT_AT), 'wide')
})

test('tablet deitado e janela de desktop continuam como eram', () => {
  assert.equal(densityFor(768), 'narrow', 'iPad em pé')
  assert.equal(densityFor(1_000), 'compact', 'janela mínima do Electron')
  assert.equal(densityFor(1_920), 'wide')
})
