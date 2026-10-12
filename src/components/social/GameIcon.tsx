import {
  Beer,
  Boxes,
  Cake,
  Car,
  CircleDashed,
  CircleDot,
  Crosshair,
  Crown,
  Film,
  Flame,
  Ghost,
  Pickaxe,
  Radiation,
  Spade,
  Swords,
  Target,
  UtensilsCrossed
} from 'lucide-react'
import * as React from 'react'
import { GameIcon as BocasGameIcon } from '@/lib/bocas-icons'
import { parseFavoriteGames } from '@/lib/api'
import { useMembersOptional } from '@/lib/members-context'
import type { IconComponent } from '@/lib/icon-component'

/**
 * Ícone do jogo. Um lugar só pra agenda, os cards, a faixa de "bora?" e os
 * jogos favoritos do perfil desenharem igual.
 *
 * A chave é a mesma string que o servidor guarda (`favoriteGames`), que a
 * presença de jogo usa (`lol`, `minecraft`) e que a agenda grava no campo
 * `game` — que hoje também guarda rodízio e churrasco. Chave desconhecida cai
 * no controle genérico — é de propósito: a lista NÃO é fechada no servidor,
 * senão cada jogo novo que a galera resolvesse jogar viraria um deploy de API.
 */

type GameSvgProps = { className?: string; strokeWidth?: number | string; 'aria-label'?: string }

/** Jogo sem ícone no lucide: desenha no mesmo traço (24×24, stroke 2). */
function gameSvg(paths: string[]): IconComponent {
  return function GameSvg({ className, strokeWidth = 2, ...props }: GameSvgProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        role={props['aria-label'] ? 'img' : undefined}
        className={className}
        {...props}
      >
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    )
  }
}

// Cabeça de demônio com chifres.
const DiabloIcon = gameSvg([
  'M5 3q0 5 4 7M19 3q0 5-4 7',
  'M7 11a5 5 0 0 1 10 0v3l-2 3v4H9v-4l-2-3Z',
  'M10 13.5h.01M14 13.5h.01M11 18h2'
])

// Cristal com asas — o "tale" de fantasia antiga.
const PristonIcon = gameSvg([
  'M12 3l4 6-4 12-4-12Z',
  'M8 9h8',
  'M8 8Q4 6 2 8q2 1 3 3 1-1 3-1M16 8q4-2 6 0-2 1-3 3-1-1-3-1'
])

const GAME_ICON: Record<string, IconComponent> = {
  lol: Swords,
  minecraft: Pickaxe,
  poker: Spade,
  // Xadrez e dama: as chaves são os valores de BoardGame (lib/api-board.ts).
  chess: Crown,
  draughts: CircleDot,
  pool: CircleDashed,
  valorant: Crosshair,
  cs2: Target,
  'arc-raiders': Radiation,
  fortnite: Boxes,
  'rocket-league': Car,
  'among-us': Ghost,
  'priston-tale': PristonIcon,
  diablo: DiabloIcon,
  // A agenda marca coisa que não é jogo (EVENT_KINDS em lib/api-events.ts).
  // Sem ícone próprio, um rodízio apareceria com um controle de videogame do lado.
  rodizio: UtensilsCrossed,
  churrasco: Flame,
  bar: Beer,
  cinema: Film,
  aniversario: Cake
}

/**
 * Jogo digitado na mão vira chave do jeito que a pessoa escreveu
 * (`xadrez`, `diablo-iv`). Aqui ele acha o ícone do jogo que já conhecemos.
 */
const GAME_ALIAS: [RegExp, string][] = [
  [/^xadrez$/, 'chess'],
  [/^damas?$/, 'draughts'],
  [/^(bilhar|sinuca|8-?ball(-pool)?)$/, 'pool'],
  [/^(league-of-legends|tft)$/, 'lol'],
  [/^(counter-strike|cs-?go|cs-?2)$/, 'cs2'],
  [/^diablo(-[0-9iv]+)?$/, 'diablo'],
  [/^priston(-tale)?$/, 'priston-tale']
]

function iconFor(game: string): IconComponent | undefined {
  const direct = GAME_ICON[game]
  if (direct) return direct
  const alias = GAME_ALIAS.find(([pattern]) => pattern.test(game))
  return alias ? GAME_ICON[alias[1]] : undefined
}

export interface GameWithoutIcon {
  game: string
  label: string
  /** Quem marcou o jogo no perfil (nome de exibição). */
  people: string[]
}

/**
 * Jogos favoritos da galera que caem no controle genérico. O painel admin
 * avisa, pra alguém desenhar o ícone e registrar em GAME_ICON/GAME_ALIAS.
 */
export function gamesWithoutIcon(
  members: { displayName: string; favoriteGames: string[] }[]
): GameWithoutIcon[] {
  const byGame = new Map<string, string[]>()
  for (const member of members) {
    for (const game of member.favoriteGames) {
      if (iconFor(game)) continue
      byGame.set(game, [...(byGame.get(game) ?? []), member.displayName])
    }
  }
  return [...byGame.entries()]
    .map(([game, people]) => ({ game, label: gameLabel(game), people }))
    .sort((a, b) => b.people.length - a.people.length || a.label.localeCompare(b.label))
}

/** gamesWithoutIcon() sobre a lista de membros carregada. Sem provider, vazio. */
export function useGamesWithoutIcon(): GameWithoutIcon[] {
  const members = useMembersOptional()?.members
  return React.useMemo(
    () =>
      gamesWithoutIcon(
        (members ?? [])
          .filter((m) => m.role !== 'bot')
          .map((m) => ({ displayName: m.displayName, favoriteGames: parseFavoriteGames(m.favoriteGames) }))
      ),
    [members]
  )
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

// Xadrez e dama não são sugestão do perfil (GAME_CATALOG), mas o ícone e o
// nome precisam ler certo onde aparecem.
const GAME_LABEL: Record<string, string> = {
  chess: 'Xadrez',
  draughts: 'Dama',
  pool: 'Bilhar',
  ...Object.fromEntries(
    GAME_CATALOG.map((game) => [game.key, game.label])
  )
}

/** Nome bonito de um jogo. Chave livre vira "Nome Digitado". */
export function gameLabel(game: string): string {
  return (
    GAME_LABEL[game] ??
    game
      .replace(/[-_]+/g, ' ')
      .replace(/\b\p{Ll}/gu, (letter) => letter.toUpperCase())
      // Numeral romano de continuação: "Diablo Iv" → "Diablo IV".
      .replace(/(?<=\s)(?:i{1,3}|iv|vi{0,3}|ix)\b/gi, (roman) => roman.toUpperCase())
  )
}

export function GameIcon({ game, className }: { game: string | null | undefined; className?: string }) {
  const cls = className ?? 'h-3.5 w-3.5'
  const Icon = (game && iconFor(game)) || BocasGameIcon
  return <Icon className={cls} aria-label={game ? gameLabel(game) : 'jogo'} />
}
