/**
 * Textos do modo treino. Puro de propósito (sem React nem `@/`), pra rodar no
 * `node --test`. No treino não há jogadores: os lados são nomeados pela cor.
 */

import { sideLabel } from './board-sides.ts'

type Side = 'white' | 'black'

/** "Pretas vencem por mate" / "Empate por afogamento". `reason` já vem traduzido. */
export function practiceHeadline(
  game: string,
  variant: string | null,
  result: { winner: Side | null; reason: string },
  reason: string
): string {
  if (!result.winner) return `Empate por ${reason}`
  return `${sideLabel(game, variant, result.winner)} vencem por ${reason}`
}

export function practiceTurnLabel(game: string, variant: string | null, turn: Side): string {
  return `Vez das ${sideLabel(game, variant, turn).toLowerCase()}`
}

/**
 * Lances do treino no formato da lista de lances. O servidor manda só o texto;
 * o lado sai da ordem, porque no contrato `white` é sempre quem abre (ver
 * board-sides) — inclusive na dama americana, onde quem abre são as pretas.
 */
export function practicePlies(moves: readonly string[]): { text: string; side: Side }[] {
  return moves.map((text, i) => ({ text, side: i % 2 === 0 ? 'white' : 'black' }))
}
