import * as React from 'react'
import { cardLabel, isRedSuit, parseCard, RANK_FACE } from '@/lib/api-poker'
import { cn } from '@/lib/utils'
import { BRAND_MASK_STYLE, SuitGlyph } from './PokerGlyphs'
import './poker.css'

/**
 * UMA CARTA. Desenhada em HTML+SVG, não em imagem: 52 PNGs pesariam no
 * instalador e sairiam borradas em tela 4K; aqui o valor é texto (Inter, o
 * mesmo peso do app) e o naipe é um glifo vetorial.
 *
 * O desenho segue o baralho de verdade: índice no canto de cima à esquerda
 * e, espelhado, no de baixo à direita; naipe grande no meio; as figuras
 * (J, Q, K) ganham uma moldura de "corte" com a letra grande, e o ás um
 * naipe maior com um anel. O verso é o feltro com as listras da marca e um
 * medalhão com a boca.
 *
 * Tamanhos fixos por nome, pra que cartas lado a lado em telas diferentes
 * (mão, mesa, histórico, colinha) sejam SEMPRE da mesma família:
 *   xs  24×34   histórico da mão, chat
 *   sm  42×59   os outros assentos, exemplos compactos
 *   md  64×90   a mesa (flop/turn/river), a colinha
 *   lg  92×129  as suas duas
 *   xl 110×154  as suas duas em tela grande
 *
 * `faceDown` é o verso; `code` vazio com `placeholder` é a vaga na mesa.
 */

export type CardSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export type CardEnter = 'fly' | 'flip' | 'fly-flip' | 'slide' | 'none'

export const CARD_WIDTH: Record<CardSize, number> = { xs: 24, sm: 42, md: 64, lg: 92, xl: 110 }

const SIZE: Record<CardSize, { rank: string; corner: string; pip: string; court: string; courtSuit: string; cornerTop: string }> = {
  xs: { rank: 'text-[11px] leading-none font-bold', corner: 'h-[7px] w-[7px]', pip: 'h-3 w-3', court: 'text-[11px]', courtSuit: 'h-[7px] w-[7px]', cornerTop: '4%' },
  sm: { rank: 'text-[13px] leading-none font-bold', corner: 'h-2.5 w-2.5', pip: 'h-5 w-5', court: 'text-base', courtSuit: 'h-2.5 w-2.5', cornerTop: '5%' },
  md: { rank: 'text-[18px] leading-none font-bold', corner: 'h-3 w-3', pip: 'h-8 w-8', court: 'text-2xl', courtSuit: 'h-3 w-3', cornerTop: '5%' },
  lg: { rank: 'text-[26px] leading-none font-bold', corner: 'h-4 w-4', pip: 'h-12 w-12', court: 'text-4xl', courtSuit: 'h-4 w-4', cornerTop: '5%' },
  xl: { rank: 'text-[30px] leading-none font-bold', corner: 'h-5 w-5', pip: 'h-14 w-14', court: 'text-5xl', courtSuit: 'h-5 w-5', cornerTop: '5%' }
}

interface Motion {
  /** Como chega. */
  enter?: CardEnter
  /** Escalonamento da entrada, em ms (`--carta-atraso`). */
  delayMs?: number
  /** Deslocamento do centro desta carta em relação ao centro do grupo, em px (pra sair do baralho certinho). */
  dx?: number
  dy?: number
  /** Giro de repouso, em graus (o leque). */
  tilt?: number
}

function motionStyle(m: Motion): React.CSSProperties {
  const s: Record<string, string> = {}
  if (m.delayMs) s['--carta-atraso'] = `${m.delayMs}ms`
  if (m.dx) s['--carta-dx'] = `${m.dx}px`
  if (m.dy) s['--carta-dy'] = `${m.dy}px`
  if (m.tilt) s['--carta-giro'] = `${m.tilt}deg`
  return s as React.CSSProperties
}

