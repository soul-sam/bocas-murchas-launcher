import { Hash, Megaphone, Lightbulb, Swords, Volume2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Channel, ChannelType } from '@/lib/api'
import { CustomEmojiImg } from './CustomEmojiImg'

/**
 * O ícone de um canal, em todo lugar que o canal aparece: barra lateral,
 * cabeçalho do chat, Ctrl+K, seletor de destino dos cards e o gerenciador.
 *
 * A API sempre teve `Channel.icon` (o seed grava 💬, ⚔️, 📅…) e o launcher
 * nunca desenhou: oito canais de texto eram oito `#` iguais, e a barra virava
 * uma coluna de nomes que só se distinguia lendo. Com ícone escolhido, é ele;
 * sem, o glifo do TIPO — que ainda é o que separa um mural de avisos de um
 * chat comum.
 *
 * Emoji do servidor viaja como `:nome:` (o mesmo formato do texto e das
 * reações), e o CustomEmojiImg resolve pelo catálogo. Nome que não existe
 * mais volta como texto literal, igual no chat.
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

/** Caixa fixa por tamanho: emoji e ícone de linha ocupam o MESMO espaço. */
const BOX: Record<Size, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-7 w-7'
}

/** Emoji nasce um pouco menor que a caixa: senão vaza pra fora dela. */
const EMOJI_TEXT: Record<Size, string> = {
  sm: 'text-[13px]',
  md: 'text-[15px]',
  lg: 'text-2xl'
}

const CUSTOM_RE = /^:([\w-]+):$/

export function ChannelGlyph({
  channel,
  size = 'sm',
  className
}: {
  channel: Pick<Channel, 'type' | 'icon'>
  /** sm = linha de lista (14px); md = cabeçalho (16px); lg = destaque (28px). */
  size?: Size
  /** Cor e ajustes — o tamanho vem de `size`. Emoji ignora cor. */
  className?: string
}) {
  const icon = channel.icon?.trim()

  if (icon) {
    const custom = CUSTOM_RE.exec(icon)
    return (
      <span
        aria-hidden
        className={cn(
          'inline-flex shrink-0 select-none items-center justify-center leading-none',
          BOX[size],
          EMOJI_TEXT[size],
          className
        )}
      >
        {custom ? (
          <CustomEmojiImg name={custom[1]} className={cn('h-full w-full', BOX[size])} />
        ) : (
          icon
        )}
      </span>
    )
  }

  const Icon = TYPE_ICON[channel.type]
  return <Icon aria-hidden className={cn('shrink-0', BOX[size], className)} />
}
