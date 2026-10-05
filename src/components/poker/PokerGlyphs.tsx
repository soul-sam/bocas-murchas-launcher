import * as React from 'react'
import type { Suit } from '@/lib/api-poker'
import { cn } from '@/lib/utils'

/**
 * GLIFOS DO PÔQUER — naipes, fichas, o botão do dealer e o ícone da barra,
 * em traço/forma, nunca emoji (o ♠ do sistema sai de uma fonte diferente em
 * cada máquina e some no tema claro). Tudo em `currentColor` ou em cor
 * passada por fora: vermelho e preto na carta, tokens do tema no resto.
 */

const SUIT_PATH: Record<Suit, string> = {
  // Espadas: a folha invertida com pé.
  s: 'M12 2.5C9.4 7 4.5 9.6 4.5 13.6a3.9 3.9 0 0 0 6.6 2.8c-.2 1.8-1 3.2-2.3 4.1h6.4c-1.3-.9-2.1-2.3-2.3-4.1a3.9 3.9 0 0 0 6.6-2.8c0-4-4.9-6.6-7.5-11.1Z',
  // Copas.
  h: 'M12 21.2S3.5 15.6 3.5 9.6A4.6 4.6 0 0 1 12 6.9a4.6 4.6 0 0 1 8.5 2.7c0 6-8.5 11.6-8.5 11.6Z',
  // Ouros.
  d: 'M12 2.2 20.2 12 12 21.8 3.8 12Z',
  // Paus: três folhas e o pé.
  c: 'M12 2.3a3.7 3.7 0 0 0-3.2 5.6 3.7 3.7 0 1 0 2 7.2c-.1 2-1 3.6-2.4 4.6h7.2c-1.4-1-2.3-2.6-2.4-4.6a3.7 3.7 0 1 0 2-7.2A3.7 3.7 0 0 0 12 2.3Z'
}

/**
 * A boca da marca como MÁSCARA (feltro, verso da carta). Inline, e não na
 * folha: `url()` de arquivo do public/ dentro de um .css o Vite reescreve
 * pra /assets/ sem copiar o arquivo — a máscara falha e o elemento some.
 * Caminho relativo, como todo `<img src="bocas-murchas-transp.png">` do app:
 * vale no site e no file:// do Electron.
 */
export const BRAND_MASK_STYLE: React.CSSProperties = {
  WebkitMaskImage: 'url(bocas-murchas-transp.png)',
  maskImage: 'url(bocas-murchas-transp.png)'
}

export function SuitGlyph({ suit, className, style }: { suit: Suit; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('inline-block shrink-0 fill-current', className)} style={style}>
      <path d={SUIT_PATH[suit]} />
    </svg>
  )
}

/**
 * Ícone da Arena: duas cartas em leque, no mesmo traço 2 em viewBox 24 dos
 * ícones da casa (lib/bocas-icons). Aceita `className`, `strokeWidth` e os
 * aria-* do IconComponent.
 */
export const PokerIcon = React.forwardRef<
  SVGSVGElement,
  React.SVGProps<SVGSVGElement> & { strokeWidth?: number | string }
>(function PokerIcon({ className, strokeWidth = 2, ...props }, ref) {
  const labelled = Boolean(props['aria-label'] || props['aria-labelledby'])
  return (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden={labelled ? undefined : true}
      role={labelled ? 'img' : undefined}
      className={cn('inline-block shrink-0 align-middle', className)}
      {...props}
    >
      {/* carta de trás, inclinada */}
      <path d="M8.6 4.2 15.3 2.6a1 1 0 0 1 1.2.8l2.7 11.9" />
      {/* carta da frente */}
      <rect x="4" y="6" width="10" height="14" rx="1.5" />
      {/* o pique (espadas) no meio da carta da frente */}
      <path d="M9 9.5c-1.3 2-2.6 3-2.6 4.6a1.6 1.6 0 0 0 2.6 1.2M9 9.5c1.3 2 2.6 3 2.6 4.6A1.6 1.6 0 0 1 9 15.3M9 15.3v1.7" />
    </svg>
  )
})

