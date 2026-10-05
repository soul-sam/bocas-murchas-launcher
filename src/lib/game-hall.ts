/**
 * SALÃO DE JOGOS — quantos estão em cada jogo.
 *
 * Funções puras de propósito: o runner de testes do projeto roda TypeScript
 * cru, sem JSX (ver `test:policy` no package.json), então nada aqui importa
 * contexto nem React. Os tipos dos parâmetros são o mínimo estrutural que os
 * contextos já entregam (`activities` do socket, `tables` do poker).
 */

export type HallGame = 'minecraft' | 'poker' | 'lol'

/** Membros com atividade publicada naquele jogo, em qualquer fase. */
export function countByActivity(
  activities: Record<string, { game?: string } | null | undefined>,
  game: string
): number {
  let count = 0
  for (const entry of Object.values(activities)) {
    if (entry?.game === game) count += 1
  }
  return count
}

/** Pessoas sentadas em mesas de poker. Quem está em duas conta uma vez. */
export function countPokerPlayers(tables: Array<{ players: Array<{ userId: string }> }>): number {
  const seen = new Set<string>()
  for (const table of tables) {
    for (const player of table.players) seen.add(player.userId)
  }
  return seen.size
}

export function onlineLabel(count: number): string {
  return count > 0 ? `${count} online` : 'Ninguém agora'
}
