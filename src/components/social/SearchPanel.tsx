import * as React from 'react'
import { Search, X, Loader2, Hash, MessageSquare, Filter } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { messages as messagesApi, resolveAssetUrl, type ChatMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useChat, isDmId, conversationIdOf } from '@/lib/chat-context'
import { useLayout } from '@/lib/layout-context'

/**
 * Busca no histórico (Ctrl+F).
 *
 * A busca é do SERVIDOR, não da lista em memória: o cliente só tem as últimas
 * 50 mensagens de cada canal aberto, então filtrar aqui acharia quase nada e
 * mentiria dizendo "nenhum resultado".
 *
 * O escopo padrão é o canal aberto — que é o que quase sempre se procura — com
 * um botão pra abrir pra tudo. Conversa direta de terceiro nunca aparece: o
 * recorte é feito no servidor a partir de quem você é.
 */

/** Espera a digitação parar antes de bater no servidor. */
const DEBOUNCE_MS = 350

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** Destaca o termo no trecho, sem HTML: o texto continua sendo texto. */
function Highlighted({ text, term }: { text: string; term: string }) {
  const parts = React.useMemo(() => {
    if (!term) return [text]
    const lower = text.toLowerCase()
    const needle = term.toLowerCase()
    const out: string[] = []

    let index = 0
    while (index < text.length) {
      const hit = lower.indexOf(needle, index)
      if (hit === -1) {
        out.push(text.slice(index))
        break
      }
      if (hit > index) out.push(text.slice(index, hit))
      out.push(text.slice(hit, hit + needle.length))
      index = hit + needle.length
    }

    return out
  }, [text, term])

  const needle = term.toLowerCase()

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === needle && needle ? (
          <mark key={index} className="rounded-[2px] bg-acid/25 px-0.5 text-acid">
            {part}
          </mark>
        ) : (
          <React.Fragment key={index}>{part}</React.Fragment>
        )
      )}
    </>
  )
}

export function SearchPanel() {
  const { token } = useAuth()
  const { activeChannel, activeChannelId, setActiveChannel, channels } = useChat()
  const { closeSearch } = useLayout()

  const [term, setTerm] = React.useState('')
  const [onlyThisChannel, setOnlyThisChannel] = React.useState(true)
  const [results, setResults] = React.useState<ChatMessage[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [searched, setSearched] = React.useState(false)

  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Conversa direta não entra no filtro "só neste canal": o parâmetro do
  // servidor é channelId, e conversa não é canal. Ali a busca é sempre geral.
  const canScope = !!activeChannelId && !isDmId(activeChannelId)
  const scoped = onlyThisChannel && canScope

  React.useEffect(() => {
    const needle = term.trim()

    if (needle.length < 2) {
      setResults([])
      setSearched(false)
      setError(null)
      return
    }

    let cancelled = false
    const timer = setTimeout(() => {
      setLoading(true)
      setError(null)

      messagesApi
        .search(token!, needle, scoped ? { channelId: activeChannelId! } : {})
        .then((found) => {
          if (cancelled) return
          setResults(found)
          setSearched(true)
        })
        .catch((err) => {
          if (cancelled) return
          setError(err instanceof Error ? err.message : 'Erro na busca')
          setResults([])
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [term, scoped, activeChannelId, token])

  /**
   * Levar até a mensagem.
   *
   * Se ela estiver no canal aberto e já carregada, rolamos até lá. Se estiver
   * em outro canal, trocamos de canal — mas NÃO prometemos rolar até ela: o
   * canal carrega só a última página, e "carregar até achar" pode ser dezenas
   * de requisições até uma mensagem de meses atrás.
   */
  const goTo = (message: ChatMessage): void => {
    const bucket = message.conversationId
      ? 'dm:' + message.conversationId
      : (message.channelId ?? null)

    if (bucket && bucket !== activeChannelId) {
      setActiveChannel(bucket)
      return
    }

    const target = document.getElementById(`msg-${message.id}`)
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  const whereOf = (message: ChatMessage): string => {
    if (message.conversationId) return 'conversa'
    const name =
      message.channel?.name ?? channels.find((c) => c.id === message.channelId)?.name
    return name ? '#' + name : 'canal'
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-void">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <h3 className="flex-1 truncate font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
          Buscar
        </h3>
        <button
          type="button"
          onClick={closeSearch}
          title="Fechar"
          aria-label="Fechar busca"
          className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="shrink-0 border-b border-line p-2">
        <div className="flex items-center gap-2 rounded-brutal border-2 border-line bg-void px-2 transition-colors focus-within:border-acid/60">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeSearch()
            }}
            placeholder="O que você procura?"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
        </div>

        {canScope && (
          <button
            type="button"
            onClick={() => setOnlyThisChannel((prev) => !prev)}
            className={cn(
              'mt-2 flex w-full items-center gap-1.5 rounded-brutal border px-2 py-1 text-left transition-colors',
              scoped
                ? 'border-acid/50 bg-acid/10 text-acid'
                : 'border-line text-muted-foreground hover:border-acid/40'
            )}
          >
            <Filter className="h-3 w-3 shrink-0" />
            <span className="truncate text-[11.5px]">
              {scoped ? `só em #${activeChannel?.name}` : 'em tudo que eu vejo'}
            </span>
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {term.trim().length < 2 ? (
          <p className="px-2 py-8 text-center text-xs leading-relaxed text-muted-foreground">
            Digite pelo menos 2 letras.
            <br />
            A busca cobre os canais e as suas conversas.
          </p>
        ) : error ? (
          <p className="px-2 py-8 text-center text-xs text-destructive">{error}</p>
        ) : results.length === 0 && searched && !loading ? (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            Nada encontrado.
          </p>
        ) : (
          <div className="space-y-1.5">
            {results.map((message) => (
              <button
                key={message.id}
                type="button"
                onClick={() => goTo(message)}
                className="block w-full rounded-brutal border border-line bg-void-light/30 p-2 text-left transition-colors hover:border-acid/40"
              >
                <span className="mb-1 flex items-center gap-1.5">
                  <UserAvatar
                    src={resolveAssetUrl(message.author.avatar)}
                    name={message.author.displayName}
                    className="h-4 w-4"
                  />
                  <span className="truncate text-[11px] font-medium text-foreground">
                    {message.author.displayName}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                    {formatWhen(message.createdAt)}
                  </span>
                </span>

                <span className="line-clamp-3 block text-[11px] leading-relaxed text-muted-foreground">
                  <Highlighted text={message.content} term={term.trim()} />
                </span>

                <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  {message.conversationId ? (
                    <MessageSquare className="h-2.5 w-2.5" />
                  ) : (
                    <Hash className="h-2.5 w-2.5" />
                  )}
                  {whereOf(message)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {results.length > 0 && (
        <footer className="shrink-0 border-t border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {results.length} {results.length === 1 ? 'resultado' : 'resultados'}
        </footer>
      )}
    </aside>
  )
}

/** Reexportado pra quem só precisa do id da conversa a partir do canal. */
export { conversationIdOf }
