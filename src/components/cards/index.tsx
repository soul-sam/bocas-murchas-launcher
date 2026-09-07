import * as React from 'react'
import { isCardMessage, parseMetadata, type ChatMessage } from '@/lib/api'
import { PollCard } from './PollCard'
import { EventCard } from './EventCard'
import { GameResultCard } from './GameResultCard'
import { RecapCard } from './RecapCard'
import { PartyCard } from './PartyCard'
import { WagerCard } from './WagerCard'
import { WatchCard } from './WatchCard'
import { SystemCard } from './SystemCard'
import { ChessResultCard } from './ChessResultCard'

/**
 * REGISTRO DE CARTÕES.
 *
 * Uma mensagem com `type` de cartão (poll, event, game, recap, party, wager,
 * watch, system, chess) é desenhada por um componente em vez do texto. O texto
 * (`content`) continua existindo como fallback: aparece na busca, na
 * notificação do sistema e em cliente antigo que não conhece o tipo.
 *
 * Cada cartão recebe a mensagem inteira e o `metadata` já parseado. Quem
 * precisa de dado fresco (votos, RSVP) escuta o socket por conta própria —
 * o servidor manda `messageUpdated` com o metadata novo quando algo muda, e
 * o chat-context já substitui a mensagem na lista.
 */

export interface CardProps<T = Record<string, unknown>> {
  message: ChatMessage
  metadata: T
  /** Modo compacto do chat (uma linha por mensagem). */
  compact?: boolean
}

type CardComponent = React.ComponentType<CardProps<any>>

const REGISTRY: Record<string, CardComponent> = {
  poll: PollCard,
  event: EventCard,
  game: GameResultCard,
  recap: RecapCard,
  party: PartyCard,
  wager: WagerCard,
  watch: WatchCard,
  system: SystemCard,
  chess: ChessResultCard
}

export function hasCard(message: ChatMessage): boolean {
  return isCardMessage(message) && message.type in REGISTRY
}

export function MessageCard({ message, compact }: { message: ChatMessage; compact?: boolean }) {
  const Component = REGISTRY[message.type]
  const metadata = React.useMemo(() => parseMetadata(message.metadata) ?? {}, [message.metadata])
  if (!Component) return null
  return (
    <div className="mt-1 max-w-xl">
      <Component message={message} metadata={metadata} compact={compact} />
    </div>
  )
}

/** Moldura padrão dos cartões, pra todos parecerem da mesma família. */
export function CardFrame({
  accent = 'acid',
  title,
  icon,
  children,
  footer
}: {
  accent?: 'acid' | 'burn' | 'destructive' | 'muted'
  title?: React.ReactNode
  icon?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const border =
    accent === 'burn'
      ? 'border-burn/50'
      : accent === 'destructive'
        ? 'border-destructive/50'
        : accent === 'muted'
          ? 'border-[#2a2a2a]'
          : 'border-acid-dark'

  return (
    <div className={`overflow-hidden rounded-brutal border-2 ${border} bg-void-light/40`}>
      {(title || icon) && (
        <div className="flex items-center gap-2 border-b border-[#1a1a1a] px-3 py-1.5">
          {icon && <span className="shrink-0 text-acid">{icon}</span>}
          {title && (
            <span className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {title}
            </span>
          )}
        </div>
      )}
      <div className="px-3 py-2">{children}</div>
      {footer && (
        <div className="border-t border-[#1a1a1a] px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  )
}
