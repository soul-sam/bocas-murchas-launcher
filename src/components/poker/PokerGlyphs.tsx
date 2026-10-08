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
 * A boca da marca como máscara (feltro, verso da carta): mora em
 * lib/brand-mask.ts porque o xadrez usa a mesma; fica reexportada aqui.
 */
export { BRAND_MASK_STYLE } from '@/lib/brand-mask'

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

// ---------------------------------------------------------------------------
// Fichas de verdade: denominações da mesa (lib/poker-chips) em pilhas vistas
// de lado, como ficam no feltro.
// ---------------------------------------------------------------------------

/**
 * A paleta de cassino, da menor ficha da mesa pra maior: branca, vermelha,
 * verde, preta, roxa e (se um dia houver sexta) dourada. É conteúdo, como a
 * carta: a ficha verde é verde em qualquer tema, senão ninguém conta pilha.
 */
const CHIP_TONES: ReadonlyArray<{ face: string; band: string; spot: string; ink: string }> = [
  { face: '#ece7da', band: '#c9c2af', spot: '#2c5aa8', ink: '#1d3b70' },
  { face: '#c73441', band: '#962330', spot: '#f4efe3', ink: '#fff7ea' },
  { face: '#2f8c55', band: '#206640', spot: '#f4efe3', ink: '#fff7ea' },
  { face: '#2a2a31', band: '#18181d', spot: '#e3c46c', ink: '#f4e2a6' },
  { face: '#6d42a6', band: '#4f2e7d', spot: '#f4efe3', ink: '#fff7ea' },
  { face: '#d89a2a', band: '#a8731a', spot: '#2a2a31', ink: '#2a1a05' }
]

export function chipTone(tone: number): (typeof CHIP_TONES)[number] {
  return CHIP_TONES[Math.max(0, Math.min(CHIP_TONES.length - 1, tone))]
}

/** Geometria de uma ficha de lado, em unidades do viewBox (diâmetro 32). */
const CHIP_D = 32
const CHIP_RY = 10.5
const CHIP_T = 4.2

interface PileStack {
  tone: number
  count: number
  /** Canto de cima à esquerda do miolo da pilha (o topo da ficha de BAIXO), em unidades. */
  x: number
  baseY: number
}

/**
 * Pilhas vistas de lado num SVG só: cada ficha é uma faixa (a borda, com as
 * riscas) e só a de cima mostra a face. `layout="row"` põe as pilhas lado a
 * lado (aposta na frente de alguém); `cluster` em duas fileiras, a de trás
 * mais alta, como um pote arrumado pelo crupiê. Pilha alta demais vira duas.
 */
export function ChipPile({
  stacks,
  size = 22,
  layout = 'row',
  maxPerStack = 8,
  maxStacks = 6,
  className,
  style
}: {
  stacks: ReadonlyArray<{ denom: { tone: number }; count: number }>
  /** Largura de UMA ficha, em px. */
  size?: number
  layout?: 'row' | 'cluster'
  maxPerStack?: number
  maxStacks?: number
  className?: string
  style?: React.CSSProperties
}) {
  // Quebra pilhas altas em várias da mesma ficha (como o crupiê faz).
  const columns: Array<{ tone: number; count: number }> = []
  for (const s of stacks) {
    let left = s.count
    while (left > 0 && columns.length < maxStacks) {
      const take = Math.min(left, maxPerStack)
      columns.push({ tone: s.denom.tone, count: take })
      left -= take
    }
  }
  if (columns.length === 0) return null

  const gap = CHIP_D * 0.86
  const placed: PileStack[] = []
  if (layout === 'cluster' && columns.length > 2) {
    // Duas fileiras: a de trás (maiores) e a da frente, deslocada meio passo.
    const back = columns.slice(0, Math.ceil(columns.length / 2))
    const front = columns.slice(back.length)
    back.forEach((c, i) => placed.push({ ...c, x: i * gap, baseY: 0 }))
    front.forEach((c, i) => placed.push({ ...c, x: i * gap + gap / 2, baseY: CHIP_RY * 1.15 }))
  } else {
    // Em fila, com um leve sobe-e-desce pra não parecer carimbo.
    columns.forEach((c, i) => placed.push({ ...c, x: i * gap, baseY: i % 2 === 1 ? CHIP_RY * 0.35 : 0 }))
  }

  const tallest = Math.max(...placed.map((p) => p.count))
  const top = CHIP_RY + (tallest - 1) * CHIP_T
  const minX = Math.min(...placed.map((p) => p.x))
  const maxX = Math.max(...placed.map((p) => p.x)) + CHIP_D
  const maxBase = Math.max(...placed.map((p) => p.baseY))
  const vbW = maxX - minX
  const vbH = top + maxBase + CHIP_RY + CHIP_T + 1
  const scale = size / CHIP_D

  return (
    <svg
      aria-hidden
      viewBox={`${minX} 0 ${vbW} ${vbH}`}
      width={vbW * scale}
      height={vbH * scale}
      className={cn('inline-block shrink-0 overflow-visible', className)}
      style={style}
    >
      {/* De trás pra frente: quem tem baseY menor é desenhado antes. */}
      {[...placed]
        .sort((a, b) => a.baseY - b.baseY)
        .map((p, si) => (
          <g key={si} transform={`translate(${p.x} ${top + p.baseY})`}>
            {/* sombra no feltro */}
            <ellipse cx={CHIP_D / 2} cy={CHIP_T + 2} rx={CHIP_D / 2 + 1.5} ry={CHIP_RY + 1} fill="rgb(0 0 0 / 0.35)" />
            {Array.from({ length: p.count }, (_, k) => (
              <SideChip key={k} tone={p.tone} y={-k * CHIP_T} face={k === p.count - 1} twist={(k * 7 + si * 3) % 10} />
            ))}
          </g>
        ))}
    </svg>
  )
}

