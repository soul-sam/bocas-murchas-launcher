import * as React from 'react'
import { Ban, Check, Flame, Headphones, Loader2, LogIn, LogOut } from 'lucide-react'
import type { CardProps } from './index'
import { CardFrame } from './index'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'
import { useMembers } from '@/lib/members-context'
import { useSmoke, smokeCountdown, type SmokeAck, type SmokeStatus } from '@/lib/smoke-context'
import { useVoice } from '@/lib/voice-context'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'

/**
 * CARTÃO DO SINAL DE FUMAÇA.
 *
 * Mesma dança do cartão de "Bora?": o estado VIVO manda enquanto a fumaça
 * existe, o `metadata` gravado assume quando ela acaba, e uma fumaça ausente
 * do retrato do servidor (`ready`) é tratada como apagada — melhor isso que
 * um botão "eu também" que não faz nada depois de um restart.
 *
 * O que ele mostra e o card do party não mostra: QUEM JÁ CUMPRIU. É a única
 * informação que faz a promessa valer alguma coisa no dia seguinte.
 */

export interface SmokeCardMetadata {
  smokeId: string
  at: number
  note?: string
  createdById: string
  status: SmokeStatus
  members: string[]
  arrived: string[]
}

export function SmokeCard({ metadata }: CardProps<SmokeCardMetadata>) {
  const { user } = useAuth()
  const { byId } = useMembers()
  const { smokeById, ready, joinSmoke, leaveSmoke, cancelSmoke } = useSmoke()
  const { voiceChannels } = useChat()
  const voice = useVoice()
  const now = useNow(20_000)

  const [busy, setBusy] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)
  const [feedback, setFeedback] = React.useState<{ text: string; bad: boolean } | null>(null)

  const live = smokeById(metadata.smokeId)

  const status: SmokeStatus = live
    ? live.status
    : ready && metadata.status !== 'closed'
      ? 'closed'
      : (metadata.status ?? 'closed')

  const at = live?.at ?? metadata.at
  const note = live?.note ?? metadata.note
  const memberIds = live ? live.members.map((m) => m.id) : (metadata.members ?? [])
  const arrived = new Set(live ? live.arrived : (metadata.arrived ?? []))
  const creatorId = live?.createdBy.id ?? metadata.createdById

  const isCreator = user?.id === creatorId
  const isAdmin = user?.role === 'admin'
  const isMember = !!user && memberIds.includes(user.id)
  const closed = status === 'closed'
  const due = status === 'due'

  const members = memberIds.map((id) => {
    const known = byId[id]
    if (known) return known
    const fromLive = live?.members.find((m) => m.id === id)
    return { id, displayName: fromLive?.displayName ?? '?', avatar: fromLive?.avatar }
  })
  const creator = byId[creatorId] ?? live?.createdBy

  const run = async (action: () => Promise<SmokeAck>): Promise<void> => {
    if (busy) return
    setBusy(true)
    setFeedback(null)
    const ack = await action()
    setBusy(false)
    if (!ack.ok) setFeedback({ text: ack.error ?? 'Deu ruim', bad: true })
  }

  const cancel = (): void => {
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 4_000)
      return
    }
    setConfirming(false)
    void run(() => cancelSmoke(metadata.smokeId))
  }

  const callChannel = voiceChannels[0]
  const alreadyInCall = voice.connected

  /**
   * A frase de cima muda de tempo verbal conforme o estado.
   *
   * "3 pessoas entram em 20 min" (promessa), "3 pessoas entram AGORA"
   * (cobrança), "2 de 3 apareceram" (placar). O card fechado vira registro, e
   * é isso que faz alguém pensar duas vezes antes de prometer e sumir.
   */
  const quantos = memberIds.length
  const gente = quantos === 1 ? '1 pessoa' : `${quantos} pessoas`

  const headline = closed
    ? arrived.size > 0
      ? `${arrived.size} de ${quantos} ${arrived.size === 1 ? 'apareceu' : 'apareceram'}`
      : 'Ninguém apareceu'
    : due
      ? `${gente} ${quantos === 1 ? 'entra' : 'entram'} agora`
      : `${gente} ${quantos === 1 ? 'entra' : 'entram'} ${smokeCountdown(at, now.getTime())}`

  const accent = closed ? 'muted' : due ? 'acid' : 'burn'

  return (
    <CardFrame
      accent={accent}
      icon={<Flame className="h-3.5 w-3.5" />}
      title="Sinal de fumaça"
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">acendido por {creator?.displayName ?? 'alguém'}</span>
          {(isCreator || isAdmin) && !closed && live && (
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-brutal px-1.5 py-0.5 font-mono text-[11.5px] uppercase tracking-widest transition-colors',
                confirming
                  ? 'bg-destructive text-destructive-foreground'
                  : 'text-muted-foreground hover:text-destructive'
              )}
            >
              <Ban className="h-3 w-3" />
              {confirming ? 'certeza?' : 'apagar'}
            </button>
          )}
        </div>
      }
    >
      <p
        className={cn(
          'font-display text-lg leading-tight',
          closed ? 'text-muted-foreground' : 'text-foreground'
        )}
      >
        {headline}
      </p>
      <p
        className={cn(
          'mt-0.5 text-[11.5px]',
          closed ? 'text-muted-foreground' : due ? 'text-acid' : 'text-burn'
        )}
      >
        {closed
          ? 'fumaça apagada'
          : `marcado pras ${new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
      </p>

      {note && (
        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {note}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {members.map((m) => (
          <span key={m.id} className="relative">
            <UserAvatar
              src={resolveAssetUrl(m.avatar)}
              name={m.displayName}
              className={cn('h-7 w-7', m.id === creatorId && 'ring-1 ring-burn')}
            />
            {arrived.has(m.id) && (
              <span
                aria-label="apareceu"
                className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-acid text-void"
              >
                <Check className="h-2 w-2" strokeWidth={4} />
              </span>
            )}
          </span>
        ))}
        {members.length > 0 && (
          <span className="ml-1 min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {members.map((m) => m.displayName.split(/\s+/)[0]).join(', ')}
          </span>
        )}
      </div>

      {!closed && live && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {!isMember && (
            <ActionButton
              tone="burn"
              filled
              disabled={busy}
              onClick={() => void run(() => joinSmoke(metadata.smokeId))}
              icon={<LogIn className="h-3 w-3" />}
            >
              Eu também
            </ActionButton>
          )}

          {isMember && !isCreator && (
            <ActionButton
              tone="muted"
              disabled={busy}
              onClick={() => void run(() => leaveSmoke(metadata.smokeId))}
              icon={<LogOut className="h-3 w-3" />}
            >
              Não vou dar
            </ActionButton>
          )}

          {isMember && !alreadyInCall && callChannel && (
            <ActionButton
              tone="acid"
              filled={due}
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
        <p className={cn('mt-2 text-[11.5px]', feedback.bad ? 'text-destructive' : 'text-acid')}>
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
        ? filled
          ? 'border-burn bg-burn text-void hover:brightness-110'
          : 'border-burn/60 text-burn hover:bg-burn/15'
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
