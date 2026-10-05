import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

/** "← Salão de jogos", igual no topo de toda tela de jogo. */
export function BackToHall({ className }: { className?: string }) {
  return (
    <Link
      to="/jogos"
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-brutal px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-acid',
        className
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      Salão de jogos
    </Link>
  )
}
