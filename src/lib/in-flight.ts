/**
 * GETs iguais ao mesmo tempo viram uma requisição só.
 *
 * Ao abrir o app várias telas/contextos pedem o mesmo endpoint quase juntos
 * (perfil de alguém aberto em dois lugares, membros, gamificação) e cada um
 * fazia o próprio fetch (auditoria out/2026, item 2.10). Aqui a segunda
 * chamada pega carona na primeira enquanto ela está no ar; terminou, a
 * próxima vai ao servidor de novo — isto NÃO é cache.
 *
 * Quem pega carona recebe uma CÓPIA do resultado: um consumidor que ordena ou
 * altera o array recebido não pode mexer no do outro.
 *
 * Puro (sem fetch) pra rodar no `node --test`.
 */
export function createInFlight() {
  const pending = new Map<string, Promise<unknown>>()

  return function share<T>(key: string, run: () => Promise<T>): Promise<T> {
    const existing = pending.get(key) as Promise<T> | undefined
    if (existing) return existing.then((value) => clone(value))

    const promise = run().finally(() => pending.delete(key))
    pending.set(key, promise)
    return promise
  }
}

function clone<T>(value: T): T {
  return value === null || typeof value !== 'object' ? value : structuredClone(value)
}
