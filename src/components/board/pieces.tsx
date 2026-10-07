import * as React from 'react'
import { cn } from '@/lib/utils'
import type { Piece } from '@/lib/board-position'

import wb from '@/assets/chess/wb.png'
import wk from '@/assets/chess/wk.png'
import wn from '@/assets/chess/wn.png'
import wp from '@/assets/chess/wp.png'
import wq from '@/assets/chess/wq.png'
import wr from '@/assets/chess/wr.png'
import bb from '@/assets/chess/bb.png'
import bk from '@/assets/chess/bk.png'
import bn from '@/assets/chess/bn.png'
import bp from '@/assets/chess/bp.png'
import bq from '@/assets/chess/bq.png'
import br from '@/assets/chess/br.png'

/**
 * As peças.
 *
 * Xadrez: o conjunto clássico em PNG (150×150, fundo transparente, o pé de
 * todas na mesma linha), desenhado por um `<image>` dentro do mesmo `<svg>`
 * 45×45 — assim a peça herda tudo o que a mesa já faz com `.board-peca`
 * (tamanho, sombra, deslize, saltos, a que é comida). Abaixo de 4 KB cada,
 * o Vite embute como data URI.
 *
 * Dama: pedra (disco com bisel) e dama (pedra com coroa gravada), em SVG. A
 * cor vem do CSS (`--peca-luz`, `--peca-fundo`, `--peca-sombra` num degradê
 * de cima pra baixo; contorno `--peca-linha`), FIXA em board.css. O degradê
 * precisa de um `<linearGradient>` com id único por instância (`useId`),
 * porque `fill` não aceita degradê de CSS.
 */

type ChessKind = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

const CHESS_SPRITES: Record<'white' | 'black', Record<ChessKind, string>> = {
  white: { p: wp, n: wn, b: wb, r: wr, q: wq, k: wk },
  black: { p: bp, n: bn, b: bb, r: br, q: bq, k: bk }
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
      {draughts ? (
        <>
          <defs>
            {/* De cima pra baixo: brilho, corpo, sombra — a luz vem da luminária. */}
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--peca-luz)' }} />
              <stop offset="0.45" style={{ stopColor: 'var(--peca-fundo)' }} />
              <stop offset="1" style={{ stopColor: 'var(--peca-sombra)' }} />
            </linearGradient>
          </defs>
          <g className="board-peca-corpo" fill={`url(#${gradientId})`}>
            <circle cx="22.5" cy="23" r="16" />
            <circle cx="22.5" cy="23" r="11.5" className="board-peca-anel" />
            {/* Dama = pedra com a coroa gravada. */}
            {piece.kind === 'king' && (
              <path d="M16.3 27.6l1.9-7.8 4.3 3.7 4.3-3.7 1.9 7.8z" className="board-peca-furo" />
            )}
          </g>
        </>
      ) : (
        <image href={CHESS_SPRITES[isLight ? 'white' : 'black'][piece.kind as ChessKind]} width="45" height="45" />
      )}
    </svg>
  )
}
