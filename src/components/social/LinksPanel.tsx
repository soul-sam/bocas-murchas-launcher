import * as React from 'react'
import { Filter, Link2, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { links as linksApi, type LinkKind, type SharedLink } from '@/lib/api-links'
import { useAuth } from '@/lib/auth-context'
import { useChat, isDmId } from '@/lib/chat-context'
import { useLayout } from '@/lib/layout-context'
import { useSocket } from '@/lib/socket-context'
import { LinkCard } from './LinkCard'

/**
 * ACHADOS — quadro dos links colados no chat.
 *
 * Todo link postado em canal vira um card aqui (o servidor extrai, classifica
 * e busca a prévia). O painel só lista: filtra por canal/tipo/texto no
 * SERVIDOR — o cliente tem 50 mensagens de cada canal em memória, então
 * vasculhar a lista local acharia quase nada e mentiria "nenhum achado".
 *
 * Escopo padrão é o canal aberto (é o que se quer 9 em 10 vezes), com um
 * botão pra abrir pra tudo. Em conversa direta não existe achado (DM é
 * privado), então ali o painel já abre em "tudo".
 *
 * Uma requisição por mudança: escopo, filtro e busca (com debounce) entram
 * na mesma chave de consulta, e trocar qualquer um recomeça do topo.
 */

type Filter = 'all' | 'video' | 'shop' | 'other'

const FILTERS: { id: Filter; label: string; kinds?: LinkKind[] }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'video', label: 'Vídeos', kinds: ['video'] },
  { id: 'shop', label: 'Compras', kinds: ['shop'] },
  // "Outros" é tudo que não é vídeo nem compra — o servidor aceita a lista.
  { id: 'other', label: 'Outros', kinds: ['image', 'article', 'other'] }
]

const PAGE_SIZE = 30
const DEBOUNCE_MS = 300
/** A quantos px do fim começamos a puxar a próxima página. */
const LOAD_MORE_THRESHOLD = 240