/** Botão do dealer ("D"), branco como em qualquer mesa. */
export function DealerChip({ className }: { className?: string }) {
  return (
    <span
      aria-label="Botão do dealer"
      title="Dealer (botão)"
      className={cn(
        'poker-dealer inline-flex h-[22px] w-[22px] items-center justify-center rounded-full font-sans text-[12px] font-black leading-none',
        className
      )}
    >
      D
    </span>
  )
}

// ---------------------------------------------------------------------------
// Fichas
// ---------------------------------------------------------------------------

/**
 * A cor da ficha diz a ordem de grandeza em BLINDS, como numa mesa de
 * verdade (branca, verde, dourada, vermelha, preta). Tokens do tema onde dá;
 * a "preta" é fixa porque não existe token pra ela e é conteúdo, como a
 * carta.
 */
export function chipColor(amount: number, bigBlind: number): string {
  const bb = amount / Math.max(1, bigBlind)
  if (bb >= 50) return 'hsl(222 28% 30%)'
  if (bb >= 20) return 'hsl(var(--destructive))'
  if (bb >= 5) return 'hsl(var(--burn))'
  if (bb >= 2) return 'hsl(var(--acid-text))'
  return 'hsl(var(--muted-foreground))'
}

/** Uma ficha vista de cima: borda com seis riscas marfim e um miolo. */
export function Chip({ color, size = 18, className, style }: { color: string; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden
      className={cn('inline-block shrink-0', className)}
      style={style}
    >
      <circle cx="16" cy="16" r="15" fill={color} />
      <circle cx="16" cy="16" r="15" fill="none" stroke="rgb(0 0 0 / 0.4)" strokeWidth="1" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <rect key={a} x="13.4" y="1.4" width="5.2" height="4.6" rx="1" fill="#f7f3ea" transform={`rotate(${a} 16 16)`} />
      ))}
      <circle cx="16" cy="16" r="9.8" fill="none" stroke="#f7f3ea" strokeWidth="1.3" opacity="0.9" />
      <circle cx="16" cy="16" r="8.2" fill="rgb(0 0 0 / 0.2)" />
      <circle cx="16" cy="16" r="5" fill="none" stroke="#f7f3ea" strokeWidth="0.8" opacity="0.5" />
    </svg>
  )
}

/**
 * Pilha de fichas pro valor: quantas, e de que cores, cresce com o tamanho
 * da aposta — uma aposta de 50 é uma ficha; uma de 2.000 é uma pilha de
 * cinco com a de cima mais escura. A pilha é vista meio de lado (cada ficha
 * 3px acima da anterior), que é como se vê uma pilha na mesa.
 */
export function ChipStack({
  amount,
  bigBlind,
  size = 18,
  className
}: {
  amount: number
  bigBlind: number
  size?: number
  className?: string
}) {
  const bb = amount / Math.max(1, bigBlind)
  const count = Math.max(1, Math.min(5, 1 + Math.floor(Math.log2(Math.max(1, bb)))))
  const lift = Math.max(2, Math.round(size * 0.17))
  // De baixo pra cima a pilha vai subindo de valor: as de baixo são a
  // denominação menor que cabe, a de cima é a do total.
  const colors: string[] = []
  for (let i = 0; i < count; i++) {
    const share = amount * ((i + 1) / count)
    colors.push(chipColor(share, bigBlind))
  }
  return (
    <span
      aria-hidden
      className={cn('relative inline-block shrink-0', className)}
      style={{ width: size, height: size + lift * (count - 1) }}
    >
      {colors.map((c, i) => (
        <Chip
          key={i}
          color={c}
          size={size}
          className="absolute left-0"
          style={{ bottom: i * lift, filter: i === count - 1 ? undefined : 'brightness(0.85)' }}
        />
      ))}
    </span>
  )
}

/** Fichinha com cor por ordem de grandeza (compatibilidade). */
export function BetChip({ amount, bigBlind, className }: { amount: number; bigBlind: number; className?: string }) {
  return <Chip color={chipColor(amount, bigBlind)} size={16} className={className} />
}
