import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, Clapperboard, Loader2, Vote, X } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { ClipPlayer } from './ClipPlayer'
import { GameIcon } from './GameIcon'
import { QUICK_EMOJIS } from './MessageItem'
import { messages as messagesApi, resolveAssetUrl } from '@/lib/api'
import { events as eventsApi, type RsvpStatus } from '@/lib/api-events'
import { polls as pollsApi } from '@/lib/api-polls'
import { clips as clipsApi, formatClipDuration } from '@/lib/api-clips'
import type { Pendencia } from '@/lib/api-pendencias'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'
import { useLayout } from '@/lib/layout-context'
import { useMembers } from '@/lib/members-context'
import { usePendencias } from '@/lib/pendencias-context'
import { formatEventWhen, formatRelative } from '@/lib/natural-date'
import { cn } from '@/lib/utils'

/**
 * UMA PENDÊNCIA, RESPONDÍVEL ALI MESMO.
 *
 * O ponto inteiro é não precisar achar o card no chat: a agenda tem os três
 * botões do RSVP, a enquete tem as opções, o clipe tem o tocador e as
 * reações rápidas. Responder usa as mesmas rotas do card do chat — o card de
 * lá se atualiza sozinho, e a pendência some daqui na hora (`resolvido`).
 *
 * Usado no painel da direita e no cartão "enquanto você estava fora".
 */

const RSVP: Array<{ status: RsvpStatus; label: string; className: string }> = [
  { status: 'going', label: 'vou', className: 'border-acid/50 text-acid hover:bg-acid hover:text-void' },
  { status: 'maybe', label: 'talvez', className: 'border-burn/50 text-burn hover:bg-burn hover:text-void' },
  {
    status: 'no',
    label: 'não vou',
    className: 'border-line text-muted-foreground hover:border-destructive hover:text-destructive'
  }
]

/** As quatro primeiras reações rápidas do chat: cabe numa linha de 288px. */
const REACOES = QUICK_EMOJIS.slice(0, 4)

