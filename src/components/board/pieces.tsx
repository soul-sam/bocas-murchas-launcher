import * as React from 'react'
import { cn } from '@/lib/utils'
import type { Piece } from '@/lib/board-position'

/**
 * As peças: um conjunto próprio, em SVG inline (grade 45×45), no estilo do
 * conjunto padrão do chess.com ("neo"): formas cheias e arredondadas, base
 * em dois degraus, brancas BRANCAS com contorno grafite e pretas em
 * cinza-chumbo com um brilho em cima. Desenhado pra ler bem de 13px (na
 * placa do jogador) a 90px (no tabuleiro cheio).
 *
 * A cor vem do CSS (`--peca-luz`, `--peca-fundo`, `--peca-sombra` num
 * degradê de cima pra baixo; contorno `--peca-linha`), mas as variáveis são
 * FIXAS em board.css — peça é conteúdo, não cromo, e tem que ler igual em
 * todo tema e em toda cor de casa. O degradê precisa de um `<linearGradient>`
 * com id único por instância (`useId`), porque `fill` não aceita degradê de CSS.
 *
 * Xadrez: seis silhuetas com um pé comum. Dama: pedra (disco com bisel) e
 * dama (pedra com coroa gravada).
 */

/** O pé comum: plinto largo embaixo e um colar mais estreito por cima. */
function Base() {
  return (
    <>
      <rect x="11.5" y="31.6" width="22" height="4.2" rx="2.1" />
      <rect x="8" y="35.3" width="29" height="4.7" rx="2.3" />
    </>
  )
}

function ChessShape({ kind }: { kind: Piece['kind'] }) {
  switch (kind) {
    case 'p':
      return (
        <>
          <circle cx="22.5" cy="11.4" r="6" />
          <rect x="14.5" y="17" width="16" height="3.4" rx="1.7" />
          <path d="M22.5 20.4c-4 0-6.8 2.7-6.8 6.1 0 2.2 1.1 4 2.8 5.1-2.4.6-4.3 1.3-5.4 2.1h18.8c-1.1-.8-3-1.5-5.4-2.1 1.7-1.1 2.8-2.9 2.8-5.1 0-3.4-2.8-6.1-6.8-6.1z" />
          <Base />
        </>
      )
    case 'r':
      return (
        <>
          <path d="M10 6h6v4h3.6V6h5.8v4H29V6h6v9l-2.6 2.6v11.8l2.6 2.6v.6H10v-.6l2.6-2.6V17.6L10 15z" />
          <path d="M12.6 17.6h19.8M12.6 29.4h19.8" className="board-peca-detalhe" />
          <Base />
        </>
      )
    case 'n':
      return (
        <>
          <path d="M12.4 32.6c-.6-6.6 1.8-11.2 6.5-13.9-2.9.5-6-.4-8.2-2.6-1.3-1.3-1.7-2.9-.9-4.3 1-2.1 3-3.7 5-5.2 1.7-1.2 3.4-2.7 4.7-4.4l1.2-5.4 3.2 3.9 4-3.3.8 5.9c5.2 3.6 7.6 9.6 7.2 17.1l-.6 12.2z" />
          <path d="M28 10.2c3.7 2.9 5.9 7.6 6.6 13.3M9.9 22c1.7.7 3.3.6 4.6-.2" className="board-peca-detalhe" />
          <circle cx="21.4" cy="12.4" r="1.4" className="board-peca-furo" />
          <circle cx="11.4" cy="18.6" r="1" className="board-peca-furo" />
          <Base />
        </>
      )
    case 'b':
      return (
        <>
          <circle cx="22.5" cy="6.2" r="2.8" />
          <path d="M22.5 9.4c-5.4 3.6-8.6 8.2-8.6 12.9 0 3.4 1.9 6 4.7 7.4-.9 1.2-2 2.2-3.4 3.2h14.6c-1.4-1-2.5-2-3.4-3.2 2.8-1.4 4.7-4 4.7-7.4 0-4.7-3.2-9.3-8.6-12.9z" />
          <path d="M24.6 13.4l4.6 5.8M15.4 28.4h14.2" className="board-peca-detalhe" />
          <Base />
        </>
      )
    case 'q':
      return (
        <>
          <circle cx="6.9" cy="13.4" r="2.4" />
          <circle cx="14.2" cy="8.6" r="2.4" />
          <circle cx="22.5" cy="6.8" r="2.4" />
          <circle cx="30.8" cy="8.6" r="2.4" />
          <circle cx="38.1" cy="13.4" r="2.4" />
          <path d="M7.6 16l4.6 10.2 2.4-14.8 4.2 15 3.7-17.2 3.7 17.2 4.2-15 2.4 14.8L37.4 16c-.8 5.8-1.8 10.2-2.9 13.2.4.8.7 1.5.9 2.2H9.6c.2-.7.5-1.4.9-2.2-1.1-3-2.1-7.4-2.9-13.2z" />
          <path d="M10.8 28.6h23.4" className="board-peca-detalhe" />
          <Base />
        </>
      )
    case 'k':
      return (
        <>
          <path d="M22.5 2.4v6.8M19 5.6h7" className="board-peca-cruz" />
          <path d="M22.5 9c-3.3 0-5.6 2.2-5.6 5 0 1.5.6 2.8 1.5 3.7-4-2.8-9.9-1.4-11 3.2-.9 4 2.2 7.4 6.7 8.1-.3 1.1-.7 2.1-1.3 3h19.4c-.6-.9-1-1.9-1.3-3 4.5-.7 7.6-4.1 6.7-8.1-1.1-4.6-7-6-11-3.2.9-.9 1.5-2.2 1.5-3.7 0-2.8-2.3-5-5.6-5z" />
          <path d="M13.8 28.2h17.4M22.5 18.4v9.8" className="board-peca-detalhe" />
          <Base />
        </>
      )
    default:
      return null
  }
}

