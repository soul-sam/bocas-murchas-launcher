import * as React from 'react'
import { BarChart3, Check, Clock, EyeOff, ListChecks, Loader2, Lock } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { ApiError, resolveAssetUrl } from '@/lib/api'
import {
  polls as pollsApi,
  optionVotes,
  type Poll,
  type PollPerson,
  type PollType
} from '@/lib/api-polls'
import { useAuth } from '@/lib/auth-context'
import { useSocket } from '@/lib/socket-context'
import { useMembers } from '@/lib/members-context'
import type { CardProps } from './index'
import { CardFrame } from './index'

/**
 * CARTÃO DE ENQUETE.
 *
 * O metadata é um RETRATO tirado na criação: pergunta, opções, prazo, autor.
 * Dá pra desenhar o card inteiro com ele, sem esperar rede — quem abre o
 * canal vê a enquete na hora. Votos e quem votou vêm de GET /polls/:id logo
 * depois, e mudam ao vivo pelos eventos `pollVoted`/`pollClosed`/`pollDeleted`
 * (globais, filtrados aqui pelo pollId). Encerrar também grava `closed` no
 * metadata, então até sem socket o card fechado aparece fechado.
 */
export interface PollCardMetadata {
  pollId: string
  question: string
  type: PollType
  isAnonymous: boolean
  /** ISO ou null (sem prazo). */
  endsAt: string | null
  createdById: string
  options: Array<{ id: string; text: string; emoji: string | null }>
  /** Gravado pelo servidor ao encerrar. */
  closed?: boolean
  closedAt?: string
}

/** Quantos avatares mostrar por opção antes de virar "+N". */
const MAX_VOTER_AVATARS = 5

/** "termina em 2h 05min", "termina em 3 dias", "termina em 40s". */
function formatTimeLeft(ms: number): string {
  if (ms <= 0) return 'encerrada'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `termina em ${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `termina em ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rest = minutes % 60
    return `termina em ${hours}h${rest > 0 ? ` ${String(rest).padStart(2, '0')}min` : ''}`
  }
  const days = Math.floor(hours / 24)
  return `termina em ${days} ${days === 1 ? 'dia' : 'dias'}`
}