export function PendenciaCard({ item, compact }: { item: Pendencia; compact?: boolean }) {
  const { token, user } = useAuth()
  const { byId } = useMembers()
  const { setActiveChannel } = useChat()
  const { setView } = useLayout()
  const { resolvido, dispensar } = usePendencias()
  const navigate = useNavigate()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const now = new Date()
  const autor = byId[item.autor.id] ?? item.autor
  const autorNome = autor.displayName.split(/\s+/)[0] || autor.displayName

  /** Roda a resposta; deu certo, some da lista. */
  const responder = async (acao: () => Promise<unknown>): Promise<void> => {
    if (!token || busy) return
    setBusy(true)
    setError(null)
    try {
      await acao()
      resolvido(item.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra responder')
      setBusy(false)
    }
  }

  const verNoChat = (): void => {
    if (!item.channelId) return
    navigate('/')
    setView('chat')
    setActiveChannel(item.channelId)
    const messageId = item.messageId
    if (messageId) {
      // O canal precisa montar antes; dois quadros dão conta do histórico em memória.
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          document.getElementById(`msg-${messageId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        )
      )
    }
  }

  const Icone = item.kind === 'agenda' ? CalendarClock : item.kind === 'enquete' ? Vote : Clapperboard
  const rotulo = item.kind === 'agenda' ? 'Agenda' : item.kind === 'enquete' ? 'Enquete' : 'Clipe'
  // Agenda sem resposta não se dispensa: "não vou" é a resposta, e é ela
  // que quem marcou precisa ver.
  const podeDispensar = item.kind !== 'agenda'

  let prazo: string | null = null
  if (item.kind === 'agenda' && item.deadline) prazo = formatEventWhen(item.deadline, now)
  else if (item.kind === 'enquete' && item.deadline) prazo = `fecha ${formatRelative(new Date(item.deadline), now)}`
  else if (item.kind === 'clipe' && item.clipe) prazo = formatClipDuration(item.clipe.durationMs)

  // Prazo apertado (menos de 3h) ganha a cor de urgência.
  const apertado =
    !!item.deadline && new Date(item.deadline).getTime() - now.getTime() < 3 * 60 * 60 * 1000

  return (
    <article
      className={cn(
        'rounded-brutal border bg-void/40',
        apertado ? 'border-burn/60' : 'border-line',
        compact ? 'px-2.5 py-2' : 'px-3 py-2.5'
      )}
    >
      <header className="flex items-center gap-1.5">
        <Icone className={cn('h-3.5 w-3.5 shrink-0', apertado ? 'text-burn' : 'text-acid')} aria-hidden />
        <span className="text-[11.5px] font-medium text-muted-foreground">{rotulo}</span>
        {prazo && (
          <span
            className={cn('min-w-0 flex-1 truncate font-mono text-[11px]', apertado ? 'text-burn' : 'text-muted-foreground')}
          >
            · {prazo}
          </span>
        )}
        {!prazo && <span className="flex-1" />}
        {podeDispensar && (
          <button
            type="button"
            onClick={() => void dispensar(item)}
            title="Dispensar: some daqui e não te lembram mais"
            aria-label="Dispensar"
            className="shrink-0 rounded-brutal p-0.5 text-muted-foreground transition-colors hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </header>

      {item.agenda && (
        <>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <GameIcon game={item.agenda.game} className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate" title={item.agenda.title}>
              {item.agenda.title}
            </span>
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <div className="flex -space-x-1.5">
              {item.agenda.going.slice(0, 5).map((id) => {
                const m = byId[id]
                return (
                  <UserAvatar
                    key={id}
                    userId={id}
                    src={resolveAssetUrl(m?.avatar)}
                    name={m?.displayName ?? '?'}
                    ringColor={m?.profileColor}
                    className="h-5 w-5 border-2 border-void"
                  />
                )
              })}
            </div>
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
              {autorNome} marcou · {item.agenda.going.length} {item.agenda.going.length === 1 ? 'vai' : 'vão'}
              {item.agenda.maybe.length > 0 && `, ${item.agenda.maybe.length} talvez`}
            </span>
          </div>
          {!compact && item.agenda.note && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.agenda.note}</p>
          )}
          <div className="mt-2 flex gap-1">
            {RSVP.map((r) => (
              <button
                key={r.status}
                type="button"
                disabled={busy}
                onClick={() => void responder(() => eventsApi.rsvp(token!, item.refId, r.status))}
                className={cn(
                  'flex-1 rounded-brutal border px-1.5 py-1 font-mono text-[11.5px] uppercase tracking-widest transition-colors disabled:opacity-50',
                  r.className
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </>
      )}

      {item.enquete && (
        <>
          <p className="mt-1 text-sm font-medium text-foreground">{item.enquete.question}</p>
          <p className="text-[11.5px] text-muted-foreground">
            de {autorNome} · {item.enquete.voters} {item.enquete.voters === 1 ? 'votou' : 'votaram'}
            {item.enquete.type === 'multiple' && ' · dá pra marcar mais no chat'}
          </p>
          <div className="mt-2 flex flex-col gap-1">
            {item.enquete.options.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={busy}
                onClick={() => void responder(() => pollsApi.vote(token!, item.refId, o.id))}
                className="flex items-center gap-2 rounded-brutal border border-line px-2 py-1 text-left text-xs text-foreground transition-colors hover:border-acid hover:bg-acid/10 disabled:opacity-50"
              >
                {o.emoji && <span aria-hidden>{o.emoji}</span>}
                <span className="min-w-0 flex-1 truncate">{o.text}</span>
                {!item.enquete!.isAnonymous && o.votes > 0 && (
                  <span className="font-mono text-[11px] text-muted-foreground">{o.votes}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {item.clipe && (
        <>
          <p className="mt-1 truncate text-sm font-medium text-foreground" title={item.clipe.title}>
            {item.clipe.title}
          </p>
          <p className="text-[11.5px] text-muted-foreground">
            {autorNome} clipou a call
            {user && item.clipe.participants.includes(user.id) && ' · você está nele'}
          </p>
          {resolveAssetUrl(item.clipe.url) && (
            <div className="mt-1.5">
              <ClipPlayer
                src={resolveAssetUrl(item.clipe.url)!}
                durationMs={item.clipe.durationMs}
                compact
                onFirstPlay={() => token && void clipsApi.countPlay(token, item.refId)}
              />
            </div>
          )}
          {item.messageId && (
            <div className="mt-2 flex gap-1">
              {REACOES.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  disabled={busy}
                  onClick={() => void responder(() => messagesApi.react(token!, item.messageId!, emoji))}
                  aria-label={`Reagir com ${emoji}`}
                  className="flex-1 rounded-brutal border border-line py-1 text-base leading-none transition-colors hover:border-acid hover:bg-acid/10 disabled:opacity-50"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <footer className="mt-1.5 flex items-center gap-2">
        {busy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {error && <span className="min-w-0 flex-1 truncate text-[11.5px] text-destructive">{error}</span>}
        <span className="flex-1" />
        {item.channelId && (
          <button
            type="button"
            onClick={verNoChat}
            className="shrink-0 text-[11px] text-muted-foreground transition-colors hover:text-acid"
          >
            ver no chat
          </button>
        )}
      </footer>
    </article>
  )
}
