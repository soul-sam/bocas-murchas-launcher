import * as React from 'react'
import { Clapperboard } from 'lucide-react'
import type { CardProps } from './index'
import { CardFrame } from './index'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { clips as clipsApi, formatClipDuration, type ClipCardMetadata } from '@/lib/api-clips'
import { useAuth } from '@/lib/auth-context'
import { useClips } from '@/lib/clip-context'
import { useMembers } from '@/lib/members-context'
import { ClipPlayer } from '@/components/social/ClipPlayer'

/**
 * CARTÃO DE CLIPE.
 *
 * O card fica no chat pra sempre; o arquivo pode não estar mais lá (quem
 * clipou apagou). Nesse caso o tocador mostra "sumiu" e o card continua de pé
 * — apagar a mensagem junto reescreveria a conversa, e quem respondeu ao
 * clipe ficaria falando sozinho.
 *
 * Os rostos embaixo são quem estava na call. É o que transforma "um áudio" em
 * "aquela noite": daqui a um ano é essa fileira que diz de quem é a lembrança.
 */
export function ClipCard({ message, metadata }: CardProps<ClipCardMetadata>) {
  const { token } = useAuth()
  const { byId } = useMembers()
  const { clips } = useClips()

  const url = resolveAssetUrl(metadata.url)
  if (!url) return <p className="text-sm text-foreground">{message.content}</p>

  /**
   * O contador de escutas vem da lista viva quando ela já chegou.
   *
   * O `metadata` da mensagem é o retrato do instante em que o clipe nasceu —
   * ali o contador é sempre zero, e mostrar isso pra sempre seria mentira.
   */
  const live = clips.find((c) => c.id === metadata.clipId)
  const participants = live?.participants ?? metadata.participants ?? []
  const plays = live?.playCount ?? 0

  const countPlay = React.useCallback(() => {
    if (!token) return
    void clipsApi.countPlay(token, metadata.clipId)
  }, [token, metadata.clipId])

  return (
    <CardFrame
      accent="acid"
      icon={<Clapperboard className="h-3.5 w-3.5" />}
      title={`Clipe · ${formatClipDuration(metadata.durationMs)}`}
      footer={
        <div className="flex items-center gap-2 normal-case">
          {participants.length > 0 && (
            <span className="flex shrink-0 items-center gap-1">
              {participants.slice(0, 8).map((id) => {
                const who = byId[id]
                return (
                  <UserAvatar
                    key={id}
                    src={resolveAssetUrl(who?.avatar)}
                    name={who?.displayName ?? '?'}
                    ringColor={who?.profileColor}
                    className="h-5 w-5"
                  />
                )
              })}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate">
            {participants.length > 0
              ? participants
                  .map((id) => byId[id]?.displayName?.split(/\s+/)[0] ?? '?')
                  .join(', ')
              : 'na call'}
          </span>
          {plays > 0 && (
            <span className="shrink-0">
              {plays} {plays === 1 ? 'escuta' : 'escutas'}
            </span>
          )}
        </div>
      }
    >
      <p className="mb-2 break-words font-display text-base leading-tight text-foreground">
        {metadata.title}
      </p>
      <ClipPlayer src={url} durationMs={metadata.durationMs} onFirstPlay={countPlay} />
    </CardFrame>
  )
}
