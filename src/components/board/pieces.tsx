import * as React from 'react'
import { cn } from '@/lib/utils'
import type { Piece } from '@/lib/board-position'

/**
 * As peças: um conjunto próprio, em SVG inline (grade 45×45), desenhado pra
 * ler bem de 13px (na placa do jogador) a 90px (no tabuleiro cheio).
 *
 * A cor vem do CSS: cada peça tem um degradê de `--peca-luz` (canto de cima,
 * à esquerda) a `--peca-fundo`, e o contorno é `--peca-linha` — variáveis
 * que board.css deriva dos tokens do tema, então nada aqui é hex e as peças
 * acompanham o tema. Claras com contorno escuro; escuras com contorno claro.
 * O degradê precisa de um `<linearGradient>` com id único por instância
 * (`useId`), porque `fill` não aceita degradê de CSS.
 *
 * Xadrez: seis silhuetas com um pé comum. Dama: pedra (disco com bisel) e
 * dama (pedra com coroa gravada).
 */

/** O pé comum de toda peça de xadrez: um plinto com os cantos arredondados. */
const BASE =
  'M11.5 37.2h22a1.6 1.6 0 0 1 1.6 1.6v1.4a.8.8 0 0 1-.8.8H10.7a.8.8 0 0 1-.8-.8v-1.4a1.6 1.6 0 0 1 1.6-1.6z'

function ChessShape({ kind }: { kind: Piece['kind'] }) {
  switch (kind) {
    case 'p':
      return (
        <>
          <circle cx="22.5" cy="12.4" r="4.6" />
          <ellipse cx="22.5" cy="18.4" rx="4.6" ry="1.7" />
          <path d="M22.5 19.4c-3.6 0-6 2.3-6 5.4 0 2.1 1.2 3.8 2.9 4.8-3.3 1.9-5.4 4.9-5.9 8.4h18c-.5-3.5-2.6-6.5-5.9-8.4 1.7-1 2.9-2.7 2.9-4.8 0-3.1-2.4-5.4-6-5.4z" />
          <path d={BASE} />
        </>
      )
    case 'r':
      return (
        <>
          <path d="M12 9.5h5.2v3.6h3.4V9.5h3.8v3.6h3.4V9.5H33v6.2l-2.4 2.3v13.2l2.4 2.6v4H12v-4l2.4-2.6V18L12 15.7z" />
          <path d="M14.4 18h16.2M14.4 31.2h16.2" className="board-peca-detalhe" />
          <path d={BASE} />
        </>
      )
    case 'n':
      return (
        <>
          <path d="M12.5 37.6c-.3-5.8 1.9-9.9 5.9-12.1-2.7.2-5.5-.7-7.4-2.7-1.1-1.2-1.3-2.6-.6-3.8.9-1.8 2.7-3.2 4.5-4.5 1.6-1.2 3.1-2.5 4.4-4l1.3-4.8 2.9 3.6 3.7-3.1.6 5.3c4.3 3.3 6.3 8.5 6.1 14.6l-.4 11.5z" />
          <path d="M27.6 12.2c3.1 2.6 5 6.6 5.6 11.4M11.3 22.6c1.5.5 2.9.4 4-.3" className="board-peca-detalhe" />
          <circle cx="21.3" cy="14.2" r="1.25" className="board-peca-furo" />
          <circle cx="12.7" cy="19.7" r=".85" className="board-peca-furo" />
          <path d={BASE} />
        </>
      )
    case 'b':
      return (
        <>
          <circle cx="22.5" cy="6.4" r="2.3" />
          <path d="M22.5 9.2c-4.9 3.5-7.9 7.6-7.9 12.1 0 3.4 2 5.9 4.8 7.2-1 2.4-2.8 4.9-5.4 8.7h17c-2.6-3.8-4.4-6.3-5.4-8.7 2.8-1.3 4.8-3.8 4.8-7.2 0-4.5-3-8.6-7.9-12.1z" />
          <path d="M22.5 14.2v7.8M18.8 18.1h7.4M17.3 28.6h10.4" className="board-peca-detalhe" />
          <path d={BASE} />
        </>
      )
    case 'q':
      return (
        <>
          <circle cx="8.5" cy="12.6" r="2.2" />
          <circle cx="15.2" cy="8.4" r="2.2" />
          <circle cx="22.5" cy="6.6" r="2.2" />
          <circle cx="29.8" cy="8.4" r="2.2" />
          <circle cx="36.5" cy="12.6" r="2.2" />
          <path d="M8.9 14.8l3.5 10.8 3-15.1 3.5 15.1 3.6-16.8 3.6 16.8 3.5-15.1 3 15.1 3.5-10.8c-.9 6.7-1.8 11.6-2.7 15.4.9 2.8 1.2 5.2.8 7H10.8c-.4-1.8-.1-4.2.8-7-.9-3.8-1.8-8.7-2.7-15.4z" />
          <path d="M12 30.3h21" className="board-peca-detalhe" />
          <path d={BASE} />
        </>
      )
    case 'k':
      return (
        <>
          <path d="M22.5 3.6v6.2M19.3 6.7h6.4" className="board-peca-cruz" />
          <path d="M22.5 9.6c-3.3 0-5.6 2.2-5.6 5.1 0 1.5.5 2.7 1.4 3.6-3.9-2.7-9.5-1.2-10.5 3.3-.8 3.7 2 6.8 6.2 7.5-.5 2.7-1.7 5.3-3.4 7.7h23.8c-1.7-2.4-2.9-5-3.4-7.7 4.2-.7 7-3.8 6.2-7.5-1-4.5-6.6-6-10.5-3.3.9-.9 1.4-2.1 1.4-3.6 0-2.9-2.3-5.1-5.6-5.1z" />
          <path d="M14.6 29.3h15.8M22.5 19.2v9.6" className="board-peca-detalhe" />
          <path d={BASE} />
        </>
      )
    default:
      return null
  }
}

