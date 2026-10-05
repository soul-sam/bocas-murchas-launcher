/**
 * Cores do xadrez e da dama. Puro de propósito (sem React nem `@/`), pra rodar
 * no `node --test`.
 *
 * No contrato `white` só quer dizer "quem joga primeiro". Na dama americana
 * quem abre é o lado ESCURO, então ali `white` é "Pretas" (peças escuras) e
 * `black` é "Brancas" (peças claras). Em todo o resto `white` é Brancas.
 */

type Side = 'white' | 'black'

const firstMoverIsDark = (game: string, variant: string | null | undefined): boolean =>
  game === 'draughts' && variant === 'us'

/** `true` quando as peças daquele lado são as claras. */
export function sideIsLight(game: string, variant: string | null | undefined, side: Side): boolean {
  return firstMoverIsDark(game, variant) ? side === 'black' : side === 'white'
}

export function sideLabel(game: string, variant: string | null | undefined, side: Side): 'Brancas' | 'Pretas' {
  return sideIsLight(game, variant, side) ? 'Brancas' : 'Pretas'
}
