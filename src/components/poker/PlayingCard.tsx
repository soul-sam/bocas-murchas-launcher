import * as React from 'react'
import { cardLabel, isRedSuit, parseCard, RANK_FACE } from '@/lib/api-poker'
import { cn } from '@/lib/utils'
import { SuitGlyph } from './PokerGlyphs'
import './poker.css'

/**
 * UMA CARTA. Desenhada em HTML+SVG, não em imagem: 52 PNGs pesariam no
 * instalador e sairiam borradas em tela 4K; aqui o valor é texto (Inter, o
 * mesmo peso do app) e o naipe é um glifo vetorial.
 *
 * Tamanhos fixos por nome, e não livres, pra que cartas lado a lado em telas
 * diferentes (mão, mesa, histórico, colinha) sejam SEMPRE da mesma família:
 *   xs 22×31  no histórico da mão e no chat
 *   sm 34×48  nos assentos dos outros
 *   md 46×64  na mesa (flop/turn/river) e na colinha
 *   lg 62×87  as suas duas
 *
 * `faceDown` é o verso; `code` vazio com `placeholder` é a vaga na mesa.
 */

export type CardSize = 'xs' | 'sm' | 'md' | 'lg'

const SIZE: Record<CardSize, { w: number; rank: string; corner: string; pip: string }> = {
  xs: { w: 22, rank: 'text-[11px] leading-none', corner: 'h-2 w-2', pip: 'h-3 w-3' },
  sm: { w: 34, rank: 'text-[12px] leading-none', corner: 'h-2.5 w-2.5', pip: 'h-4 w-4' },
  md: { w: 46, rank: 'text-sm leading-none', corner: 'h-3 w-3', pip: 'h-6 w-6' },
  lg: { w: 62, rank: 'text-lg leading-none', corner: 'h-3.5 w-3.5', pip: 'h-8 w-8' }
}

export function PlayingCard({
  code,
  size = 'md',
  faceDown,
  placeholder,
  dim,
  highlight,
  animate,
  className,
  style
}: {
  code?: string | null
  size?: CardSize
  faceDown?: boolean
  /** Sem carta: desenha a vaga tracejada (lugar do flop ainda por vir). */
  placeholder?: boolean
  /** Apagada: foldou ou perdeu. */
  dim?: boolean
  /** Faz parte da mão vencedora. */
  highlight?: boolean
  /** Entra virando (carta recém-dada). */
  animate?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const s = SIZE[size]
  const card = code ? parseCard(code) : null

  if (!card && !faceDown) {
    if (!placeholder) return null
    return <span aria-hidden className={cn('carta carta--vaga', className)} style={{ width: s.w, ...style }} />
  }

  if (faceDown || !card) {
    return (
      <span
        role="img"
        aria-label="carta virada"
        className={cn('carta carta--verso', dim && 'carta--apagada', animate && 'carta--entra', className)}
        style={{ width: s.w, ...style }}
      />
    )
  }

  const red = isRedSuit(card.suit)
  const face = RANK_FACE[card.rank]

  return (
    <span
      role="img"
      aria-label={cardLabel(code!)}
      className={cn(
        'carta',
        red ? 'carta--vermelha' : 'carta--preta',
        dim && 'carta--apagada',
        highlight && 'carta--vencedora',
        animate && 'carta--entra',
        className
      )}
      style={{ width: s.w, ...style }}
    >
      {/* canto: valor em cima do naipe pequeno */}
      <span
        className={cn('absolute left-[7%] top-[5%] flex flex-col items-center font-sans font-bold', s.rank)}
        style={{ letterSpacing: face === '10' ? '-0.08em' : undefined }}
      >
        <span>{face}</span>
        <SuitGlyph suit={card.suit} className={cn('mt-px', s.corner)} />
      </span>
      {/* naipe grande no centro, um pouco pra baixo pra equilibrar o canto */}
      <SuitGlyph
        suit={card.suit}
        className={cn('absolute left-1/2 top-[56%] -translate-x-1/2 -translate-y-1/2', s.pip)}
      />
    </span>
  )
}

/** Fileira de cartas, com sobreposição leve quando pedido (mãos nos assentos). */
export function CardRow({
  codes,
  size = 'md',
  faceDown,
  dim,
  highlightCodes,
  overlap,
  animate,
  slots,
  className
}: {
  codes: string[]
  size?: CardSize
  faceDown?: boolean
  dim?: boolean
  /** Cartas que fazem parte da melhor mão. */
  highlightCodes?: string[] | null
  overlap?: boolean
  animate?: boolean
  /** Quantas vagas desenhar no total (a mesa tem 5). */
  slots?: number
  className?: string
}) {
  const total = slots ?? codes.length
  const hl = highlightCodes ? new Set(highlightCodes) : null
  return (
    <span className={cn('inline-flex items-center', overlap ? '-space-x-2' : 'gap-1', className)}>
      {Array.from({ length: total }).map((_, i) => {
        const code = codes[i]
        return (
          <PlayingCard
            key={code ? `${code}-${i}` : `vaga-${i}`}
            code={code}
            size={size}
            faceDown={faceDown && !!code}
            placeholder={!code}
            dim={dim}
            highlight={!!code && !!hl && hl.has(code)}
            animate={animate && !!code}
            style={overlap ? { transform: `rotate(${(i - (total - 1) / 2) * 6}deg)` } : undefined}
          />
        )
      })}
    </span>
  )
}
