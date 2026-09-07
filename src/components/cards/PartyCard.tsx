import * as React from 'react'
import { Ban, Headphones, Loader2, LogIn, LogOut, Zap } from 'lucide-react'
import type { CardProps } from './index'
import { CardFrame } from './index'
import { UserAvatar } from '@/components/ui/avatar'
import { GameIcon } from '@/components/social/GameIcon'
import { resolveAssetUrl } from '@/lib/api'
import { gameLabel, type PartyCardMetadata, type PartyStatus } from '@/lib/api-events'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'
import { useMembers } from '@/lib/members-context'
import { useParty, type PartyAck } from '@/lib/party-context'
import { useVoice } from '@/lib/voice-context'
import { formatRelative } from '@/lib/natural-date'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'

/**
 * CARTÃO "BORA?".
 *
 * Duas fontes, nessa ordem: o estado VIVO do party (useParty, via socket) e,
 * na falta dele, o metadata gravado na mensagem. O vivo manda enquanto o
 * party existe; quando acaba, o servidor grava o status final no metadata e
 * apaga o vivo — e o card passa a ler o metadata, que agora diz "closed".
 *
 * Caso chato: servidor reiniciou. O party (memória) morreu sem ninguém
 * reescrever o card, e o metadata continua dizendo "open". Se já recebemos o
 * retrato do servidor (`ready`) e o party não está nele, tratamos como
 * encerrado — melhor que um botão "entrar" que nunca funciona.
 */

interface ShownMember {
  id: string
  displayName: string
  avatar?: string | null
  profileColor?: string | null
}

