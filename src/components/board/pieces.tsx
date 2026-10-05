import { cn } from '@/lib/utils'
import type { Piece } from '@/lib/board-position'

/**
 * As peças: um conjunto próprio e simples, em SVG inline (grade 45×45). A cor
 * vem do CSS (`--peca-fundo` / `--peca-linha` em board.css, derivadas dos
 * tokens do tema), então as peças acompanham o tema e nada aqui é hex.
 * Brancas = claras com contorno escuro; pretas = escuras com contorno claro.
 *
 * Xadrez: seis silhuetas. Dama: pedra (disco) e dama (pedra com anel interno).
 */

/** O pé comum de toda peça de xadrez. */
const BASE = 'M11 37.5h23v3H11z'

function ChessShape({ kind }: { kind: Piece['kind'] }) {
  switch (kind) {
    case 'p':
      return (
        <>
          <circle cx="22.5" cy="13" r="5.5" />
          <path d="M15 36c0-8 3.5-11 7.5-15 4 4 7.5 7 7.5 15z" />
          <path d={BASE} />
        </>
      )
    case 'r':
      return (
        <>
          <path d="M12 36.5V14h4v3.5h4V14h5v3.5h4V14h4v22.5z" />
          <path d="M14 36.5V22h17v14.5z" />
          <path d={BASE} />
        </>
      )
    case 'n':
      return (
        <>
          <path d="M13 37c0-9 2-15 8-19l-5-1.5 3-5 6.5-3.5C32 9 36 15 36 24v13z" />
          <circle cx="23" cy="15.5" r="1.3" className="board-peca-furo" />
          <path d={BASE} />
        </>
      )
    case 'b':
      return (
        <>
          <circle cx="22.5" cy="8" r="2.5" />
          <path d="M22.5 11c-5 3.5-8 7-8 11 0 3 2 5 4 6-1 2-2 5-4 9h16c-2-4-3-7-4-9 2-1 4-3 4-6 0-4-3-7.500-8-11z" />
          <path d="M22.500 15v8M18.500 19h8" className="board-peca-furo-linha" />
          <path d={BASE} />
        </>
      )
    case 'q':
      return (
        <>
          <circle cx="9.500" cy="12" r="2.500" />
          <circle cx="16.500" cy="8.500" r="2.500" />
          <circle cx="28.500" cy="8.500" r="2.500" />
          <circle cx="35.500" cy="12" r="2.500" />
          <circle cx="22.500" cy="7" r="2.500" />
          <path d="M8.500 14l5 16 5-14 4 14 4-14 5 14 5-16-2 22h-24z" />
          <path d={BASE} />
        </>
      )
    case 'k':
      return (
        <>
          <path d="M22.500 4v8M18.500 8h8" className="board-peca-cruz" />
          <path d="M22.500 13c-4-3-12-1.500-10 6 1 4 5 6 6.500 8-1 3-3 6-5 10h17c-2-4-4-7-5-10 1.500-2 5.500-4 6.500-8 2-7.500-6-9-10-6z" />
          <path d={BASE} />
        </>
      )
    default:
      return null
  }
}

export function PieceGlyph({ piece, className }: { piece: Piece; className?: string }) {
  const draughts = piece.kind === 'man' || piece.kind === 'king'
  return (
    <svg
      viewBox="0 0 45 45"
      className={cn('board-peca', piece.side === 'white' ? 'board-peca--branca' : 'board-peca--preta', className)}
      aria-hidden
      focusable="false"
    >
      {draughts ? (
        <>
          <circle cx="22.500" cy="22.500" r="16.500" />
          {/* Dama = pedra com um anel interno. */}
          {piece.kind === 'king' && <circle cx="22.500" cy="22.500" r="9" className="board-peca-anel" />}
        </>
      ) : (
        <ChessShape kind={piece.kind} />
      )}
    </svg>
  )
}
