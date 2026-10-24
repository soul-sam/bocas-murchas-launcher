import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isWagerQueue } from './wager-queue.ts'

test('isWagerQueue: treino, bot, tutorial, custom e Desafios da Horuja não aceitam aposta', () => {
  for (const q of ['custom', 'coop', 'tutorial', 'tft_horuja', 'queue_1220', 'queue_3140']) {
    assert.equal(isWagerQueue(q), false, q)
  }
})

test('isWagerQueue: PvP, TFT normal e fila nova desconhecida aceitam', () => {
  for (const q of ['ranked_solo', 'normal_draft', 'aram', 'tft', 'queue_4310']) {
    assert.equal(isWagerQueue(q), true, q)
  }
  assert.equal(isWagerQueue(undefined), true)
  assert.equal(isWagerQueue(null), true)
})
