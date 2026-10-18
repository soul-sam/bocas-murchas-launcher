/**
 * Regras puras do cache de mensagens do chat (chat-context.tsx).
 *
 * Fora do contexto pra rodar no `node --test`: o corte decide o que some da
 * memória, e um erro aqui ou perde mensagem nova ou volta a crescer sem fim.
 */

export interface HasId {
  id: string
}

/**
 * Junta a mensagem nova no fim, sem duplicar, e corta o começo se passar de
 * `keep`. Devolve a MESMA lista quando a mensagem já estava (o servidor manda
 * de volta pro autor), pra o React não renderizar à toa.
 */
export function appendCapped<T extends HasId>(list: readonly T[], message: T, keep: number): T[] | readonly T[] {
  if (list.some((m) => m.id === message.id)) return list
  const grown = [...list, message]
  return grown.length <= keep ? grown : grown.slice(-keep)
}

/** Canais que passam de `keep` — os que vão ser aparados. */
export function overCap<T>(byChannel: Record<string, readonly T[]>, keep: number): string[] {
  return Object.entries(byChannel)
    .filter(([, list]) => list.length > keep)
    .map(([id]) => id)
}
