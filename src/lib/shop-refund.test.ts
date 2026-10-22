import { test } from 'node:test'
import assert from 'node:assert/strict'
import { refundDeadline, refundTimeLeft } from './shop-refund.ts'

const NOW = Date.parse('2026-10-22T12:00:00Z')

test('refundDeadline: item meu dentro do prazo devolve o prazo', () => {
  const until = refundDeadline({ owned: true, refundableUntil: '2026-10-23T10:00:00Z' }, NOW)
  assert.equal(until?.toISOString(), '2026-10-23T10:00:00.000Z')
})

test('refundDeadline: prazo vencido, sem prazo ou item que não tenho = sem botão', () => {
  assert.equal(refundDeadline({ owned: true, refundableUntil: '2026-10-22T11:59:00Z' }, NOW), null)
  assert.equal(refundDeadline({ owned: true, refundableUntil: null }, NOW), null)
  assert.equal(refundDeadline({ owned: true }, NOW), null)
  assert.equal(refundDeadline({ owned: false, refundableUntil: '2026-10-23T10:00:00Z' }, NOW), null)
  assert.equal(refundDeadline({ owned: true, refundableUntil: 'lixo' }, NOW), null)
})

test('refundTimeLeft: horas inteiras, e minutos na última hora', () => {
  assert.equal(refundTimeLeft(new Date(NOW + 5.5 * 3600_000), NOW), 'faltam 5h')
  assert.equal(refundTimeLeft(new Date(NOW + 12 * 60_000), NOW), 'faltam 12 min')
  assert.equal(refundTimeLeft(new Date(NOW + 10_000), NOW), 'faltam 1 min')
})
