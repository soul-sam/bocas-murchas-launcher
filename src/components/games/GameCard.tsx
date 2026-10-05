import { Button } from '@/components/ui/button'
import { GameIcon } from '@/components/social/GameIcon'
import { onlineLabel } from '@/lib/game-hall'
import { cn } from '@/lib/utils'

/**
 * Um jogo no Salão: ícone, quantos estão nele agora e a porta de entrada.
 *
 * O card inteiro não é clicável de propósito: o botão é o único alvo, com
 * rótulo próprio, e quem navega por teclado para num lugar só por jogo.
 */
export function GameCard({
  game,
  title,
  subtitle,
  online,
  onEnter
}: {
  game: string
  title: string
  subtitle: string
  online: number
  onEnter: () => void
}) {
  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-brutal border border-line bg-void p-5">
      <div className="flex items-center gap-3">
        <GameIcon game={game} className="h-10 w-10 shrink-0 text-acid" />
        <div className="min-w-0">
          <h2 className="title-brutal truncate text-xl leading-tight">{title}</h2>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <span
          aria-hidden
          className={cn('h-2 w-2 rounded-full', online > 0 ? 'bg-acid' : 'bg-surface-strong')}
        />
        <span className={cn(online > 0 && 'text-foreground')}>{onlineLabel(online)}</span>
      </p>

      <Button className="mt-auto w-full" onClick={onEnter} aria-label={`Entrar em ${title}`}>
        Entrar
      </Button>
    </article>
  )
}
