/**
 * Sequências de teclado que acordam um ovo.
 *
 * Só contam teclas digitadas FORA de campo de texto: "murcho" escrito no chat
 * é mensagem, não ovo. A camada guarda as últimas teclas num buffer curto e
 * pergunta se ele TERMINA com alguma sequência — assim "xxmurcho" também vale
 * e ninguém precisa começar do zero depois de errar uma letra.
 */

export type SequenceId = 'konami' | 'murcho' | 'iddqd' | 'notebook'

const word = (text: string): string[] => text.split('')

export const SEQUENCES: ReadonlyArray<{ id: SequenceId; keys: string[] }> = [
  {
    id: 'konami',
    keys: ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a']
  },
  { id: 'murcho', keys: word('murcho') },
  { id: 'iddqd', keys: word('iddqd') },
  // O caderninho também abre por teclado, porque na web não existe barra de
  // título pra clicar.
  { id: 'notebook', keys: word('ovos') }
]

export const BUFFER_SIZE = Math.max(...SEQUENCES.map((s) => s.keys.length))

/** A tecla como ela entra no buffer: minúscula, sem acento de layout. */
export function normalizeKey(key: string): string | null {
  if (key.length === 1) return key.toLowerCase()
  if (key.startsWith('Arrow')) return key.toLowerCase()
  return null
}

/** Qual sequência o buffer acabou de completar, se alguma. */
export function completedSequence(buffer: readonly string[]): SequenceId | null {
  for (const sequence of SEQUENCES) {
    const n = sequence.keys.length
    if (buffer.length < n) continue
    const tail = buffer.slice(buffer.length - n)
    if (tail.every((key, i) => key === sequence.keys[i])) return sequence.id
  }
  return null
}

/** Foco num campo de texto? Aí a tecla é da pessoa, não do ovo. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
