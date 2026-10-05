import { formatClock } from '@/lib/board-position'
import { cn } from '@/lib/utils'
import './board.css'

/** O relógio de um lado: destaque quando é a vez dele, alerta nos últimos 10 s. */
export function Clock({ ms, active, low }: { ms: number; active: boolean; low: boolean }) {
  return (
    <span className={cn('board-relogio', active && 'board-relogio--ativo', low && 'board-relogio--baixo')}>
      {formatClock(ms)}
    </span>
  )
}
