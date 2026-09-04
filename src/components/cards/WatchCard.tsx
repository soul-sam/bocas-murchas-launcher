import * as React from 'react'
import { ExternalLink, Play, Tv, Users } from 'lucide-react'
import type { CardProps } from './index'
import { CardFrame } from './index'
import { UserAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useChat } from '@/lib/chat-context'
import { useVoice } from '@/lib/voice-context'
import { useMembers } from '@/lib/members-context'
import { useLayout } from '@/lib/layout-context'
import { useSocket } from '@/lib/socket-context'
import { useWatch } from '@/lib/watch-context'
import { openExternal } from '@/lib/rich-text'
import { youtubeThumbnail, youtubeWatchUrl } from '@/lib/youtube'

/**
 * CARTÃO 'ASSISTINDO JUNTO' — metadata: { channelId, videoId, title, hostUserId }.
 *
 * O servidor posta isso no canal do sistema quando alguém bota um vídeo novo
 * na call. O cartão é o convite: capa, quem trouxe, e um botão que já entra
 * na call e abre o palco — sem isso a pessoa lia "Samu botou X" e tinha que
 * caçar o canal de voz na barra pra descobrir onde.
 *
 * O cartão é uma mensagem, então fica no histórico pra sempre; a sessão não.
 * "Rolando agora" só aparece enquanto o contexto ainda conhece a sessão desse
 * canal com ESSE vídeo — e some junto com ela.
 */
interface WatchCardMeta {
  channelId?: string
  videoId?: string
  title?: string | null
  hostUserId?: string
}

export function WatchCard({ message, metadata, compact }: CardProps<WatchCardMeta>) {
  const { voiceChannels } = useChat()
  const { voiceByChannel } = useSocket()
  const { byId } = useMembers()
  const { setView } = useLayout()
  const voice = useVoice()
  const watch = useWatch()

  const [joining, setJoining] = React.useState(false)
  const [thumbBroken, setThumbBroken] = React.useState(false)

  const videoId = typeof metadata.videoId === 'string' ? metadata.videoId : null
  const channel = voiceChannels.find((c) => c.id === metadata.channelId) ?? null
  const host = metadata.hostUserId ? byId[metadata.hostUserId] : undefined
  const hostName = host?.displayName ?? message.author.displayName
  const title = metadata.title?.trim() || 'Vídeo do YouTube'

  /**
   * Ainda está no ar? O retrato de canais em que não estou vem do connect e
   * pode estar velho, mas o servidor apaga a sessão quando o canal esvazia e
   * manda o retrato de novo a cada reconexão — então o pior caso é um "rolando
   * agora" que sobra por um tempo, nunca um que falta.
   */
  const live = !!(channel && videoId && watch.sessionFor(channel.id)?.videoId === videoId)
  const peopleInCall = channel ? voiceByChannel[channel.id]?.length ?? 0 : 0
  const alreadyThere = !!(channel && voice.connected && voice.channel?.id === channel.id)

  const join = React.useCallback(async () => {
    if (!channel) return
    setView('voice')
    if (alreadyThere) return
    setJoining(true)
    try {
      await voice.join(channel)
    } finally {
      setJoining(false)
    }
  }, [channel, alreadyThere, voice, setView])

  if (!videoId) {
    return (
      <CardFrame title="Assistir junto" icon={<Tv className="h-3.5 w-3.5" />}>
        <p className="text-sm text-foreground">{message.content}</p>
      </CardFrame>
    )
  }

  if (compact) {
    return (
      <CardFrame title="Assistir junto" icon={<Tv className="h-3.5 w-3.5" />}>
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm text-foreground">
            <span className="text-muted-foreground">{hostName} trouxe </span>
            {title}
          </p>
          {channel && (
            <button
              type="button"
              onClick={() => void join()}
              className="shrink-0 rounded-brutal border border-acid/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-acid transition-colors hover:bg-acid/10"
            >
              {alreadyThere ? 'ver' : 'entrar'}
            </button>
          )}
        </div>
      </CardFrame>
    )
  }

  return (
    <CardFrame
      accent={live ? 'acid' : 'muted'}
      icon={<Tv className="h-3.5 w-3.5" />}
      title={
        <span className="flex items-center gap-2">
          Assistir junto
          {live && (
            <span className="flex items-center gap-1 text-acid">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-acid" />
              rolando agora
            </span>
          )}
        </span>
      }
      footer={
        channel ? (
          <span className="flex items-center gap-1.5">
            <Users className="h-3 w-3" />
            {channel.name}
            {peopleInCall > 0 && (
              <span>· {peopleInCall} na call</span>
            )}
          </span>
        ) : (
          'esse canal de voz não existe mais'
        )
      }
    >
      <div className="flex gap-3">
        {/* Capa: clicar abre no YouTube, pra quem só quer ver o que é. */}
        <button
          type="button"
          onClick={() => openExternal(youtubeWatchUrl(videoId))}
          title="Abrir no YouTube"
          className="group relative aspect-video w-36 shrink-0 overflow-hidden rounded-brutal border border-[#1a1a1a] bg-black sm:w-44"
        >
          {!thumbBroken ? (
            <img
              src={youtubeThumbnail(videoId)}
              alt=""
              onError={() => setThumbBroken(true)}
              className="h-full w-full object-cover transition-opacity group-hover:opacity-70"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <Tv className="h-6 w-6 text-muted-foreground" />
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
            <ExternalLink className="h-5 w-5 text-dirty-white drop-shadow" />
          </span>
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{title}</p>

          <div className="flex items-center gap-1.5">
            <UserAvatar
              src={host?.avatar ?? message.author.avatar ?? undefined}
              name={hostName}
              ringColor={host?.profileColor}
              className="h-5 w-5"
            />
            <span className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {hostName} trouxe
            </span>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2">
            {channel ? (
              <button
                type="button"
                onClick={() => void join()}
                disabled={joining}
                className={cn(
                  'flex items-center gap-1.5 rounded-brutal border-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors',
                  alreadyThere
                    ? 'border-acid bg-acid/10 text-acid hover:bg-acid/20'
                    : 'border-acid/60 text-acid hover:bg-acid/10',
                  joining && 'opacity-60'
                )}
              >
                <Play className="h-3 w-3" />
                {alreadyThere ? 'Abrir o palco' : joining ? 'Entrando…' : 'Entrar e assistir'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openExternal(youtubeWatchUrl(videoId))}
                className="flex items-center gap-1.5 rounded-brutal border-2 border-[#2a2a2a] px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-acid/50 hover:text-acid"
              >
                <ExternalLink className="h-3 w-3" />
                Abrir no YouTube
              </button>
            )}
          </div>
        </div>
      </div>
    </CardFrame>
  )
}
