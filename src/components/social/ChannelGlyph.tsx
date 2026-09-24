import { Hash, Megaphone, Lightbulb, Swords, Volume2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Channel, ChannelType } from '@/lib/api'
import { ChannelIconArt, channelIconDef } from '@/lib/channel-icons'

/**
 * O ícone de um canal, em todo lugar que o canal aparece: barra lateral,
 * cabeçalho do chat, Ctrl+K, seletor de destino dos cards e o gerenciador.
 *
 * Com ícone escolhido no catálogo (lib/channel-icons), é ele; sem, o símbolo
 * do TIPO — que ainda é o que separa um mural de avisos de um chat comum.
 * Sempre traço e sempre `currentColor`: a linha ativa acende o ícone junto.
 */

const TYPE_ICON: Record<ChannelType, LucideIcon> = {
  text: Hash,
  voice: Volume2,
  announcements: Megaphone,
  suggestions: Lightbulb,
  lol: Swords,
  dm: Hash
}

type Size = 'sm' | 'md' | 'lg'

const BOX: Record<Size, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-6 w-6'
}

export function ChannelGlyph({
  channel,
  size = 'sm',
  className
}: {
  channel: Pick<Channel, 'type' | 'icon'>
  /** sm = linha de lista (14px); md = cabeçalho (16px); lg = destaque (24px). */
  size?: Size
  className?: string
}) {
  const def = channelIconDef(channel.icon)
  const classes = cn('shrink-0', BOX[size], className)

  if (def) return <ChannelIconArt def={def} className={classes} />

  const Icon = TYPE_ICON[channel.type]
  return <Icon aria-hidden className={classes} />
}
