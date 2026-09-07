import * as React from 'react'
import { Bug, Lightbulb, Loader2, Plus, ThumbsUp, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  suggestions as suggestionsApi,
  STATUS_HINT,
  STATUS_LABEL,
  type Suggestion,
  type SuggestionStatus
} from '@/lib/api-suggestions'
import { useAuth } from '@/lib/auth-context'
import { useLayout } from '@/lib/layout-context'
import { useOverlays } from '@/lib/overlay-context'
import { useSocket } from '@/lib/socket-context'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/ui/tooltip'

/**
 * O QUADRO — todas as sugestões, ordenadas por voto.
 *
 * O card no chat mostra UMA sugestão no meio da conversa; este painel responde
 * a pergunta que o chat não responde: "o que a galera mais quer?". É a lista
 * inteira, do mais votado pro menos, com filtro por status.
 *
 * Por que ordenar por voto e não por data: a fila do que fazer não é a ordem
 * em que as coisas foram pedidas. Sugestão de três meses atrás com nove votos
 * vale mais do que a de ontem com um.
 *
 * A lista é buscada no SERVIDOR a cada troca de filtro (e não filtrada em
 * memória) pelo mesmo motivo do painel de achados: o cliente não tem tudo.
 */

const FILTERS: Array<{ id: SuggestionStatus | 'todas'; label: string }> = [
  { id: 'todas', label: 'Tudo' },
  { id: 'aberta', label: 'Abertas' },
  { id: 'planejada', label: 'Planejadas' },
  { id: 'feita', label: 'Feitas' }
]

export function SuggestionsPanel() {
  const { token, user } = useAuth()
  const { socket } = useSocket()
  const { closeSuggestions } = useLayout()
  const { openSuggestionComposer } = useOverlays()

  const [filter, setFilter] = React.useState<SuggestionStatus | 'todas'>('aberta')
  const [items, setItems] = React.useState<Suggestion[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [voting, setVoting] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      setItems(
        await suggestionsApi.list(token, {
          status: filter === 'todas' ? undefined : filter,
          sort: 'votadas'
        })
      )
    } catch {
      setError('Não consegui carregar o quadro')
    } finally {
      setLoading(false)
    }
  }, [token, filter])

  React.useEffect(() => {
    void load()
  }, [load])

  /**
   * Ao vivo: voto novo mexe só na contagem (reordenar embaixo do dedo de quem
   * está lendo seria pior que a lista ficar um instante fora de ordem);
   * sugestão nova ou status trocado recarrega, porque os dois podem mudar
   * quem entra e quem sai do filtro aberto.
   */
  React.useEffect(() => {
    if (!socket) return

    const onVoted = (data: { suggestionId: string; votes: number; userId: string; voted: boolean }): void => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === data.suggestionId
            ? {
                ...item,
                votes: data.votes,
                votedByMe: data.userId === user?.id ? data.voted : item.votedByMe
              }
            : item
        )
      )
    }

    const reload = (): void => void load()

    socket.on('suggestionVoted', onVoted)
    socket.on('suggestionCreated', reload)
    socket.on('suggestionUpdated', reload)
    socket.on('suggestionDeleted', reload)
    return () => {
      socket.off('suggestionVoted', onVoted)
      socket.off('suggestionCreated', reload)
      socket.off('suggestionUpdated', reload)
      socket.off('suggestionDeleted', reload)
    }
  }, [socket, load, user?.id])

  const vote = async (id: string): Promise<void> => {
    if (!token || voting) return
    setVoting(id)
    try {
      const result = await suggestionsApi.vote(token, id)
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...result } : item)))
    } catch {
      // O erro do servidor ("essa já foi resolvida") não vale um alerta no
      // painel: o botão volta ao normal e o estado continua honesto.
    } finally {
      setVoting(null)
    }
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-void">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <Lightbulb className="h-3.5 w-3.5 shrink-0 text-burn" />
        <h3 className="flex-1 truncate font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
          Sugestões
        </h3>
        <Hint label="Fechar o quadro" side="left">
          <button
            type="button"
            onClick={closeSuggestions}
            aria-label="Fechar sugestões"
            className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </Hint>
      </header>

      <div className="flex shrink-0 gap-1 border-b border-line px-2 py-1.5">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setFilter(option.id)}
            className={cn(
              'rounded-brutal px-1.5 py-0.5 text-[11px] transition-colors',
              filter === option.id
                ? 'bg-acid/10 text-acid'
                : 'text-muted-foreground hover:bg-void-light hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="scroll-stable min-h-0 flex-1 overflow-y-auto p-2">
        {loading && items.length === 0 ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="px-2 py-8 text-center text-xs text-destructive">{error}</p>
        ) : items.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs leading-relaxed text-muted-foreground">
            {filter === 'aberta'
              ? 'Nenhuma sugestão aberta. Ou está tudo perfeito, ou ninguém falou nada.'
              : 'Nada aqui ainda.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => {
              const resolved = item.status === 'feita' || item.status === 'recusada'

              return (
                <li key={item.id}>
                  <div className="flex items-start gap-2 rounded-brutal border border-line p-1.5 transition-colors hover:border-line-strong">
                    <Hint
                      label={
                        resolved
                          ? STATUS_LABEL[item.status]
                          : item.votedByMe
                            ? 'Tirar meu voto'
                            : 'Também quero'
                      }
                      description={resolved ? STATUS_HINT[item.status] : undefined}
                      side="left"
                    >
                      <button
                        type="button"
                        onClick={() => void vote(item.id)}
                        disabled={resolved || voting === item.id}
                        className={cn(
                          'flex w-9 shrink-0 flex-col items-center rounded-brutal border px-0.5 py-1 transition-colors',
                          item.votedByMe
                            ? 'border-acid/60 bg-acid/10 text-acid'
                            : 'border-line text-muted-foreground hover:border-acid/50 hover:text-foreground',
                          resolved && 'cursor-not-allowed opacity-50'
                        )}
                      >
                        <ThumbsUp className="h-3 w-3" />
                        {/* tabular-nums: a contagem muda ao vivo e sem isso a
                            coluna inteira dança a cada voto. */}
                        <span className="font-mono text-[11px] tabular-nums">{item.votes}</span>
                      </button>
                    </Hint>

                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'text-[12px] leading-snug',
                          item.status === 'recusada' && 'text-muted-foreground line-through'
                        )}
                      >
                        {item.title}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        {item.kind === 'bug' ? (
                          <Bug className="h-2.5 w-2.5 shrink-0" />
                        ) : (
                          <Lightbulb className="h-2.5 w-2.5 shrink-0" />
                        )}
                        <span className="truncate">{item.createdBy.displayName}</span>
                        {item.status !== 'aberta' && (
                          <span
                            className={cn(
                              'ml-auto shrink-0 rounded-[2px] border px-1',
                              item.status === 'feita'
                                ? 'border-acid/50 text-acid-text'
                                : item.status === 'planejada'
                                  ? 'border-burn/50 text-burn'
                                  : 'border-line'
                            )}
                          >
                            {STATUS_LABEL[item.status]}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-line p-2">
        <Button size="sm" className="w-full" onClick={openSuggestionComposer}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nova sugestão
        </Button>
      </div>
    </aside>
  )
}
