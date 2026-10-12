import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Boca Suprema — lábios murchos no gradiente da pessoa (`--fx-c` → `--fx-c2`,
 * rosa sem Cor Suprema). Usada na Moldura Suprema (embaixo da foto) e no
 * emoji Boca Suprema. `animated` liga o brilho que passa e a "murchada";
 * `kiss` (só o emoji) faz biquinho e solta um coração.
 */
export function SupremeMouth({
  className,
  animated = true,
  kiss = false
}: {
  className?: string
  animated?: boolean
  kiss?: boolean
}) {
  const id = React.useId()
  return (
    <svg
      viewBox="0 0 32 20"
      overflow="visible"
      aria-hidden
      className={cn('supreme-mouth', animated && (kiss ? 'supreme-mouth-kiss' : 'supreme-mouth-anim'), className)}
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="0" x2="1">
          <stop offset="0" stopColor="var(--fx-c, #ff6fd8)" />
          <stop offset="1" stopColor="var(--fx-c2, #ff3d8b)" />
        </linearGradient>
      </defs>
      <g className="supreme-mouth-lips">
        {/* lábio de cima, com o arco do cupido levemente caído (murcho) */}
        <path d="M2 10 C6 4, 11 3, 16 6.5 C21 3, 26 4, 30 10 C24 9.5, 20 9, 16 10 C12 9, 8 9.5, 2 10 Z" fill={`url(#${id}-g)`} />
        {/* lábio de baixo */}
        <path d="M2 10 C8 11, 12 11.5, 16 11 C20 11.5, 24 11, 30 10 C26 16, 21 18, 16 18 C11 18, 6 16, 2 10 Z" fill={`url(#${id}-g)`} opacity="0.92" />
        {/* brilho */}
        <ellipse className="supreme-mouth-shine" cx="11" cy="14" rx="3" ry="1.2" fill="#fff" opacity="0.55" />
      </g>
      {kiss && animated && (
        <path
          className="supreme-mouth-heart"
          d="M24 8 C24 6.2, 26.4 5.6, 27.2 7.2 C28 5.6, 30.4 6.2, 30.4 8 C30.4 9.8, 27.2 11.6, 27.2 11.6 C27.2 11.6, 24 9.8, 24 8 Z"
          fill="var(--fx-c2, #ff3d8b)"
        />
      )}
    </svg>
  )
}

/**
 * Fone da Moldura Suprema: arco por cima da foto e uma concha em cada
 * "orelha". O arco estica com a caixa (serve pra foto redonda e pra webcam);
 * as conchas são medidas pela ALTURA, então não achatam no retângulo.
 */
export function SupremeHeadphones() {
  const id = React.useId()
  return (
    <>
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden className="frame-supreme-band">
        <defs>
          <linearGradient id={`${id}-b`} x1="0" x2="1">
            <stop offset="0" stopColor="var(--fx-c, #ff6fd8)" />
            <stop offset="1" stopColor="var(--fx-c2, #ff3d8b)" />
          </linearGradient>
        </defs>
        {/* contorno por baixo, faixa colorida por cima */}
        <path d="M3 60 C3 0, 97 0, 97 60" fill="none" stroke="var(--supreme-outline)" strokeWidth="6.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        <path d="M3 60 C3 0, 97 0, 97 60" fill="none" stroke={`url(#${id}-b)`} strokeWidth="3.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      </svg>
      <span aria-hidden className="frame-supreme-cup frame-supreme-cup-l" />
      <span aria-hidden className="frame-supreme-cup frame-supreme-cup-r" />
    </>
  )
}