export function PollCard({ metadata, compact }: CardProps<PollCardMetadata>) {
  const { token, user } = useAuth()
  const { socket } = useSocket()
  const { byId } = useMembers()

  const pollId = metadata.pollId

  /** A enquete "de verdade", com votos. Nula até a primeira busca. */
  const [live, setLive] = React.useState<Poll | null>(null)
  /** Onde EU votei. */
  const [mine, setMine] = React.useState<string[]>([])
  const [closedLive, setClosedLive] = React.useState(false)
  const [deleted, setDeleted] = React.useState(false)
  const [busyOption, setBusyOption] = React.useState<string | null>(null)
  const [closing, setClosing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [now, setNow] = React.useState(() => Date.now())

  const refresh = React.useCallback(async () => {
    if (!token || !pollId) return
    try {
      const detail = await pollsApi.get(token, pollId)
      setLive(detail.poll)
      setMine(detail.userVotedOptionIds)
      if (!detail.poll.isActive) setClosedLive(true)
    } catch (err) {
      // 404 = apagaram a enquete e o card ficou pra trás (histórico antigo).
      if (err instanceof ApiError && err.status === 404) setDeleted(true)
    }
  }, [token, pollId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  // --- tempo real ---------------------------------------------------------
  React.useEffect(() => {
    if (!socket || !pollId) return

    const handleVoted = (data: { pollId: string; poll?: Poll | null }): void => {
      if (data?.pollId !== pollId) return
      // As contagens do evento entram na hora; quem votou (avatar) e o meu
      // próprio voto vêm da busca logo atrás.
      const incoming = data.poll
      if (incoming) {
        setLive((prev) =>
          prev ? { ...prev, ...incoming, options: mergeOptions(prev, incoming) } : incoming
        )
      }
      void refresh()
    }

    const handleClosed = (data: { poll?: { id: string } }): void => {
      if (data?.poll?.id !== pollId) return
      setClosedLive(true)
      void refresh()
    }

    const handleDeleted = (data: { pollId: string }): void => {
      if (data?.pollId !== pollId) return
      setDeleted(true)
    }

    socket.on('pollVoted', handleVoted)
    socket.on('pollClosed', handleClosed)
    socket.on('pollDeleted', handleDeleted)
    return () => {
      socket.off('pollVoted', handleVoted)
      socket.off('pollClosed', handleClosed)
      socket.off('pollDeleted', handleDeleted)
    }
  }, [socket, pollId, refresh])

  // --- prazo ----------------------------------------------------------------
  const endsAtMs = React.useMemo(() => {
    const raw = live?.endsAt ?? metadata.endsAt
    if (!raw) return null
    const value = new Date(raw).getTime()
    return Number.isNaN(value) ? null : value
  }, [live?.endsAt, metadata.endsAt])

  const expired = endsAtMs !== null && endsAtMs <= now
  const closed = !!metadata.closed || closedLive || live?.isActive === false || expired

  React.useEffect(() => {
    if (endsAtMs === null || closed) return
    // Perto do fim a contagem anda por segundo; longe, de meio em meio minuto
    // basta — dezenas de cards no canal não precisam re-renderizar à toa.
    const left = endsAtMs - Date.now()
    const interval = left < 90_000 ? 1_000 : 30_000
    const timer = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(timer)
  }, [endsAtMs, closed])

  // --- dados desenháveis -----------------------------------------------------
  const options = React.useMemo(() => {
    // A ordem e o texto vêm do retrato; a contagem e os votantes da busca.
    const liveById = new Map((live?.options ?? []).map((option) => [option.id, option]))
    const base = metadata.options?.length
      ? metadata.options
      : (live?.options ?? []).map((o) => ({ id: o.id, text: o.text, emoji: o.emoji ?? null }))

    return base.map((option) => {
      const fresh = liveById.get(option.id)
      const voters: PollPerson[] = (fresh?.votes ?? []).map((vote) => {
        const member = byId[vote.userId]
        return member
          ? { id: member.id, displayName: member.displayName, avatar: member.avatar }
          : vote.user ?? { id: vote.userId, displayName: '?' }
      })
      return {
        ...option,
        count: fresh ? optionVotes(fresh) : 0,
        voters
      }
    })
  }, [metadata.options, live, byId])

  const total = options.reduce((sum, option) => sum + option.count, 0)
  const leaderCount = options.reduce((max, option) => Math.max(max, option.count), 0)

  const isAnonymous = live?.isAnonymous ?? metadata.isAnonymous
  const type: PollType = live?.type ?? metadata.type ?? 'single'
  const createdById = live?.createdById ?? metadata.createdById
  const canClose = !closed && !!user && (user.id === createdById || user.role === 'admin')

  // --- ações -------------------------------------------------------------------
  const vote = async (optionId: string): Promise<void> => {
    if (!token || closed || busyOption || deleted) return

    setBusyOption(optionId)
    setError(null)

    // Otimista: a barra mexe no clique, a resposta do servidor só confirma.
    const previousMine = mine
    const previousLive = live
    const willRemove = mine.includes(optionId)
    const nextMine = willRemove
      ? mine.filter((id) => id !== optionId)
      : type === 'single'
        ? [optionId]
        : [...mine, optionId]
    setMine(nextMine)
    const meId = user?.id
    setLive((prev) => (prev && meId ? applyLocalVote(prev, previousMine, nextMine, meId) : prev))

    try {
      await pollsApi.vote(token, pollId, optionId)
      await refresh()
    } catch (err) {
      setMine(previousMine)
      setLive(previousLive)
      setError(err instanceof Error ? err.message : 'Não deu pra votar')
      void refresh()
    } finally {
      setBusyOption(null)
    }
  }

  const close = async (): Promise<void> => {
    if (!token || !canClose || closing) return
    setClosing(true)
    setError(null)
    try {
      await pollsApi.close(token, pollId)
      setClosedLive(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra encerrar')
    } finally {
      setClosing(false)
    }
  }

  // --- render --------------------------------------------------------------------
  if (deleted) {
    return (
      <CardFrame accent="muted" title="Enquete" icon={<BarChart3 className="h-3.5 w-3.5" />}>
        <p className="text-xs italic text-muted-foreground">Essa enquete foi apagada.</p>
      </CardFrame>
    )
  }

  const kindLabel = type === 'multiple' ? 'várias respostas' : 'uma resposta'

  return (
    <CardFrame
      accent={closed ? 'muted' : 'acid'}
      icon={<BarChart3 className="h-3.5 w-3.5" />}
      title={
        <span className="flex items-center gap-1.5">
          Enquete · {kindLabel}
          {isAnonymous && (
            <span className="flex items-center gap-0.5" title="Ninguém vê quem votou em quê">
              · <EyeOff className="h-3 w-3" /> anônima
            </span>
          )}
        </span>
      }
      footer={
        <div className="flex items-center gap-2">
          <span className="truncate">
            {total} {total === 1 ? 'voto' : 'votos'}
            {closed ? (
              <span className="ml-2 inline-flex items-center gap-1 text-burn">
                <Lock className="h-3 w-3" /> Encerrada
              </span>
            ) : endsAtMs !== null ? (
              <span className="ml-2 inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {formatTimeLeft(endsAtMs - now)}
              </span>
            ) : null}
          </span>

          {canClose && (
            <button
              type="button"
              onClick={() => void close()}
              disabled={closing}
              title="Encerrar a enquete pra todo mundo"
              className="ml-auto shrink-0 rounded-brutal border border-line-strong px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-burn hover:text-burn disabled:opacity-50"
            >
              {closing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'encerrar'}
            </button>
          )}
        </div>
      }
    >
      <p
        className={cn(
          'mb-2 font-display leading-tight text-dirty-white',
          compact ? 'text-sm' : 'text-base'
        )}
      >
        {live?.question ?? metadata.question}
      </p>

      <ul className="space-y-1">
        {options.map((option) => {
          const selected = mine.includes(option.id)
          const percent = total > 0 ? Math.round((option.count / total) * 100) : 0
          const leading = closed && option.count > 0 && option.count === leaderCount
          const busy = busyOption === option.id

          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => void vote(option.id)}
                disabled={closed || !!busyOption}
                title={
                  closed
                    ? 'Enquete encerrada'
                    : selected
                      ? 'Tirar meu voto'
                      : type === 'single'
                        ? 'Votar nesta'
                        : 'Marcar esta também'
                }
                className={cn(
                  'relative w-full overflow-hidden rounded-brutal border text-left transition-colors',
                  compact ? 'px-2 py-1' : 'px-2.5 py-1.5',
                  selected
                    ? 'border-acid bg-acid/5'
                    : leading
                      ? 'border-burn/60'
                      : 'border-line hover:border-acid/50',
                  closed ? 'cursor-default' : 'cursor-pointer'
                )}
              >
                {/* A barra é o fundo do botão: cresce da esquerda com o %. */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-y-0 left-0 transition-[width] duration-500 ease-out motion-reduce:transition-none',
                    selected ? 'bg-acid/20' : leading ? 'bg-burn/15' : 'bg-acid/10'
                  )}
                  style={{ width: `${percent}%` }}
                />

                <span className="relative flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-brutal border',
                      type === 'single' ? 'rounded-full' : '',
                      selected ? 'border-acid bg-acid text-void' : 'border-line-strong'
                    )}
                  >
                    {busy ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
                    ) : selected ? (
                      <Check className="h-3 w-3" strokeWidth={3} />
                    ) : null}
                  </span>

                  {option.emoji && (
                    <span className="shrink-0 text-base leading-none">{option.emoji}</span>
                  )}

                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {option.text}
                  </span>

                  {!isAnonymous && option.voters.length > 0 && (
                    <VoterStack voters={option.voters} />
                  )}

                  <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-muted-foreground">
                    <span className={cn(selected && 'text-acid', leading && 'text-burn')}>
                      {percent}%
                    </span>
                    <span className="ml-1 opacity-70">({option.count})</span>
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {type === 'multiple' && !closed && (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <ListChecks className="h-3 w-3" /> pode marcar mais de uma
        </p>
      )}

      {error && <p className="mt-1.5 text-[11px] text-destructive">{error}</p>}
    </CardFrame>
  )
}

/** Avatares de quem votou na opção, empilhados; o resto vira "+N". */
function VoterStack({ voters }: { voters: PollPerson[] }) {
  const shown = voters.slice(0, MAX_VOTER_AVATARS)
  const rest = voters.length - shown.length
  const names = voters.map((v) => v.displayName).join(', ')

  return (
    <span className="flex shrink-0 items-center -space-x-1.5" title={names}>
      {shown.map((voter) => (
        <UserAvatar
          key={voter.id}
          src={resolveAssetUrl(voter.avatar)}
          name={voter.displayName}
          className="h-4 w-4 border-void text-[11px]"
        />
      ))}
      {rest > 0 && (
        <span className="ml-1 rounded-brutal bg-void px-1 font-mono text-[11px] text-muted-foreground">
          +{rest}
        </span>
      )}
    </span>
  )
}

/**
 * Contagens novas do evento por cima das opções que já tínhamos — sem perder
 * a lista de votantes, que o evento não traz.
 */
function mergeOptions(previous: Poll, incoming: Poll): Poll['options'] {
  const byId = new Map(incoming.options.map((option) => [option.id, option]))
  return previous.options.map((option) => {
    const fresh = byId.get(option.id)
    if (!fresh) return option
    return { ...option, voteCount: optionVotes(fresh), _count: fresh._count }
  })
}

/**
 * Aplica o meu clique localmente: soma onde entrei, subtrai de onde saí, e
 * me põe/tira da lista de votantes pra o avatar aparecer junto com a barra.
 * O servidor confirma (ou corrige) na busca que vem logo atrás.
 */
function applyLocalVote(poll: Poll, before: string[], after: string[], meId: string): Poll {
  const removed = before.filter((id) => !after.includes(id))
  const added = after.filter((id) => !before.includes(id))

  return {
    ...poll,
    options: poll.options.map((option) => {
      let count = optionVotes(option)
      let votes = option.votes
      if (removed.includes(option.id)) {
        count = Math.max(0, count - 1)
        votes = votes?.filter((vote) => vote.userId !== meId)
      }
      if (added.includes(option.id)) {
        count += 1
        if (votes && !poll.isAnonymous && !votes.some((vote) => vote.userId === meId)) {
          votes = [...votes, { id: `local:${option.id}`, userId: meId, optionId: option.id }]
        }
      }
      return { ...option, voteCount: count, votes }
    })
  }
}
