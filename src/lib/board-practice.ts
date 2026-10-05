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
