import * as React from 'react'
import { Hash, Megaphone, Lightbulb, Swords } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChat } from '@/lib/chat-context'
import { type Channel, type ChannelFeed } from '@/lib/api'

/**
 * "CAI EM #agenda" — o destino do card, à vista e trocável.
 *
 * O que isso conserta: evento, enquete e party nasciam no canal que a pessoa
 * estava OLHANDO. Marcar um treino com o mural do LoL aberto criava um card de
 * agenda dentro do mural do LoL, e ninguém percebia porque o composer não dizia
 * pra onde a coisa ia.
 *
 * Duas decisões aqui, e as duas importam:
 *
 * 1. O padrão vem do FEED do canal, não do scroll. `feedChannel` prevê o mesmo
 *    canal que a API escolheria — ver o comentário dele em chat-context.
 * 2. O destino aparece escrito, e dá pra trocar. Um padrão que não se vê é um
 *    padrão que ninguém corrige quando está errado; e mandar a agenda pro
 *    mural do LoL de propósito continua sendo legítimo — só não pode ser
 *    acidente.
 */

/**
 * Estado do destino de um card.
 *
 * O valor só é "decidido" depois que os canais carregam, e é por isso que ele
 * nasce null e é preenchido por efeito: escolher antes da lista chegar fixaria
 * um destino errado que a pessoa veria mudar sozinho na cara dela.
 */
export function useCardTarget(feed: ChannelFeed): {
  /** Canal escolhido, ou null enquanto os canais não chegaram. */
  targetId: string | null
  setTargetId: (id: string) => void
  /** Todos os canais de texto, na ordem da barra lateral. */
  options: Channel[]
  /** O que o feed indica — o que fica marcado como padrão na lista. */
  suggested: Channel | null
  /** Volta pro padrão quando o composer reabre. */
  reset: () => void
} {
  const { textChannels, feedChannel } = useChat()
  const suggested = feedChannel(feed)
  const [chosen, setChosen] = React.useState<string | null>(null)

  const targetId =
    chosen && textChannels.some((c) => c.id === chosen) ? chosen : (suggested?.id ?? null)

  const reset = React.useCallback(() => setChosen(null), [])

  return { targetId, setTargetId: setChosen, options: textChannels, suggested, reset }
}

function ChannelIcon({ channel, className }: { channel: Channel; className?: string }) {
  if (channel.type === 'announcements') return <Megaphone className={className} />
  if (channel.type === 'suggestions') return <Lightbulb className={className} />
  if (channel.type === 'lol') return <Swords className={className} />
  return <Hash className={className} />
}

export function CardTargetPicker({
  feed,
  targetId,
  onChange,
  options,
  suggested,
  className
}: {
  feed: ChannelFeed
  targetId: string | null
  onChange: (id: string) => void
  options: Channel[]
  suggested: Channel | null
  className?: string
}) {
  const current = options.find((c) => c.id === targetId) ?? null

  // Servidor sem canal de texto nenhum: não há o que escolher, e inventar um
  // seletor vazio só confundiria. O card simplesmente não nasce.
  if (options.length === 0) return null

  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-[11.5px] text-muted-foreground">Cai em</span>

      <div className="flex items-center gap-2">
        {current && <ChannelIcon channel={current} className="h-3.5 w-3.5 shrink-0 text-acid" />}

        <select
          value={targetId ?? ''}
          onChange={(event) => onChange(event.target.value)}
          className="input-terminal min-w-0 flex-1 rounded-brutal px-2 py-1.5 text-sm"
        >
          {options.map((channel) => (
            <option key={channel.id} value={channel.id}>
              #{channel.name}
              {channel.id === suggested?.id ? ' — padrão' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Só quando a pessoa sai do padrão: o aviso existe pra ela reparar que
          escolheu, não pra repetir o óbvio quando está tudo no lugar. */}
      {current && suggested && current.id !== suggested.id && (
        <span className="mt-1 block text-[11px] text-burn">
          fora do canal de {FEED_WORD[feed]} (#{suggested.name})
        </span>
      )}
    </label>
  )
}

const FEED_WORD: Record<ChannelFeed, string> = {
  agenda: 'agenda',
  enquetes: 'enquetes',
  jogos: 'jogos',
  apostas: 'apostas',
  clipes: 'clipes',
  sistema: 'avisos',
  sugestoes: 'sugestões'
}
