import test from 'node:test'
import assert from 'node:assert/strict'
import { formatRelative } from './natural-date.ts'

/**
 * "em 5h60": o resto em minutos era arredondado sozinho, então 5h59min40s
 * virava sessenta minutos em vez de 6h. Apareceu no cartão de pendências de
 * um evento marcado pra daqui a 6h.
 */
test('formatRelative nunca escreve 60 minutos', () => {
  const now = new Date(2026, 9, 13, 17, 0, 0)
  const quase6h = new Date(now.getTime() + 6 * 3_600_000 - 20_000)
  assert.equal(formatRelative(quase6h, now), 'em 6h')

  const quase2h = new Date(now.getTime() + 2 * 3_600_000 - 20_000)
  assert.equal(formatRelative(quase2h, now), 'em 2h')

  const doisEMeia = new Date(now.getTime() + 2.5 * 3_600_000)
  assert.equal(formatRelative(doisEMeia, now), 'em 2h30')
})
