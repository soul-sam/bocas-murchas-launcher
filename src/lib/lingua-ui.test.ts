import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canOpenToday,
  dayLabel,
  errorCode,
  errorMessage,
  missionsXp,
  optionSpeech,
  placementResume,
  promptSpeech,
  resultTitle
} from './lingua-ui.ts'
import type { FinishResult, PublicQuestion } from './api-lingua'

const toPt: PublicQuestion = {
  id: 'q1',
  direction: 'to_pt',
  prompt: 'neko',
  promptSpeak: 'ねこ',
  options: ['gato', 'cão', 'peixe', 'pássaro']
}
const fromPt: PublicQuestion = {
  id: 'q2',
  direction: 'from_pt',
  prompt: 'gato',
  options: ['neko', 'inu', 'sakana', 'tori'],
  optionsSpeak: ['ねこ', 'いぬ', 'さかな', 'とり']
}

test('promptSpeech: to_pt fala o promptSpeak (kana), não o romaji', () => {
  assert.equal(promptSpeech(toPt), 'ねこ')
})

test('promptSpeech: to_pt sem promptSpeak fala o próprio prompt', () => {
  assert.equal(promptSpeech({ ...toPt, promptSpeak: undefined }), 'neko')
})

test('promptSpeech: from_pt não fala (enunciado em português)', () => {
  assert.equal(promptSpeech(fromPt), null)
})

test('optionSpeech: from_pt fala optionsSpeak[i]', () => {
  assert.equal(optionSpeech(fromPt, 2), 'さかな')
})

test('optionSpeech: from_pt sem optionsSpeak fala a opção exibida', () => {
  assert.equal(optionSpeech({ ...fromPt, optionsSpeak: undefined }, 1), 'inu')
})

test('optionSpeech: to_pt não fala (opções em português)', () => {
  assert.equal(optionSpeech(toPt, 0), null)
})

test('canOpenToday: disponível e ativa abrem; feita e reprovada não', () => {
  assert.equal(canOpenToday('available'), true)
  assert.equal(canOpenToday('active'), true)
  assert.equal(canOpenToday('done'), false)
  assert.equal(canOpenToday('failed'), false)
})

test('dayLabel: reprovada hoje diz que repete amanhã', () => {
  assert.equal(dayLabel('failed'), 'Repete amanhã')
})

test('errorMessage: códigos conhecidos viram frase; frase passa; código estranho vira genérico', () => {
  assert.equal(errorMessage('already_done_today'), 'A lição dessa língua já foi feita hoje. Volta amanhã.')
  assert.equal(errorMessage('Erro ao iniciar lição'), 'Erro ao iniciar lição')
  assert.equal(errorMessage('weird_code'), 'Deu ruim. Tenta de novo.')
  assert.match(errorMessage(null), /conexão/)
})

test('errorCode: ApiError devolve o código; outro erro, null', () => {
  const api = Object.assign(new Error('attempt_expired'), { name: 'ApiError' })
  assert.equal(errorCode(api), 'attempt_expired')
  assert.equal(errorCode(new TypeError('Failed to fetch')), null)
  assert.equal(errorCode('x'), null)
})

const result = (over: Partial<FinishResult>): FinishResult => ({
  status: 'done',
  correct: 10,
  xp: 100,
  missions: [],
  streak: 1,
  generalStreak: 1,
  levelUp: null,
  ...over
})

test('resultTitle: perfeita, concluída, falhou', () => {
  assert.equal(resultTitle(result({}), 10), 'Lição perfeita!')
  assert.equal(resultTitle(result({ correct: 7 }), 10), 'Lição concluída')
  assert.equal(resultTitle(result({ status: 'failed', correct: 4 }), 10), 'Quase! Essa lição volta amanhã')
})

test('missionsXp soma as missões ganhas', () => {
  assert.equal(
    missionsXp(result({ missions: [{ kind: 'perfect', xp: 150 }, { kind: 'five_days', xp: 150 }] })),
    300
  )
})

test('placementResume: retoma do nível guardado', () => {
  assert.equal(placementResume('B2'), 'B2')
})

test('placementResume: nada ou lixo guardado começa no A1', () => {
  for (const v of [null, undefined, '', 'C2', 'b1', 3]) assert.equal(placementResume(v), 'A1')
})

test('errorMessage: already_placed', () => {
  assert.equal(errorMessage('already_placed'), 'Você já começou essa língua. O nível não muda mais.')
})
