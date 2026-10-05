import * as React from 'react'
import { cn } from '@/lib/utils'
import './board.css'

/**
 * Os lances na notação do servidor (UCI no xadrez, casas na dama), dois por
 * linha: brancas e pretas. Acompanha o fim da lista conforme a partida anda.
 */
export function MoveList({ moves }: { moves: string[] }) {
  const endRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [moves.length])

  if (moves.length === 0) {
    return <p className="px-3 py-3 text-xs text-muted-foreground">Nenhum lance ainda.</p>
  }

  const rows: Array<{ n: number; white: string; black: string | null }> = []
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({ n: i / 2 + 1, white: moves[i], black: moves[i + 1] ?? null })
  }
  const last = moves.length - 1

  return (
    <div className="board-lances min-h-0 flex-1">
      {rows.map((row) => (
        <React.Fragment key={row.n}>
          <span className="board-lances-n">{row.n}.</span>
          <span className={cn('board-lance', row.n * 2 - 2 === last && 'board-lance--ultimo')}>{row.white}</span>
          <span className={cn('board-lance', row.black !== null && row.n * 2 - 1 === last && 'board-lance--ultimo')}>
            {row.black ?? ''}
          </span>
        </React.Fragment>
      ))}
      <div ref={endRef} className="col-span-3" />
    </div>
  )
}
