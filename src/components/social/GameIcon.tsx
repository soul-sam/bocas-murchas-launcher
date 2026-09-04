import { Gamepad2, Pickaxe, Swords } from 'lucide-react'

/**
 * Ícone do jogo: espadas pro LoL, picareta pro Minecraft, controle pro resto.
 * Um lugar só pra agenda, os cards e a faixa de "bora?" desenharem igual.
 */
export function GameIcon({ game, className }: { game: string | null | undefined; className?: string }) {
  const cls = className ?? 'h-3.5 w-3.5'
  switch (game) {
    case 'lol':
      return <Swords className={cls} aria-label="LoL" />
    case 'minecraft':
      return <Pickaxe className={cls} aria-label="Minecraft" />
    default:
      return <Gamepad2 className={cls} aria-label={game ?? 'jogo'} />
  }
}
