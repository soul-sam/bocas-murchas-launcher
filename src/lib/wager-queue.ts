/**
 * Filas em que NÃO dá pra apostar — espelho de `WAGER.nonPvpQueues` da API
 * (lib/gamification/rules.ts). A API é quem recusa; aqui é só pra tela dizer
 * "partida não habilitada para aposta" em vez de esperar um board que nunca
 * vem (a API nem lista essas partidas).
 *
 * `queue_1220` e `queue_3140` são o Desafios da Horuja e o modo treino como
 * chegam de launcher antigo, que não tinha nome pra essas filas.
 */
const NON_WAGER_QUEUES: readonly string[] = [
  'custom',
  'coop',
  'tutorial',
  'tft_horuja',
  'queue_1220',
  'queue_3140'
]

/** Partida em que dá pra apostar. Sem fila (ainda não lida) não bloqueia. */
export function isWagerQueue(queue: string | null | undefined): boolean {
  return !queue || !NON_WAGER_QUEUES.includes(queue)
}

export const NON_WAGER_TITLE = 'Partida não habilitada para aposta'
