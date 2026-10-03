import * as React from 'react'
import type { Suit } from '@/lib/api-poker'
import { cn } from '@/lib/utils'

/**
 * GLIFOS DO PÔQUER — naipes e o ícone da barra, em traço/forma, nunca emoji
 * (o ♠ do sistema sai de uma fonte diferente em cada máquina e some no tema
 * claro). Tudo em `currentColor`, pra cor vir de fora: vermelho e preto na
 * carta, a cor do texto em qualquer outro lugar.
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

export function SuitGlyph({ suit, className }: { suit: Suit; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('inline-block shrink-0 fill-current', className)}>
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
        'poker-dealer inline-flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] font-bold leading-none',
        className
      )}
    >
      D
    </span>
  )
}

/** Fichinha com cor por ordem de grandeza — a aposta em frente ao assento. */
export function BetChip({ amount, bigBlind, className }: { amount: number; bigBlind: number; className?: string }) {
  const bb = amount / Math.max(1, bigBlind)
  const color =
    bb >= 50
      ? 'hsl(var(--destructive))'
      : bb >= 20
        ? 'hsl(var(--burn))'
        : bb >= 5
          ? 'hsl(var(--acid))'
          : 'hsl(var(--muted-foreground))'
  return (
    <span
      aria-hidden
      className={cn('poker-ficha-redonda poker-ficha-redonda--aposta inline-block h-4 w-4', className)}
      style={{ ['--ficha-cor' as string]: color }}
    />
  )
}