/** Uma ficha de lado com o topo em `y` (centro da elipse de cima). */
function SideChip({ tone, y, face, twist }: { tone: number; y: number; face: boolean; twist: number }) {
  const c = chipTone(tone)
  const r = CHIP_D / 2
  const band = `M0 ${y} L0 ${y + CHIP_T} A${r} ${CHIP_RY} 0 0 0 ${CHIP_D} ${y + CHIP_T} L${CHIP_D} ${y} A${r} ${CHIP_RY} 0 0 1 0 ${y} Z`
  // As riscas da borda: três aparecem na frente, deslocadas um pouco por
  // ficha (`twist`) pra pilha não parecer um código de barras.
  const spots = [4, 13.7, 23.4].map((x) => x + (twist - 5) * 0.35)
  // A frente da borda acompanha a metade de baixo da elipse: no meio ela
  // desce `ry` inteiro; nas pontas, quase nada.
  const frontY = (xc: number): number => y + CHIP_RY * Math.sqrt(Math.max(0, 1 - ((xc - r) / r) ** 2))
  return (
    <g>
      <path d={band} fill={c.band} stroke="rgb(0 0 0 / 0.45)" strokeWidth={0.6} />
      {spots.map((x, i) => (
        <rect key={i} x={x} y={frontY(x + 2.3) + 0.4} width={4.6} height={CHIP_T - 0.8} fill={c.spot} opacity={0.92} rx={0.6} />
      ))}
      {face && (
        <>
          <ellipse cx={r} cy={y} rx={r} ry={CHIP_RY} fill={c.face} stroke="rgb(0 0 0 / 0.35)" strokeWidth={0.6} />
          {/* as seis riscas da borda, na face */}
          <ellipse
            cx={r}
            cy={y}
            rx={r - 2.4}
            ry={CHIP_RY - 1.7}
            fill="none"
            stroke={c.spot}
            strokeWidth={3}
            pathLength={60}
            strokeDasharray="4.4 5.6"
            strokeDashoffset={twist}
            opacity={0.95}
          />
          <ellipse cx={r} cy={y} rx={r - 7} ry={CHIP_RY - 4.4} fill="rgb(0 0 0 / 0.12)" stroke={c.spot} strokeWidth={0.7} opacity={0.9} />
          {/* brilho de cima */}
          <ellipse cx={r - 3} cy={y - 2.4} rx={r - 9} ry={2} fill="rgb(255 255 255 / 0.18)" />
        </>
      )}
    </g>
  )
}

/**
 * Uma ficha vista DE CIMA com o valor no miolo — a do "escolher fichas" da
 * barra de ação. Mesma paleta das pilhas.
 */
export function ChipFace({
  tone,
  label,
  size = 40,
  className
}: {
  tone: number
  label: string
  size?: number
  className?: string
}) {
  const c = chipTone(tone)
  const long = label.length >= 4
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden className={cn('inline-block shrink-0', className)}>
      <circle cx="20" cy="21" r="19" fill="rgb(0 0 0 / 0.35)" />
      <circle cx="20" cy="20" r="19" fill={c.face} stroke="rgb(0 0 0 / 0.45)" strokeWidth="0.8" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <rect key={a} x="17.4" y="1.3" width="5.2" height="5" rx="1" fill={c.spot} transform={`rotate(${a} 20 20)`} />
      ))}
      <circle cx="20" cy="20" r="13" fill="none" stroke={c.spot} strokeWidth="1.2" strokeDasharray="2.2 2" opacity="0.9" />
      <circle cx="20" cy="20" r="11" fill="rgb(0 0 0 / 0.14)" />
      <text
        x="20"
        y="20"
        textAnchor="middle"
        dominantBaseline="central"
        fill={c.ink}
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight={800}
        fontSize={long ? 7.6 : 9.6}
        letterSpacing="-0.02em"
      >
        {label}
      </text>
    </svg>
  )
}
