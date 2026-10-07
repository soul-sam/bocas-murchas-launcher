import * as React from 'react'
import { sideIsLight, type BoardGame, type DraughtsVariant, type Side } from '@/lib/api-board'
import type { Piece } from '@/lib/board-position'
import { cn } from '@/lib/utils'
import { PieceGlyph } from './pieces'
import './board.css'

/**
 * Os lances, dois por linha (brancas e pretas), como no chess.com: no xadrez
 * em SAN com a FIGURA da peça no lugar da letra (Cf3 vira [cavalo]f3, e8=D
 * vira e8=[dama]), na dama a notação de casas. O lance da posição na tela
 * fica marcado; clicar num lance leva o tabuleiro até ele.
 *
 * Acompanha o lance marcado sem rolar a página: só o contêiner da lista anda
 * (scrollIntoView rolaria a tela inteira no celular).
 */

export interface MoveListPly {
  text: string
  side: Side
}

const SAN = /^([KQRBN])?(.*?)(?:=([QRBN]))?([+#])?$/

function SanText({ san, side, light }: { san: string; side: Side; light: boolean }) {
  const m = SAN.exec(san)
  if (!m) return <>{san}</>
  const [, piece, body, promotion, suffix] = m
  const glyph = (letter: string) => (
    <PieceGlyph
      piece={{ side, kind: letter.toLowerCase() as Piece['kind'] }}
      light={light}
      className="board-peca--mini board-san-peca"
    />
  )
  return (
    <>
      {piece && glyph(piece)}
      {body}
      {promotion && (
        <>
          ={glyph(promotion)}
        </>
      )}
      {suffix}
    </>
  )
}

export function MoveList({
  game,
  variant = null,
  plies,
  current,
  onSelect
}: {
  game: BoardGame
  variant?: DraughtsVariant | null
  plies: MoveListPly[]
  /** Quantos lances a tela está mostrando (0 = posição inicial). */
  current: number
  /** Leva o tabuleiro até a posição depois do lance `ply + 1`. */
  onSelect?: (shown: number) => void
}) {
  const listRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const list = listRef.current
    if (!list) return
    const scroller = list.parentElement && list.parentElement.scrollHeight > list.parentElement.clientHeight
      ? list.parentElement
      : list
    // Ao vivo: o fim da lista. Navegando: o lance marcado à vista.
    if (current >= plies.length) {
      scroller.scrollTop = scroller.scrollHeight
      return
    }
    const el = list.querySelector<HTMLElement>('.board-lance--atual')
    if (!el) {
      scroller.scrollTop = 0
      return
    }
    const top = el.offsetTop
    const bottom = top + el.offsetHeight
    if (top < scroller.scrollTop) scroller.scrollTop = Math.max(0, top - 6)
    else if (bottom > scroller.scrollTop + scroller.clientHeight) {
      scroller.scrollTop = bottom - scroller.clientHeight + 6
    }
  }, [current, plies.length])

  if (plies.length === 0) {
    return <p className="px-3 py-3 text-xs text-muted-foreground">Nenhum lance ainda.</p>
  }

  const rows: Array<{ n: number; white: number; black: number | null }> = []
  for (let i = 0; i < plies.length; i += 2) {
    rows.push({ n: i / 2 + 1, white: i, black: i + 1 < plies.length ? i + 1 : null })
  }

  const cell = (i: number | null) => {
    if (i === null) return <span className="board-lance board-lance--vazio" />
    const ply = plies[i]
    const content =
      game === 'chess' ? (
        <SanText san={ply.text} side={ply.side} light={sideIsLight(game, variant, ply.side)} />
      ) : (
        ply.text
      )
    const active = current === i + 1
    if (!onSelect) {
      return <span className={cn('board-lance', active && 'board-lance--atual')}>{content}</span>
    }
    return (
      <button
        type="button"
        className={cn('board-lance', active && 'board-lance--atual')}
        aria-current={active ? 'step' : undefined}
        aria-label={`Lance ${Math.floor(i / 2) + 1}${ply.side === 'white' ? '' : '…'} ${ply.text}`}
        onClick={() => onSelect(i + 1)}
      >
        {content}
      </button>
    )
  }

  return (
    <div ref={listRef} className="board-lances min-h-0 flex-1">
      {rows.map((row) => (
        <React.Fragment key={row.n}>
          <span className="board-lances-n">{row.n}.</span>
          {cell(row.white)}
          {cell(row.black)}
        </React.Fragment>
      ))}
    </div>
  )
}
