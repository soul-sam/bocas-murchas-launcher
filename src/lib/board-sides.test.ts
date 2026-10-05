import test from 'node:test'
import assert from 'node:assert/strict'
import { sideIsLight, sideLabel } from './board-sides.ts'

test('xadrez: white é Brancas (clara), black é Pretas (escura)', () => {
  assert.equal(sideLabel('chess', null, 'white'), 'Brancas')
  assert.equal(sideLabel('chess', null, 'black'), 'Pretas')
  assert.equal(sideIsLight('chess', null, 'white'), true)
  assert.equal(sideIsLight('chess', null, 'black'), false)
})

test('dama brasileira: igual ao xadrez', () => {
  assert.equal(sideLabel('draughts', 'br', 'white'), 'Brancas')
  assert.equal(sideLabel('draughts', 'br', 'black'), 'Pretas')
  assert.equal(sideIsLight('draughts', 'br', 'white'), true)
  assert.equal(sideIsLight('draughts', 'br', 'black'), false)
})

test('dama americana: quem abre (white) é Pretas/escuro, black é Brancas/claro', () => {
  assert.equal(sideLabel('draughts', 'us', 'white'), 'Pretas')
  assert.equal(sideLabel('draughts', 'us', 'black'), 'Brancas')
  assert.equal(sideIsLight('draughts', 'us', 'white'), false)
  assert.equal(sideIsLight('draughts', 'us', 'black'), true)
})

test('dama sem variante e xadrez com variante perdida seguem o padrão', () => {
  assert.equal(sideLabel('draughts', null, 'white'), 'Brancas')
  assert.equal(sideLabel('chess', 'us', 'white'), 'Brancas')
})
