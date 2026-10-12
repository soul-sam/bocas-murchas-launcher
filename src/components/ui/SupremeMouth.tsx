import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Boca Suprema — lábios murchos no gradiente da pessoa (`--fx-c` → `--fx-c2`,
 * rosa sem Cor Suprema). Usada na Moldura Suprema (no lugar da coroa) e no
 * emoji Boca Suprema. `animated` liga o brilho que passa e a "murchada".
 */
export function SupremeMouth({ className, animated = true }: { className?: string; animated?: boolean }) {
  const id = React.useId()
  return (
    <svg viewBox="0 0 32 20" aria-hidden className={cn('supreme-mouth', animated && 'supreme-mouth-anim', className)}>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" x2="1">
          <stop offset="0" stopColor="var(--fx-c, #ff6fd8)" />
          <stop offset="1" stopColor="var(--fx-c2, #ff3d8b)" />
        </linearGradient>
      </defs>
      {/* lábio de cima, com o arco do cupido levemente caído (murcho) */}
      <path d="M2 10 C6 4, 11 3, 16 6.5 C21 3, 26 4, 30 10 C24 9.5, 20 9, 16 10 C12 9, 8 9.5, 2 10 Z" fill={`url(#${id}-g)`} />
      {/* lábio de baixo */}
      <path d="M2 10 C8 11, 12 11.5, 16 11 C20 11.5, 24 11, 30 10 C26 16, 21 18, 16 18 C11 18, 6 16, 2 10 Z" fill={`url(#${id}-g)`} opacity="0.92" />
      {/* brilho */}
      <ellipse className="supreme-mouth-shine" cx="11" cy="14" rx="3" ry="1.2" fill="#fff" opacity="0.55" />
    </svg>
  )
}