function motionClass(m: Motion): string | undefined {
  const mode = m.enter ?? 'none'
  return cn(
    (mode === 'fly' || mode === 'slide' || mode === 'fly-flip') && 'carta--voa',
    m.tilt && 'carta--girada carta--leque'
  )
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
  dx,
  dy,
  tilt,
  className,
  style
}: {
  code?: string | null
  size?: CardSize
  faceDown?: boolean
  /** Sem carta: desenha a vaga (lugar do flop ainda por vir). */
  placeholder?: boolean
  /** Apagada: foldou ou perdeu. */
  dim?: boolean
  /** Faz parte da mão vencedora. */
  highlight?: boolean
  /** Nome antigo de `enter="fly"`. */
  animate?: boolean
  /** Como a carta chega: `fly` do baralho; `none` parada. (`flip` e `fly-flip` são da FlipCard.) */
  enter?: CardEnter
  delayMs?: number
  dx?: number
  dy?: number
  tilt?: number
  className?: string
  style?: React.CSSProperties
}) {
  const s = SIZE[size]
  const w = CARD_WIDTH[size]
  const card = code ? parseCard(code) : null
  const motion: Motion = { enter: enter ?? (animate ? 'fly' : 'none'), delayMs, dx, dy, tilt }

  if (!card && !faceDown) {
    if (!placeholder) return null
    return <span aria-hidden className={cn('carta carta--vaga', className)} style={{ width: w, ...style }} />
  }

  if (faceDown || !card) {
    return (
      <span
        role="img"
        aria-label="carta virada"
        className={cn('carta carta--verso', dim && 'carta--apagada', motionClass(motion), className)}
        style={{ width: w, ...motionStyle(motion), ...style }}
      >
        {size !== 'xs' && <span aria-hidden className="carta-verso-marca" style={BRAND_MASK_STYLE} />}
      </span>
    )
  }

  const red = isRedSuit(card.suit)
  const face = RANK_FACE[card.rank]
  const court = card.rank >= 11 && card.rank <= 13
  const ace = card.rank === 14
  const tight = face === '10'

  return (
    <span
      role="img"
      aria-label={cardLabel(code!)}
      className={cn(
        'carta',
        red ? 'carta--vermelha' : 'carta--preta',
        dim && 'carta--apagada',
        highlight && 'carta--vencedora',
        motionClass(motion),
        className
      )}
      style={{ width: w, ...motionStyle(motion), ...style }}
    >
      {/* índice de cima: valor sobre o naipe pequeno */}
      <span
        className={cn('absolute left-[7%] flex flex-col items-center font-sans', s.rank)}
        style={{ top: s.cornerTop, letterSpacing: tight ? '-0.1em' : '-0.02em' }}
      >
        <span>{face}</span>
        {size !== 'xs' && <SuitGlyph suit={card.suit} className={cn('mt-px', s.corner)} />}
      </span>
      {/* índice de baixo, espelhado (só a partir do sm — no xs não cabe) */}
      {size !== 'xs' && (
        <span
          className={cn('absolute bottom-[5%] right-[7%] flex rotate-180 flex-col items-center font-sans', s.rank)}
          style={{ letterSpacing: tight ? '-0.1em' : '-0.02em' }}
          aria-hidden
        >
          <span>{face}</span>
          <SuitGlyph suit={card.suit} className={cn('mt-px', s.corner)} />
        </span>
      )}

      {/* o miolo */}
      {court && size !== 'xs' ? (
        <span className="carta-corte" aria-hidden>
          <span className={cn('font-display leading-none', s.court)}>{face}</span>
          <SuitGlyph suit={card.suit} className={cn('absolute bottom-[6%] right-[8%]', s.courtSuit)} />
        </span>
      ) : (
        <SuitGlyph
          suit={card.suit}
          className={cn(
            'absolute left-1/2 top-[53%] -translate-x-1/2 -translate-y-1/2',
            s.pip,
            ace && size !== 'xs' && 'scale-110 drop-shadow-[0_1px_0_rgb(0_0_0/0.15)]'
          )}
        />
      )}
      {ace && size !== 'xs' && (
        <span
          aria-hidden
          className="absolute left-1/2 top-[53%] block -translate-x-1/2 -translate-y-1/2 rounded-full border border-current opacity-30"
          style={{ width: '58%', aspectRatio: '1' }}
        />
      )}
    </span>
  )
}

/**
 * Carta que chega de costas e VIRA (3D de verdade: duas faces num pai com
 * preserve-3d). É assim que a mesa abre o flop (`fly`: sai do baralho,
 * pousa e vira), que as suas duas aparecem e que as dos outros abrem no
 * showdown (virando no lugar).
 */
