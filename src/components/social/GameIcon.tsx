import {
  Boxes,
  Car,
  Crosshair,
  Gamepad2,
  Ghost,
  Pickaxe,
  Radiation,
  Swords,
  Target,
  type LucideIcon
} from 'lucide-react'

/**
 * Ícone do jogo. Um lugar só pra agenda, os cards, a faixa de "bora?" e os
 * jogos favoritos do perfil desenharem igual.
 *
 * A chave é a mesma string que o servidor guarda (`favoriteGames`) e que a
 * presença de jogo usa (`lol`, `minecraft`). Chave desconhecida cai no
 * controle genérico — é de propósito: a lista de jogos NÃO é fechada no
 * servidor, senão cada jogo novo que a galera resolvesse jogar viraria um
 * deploy de API.
 */

const GAME_ICON: Record<string, LucideIcon> = {
  lol: Swords,
  minecraft: Pickaxe,
  valorant: Crosshair,
  cs2: Target,
  'arc-raiders': Radiation,
  fortnite: Boxes,
  'rocket-league': Car,
  'among-us': Ghost
}

/**
 * Os jogos que aparecem como sugestão no editor de perfil, na ordem em que a
 * galera joga. Quem joga outra coisa digita o nome.
 */
export const GAME_CATALOG: { key: string; label: string }[] = [
  { key: 'lol', label: 'LoL' },
  { key: 'minecraft', label: 'Minecraft' },
  { key: 'valorant', label: 'Valorant' },
  { key: 'cs2', label: 'CS2' },
  { key: 'arc-raiders', label: 'Arc Raiders' },
  { key: 'fortnite', label: 'Fortnite' },
  { key: 'rocket-league', label: 'Rocket League' },
  { key: 'among-us', label: 'Among Us' }
]

const GAME_LABEL: Record<string, string> = Object.fromEntries(
  GAME_CATALOG.map((game) => [game.key, game.label])
)

/** Nome bonito de um jogo. Chave livre vira "Nome Digitado". */
export function gameLabel(game: string): string {
  return (
    GAME_LABEL[game] ??
    game
      .replace(/[-_]+/g, ' ')
      .replace(/\b\p{Ll}/gu, (letter) => letter.toUpperCase())
  )
}

export function GameIcon({ game, className }: { game: string | null | undefined; className?: string }) {
  const cls = className ?? 'h-3.5 w-3.5'
  const Icon = (game && GAME_ICON[game]) || Gamepad2
  return <Icon className={cls} aria-label={game ? gameLabel(game) : 'jogo'} />
}