export function PartyCard({ metadata }: CardProps<PartyCardMetadata>) {
  const { user } = useAuth()
  const { byId } = useMembers()
  const { partyById, ready, joinParty, leaveParty, cancelParty, nudgeParty } = useParty()
  const voice = useVoice()
  const { voiceChannels } = useChat()
  const now = useNow(30_000)

  const [busy, setBusy] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)
  const [feedback, setFeedback] = React.useState<{ text: string; bad: boolean } | null>(null)

  const live = partyById(metadata.partyId)

  const status: PartyStatus = live
    ? live.status
    : ready && metadata.status !== 'closed'
      ? 'closed'
      : (metadata.status ?? 'closed')

  const memberIds = live ? live.members.map((m) => m.id) : metadata.members ?? []
  const slots = live?.slots ?? metadata.slots
  const game = live?.game ?? metadata.game
  const note = live?.note ?? metadata.note
  const creatorId = live?.createdBy.id ?? metadata.createdById

  const isCreator = user?.id === creatorId
  const isAdmin = user?.role === 'admin'
  const isMember = !!user && memberIds.includes(user.id)
  const closed = status === 'closed'

  // Nome e avatar: da lista de membros (atualizada), senão do retrato que o
  // servidor mandou junto com o party.
  const members: ShownMember[] = memberIds.map((id) => {
    const known = byId[id]
    if (known) return known
    const fromLive = live?.members.find((m) => m.id === id)
    return { id, displayName: fromLive?.displayName ?? '?', avatar: fromLive?.avatar }
  })
  const creator = byId[creatorId] ?? live?.createdBy

  const emptySlots = Math.max(0, slots - memberIds.length)

  const run = async (action: () => Promise<PartyAck>, done?: (ack: PartyAck) => string | null) => {
    if (busy) return
    setBusy(true)
    setFeedback(null)
    const ack = await action()
    setBusy(false)
    if (!ack.ok) {
      setFeedback({ text: ack.error ?? 'Deu ruim', bad: true })
      return
    }
    const text = done?.(ack)
    if (text) setFeedback({ text, bad: false })
  }

  const cancel = (): void => {
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 4_000)
      return
    }
    setConfirming(false)
    void run(() => cancelParty(metadata.partyId))
  }

  const callChannel = voiceChannels[0]
  const alreadyInCall = voice.connected && voice.channel?.id === callChannel?.id
  const showCall = status === 'full' && !!callChannel && !alreadyInCall

  const statusLine = closed
    ? 'encerrado'
    : status === 'full'
      ? `fechou o time · ${memberIds.length}/${slots}`
      : `aberto · ${memberIds.length}/${slots}` +
        (live ? ` · expira ${formatRelative(new Date(live.expiresAt), now)}` : '')

  const accent = closed ? 'muted' : status === 'full' ? 'acid' : 'burn'

  return (
    <CardFrame
      accent={accent}
      icon={<GameIcon game={game} />}
      title={`Bora? · ${gameLabel(game)}`}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">chamado por {creator?.displayName ?? 'alguém'}</span>
          {(isCreator || isAdmin) && !closed && live && (
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-brutal px-1.5 py-0.5 font-mono text-[11.5px] uppercase tracking-widest transition-colors',
                confirming ? 'bg-destructive text-destructive-foreground' : 'text-muted-foreground hover:text-destructive'
              )}
            >
              <Ban className="h-3 w-3" />
              {confirming ? 'certeza?' : 'cancelar'}
            </button>
          )}
        </div>
      }
    >
      <p
        className={cn(
          'font-display text-lg leading-tight',
          closed ? 'text-muted-foreground line-through' : 'text-foreground'
        )}
      >
        Bora {gameLabel(game)}?
      </p>
      <p
        className={cn(
          'mt-0.5 text-[11.5px]',
          closed ? 'text-muted-foreground' : status === 'full' ? 'text-acid' : 'text-burn'
        )}
      >
        {statusLine}
      </p>

      {note && !closed && (
        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{note}</p>
      )}

      {/* Quem está dentro + vagas vazias */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {members.map((m) => (
          <UserAvatar
            key={m.id}
            src={resolveAssetUrl(m.avatar)}
            name={m.displayName}
            ringColor={m.profileColor}
            className={cn('h-7 w-7', m.id === creatorId && 'ring-1 ring-burn')}
          />
        ))}
        {!closed &&
          Array.from({ length: Math.min(emptySlots, 10) }).map((_, i) => (
            <span
              key={`empty-${i}`}
              aria-hidden
              className="h-7 w-7 rounded-brutal border-2 border-dashed border-line-strong"
            />
          ))}
        {members.length > 0 && (
          <span className="ml-1 min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {members.map((m) => m.displayName.split(/\s+/)[0]).join(', ')}
          </span>
        )}
      </div>

      {/* Ações */}
      {!closed && live && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {status === 'open' && !isMember && (
            <ActionButton
              tone="acid"
              filled
              disabled={busy}
              onClick={() => void run(() => joinParty(metadata.partyId))}
              icon={<LogIn className="h-3 w-3" />}
            >
              Entrar
            </ActionButton>
          )}

          {isMember && !isCreator && (
            <ActionButton
              tone="muted"
              disabled={busy}
              onClick={() => void run(() => leaveParty(metadata.partyId))}
              icon={<LogOut className="h-3 w-3" />}
            >
              Sair
            </ActionButton>
          )}

          {isCreator && status === 'open' && (
            <ActionButton
              tone="burn"
              disabled={busy}
              onClick={() =>
                void run(
                  () => nudgeParty(metadata.partyId),
                  (ack) =>
                    ack.delivered === 0
                      ? 'ninguém online pra cutucar'
                      : `cutucou ${ack.delivered ?? 0} pessoa${ack.delivered === 1 ? '' : 's'}`
                )
              }
              icon={<Zap className="h-3 w-3" />}
            >
              Cutucar quem falta
            </ActionButton>
          )}

          {showCall && (
            <ActionButton
              tone="acid"
              filled
              disabled={busy}
              onClick={() => void voice.join(callChannel)}
              icon={<Headphones className="h-3 w-3" />}
            >
              Entrar na call
            </ActionButton>
          )}

          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
      )}

      {feedback && (
        <p
          className={cn(
            'mt-2 text-[11.5px]',
            feedback.bad ? 'text-destructive' : 'text-acid'
          )}
        >
          {feedback.text}
        </p>
      )}
    </CardFrame>
  )
}

function ActionButton({
  tone,
  filled,
  disabled,
  onClick,
  icon,
  children
}: {
  tone: 'acid' | 'burn' | 'muted'
  filled?: boolean
  disabled?: boolean
  onClick: () => void
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  const styles =
    tone === 'acid'
      ? filled
        ? 'border-acid bg-acid text-void hover:bg-acid/90'
        : 'border-acid/50 text-acid hover:bg-acid/10'
      : tone === 'burn'
        ? 'border-burn/60 text-burn hover:bg-burn/15'
        : 'border-line-strong text-muted-foreground hover:border-acid/50 hover:text-foreground'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-brutal border-2 px-2.5 py-1 font-mono text-[11.5px] uppercase tracking-widest transition-colors',
        styles,
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      {icon}
      {children}
    </button>
  )
}