export function FlipCard({
  code,
  size = 'md',
  dim,
  highlight,
  delayMs,
  fly,
  dx,
  dy,
  tilt,
  className,
  style
}: {
  code: string
  size?: CardSize
  dim?: boolean
  highlight?: boolean
  delayMs?: number
  /** Sai do baralho antes de virar. */
  fly?: boolean
  dx?: number
  dy?: number
  tilt?: number
  className?: string
  style?: React.CSSProperties
}) {
  const w = CARD_WIDTH[size]
  const motion: Motion = { enter: fly ? 'fly' : 'none', delayMs, dx, dy, tilt }
  return (
    <span
      className={cn('carta-flip', fly && 'carta-flip--chega', motionClass(motion), className)}
      style={{ width: w, ...motionStyle(motion), ...style }}
    >
      <span className="carta-flip-inner">
        <PlayingCard faceDown size={size} className="carta-flip-face carta-flip-back" />
        <PlayingCard code={code} size={size} dim={dim} highlight={highlight} className="carta-flip-face" />
      </span>
    </span>
  )
}

/**
 * Fileira de cartas. `fan` abre em leque (as duas de um assento); sem ele é
 * uma fila com `gap`. Publica em cada carta o deslocamento dela em relação
 * ao centro da fileira, pra que a animação de sair do baralho acerte.
 */
export function CardRow({
  codes,
  size = 'md',
  faceDown,
  dim,
  highlightCodes,
  overlap,
  fan,
  spread,
  animate,
  enter,
  staggerMs = 90,
  staggerFrom = 0,
  baseDelayMs = 0,
  slots,
  gap = 6,
  className
}: {
  codes: string[]
  size?: CardSize
  faceDown?: boolean
  dim?: boolean
  /** Cartas que fazem parte da melhor mão. */
  highlightCodes?: string[] | null
  /** Nome antigo de `fan`. */
  overlap?: boolean
  /** Em leque: sobrepostas e giradas. */
  fan?: boolean
  /** Leque mais aberto (as suas duas: dá pra ler as duas inteiras). */
  spread?: boolean
  /** Nome antigo de `enter="fly"`. */
  animate?: boolean
  /**
   * Como as cartas chegam: `fly` do baralho (dadas, viradas pra baixo ou não),
   * `flip` virando no lugar (showdown), `fly-flip` do baralho e virando ao
   * pousar (a mesa, as suas), `none` paradas.
   */
  enter?: CardEnter
  /** Intervalo entre uma carta e a seguinte. */
  staggerMs?: number
  /** A partir deste índice as cartas são NOVAS (só elas animam e escalonam). */
  staggerFrom?: number
  /** Atraso base de todas (o assento N espera os anteriores receberem). */
  baseDelayMs?: number
  /** Quantas vagas desenhar no total (a mesa tem 5). */
  slots?: number
  /** Espaço entre cartas na fila, em px. */
  gap?: number
  className?: string
}) {
  const total = slots ?? codes.length
  const hl = highlightCodes ? new Set(highlightCodes) : null
  const mode: CardEnter = enter ?? (animate ? 'fly' : 'none')
  const leque = fan || overlap
  const w = CARD_WIDTH[size]
  // No leque a segunda carta cobre ~38% da primeira (~25% no aberto).
  const stride = leque ? Math.round(w * (spread ? 0.76 : 0.62)) : w + gap
  const tiltStep = leque ? (size === 'xs' ? 8 : size === 'sm' ? 9 : 7) : 0

  return (
    <span
      className={cn('relative inline-flex items-end', className)}
      style={{ gap: leque ? 0 : gap, ...(leque ? { paddingTop: 6 } : null) }}
    >
      {Array.from({ length: total }).map((_, i) => {
        const code = codes[i]
        const fresh = i >= staggerFrom
        const delay = fresh ? baseDelayMs + (i - staggerFrom) * staggerMs : 0
        const dx = Math.round((i - (total - 1) / 2) * stride)
        const tilt = leque ? (i - (total - 1) / 2) * tiltStep : 0
        const style: React.CSSProperties | undefined = leque && i > 0 ? { marginLeft: -(w - stride) } : undefined

        if (code && (mode === 'flip' || mode === 'fly-flip') && fresh && !faceDown) {
          return (
            <FlipCard
              key={`${code}-${i}`}
              code={code}
              size={size}
              dim={dim}
              highlight={!!hl && hl.has(code)}
              delayMs={delay}
              fly={mode === 'fly-flip'}
              dx={dx}
              tilt={tilt}
              style={style}
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
            enter={code && fresh && (mode === 'fly' || mode === 'slide') ? 'fly' : 'none'}
            delayMs={delay}
            dx={dx}
            tilt={tilt}
            style={style}
          />
        )
      })}
    </span>
  )
}
