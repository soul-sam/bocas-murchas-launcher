import test from 'node:test'
import assert from 'node:assert/strict'
import { collectMentions, isSafeUrl, mentionsEveryone } from './rich-text.ts'

/**
 * Regra de seguranca: so http(s) chega no shell.openExternal. Qualquer outro
 * esquema vindo de mensagem de terceiro (file:, javascript:, esquema de outro
 * programa) abriria arquivo local ou executaria programa.
 */
test('isSafeUrl aceita só http e https', () => {
  assert.equal(isSafeUrl('https://bocasmurchas.com.br'), true)
  assert.equal(isSafeUrl('http://example.com/x?y=1'), true)
  assert.equal(isSafeUrl('HTTPS://EXAMPLE.COM'), true)
})

test('isSafeUrl recusa esquemas perigosos e lixo', () => {
  for (const url of [
    'javascript:alert(1)',
    'file:///C:/Windows/System32/calc.exe',
    'steam://run/123',
    'data:text/html,<script>1</script>',
    'ms-settings:',
    'www.sem-esquema.com',
    '',
    'not a url'
  ]) {
    assert.equal(isSafeUrl(url), false, url)
  }
})

/** Notificacao de mencao: nomes em minusculas, sem repetir, ignorando codigo. */
test('collectMentions devolve nomes únicos em minúsculas', () => {
  assert.deepEqual(collectMentions('oi @Fulano e @fulano, cadê o @Beltrano?'), ['fulano', 'beltrano'])
  assert.deepEqual(collectMentions('sem mencao nenhuma'), [])
})

test('mentionsEveryone reconhece os apelidos e não pega e-mail', () => {
  assert.equal(mentionsEveryone('@everyone bora'), true)
  assert.equal(mentionsEveryone('bora @todos'), true)
  assert.equal(mentionsEveryone('chama @Geral'), true)
  assert.equal(mentionsEveryone('fulano@todos.com'), false)
  assert.equal(mentionsEveryone('@todosmenos'), false)
})