/** Duração de cada salto numa captura múltipla da dama. */
export const HOP_MS = 180

/**
 * Deslocamento da animação de chegada, em casas (ver `.board-peca--anda`).
 * `stops`: captura múltipla da dama — as paradas do caminho, da origem até
 * aqui (a última é 0,0), em casas; a peça pula parada a parada (Web
 * Animations, porque CSS não aceita uma lista variável de keyframes).
 */
export interface PieceMotion {
  dx: number
  dy: number
  stops?: ReadonlyArray<{ dx: number; dy: number }>
  hopMs?: number
}

/**
 * `light` força a cor (dama americana: o lado que abre tem as peças escuras);
 * sem ele vale `piece.side`. `motion` faz a peça deslizar da origem até aqui.
 * `eatenDelay`: peça comida (a casa já está vazia) — fica e some depois de
 * tantos ms (`.board-peca--comida`).
 */
export function PieceGlyph({
  piece,
  className,
  light,
  motion,
  eatenDelay
}: {
  piece: Piece
  className?: string
  light?: boolean
  motion?: PieceMotion
  eatenDelay?: number
}) {
  // `useId` traz dois-pontos (":r1:"); dentro de url(#…) é mais seguro sem eles.
  const gradientId = `peca-${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const isLight = light ?? piece.side === 'white'
  const draughts = piece.kind === 'man' || piece.kind === 'king'
  const hops = motion?.stops && motion.stops.length > 1 ? motion.stops : null
  const eaten = eatenDelay !== undefined
  const style = eaten
    ? ({ '--atraso': `${eatenDelay}ms` } as React.CSSProperties)
    : motion && !hops
      ? ({ '--dx': motion.dx, '--dy': motion.dy } as React.CSSProperties)
      : undefined

  // Os saltos: a casa mede a peça (100% da casa = uma casa), e cada parada
  // vira um keyframe; o caminho todo dura um salto por trecho.
  const ref = React.useRef<SVGSVGElement>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el || !hops) return
    const cell = el.parentElement?.getBoundingClientRect()
    if (!cell) return
    const w = cell.width
    const h = cell.height
    const frames = hops.map((s, i) => ({
      transform: `translate(${s.dx * w}px, ${s.dy * h}px) scale(${i === 0 || i === hops.length - 1 ? 1 : 1.08})`,
      easing: 'ease-in-out'
    }))
    const anim = el.animate(frames, {
      duration: (hops.length - 1) * (motion?.hopMs ?? HOP_MS),
      fill: 'both'
    })
    return () => anim.cancel()
  }, [hops, motion?.hopMs])

  return (
    <svg
      ref={ref}
      viewBox="0 0 45 45"
      className={cn(
        'board-peca',
        isLight ? 'board-peca--branca' : 'board-peca--preta',
        motion && !hops && 'board-peca--anda',
        hops && 'board-peca--pula',
        eaten && 'board-peca--comida',
        className
      )}
      style={style}
      aria-hidden
      focusable="false"
    >
      <defs>
        {/* De cima pra baixo: brilho, corpo, sombra — a luz vem da luminária. */}
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--peca-luz)' }} />
          <stop offset="0.45" style={{ stopColor: 'var(--peca-fundo)' }} />
          <stop offset="1" style={{ stopColor: 'var(--peca-sombra)' }} />
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
