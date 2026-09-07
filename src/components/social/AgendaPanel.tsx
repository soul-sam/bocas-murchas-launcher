import * as React from 'react'
import { CalendarPlus, Loader2, Trash2, X } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { GameIcon } from './GameIcon'
import { resolveAssetUrl } from '@/lib/api'
import { events as eventsApi, type AgendaEvent, type RsvpStatus } from '@/lib/api-events'
import { useAuth } from '@/lib/auth-context'
import { useLayout } from '@/lib/layout-context'
import { useMembers } from '@/lib/members-context'
import { useOverlays } from '@/lib/overlay-context'
import { useSocket } from '@/lib/socket-context'
import { formatDayLabel, formatRelative, formatTime } from '@/lib/natural-date'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'

/**
 * AGENDA — coluna da direita: o que está marcado, agrupado por dia.
 *
 * A lista vem do REST (GET /events/upcoming) e é RECARREGADA a cada
 * `event:changed`, em vez de aplicar o evento do socket por cima. É uma
 * lista de 30 no máximo, e recarregar garante a mesma ordem e o mesmo filtro
 * ("começou há menos de 3h ainda aparece") que o servidor aplica — sem
 * duplicar essa regra aqui.
 */

const RSVP_CHIPS: Array<{ status: RsvpStatus; label: string; active: string; idle: string }> = [
  { status: 'going', label: 'vou', active: 'bg-acid text-void', idle: 'text-acid hover:bg-acid/10' },
  { status: 'maybe', label: 'talvez', active: 'bg-burn text-void', idle: 'text-burn hover:bg-burn/10' },
  {
    status: 'no',
    label: 'não',
    active: 'bg-destructive text-destructive-foreground',
    idle: 'text-muted-foreground hover:text-destructive'
  }
]

