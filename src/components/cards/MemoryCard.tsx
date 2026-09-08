import { History } from 'lucide-react'
import type { CardProps } from './index'
import { CardFrame } from './index'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { formatDayKey, formatMinutes, type MemoryCardMetadata, type MemoryMessage } from '@/lib/api-retro'
import { useChat } from '@/lib/chat-context'
import { useLayout } from '@/lib/layout-context'
import { useMembers } from '@/lib/members-context'
import { useOverlays } from '@/lib/overlay-context'
import { cn } from '@/lib/utils'

/**
 * CARTÃO "NAQUELE DIA".
 *
 * A mensagem antiga é reproduzida INTEIRA, com avatar e nome — não resumida
 * nem parafraseada. O valor de uma lembrança está na forma original: "o Fulano
 * escreveu isso" é a piada; "uma mensagem com 7 reações" não é nada.
 *
 * Clicar leva pro canal onde aquilo foi dito. A conversa em volta é metade da
 * lembrança, e ela continua lá no histórico.
 */
export function MemoryCard({ message, metadata }: CardProps<MemoryCardMetadata>) {
  const { byId } = useMembers()
  const { setActiveChannel } = useChat()
  const { setView } = useLayout()
  const { openLightbox } = useOverlays()

  const top = Array.isArray(metadata.top) ? metadata.top : []
  const people = Array.isArray(metadata.people) ? metadata.people : []

  if (top.length === 0 && !metadata.messages) {
    return <p className="text-sm text-foreground">{message.content}</p>
  }

  const go = (channelId: string | null): void => {
    if (!channelId) return
    setActiveChannel(channelId)
    setView('chat')
  }

  return (
    <CardFrame
      accent="muted"
      icon={<History className="h-3.5 w-3.5" />}
      title={
        <span>
          <span className="text-foreground">{metadata.label}</span> ·{' '}
          {formatDayKey(metadata.dayKey)}
        </span>
      }
      footer={
        <div className="flex items-center gap-1.5 normal-case">
          <span className="shrink-0">
            {metadata.messages} mensagens
            {metadata.voiceMinutes > 0 && ` · ${formatMinutes(metadata.voiceMinutes)} de call`}
            {metadata.games > 0 && ` · ${metadata.games} partidas`}
          </span>
          {people.length > 0 && (
            <span className="ml-auto flex shrink-0 items-center gap-1">
              {people.slice(0, 8).map((p) => (
                <UserAvatar
                  userId={p.id}
                  key={p.id}
                  src={resolveAssetUrl(byId[p.id]?.avatar ?? p.avatar)}
                  name={byId[p.id]?.displayName ?? p.displayName}
                  className="h-5 w-5"
                />
              ))}
            </span>
          )}
        </div>
      }
    >
      <div className="space-y-2">
        {top.map((old) => (
          <OldMessage key={old.id} entry={old} onOpenImage={openLightbox} onGo={go} />
        ))}
      </div>
    </CardFrame>
  )
}

function OldMessage({
  entry,
  onOpenImage,
  onGo
}: {
  entry: MemoryMessage
  onOpenImage: (url: string) => void
  onGo: (channelId: string | null) => void
}) {
  const { byId } = useMembers()
  const known = byId[entry.authorId]
  const name = known?.displayName ?? entry.displayName
  const color = known?.profileColor ?? undefined

  const media = entry.imageUrl ?? entry.gifUrl ?? entry.stickerUrl
  const mediaUrl = resolveAssetUrl(media)

  const hora = new Date(entry.createdAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })

  return (
    <div className="rounded-brutal border border-line bg-void/60 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <UserAvatar
          src={resolveAssetUrl(known?.avatar ?? entry.avatar)}
          name={name}
          ringColor={color}
          className="h-5 w-5"
        />
        <span className="truncate text-xs" style={color ? { color } : undefined}>
          {name}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{hora}</span>
        <button
          type="button"
          onClick={() => onGo(entry.channelId)}
          disabled={!entry.channelId}
          className={cn(
            'ml-auto shrink-0 text-[11px] transition-colors',
            entry.channelId
              ? 'text-muted-foreground hover:text-acid'
              : 'cursor-default text-muted-foreground'
          )}
        >
          {entry.channelName ? `#${entry.channelName}` : 'canal apagado'}
        </button>
      </div>

      {entry.content && (
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
          {entry.content}
        </p>
      )}

      {mediaUrl && (
        <button
          type="button"
          onClick={() => onOpenImage(mediaUrl)}
          className="mt-1.5 block max-w-[220px] overflow-hidden rounded-brutal border border-line"
        >
          <img src={mediaUrl} alt="" className="block h-auto w-full" loading="lazy" />
        </button>
      )}

      <p className="mt-1 text-[11px] text-muted-foreground">
        {entry.reactions} {entry.reactions === 1 ? 'reação' : 'reações'} na época
      </p>
    </div>
  )
}
