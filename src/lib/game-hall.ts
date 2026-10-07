/**
 * SALÃO DE JOGOS — quantos estão em cada jogo.
 *
 * Funções puras de propósito: o runner de testes do projeto roda TypeScript
 * cru, sem JSX (ver `test:policy` no package.json), então nada aqui importa
 * contexto nem React. Os tipos dos parâmetros são o mínimo estrutural que os
 * contextos já entregam (`activities` do socket, `tables` do poker).
 */

export type HallGame = 'minecraft' | 'poker' | 'lol' | 'chess' | 'draughts' | 'pool'

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

/**
 * Jogadores sentados + espectadores nas mesas daquele jogo. Por mesa conta
 * pessoas distintas entre host, brancas e pretas (o host costuma ser um dos
 * dois), e soma os espectadores, que o servidor já entrega contados.
 */
export function countBoardPeople(
  tables: Array<{
    game: string
    white: { userId: string } | null
    black: { userId: string } | null
    host: { userId: string }
    spectators: number
    phase?: string
  }>,
  game: string
): number {
  let count = 0
  for (const table of tables) {
    // Mesa encerrada ainda pode estar na lista por um instante: ninguém joga nela.
    if (table.game !== game || table.phase === 'finished') continue
    const seated = new Set<string>([table.host.userId])
    if (table.white) seated.add(table.white.userId)
    if (table.black) seated.add(table.black.userId)
    count += seated.size + table.spectators
  }
  return count
}