interface DayGroup {
  key: string
  label: string
  items: AgendaEvent[]
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function AgendaPanel() {
  const { closeAgenda: close } = useLayout()
  const { token, user } = useAuth()
  const { socket } = useSocket()
  const { openEventComposer } = useOverlays()
  const { byId } = useMembers()
  const now = useNow(60_000)

  const [events, setEvents] = React.useState<AgendaEvent[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [confirmId, setConfirmId] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    if (!token) return
    try {
      setEvents(await eventsApi.upcoming(token))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra carregar a agenda')
    } finally {
      setLoading(false)
    }
  }, [token])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    if (!socket) return
    const handle = (): void => void refresh()
    socket.on('event:changed', handle)
    // Reconectou: o que mudou enquanto estávamos fora não chegou por socket.
    socket.on('connect', handle)
    return () => {
      socket.off('event:changed', handle)
      socket.off('connect', handle)
    }
  }, [socket, refresh])

  const groups = React.useMemo<DayGroup[]>(() => {
    const map = new Map<string, DayGroup>()
    for (const event of events) {
      const d = new Date(event.startsAt)
      if (Number.isNaN(d.getTime())) continue
      const key = dayKey(d)
      let group = map.get(key)
      if (!group) {
        group = { key, label: capitalize(formatDayLabel(d, now)), items: [] }
        map.set(key, group)
      }
      group.items.push(event)
    }
    return [...map.values()]
  }, [events, now])

  const respond = async (event: AgendaEvent, status: RsvpStatus): Promise<void> => {
    if (!token || busyId) return
    setBusyId(event.id)
    try {
      const updated = await eventsApi.rsvp(token, event.id, status)
      // A resposta já vem com o evento novo; o `event:changed` que chega em
      // seguida recarrega tudo de qualquer jeito.
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra responder')
    } finally {
      setBusyId(null)
    }
  }

  const cancel = async (event: AgendaEvent): Promise<void> => {
    if (!token || busyId) return
    if (confirmId !== event.id) {
      setConfirmId(event.id)
      setTimeout(() => setConfirmId((current) => (current === event.id ? null : current)), 4_000)
      return
    }
    setConfirmId(null)
    setBusyId(event.id)
    try {
      await eventsApi.cancel(token, event.id)
      setEvents((prev) => prev.filter((e) => e.id !== event.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra cancelar')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-void xl:w-80">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <h3 className="flex-1 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
          Agenda
        </h3>
        <button
          type="button"
          onClick={() => openEventComposer()}
          title="Marcar na agenda (/marcar)"
          className="flex items-center gap-1 rounded-brutal border border-acid/40 px-1.5 py-0.5 font-mono text-[11.5px] uppercase tracking-widest text-acid transition-colors hover:bg-acid/10"
        >
          <CalendarPlus className="h-3 w-3" />
          marcar
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Fechar"
          className="rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">Nada marcado.</p>
            <p className="text-[11.5px] text-muted-foreground">
              digita /marcar sexta 21h lol no chat
            </p>
            <button
              type="button"
              onClick={() => openEventComposer()}
              className="btn-acid rounded-brutal px-3 py-1.5 text-xs"
            >
              marcar
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <section key={group.key}>
                <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-acid-text">
                  {group.label}
                </h4>
                <div className="space-y-1.5">
                  {group.items.map((event) => {
                    const d = new Date(event.startsAt)
                    const started = d.getTime() <= now.getTime()
                    const going = event.rsvps.filter((r) => r.status === 'going')
                    const mine = user
                      ? (event.rsvps.find((r) => r.userId === user.id)?.status ?? null)
                      : null
                    const canManage =
                      !!user && (user.id === event.createdById || user.role === 'admin')
                    const busy = busyId === event.id

                    return (
                      <div
                        key={event.id}
                        className={cn(
                          'group rounded-brutal border bg-void/40 px-2 py-2 transition-colors',
                          started ? 'border-burn/40' : 'border-line hover:border-acid/40'
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={cn(
                              'w-11 shrink-0 pt-0.5 font-mono text-xs',
                              started ? 'text-burn' : 'text-acid'
                            )}
                          >
                            {formatTime(d)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                              <GameIcon
                                game={event.game}
                                className="h-3 w-3 shrink-0 text-muted-foreground"
                              />
                              <span className="truncate" title={event.title}>
                                {event.title}
                              </span>
                            </p>
                            <p className="font-mono text-[11.5px] text-muted-foreground">
                              {started ? `começou ${formatRelative(d, now)}` : formatRelative(d, now)}
                              {' · '}
                              {going.length} {going.length === 1 ? 'vai' : 'vão'}
                            </p>
                          </div>
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => void cancel(event)}
                              disabled={busy}
                              title="Cancelar evento"
                              className={cn(
                                'shrink-0 rounded-brutal p-1 transition-all',
                                confirmId === event.id
                                  ? 'bg-destructive text-destructive-foreground opacity-100'
                                  : 'text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100'
                              )}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>

                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1">
                            <div className="flex -space-x-1.5">
                              {going.slice(0, 5).map((rsvp) => {
                                const member = byId[rsvp.userId] ?? rsvp.user
                                return (
                                  <UserAvatar
                                    key={rsvp.userId}
                                    src={resolveAssetUrl(member?.avatar)}
                                    name={member?.displayName ?? '?'}
                                    ringColor={member?.profileColor}
                                    className="h-5 w-5 border-2 border-void"
                                  />
                                )
                              })}
                            </div>
                            {going.length > 5 && (
                              <span className="font-mono text-[11.5px] text-muted-foreground">
                                +{going.length - 5}
                              </span>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-0.5">
                            {busy ? (
                              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                            ) : (
                              RSVP_CHIPS.map((chip) => (
                                <button
                                  key={chip.status}
                                  type="button"
                                  onClick={() => void respond(event, chip.status)}
                                  className={cn(
                                    'rounded-brutal px-1.5 py-0.5 font-mono text-[11.5px] uppercase tracking-widest transition-colors',
                                    mine === chip.status ? chip.active : chip.idle
                                  )}
                                >
                                  {chip.label}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-brutal border border-destructive/50 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </aside>
  )
}
