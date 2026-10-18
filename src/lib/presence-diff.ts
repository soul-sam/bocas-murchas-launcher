/**
 * Presença por diferença: aplicar `presence:join` / `presence:leave` na lista
 * de quem está online (auditoria out/2026, item 3.3).
 *
 * O servidor só manda isto pra quem declarou `caps: ['presence-diff']` no
 * handshake (socket-context); o retrato completo continua chegando ao
 * conectar, e é ele que corrige qualquer desvio.
 *
 * Puro pra rodar no `node --test`. Devolve a MESMA lista quando nada muda.
 */
export interface HasPresenceId {
  id: string
}

/** Chegou alguém: entra no fim, ou substitui a entrada antiga da mesma pessoa. */
export function applyPresenceJoin<T extends HasPresenceId>(list: T[], person: T): T[] {
  const at = list.findIndex((p) => p.id === person.id)
  if (at === -1) return [...list, person]
  const next = list.slice()
  next[at] = person
  return next
}

/** Saiu: some da lista. */
export function applyPresenceLeave<T extends HasPresenceId>(list: T[], userId: string): T[] {
  return list.some((p) => p.id === userId) ? list.filter((p) => p.id !== userId) : list
}
