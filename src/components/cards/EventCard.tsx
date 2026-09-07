import * as React from 'react'
import { Ban, Loader2 } from 'lucide-react'
import type { CardProps } from './index'
import { CardFrame } from './index'
import { UserAvatar } from '@/components/ui/avatar'
import { GameIcon } from '@/components/social/GameIcon'
import { resolveAssetUrl } from '@/lib/api'
import { events as eventsApi, gameLabel, type EventCardMetadata, type RsvpStatus } from '@/lib/api-events'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { formatEventWhen } from '@/lib/natural-date'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'

/**
 * CARTÃO DE EVENTO (agenda).
 *
 * Desenha SÓ o que está no metadata. Não busca nada: quando alguém responde
 * "vou", o servidor reescreve o metadata do card e manda `messageUpdated`, e
 * o chat-context troca a mensagem na lista — este componente só re-renderiza.
 * Por isso os botões não fazem atualização otimista: o clique vai pro
 * servidor e a tela muda quando a resposta volta pra todo mundo ao mesmo
 * tempo, sem estado local pra ficar divergente.
 */

const RSVP_OPTIONS: Array<{
  status: RsvpStatus
  label: string
  active: string
  idle: string
}> = [
  {
    status: 'going',
    label: 'Vou',
    active: 'border-acid bg-acid text-void',
    idle: 'border-acid/40 text-acid hover:bg-acid/10'
  },
  {
    status: 'maybe',
    label: 'Talvez',
    active: 'border-burn bg-burn text-void',
    idle: 'border-burn/40 text-burn hover:bg-burn/10'
  },
  {
    status: 'no',
    label: 'Não',
    active: 'border-destructive bg-destructive text-destructive-foreground',
    idle: 'border-line-strong text-muted-foreground hover:border-destructive/50 hover:text-destructive'
  }
]

const EMPTY_RSVPS: Record<RsvpStatus, string[]> = { going: [], maybe: [], no: [] }

export function EventCard({ metadata, compact }: CardProps<EventCardMetadata>) {
  const { token, user } = useAuth()
  const { byId } = useMembers()
  const now = useNow(60_000)

  const [busy, setBusy] = React.useState<RsvpStatus | 'cancel' | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const rsvps = metadata.rsvps ?? EMPTY_RSVPS
  const cancelled = !!metadata.cancelled
  const startsAt = new Date(metadata.startsAt)
  const started = !Number.isNaN(startsAt.getTime()) && startsAt.getTime() <= now.getTime()

  const mine: RsvpStatus | null = !user
    ? null
    : rsvps.going?.includes(user.id)
      ? 'going'
      : rsvps.maybe?.includes(user.id)
        ? 'maybe'
        : rsvps.no?.includes(user.id)
          ? 'no'
          : null

  const canManage = !!user && (user.id === metadata.createdById || user.role === 'admin')
  const creator = byId[metadata.createdById]

  const people = (ids: string[] | undefined) =>
    (ids ?? []).map((id) => byId[id] ?? null).map((m, i) => ({ id: (ids ?? [])[i], member: m }))

  const going = people(rsvps.going)
  const maybe = people(rsvps.maybe)

  const respond = async (status: RsvpStatus): Promise<void> => {
    if (!token || busy || cancelled) return
    setBusy(status)
    setError(null)
    try {
      await eventsApi.rsvp(token, metadata.eventId, status)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra responder')
    } finally {
      setBusy(null)
    }
  }

  const cancel = async (): Promise<void> => {
    if (!token || busy) return
    // Dois cliques: um cancelamento sem querer apaga o evento de todo mundo.
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 4_000)
      return
    }
    setBusy('cancel')
    setError(null)
    try {
      await eventsApi.cancel(token, metadata.eventId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra cancelar')
    } finally {
      setBusy(null)
      setConfirming(false)
    }
  }

  const when = cancelled ? 'cancelado' : formatEventWhen(startsAt, now)
  const accent = cancelled ? 'muted' : started ? 'burn' : 'acid'

  return (
    <CardFrame
      accent={accent}
      icon={<GameIcon game={metadata.game} />}
      title={`Agenda · ${gameLabel(metadata.game)}`}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">
            marcado por {creator?.displayName ?? 'alguém'}
          </span>
          {canManage && !cancelled && (
            <button
              type="button"
              onClick={() => void cancel()}
              disabled={busy !== null}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-brutal px-1.5 py-0.5 font-mono text-[11.5px] uppercase tracking-widest transition-colors',
                confirming
                  ? 'bg-destructive text-destructive-foreground'
                  : 'text-muted-foreground hover:text-destructive'
              )}
            >
              {busy === 'cancel' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Ban className="h-3 w-3" />
              )}
              {confirming ? 'certeza?' : 'cancelar'}
            </button>
          )}
        </div>
      }
    >
      <p
        className={cn(
          'font-display text-lg leading-tight',
          cancelled ? 'line-through text-muted-foreground' : 'text-foreground'
        )}
      >
        {metadata.title}
      </p>

      <p
        className={cn(
          'mt-0.5 text-[11.5px]',
          cancelled ? 'text-muted-foreground' : started ? 'text-burn' : 'text-acid'
        )}
      >
        {when}
      </p>

      {!compact && metadata.note && !cancelled && (
        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {metadata.note}
        </p>
      )}

      {/* Vou / Talvez / Não */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {RSVP_OPTIONS.map((option) => {
          const count = rsvps[option.status]?.length ?? 0
          const active = mine === option.status
          return (
            <button
              key={option.status}
              type="button"
              disabled={cancelled || busy !== null}
              onClick={() => void respond(option.status)}
              className={cn(
                'flex items-center gap-1.5 rounded-brutal border-2 px-2.5 py-1 font-mono text-[11.5px] uppercase tracking-widest transition-colors',
                active ? option.active : option.idle,
                (cancelled || busy !== null) && 'cursor-not-allowed opacity-60'
              )}
            >
              {busy === option.status ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                option.label
              )}
              <span className={cn('font-bold', active ? '' : 'opacity-70')}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Quem vai */}
      {(going.length > 0 || maybe.length > 0) && (
        <div className="mt-3 space-y-1.5">
          {going.length > 0 && (
            <AvatarRow label="vão" people={going} />
          )}
          {maybe.length > 0 && (
            <AvatarRow label="talvez" people={maybe} dim />
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 text-[11.5px] text-destructive">
          {error}
        </p>
      )}
    </CardFrame>
  )
}

function AvatarRow({
  label,
  people,
  dim
}: {
  label: string
  people: Array<{
    id: string
    member: { displayName: string; avatar?: string | null; profileColor?: string | null } | null
  }>
  dim?: boolean
}) {
  const shown = people.slice(0, 8)
  const extra = people.length - shown.length

  return (
    <div className={cn('flex items-center gap-2', dim && 'opacity-60')}>
      <span className="w-10 shrink-0 text-[11.5px] text-muted-foreground">
        {label}
      </span>
      <div className="flex -space-x-1.5">
        {shown.map(({ id, member }) => (
          <UserAvatar
            key={id}
            src={resolveAssetUrl(member?.avatar)}
            name={member?.displayName ?? '?'}
            ringColor={member?.profileColor}
            className="h-6 w-6 border-2 border-void"
          />
        ))}
      </div>
      {extra > 0 && (
        <span className="font-mono text-[11.5px] text-muted-foreground">+{extra}</span>
      )}
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
        {shown
          .map(({ member }) => member?.displayName.split(/\s+/)[0])
          .filter(Boolean)
          .join(', ')}
      </span>
    </div>
  )
}
