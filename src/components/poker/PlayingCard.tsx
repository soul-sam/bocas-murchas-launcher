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
  enter,
  delayMs,
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
  /** Entra deslizando (nome antigo; igual a `enter="slide"`). */
  animate?: boolean
  /**
   * Como a carta chega: `fly` sai do centro da mesa até o assento (cartas
   * dadas), `slide` desce de cima (as suas, no rodapé), `none` fica parada.
   */
  enter?: 'fly' | 'slide' | 'none'
  /** Escalonamento da entrada, em ms (`--carta-atraso`). */
  delayMs?: number
  className?: string
  style?: React.CSSProperties
}) {
  const s = SIZE[size]
  const card = code ? parseCard(code) : null
  const mode = enter ?? (animate ? 'slide' : 'none')
  const enterClass = mode === 'fly' ? 'carta--voa' : mode === 'slide' ? 'carta--desliza' : null
  const enterStyle: React.CSSProperties | undefined =
    delayMs ? ({ ['--carta-atraso' as string]: `${delayMs}ms` } as React.CSSProperties) : undefined

  if (!card && !faceDown) {
    if (!placeholder) return null
    return <span aria-hidden className={cn('carta carta--vaga', className)} style={{ width: s.w, ...style }} />
  }

  if (faceDown || !card) {
    return (
      <span
        role="img"
        aria-label="carta virada"
        className={cn('carta carta--verso', dim && 'carta--apagada', enterClass, className)}
        style={{ width: s.w, ...enterStyle, ...style }}
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
        enterClass,
        className
      )}
      style={{ width: s.w, ...enterStyle, ...style }}
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

/**
 * Carta que chega de costas e VIRA (3D de verdade: duas faces num pai com
 * preserve-3d). É assim que a mesa abre o flop e que as cartas dos outros
 * aparecem no showdown.
 */
export function FlipCard({
  code,
  size = 'md',
  dim,
  highlight,
  delayMs,
  className
}: {
  code: string
  size?: CardSize
  dim?: boolean
  highlight?: boolean
  delayMs?: number
  className?: string
}) {
  const s = SIZE[size]
  return (
    <span className={cn('carta-flip', className)} style={{ width: s.w }}>
      <span
        className="carta-flip-inner"
        style={delayMs ? ({ ['--carta-atraso' as string]: `${delayMs}ms` } as React.CSSProperties) : undefined}
      >
        <PlayingCard faceDown size={size} className="carta-flip-face carta-flip-back" />
        <PlayingCard code={code} size={size} dim={dim} highlight={highlight} className="carta-flip-face" />
      </span>
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
  enter,
  staggerMs = 90,
  staggerFrom = 0,
  baseDelayMs = 0,
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
  /** Nome antigo de `enter="slide"`. */
  animate?: boolean
  /**
   * Como as cartas chegam: `fly` do centro (dadas), `slide` de cima (as
   * suas), `flip` de costas virando (mesa, showdown), `none` paradas.
   */
  enter?: 'fly' | 'slide' | 'flip' | 'none'
  /** Intervalo entre uma carta e a seguinte. */
  staggerMs?: number
  /** A partir deste índice as cartas são NOVAS (só elas animam e escalonam). */
  staggerFrom?: number
  /** Atraso base de todas (o assento N espera os anteriores receberem). */
  baseDelayMs?: number
  /** Quantas vagas desenhar no total (a mesa tem 5). */
  slots?: number
  className?: string
}) {
  const total = slots ?? codes.length
  const hl = highlightCodes ? new Set(highlightCodes) : null
  const mode = enter ?? (animate ? 'slide' : 'none')
  return (
    <span className={cn('inline-flex items-center', overlap ? '-space-x-2' : 'gap-1', className)}>
      {Array.from({ length: total }).map((_, i) => {
        const code = codes[i]
        const fresh = i >= staggerFrom
        const delay = fresh ? baseDelayMs + (i - staggerFrom) * staggerMs : 0
        const rotate = overlap ? { transform: `rotate(${(i - (total - 1) / 2) * 6}deg)` } : undefined
        if (code && mode === 'flip' && fresh && !faceDown) {
          return (
            <FlipCard
              key={`${code}-${i}`}
              code={code}
              size={size}
              dim={dim}
              highlight={!!hl && hl.has(code)}
              delayMs={delay}
            />
          )
        }
        return (
          <PlayingCard
            key={code ? `${code}-${i}` : `vaga-${i}`}
            code={code}
            size={size}
            faceDown={faceDown && !!code}
            placeholder={!code}
            dim={dim}
            highlight={!!code && !!hl && hl.has(code)}
            enter={code && fresh && mode !== 'flip' ? mode : 'none'}
            delayMs={delay}
            style={rotate}
          />
        )
      })}
    </span>
  )
}
