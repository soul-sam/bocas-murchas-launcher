import * as React from 'react'
import { Bug, ChevronDown, Lightbulb, Loader2, ThumbsUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  suggestions as suggestionsApi,
  KIND_LABEL,
  STATUS_HINT,
  STATUS_LABEL,
  type Suggestion,
  type SuggestionCardMeta,
  type SuggestionStatus
} from '@/lib/api-suggestions'
import { useAuth } from '@/lib/auth-context'
import { useSocket } from '@/lib/socket-context'
import { Hint } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { CardProps } from './index'
import { CardFrame } from './index'

/**
 * CARTÃO DE SUGESTÃO.
 *
 * Mesma divisão da enquete: o `metadata` é um RETRATO (título, tipo, status do
 * dia em que foi postada) e serve pra desenhar o card no primeiro quadro, sem
 * rede. A verdade — quantos votos, se EU votei, o status de agora — vem de
 * GET /suggestions/:id logo depois e muda ao vivo pelos eventos.
 *
 * O botão de voto é o coração disso: é ele que transforma "fulano pediu" em
 * "sete pessoas querem", que é a única informação que ajuda quem vai decidir o
 * que fazer no fim de semana.
 */

/** Cor e ícone por status. Feita é verde, recusada é apagada, o resto é âmbar. */
const STATUS_STYLE: Record<SuggestionStatus, string> = {
  aberta: 'border-line-strong text-muted-foreground',
  planejada: 'border-burn/50 text-burn',
  feita: 'border-acid/50 text-acid-text',
  recusada: 'border-line text-muted-foreground line-through'
}