export function LinksPanel() {
  const { token, user } = useAuth()
  const { socket } = useSocket()
  const { activeChannelId, activeChannel, setActiveChannel } = useChat()
  const { closeLinks } = useLayout()

  const [onlyThisChannel, setOnlyThisChannel] = React.useState(true)
  const [filter, setFilter] = React.useState<Filter>('all')
  const [term, setTerm] = React.useState('')
  const [query, setQuery] = React.useState('')

  const [items, setItems] = React.useState<SharedLink[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [hasMore, setHasMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const listRef = React.useRef<HTMLDivElement>(null)
  /** Descarta resposta atrasada de uma consulta que já mudou. */
  const requestSeq = React.useRef(0)

  const canScope = !!activeChannelId && !isDmId(activeChannelId)
  const scoped = onlyThisChannel && canScope
  const channelId = scoped ? activeChannelId! : undefined
  const kinds = FILTERS.find((f) => f.id === filter)?.kinds

  // Digitação → consulta, com pausa.
  React.useEffect(() => {
    const timer = setTimeout(() => setQuery(term.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [term])

  // Primeira página sempre que a consulta muda.
  React.useEffect(() => {
    if (!token) return
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)

    linksApi
      .list(token, { channelId, kind: kinds, q: query || undefined, limit: PAGE_SIZE })
      .then((page) => {
        if (seq !== requestSeq.current) return
        setItems(page)
        setHasMore(page.length >= PAGE_SIZE)
        if (listRef.current) listRef.current.scrollTop = 0
      })
      .catch((err) => {
        if (seq !== requestSeq.current) return
        setError(err instanceof Error ? err.message : 'Erro ao buscar achados')
        setItems([])
        setHasMore(false)
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false)
      })
    // `kinds` deriva de `filter`; a dependência é o filtro em si.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, channelId, filter, query])

  const loadMore = React.useCallback(async (): Promise<void> => {
    if (!token || loading || loadingMore || !hasMore || items.length === 0) return
    const seq = requestSeq.current
    setLoadingMore(true)
    try {
      const page = await linksApi.list(token, {
        channelId,
        kind: kinds,
        q: query || undefined,
        before: items[items.length - 1].createdAt,
        limit: PAGE_SIZE
      })
      if (seq !== requestSeq.current) return
      setItems((prev) => {
        const seen = new Set(prev.map((l) => l.id))
        return [...prev, ...page.filter((l) => !seen.has(l.id))]
      })
      setHasMore(page.length >= PAGE_SIZE)
    } catch {
      if (seq === requestSeq.current) setHasMore(false)
    } finally {
      if (seq === requestSeq.current) setLoadingMore(false)
    }
  }, [token, loading, loadingMore, hasMore, items, channelId, kinds, query])

  const onScroll = (event: React.UIEvent<HTMLDivElement>): void => {
    const el = event.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < LOAD_MORE_THRESHOLD) void loadMore()
  }

  /**
   * Chegou link novo enquanto o painel está aberto.
   *
   * Só entra se passaria na consulta atual — senão o card aparece, a pessoa
   * rola, ele "some" na próxima página e parece bug.
   */
  React.useEffect(() => {
    if (!socket) return

    const matches = (link: SharedLink): boolean => {
      if (channelId && link.channelId !== channelId) return false
      if (kinds && !kinds.includes(link.kind)) return false
      if (query) {
        const needle = query.toLowerCase()
        const haystack = `${link.title ?? ''} ${link.url} ${link.domain}`.toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    }

    const handleCreated = ({ link }: { link: SharedLink }): void => {
      if (!link || !matches(link)) return
      setItems((prev) => (prev.some((l) => l.id === link.id) ? prev : [link, ...prev]))
    }

    const handleDeleted = ({ id }: { id: string }): void => {
      setItems((prev) => prev.filter((l) => l.id !== id))
    }

    socket.on('link:created', handleCreated)
    socket.on('link:deleted', handleDeleted)
    return () => {
      socket.off('link:created', handleCreated)
      socket.off('link:deleted', handleDeleted)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, channelId, filter, query])

  const patch = React.useCallback((id: string, changes: Partial<SharedLink>): void => {
    setItems((prev) => prev.map((l) => (l.id === id ? { ...l, ...changes } : l)))
  }, [])

  const removed = React.useCallback((id: string): void => {
    setItems((prev) => prev.filter((l) => l.id !== id))
  }, [])

  /**
   * Ir pra mensagem: troca de canal se preciso e tenta rolar até ela no
   * próximo frame. Se a mensagem não está carregada (é antiga), paramos por
   * aí — "carregar até achar" seria dezenas de requisições.
   */
  const jump = React.useCallback(
    (link: SharedLink): void => {
      if (!link.channelId) return
      if (link.channelId !== activeChannelId) setActiveChannel(link.channelId)
      requestAnimationFrame(() => {
        document
          .getElementById(`msg-${link.message.id}`)
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
    },
    [activeChannelId, setActiveChannel]
  )

  const isAdmin = user?.role === 'admin'

  const emptyMessage = (): React.ReactNode => {
    if (query) {
      return (
        <>
          Nada com “{query}”.
          {scoped && (
            <>
              <br />
              Tenta em todos os canais.
            </>
          )}
        </>
      )
    }
    if (filter !== 'all') {
      const label = FILTERS.find((f) => f.id === filter)?.label.toLowerCase()
      return `Nenhum achado em ${label} por aqui.`
    }
    if (scoped) {
      return (
        <>
          Nenhum link em #{activeChannel?.name} ainda.
          <br />
          Cola um no chat e ele aparece aqui.
        </>
      )
    }
    return 'Ninguém colou link ainda.'
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-[#1a1a1a] bg-[#0D0D0D] xl:w-80">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#1a1a1a] px-3">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-acid" />
        <h3 className="flex-1 truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Achados
        </h3>
        <button
          type="button"
          onClick={closeLinks}
          title="Fechar"
          aria-label="Fechar achados"
          className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-acid"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="shrink-0 space-y-2 border-b border-[#1a1a1a] p-2">
        <div className="flex items-center gap-2 rounded-brutal border-2 border-[#1a1a1a] bg-void px-2 transition-colors focus-within:border-acid/60">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeLinks()
            }}
            placeholder="Buscar nos achados"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && items.length > 0 && (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-acid" />
          )}
        </div>

        {canScope && (
          <button
            type="button"
            onClick={() => setOnlyThisChannel((prev) => !prev)}
            className={cn(
              'flex w-full items-center gap-1.5 rounded-brutal border px-2 py-1 text-left transition-colors',
              scoped
                ? 'border-acid/50 bg-acid/10 text-acid'
                : 'border-[#1a1a1a] text-muted-foreground hover:border-acid/40'
            )}
          >
            <Filter className="h-3 w-3 shrink-0" />
            <span className="truncate font-mono text-[10px] uppercase tracking-widest">
              {scoped ? `só em #${activeChannel?.name}` : 'em todos os canais'}
            </span>
          </button>
        )}

        <div className="flex gap-1">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              className={cn(
                'flex-1 rounded-brutal border px-1 py-1 font-mono text-[9px] uppercase tracking-widest transition-colors',
                filter === option.id
                  ? 'border-acid/50 bg-acid/10 text-acid'
                  : 'border-[#1a1a1a] text-muted-foreground hover:border-acid/40 hover:text-foreground'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && items.length === 0 ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-acid" />
          </div>
        ) : error ? (
          <p className="px-2 py-8 text-center text-xs text-destructive">{error}</p>
        ) : items.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs leading-relaxed text-muted-foreground">
            {emptyMessage()}
          </p>
        ) : (
          <div className="space-y-1.5">
            {items.map((link) => (
              <LinkCard
                key={link.id}
                link={link}
                canDelete={isAdmin || link.author.id === user?.id}
                onPatch={patch}
                onRemoved={removed}
                onJump={jump}
              />
            ))}
            {loadingMore && (
              <div className="flex h-10 items-center justify-center">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-acid" />
              </div>
            )}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <footer className="shrink-0 border-t border-[#1a1a1a] px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {items.length} {items.length === 1 ? 'achado' : 'achados'}
          {hasMore && ' · rola pra ver mais'}
        </footer>
      )}
    </aside>
  )
}