/** Deslocamento da animação de chegada, em casas (ver `.board-peca--anda`). */
export interface PieceMotion {
  dx: number
  dy: number
}

/**
 * `light` força a cor (dama americana: o lado que abre tem as peças escuras);
 * sem ele vale `piece.side`. `motion` faz a peça deslizar da origem até aqui.
 */
export function PieceGlyph({
  piece,
  className,
  light,
  motion
}: {
  piece: Piece
  className?: string
  light?: boolean
  motion?: PieceMotion
}) {
  // `useId` traz dois-pontos (":r1:"); dentro de url(#…) é mais seguro sem eles.
  const gradientId = `peca-${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const isLight = light ?? piece.side === 'white'
  const draughts = piece.kind === 'man' || piece.kind === 'king'
  const style = motion
    ? ({ '--dx': motion.dx, '--dy': motion.dy } as React.CSSProperties)
    : undefined
  return (
    <svg
      viewBox="0 0 45 45"
      className={cn(
        'board-peca',
        isLight ? 'board-peca--branca' : 'board-peca--preta',
        motion && 'board-peca--anda',
        className
      )}
      style={style}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--peca-luz)' }} />
          <stop offset="1" style={{ stopColor: 'var(--peca-fundo)' }} />
        </linearGradient>
      </defs>
      <g className="board-peca-corpo" fill={`url(#${gradientId})`}>
        {draughts ? (
          <>
            <circle cx="22.5" cy="23" r="16" />
            <circle cx="22.5" cy="23" r="11.5" className="board-peca-anel" />
            {/* Dama = pedra com a coroa gravada. */}
            {piece.kind === 'king' && (
              <path d="M16.3 27.6l1.9-7.8 4.3 3.7 4.3-3.7 1.9 7.8z" className="board-peca-furo" />
            )}
          </>
        ) : (
          <ChessShape kind={piece.kind} />
        )}
      </g>
    </svg>
  )
}