export function SuggestionCard({ metadata, compact }: CardProps<SuggestionCardMeta>) {
  const { token, user } = useAuth()
  const { socket } = useSocket()

  const suggestionId = metadata.suggestionId

  const [live, setLive] = React.useState<Suggestion | null>(null)
  const [voting, setVoting] = React.useState(false)
  const [deleted, setDeleted] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    if (!token || !suggestionId) return
    try {
      setLive(await suggestionsApi.get(token, suggestionId))
    } catch {
      // Sugestão apagada, ou servidor antigo: o card cai pro retrato do
      // metadata em vez de sumir da conversa.
    }
  }, [token, suggestionId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  /**
   * Os eventos são globais (todo mundo recebe todos), então cada card filtra
   * pelo seu id. É o mesmo desenho do cartão de enquete.
   */
  React.useEffect(() => {
    if (!socket) return

    const onVoted = (data: { suggestionId: string; votes: number; userId: string; voted: boolean }): void => {
      if (data.suggestionId !== suggestionId) return
      setLive((prev) =>
        prev
          ? {
              ...prev,
              votes: data.votes,
              votedByMe: data.userId === user?.id ? data.voted : prev.votedByMe
            }
          : prev
      )
    }

    const onUpdated = (data: { suggestion: Suggestion }): void => {
      if (data.suggestion.id !== suggestionId) return
      // `votedByMe` vem de quem fez a mudança (um admin), não de mim.
      setLive((prev) => ({ ...data.suggestion, votedByMe: prev?.votedByMe ?? false }))
    }

    const onDeleted = (data: { suggestionId: string }): void => {
      if (data.suggestionId === suggestionId) setDeleted(true)
    }

    socket.on('suggestionVoted', onVoted)
    socket.on('suggestionUpdated', onUpdated)
    socket.on('suggestionDeleted', onDeleted)
    return () => {
      socket.off('suggestionVoted', onVoted)
      socket.off('suggestionUpdated', onUpdated)
      socket.off('suggestionDeleted', onDeleted)
    }
  }, [socket, suggestionId, user?.id])

  const status = live?.status ?? metadata.status ?? 'aberta'
  const kind = live?.kind ?? metadata.kind ?? 'ideia'
  const title = live?.title ?? metadata.title
  const resolved = status === 'feita' || status === 'recusada'
  const isAdmin = user?.role === 'admin'

  const vote = async (): Promise<void> => {
    if (!token || voting || resolved) return
    setVoting(true)
    setError(null)
    try {
      const result = await suggestionsApi.vote(token, suggestionId)
      setLive((prev) => (prev ? { ...prev, ...result } : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui registrar o voto')
    } finally {
      setVoting(false)
    }
  }

  const changeStatus = async (next: SuggestionStatus): Promise<void> => {
    if (!token) return
    try {
      const updated = await suggestionsApi.setStatus(token, suggestionId, { status: next })
      setLive((prev) => ({ ...updated, votedByMe: prev?.votedByMe ?? updated.votedByMe }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui mudar o status')
    }
  }

  if (deleted) {
    return (
      <CardFrame accent="muted" title="Sugestão">
        <p className="text-xs text-muted-foreground">Essa sugestão foi apagada.</p>
      </CardFrame>
    )
  }

  return (
    <CardFrame
      accent={status === 'feita' ? 'acid' : status === 'planejada' ? 'burn' : 'muted'}
      icon={
        kind === 'bug' ? <Bug className="h-3.5 w-3.5" /> : <Lightbulb className="h-3.5 w-3.5" />
      }
      title={KIND_LABEL[kind]}
      footer={
        live?.appVersion && kind === 'bug' ? `relatado na versão ${live.appVersion}` : undefined
      }
    >
      <div className="flex items-start gap-2.5">
        {/* O VOTO fica à esquerda e é a coisa mais alta do card: é o único
            gesto que a maioria das pessoas vai fazer aqui. */}
        <Hint
          label={
            resolved
              ? 'Essa já foi resolvida'
              : live?.votedByMe
                ? 'Tirar meu voto'
                : 'Também quero isso'
          }
          side="top"
        >
          <button
            type="button"
            onClick={() => void vote()}
            disabled={voting || resolved || !live}
            className={cn(
              'flex w-12 shrink-0 flex-col items-center gap-0.5 rounded-brutal border px-1 py-1.5 transition-colors',
              live?.votedByMe
                ? 'border-acid/60 bg-acid/10 text-acid'
                : 'border-line text-muted-foreground hover:border-acid/50 hover:text-foreground',
              (resolved || !live) && 'cursor-not-allowed opacity-50'
            )}
          >
            {voting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ThumbsUp className="h-3.5 w-3.5" />
            )}
            {/* tabular-nums: a contagem muda ao vivo, e sem isso a largura do
                número dança a cada voto. */}
            <span className="font-mono text-[11.5px] tabular-nums">{live?.votes ?? '—'}</span>
          </button>
        </Hint>

        <div className="min-w-0 flex-1">
          <p className={cn('text-sm leading-snug', status === 'recusada' && 'text-muted-foreground')}>
            {title}
          </p>

          {!compact && live?.detail && (
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {live.detail}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {isAdmin ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'flex items-center gap-1 rounded-brutal border px-1.5 py-0.5 text-[11px] transition-colors hover:border-acid/50',
                      STATUS_STYLE[status]
                    )}
                  >
                    {STATUS_LABEL[status]}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>Mudar o status</DropdownMenuLabel>
                  {(Object.keys(STATUS_LABEL) as SuggestionStatus[]).map((option) => (
                    <DropdownMenuItem
                      key={option}
                      onSelect={() => void changeStatus(option)}
                      className="flex-col items-start gap-0"
                    >
                      <span>{STATUS_LABEL[option]}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {STATUS_HINT[option]}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Hint label={STATUS_LABEL[status]} description={STATUS_HINT[status]} side="top">
                <span
                  className={cn(
                    'cursor-help rounded-brutal border px-1.5 py-0.5 text-[11px]',
                    STATUS_STYLE[status]
                  )}
                >
                  {STATUS_LABEL[status]}
                </span>
              </Hint>
            )}

            {live?.resolution && (
              <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                — {live.resolution}
              </span>
            )}
          </div>

          {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
        </div>
      </div>
    </CardFrame>
  )
}
