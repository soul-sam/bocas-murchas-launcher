import * as React from 'react'
import { ArrowLeft, ImagePlus, Link as LinkIcon, Loader2, Search, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { gifs as gifsApi, isProviderOff, type Gif } from '@/lib/api-gifs'

/**
 * SELETOR DE GIF — busca no Giphy (pela nossa API) pra avatar e capa.
 *
 * É um PAINEL, não uma modal. Ele vive dentro do diálogo de perfil e ocupa o
 * lugar do formulário enquanto está aberto, com um botão de voltar. Empilhar
 * um Dialog do Radix sobre outro é exatamente o caso que travava a interface
 * inteira do launcher (duas camadas modais sobrepostas — ver
 * lib/interaction-guard.ts), então isso aqui não abre camada nenhuma.
 *
 * COLAR URL SEMPRE FUNCIONA, e não é só um extra: se o servidor estiver sem
 * `GIPHY_API_KEY`, a busca responde 503 e o painel fica só com esse campo. A
 * feature degrada em vez de sumir.
 *
 * De qualquer um dos dois caminhos sai uma URL, que quem chamou manda pro
 * servidor copiar pro nosso storage (uploads.fromUrl). O link do Giphy nunca
 * vai direto pro perfil: ele carrega um token com validade.
 */

/** Espera o campo parar antes de buscar. Uma busca por tecla seria absurdo. */
const DEBOUNCE_MS = 400

/** Sugestões de busca, pra quem abre e não sabe o que procurar. */
const SUGGESTIONS = ['gato', 'meme', 'dança', 'lol', 'minecraft', 'rir', 'raiva', 'anime']

function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handle = (event: MediaQueryListEvent): void => setReduced(event.matches)
    query.addEventListener('change', handle)
    return () => query.removeEventListener('change', handle)
  }, [])

  return reduced
}

type Status = 'idle' | 'loading' | 'more' | 'error' | 'off'

export function GifPicker({
  kind,
  onPick,
  onCancel
}: {
  kind: 'avatar' | 'banner'
  /** Recebe a URL já escolhida pro tipo certo (avatar leve, capa maior). */
  onPick: (url: string) => void
  onCancel: () => void
}) {
  const { token } = useAuth()
  const reducedMotion = useReducedMotion()

  const [query, setQuery] = React.useState('')
  const [debounced, setDebounced] = React.useState('')
  const [items, setItems] = React.useState<Gif[]>([])
  const [nextOffset, setNextOffset] = React.useState<number | null>(null)
  const [status, setStatus] = React.useState<Status>('loading')
  const [error, setError] = React.useState<string | null>(null)
  const [manualUrl, setManualUrl] = React.useState('')
  /**
   * Contador de tentativas, só pra o botão de "tentar de novo" funcionar.
   *
   * Sem ele o botão chamava `setDebounced(current => current)` — mesmo valor,
   * então o React descarta a atualização, o efeito não roda de novo e o
   * clique não fazia absolutamente nada. Um número que só cresce garante uma
   * dependência nova a cada clique.
   */
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  /**
   * Busca a primeira página do termo atual.
   *
   * O `cancelled` não é decoração: digitar "gato" e depois "gata" dispara duas
   * buscas, e sem isso a resposta mais LENTA (a antiga) poderia chegar depois
   * e sobrescrever a mais nova na tela.
   */
  React.useEffect(() => {
    if (!token) return
    let cancelled = false

    setStatus('loading')
    setError(null)

    const load = debounced
      ? gifsApi.search(token, debounced)
      : gifsApi.trending(token)

    void load
      .then((page) => {
        if (cancelled) return
        setItems(page.gifs)
        setNextOffset(page.nextOffset)
        setStatus('idle')
      })
      .catch((err) => {
        if (cancelled) return
        setItems([])
        setNextOffset(null)
        if (isProviderOff(err)) {
          setStatus('off')
          setError(err instanceof Error ? err.message : null)
        } else {
          setStatus('error')
          setError(err instanceof Error ? err.message : 'Não deu pra buscar agora.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [token, debounced, attempt])

  const loadMore = async (): Promise<void> => {
    if (!token || nextOffset === null || status === 'more') return
    setStatus('more')
    try {
      const page = debounced
        ? await gifsApi.search(token, debounced, nextOffset)
        : await gifsApi.trending(token, nextOffset)
      // Concatena por id: o Giphy repete item entre páginas de vez em quando,
      // e chave duplicada no React vira aviso e item fantasma.
      setItems((current) => {
        const seen = new Set(current.map((gif) => gif.id))
        return [...current, ...page.gifs.filter((gif) => !seen.has(gif.id))]
      })
      setNextOffset(page.nextOffset)
      setStatus('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra carregar mais.')
      setStatus('idle')
    }
  }

  const submitManual = (event: React.FormEvent): void => {
    event.preventDefault()
    const url = manualUrl.trim()
    if (url) onPick(url)
  }

  const providerOff = status === 'off'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex shrink-0 items-center gap-1 rounded-brutal border-2 border-line px-2 py-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-acid/50 hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          voltar
        </button>
        <p className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
          GIF pra {kind === 'avatar' ? 'foto de perfil' : 'capa'}
        </p>
      </div>

      {!providerOff && (
        <>
          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Procura um GIF…"
              autoFocus
              spellCheck={false}
              maxLength={50}
              className="input-terminal h-9 w-full rounded-brutal pl-7 pr-2 text-sm"
            />
          </div>

          {!query && (
            <div className="flex shrink-0 flex-wrap gap-1">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setQuery(suggestion)}
                  className="rounded-brutal border border-line px-2 py-0.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-acid/50 hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {status === 'loading' ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : status === 'error' ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                <TriangleAlert className="h-5 w-5 text-destructive" />
                <p className="text-xs text-destructive">{error}</p>
                <button
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                  className="rounded-brutal border-2 border-line px-2 py-1 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-acid/50 hover:text-foreground"
                >
                  tentar de novo
                </button>
              </div>
            ) : items.length === 0 ? (
              <p className="py-14 text-center text-sm text-muted-foreground">
                Nada com esse nome. Tenta outra palavra.
              </p>
            ) : (
              <>
                {/*
                  Colunas do CSS em vez de grade: GIF tem altura de tudo, e numa
                  grade de linhas iguais os altos são cortados e os baixos
                  deixam buraco. Assim cada um entra com a altura que tem.
                */}
                <div className="columns-2 gap-2 sm:columns-3">
                  {items.map((gif) => (
                    <button
                      key={gif.id}
                      type="button"
                      onClick={() => onPick(kind === 'avatar' ? gif.avatarUrl : gif.bannerUrl)}
                      title={gif.description || 'Usar este GIF'}
                      className="mb-2 block w-full overflow-hidden rounded-brutal border-2 border-line transition-colors hover:border-acid focus:border-acid focus:outline-none"
                    >
                      <img
                        // Quem pediu menos animação no sistema vê o quadro
                        // parado: uma parede de 24 GIFs mexendo é exatamente o
                        // que essa preferência existe pra evitar.
                        src={reducedMotion ? gif.stillUrl : gif.previewUrl}
                        alt={gif.description}
                        loading="lazy"
                        // width/height do payload: sem eles a página pula a
                        // cada imagem que termina de carregar.
                        width={gif.width}
                        height={gif.height}
                        className="block h-auto w-full bg-void-light"
                      />
                    </button>
                  ))}
                </div>

                {nextOffset !== null && (
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={status === 'more'}
                    className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-brutal border-2 border-line py-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-acid/50 hover:text-foreground disabled:opacity-50"
                  >
                    {status === 'more' && <Loader2 className="h-3 w-3 animate-spin" />}
                    carregar mais
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      {providerOff && (
        <div className="flex shrink-0 items-start gap-2 rounded-brutal border-2 border-burn/40 bg-burn/[0.06] px-3 py-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-burn" />
          <div className="min-w-0">
            <p className="text-xs text-foreground">A busca de GIF está desligada no servidor.</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {error ?? 'Falta a chave do Giphy.'} Dá pra colar o link de um GIF do mesmo jeito.
            </p>
          </div>
        </div>
      )}

      {/* Colar link: sempre disponível, com ou sem busca funcionando. */}
      <form onSubmit={submitManual} className="flex shrink-0 items-center gap-1.5">
        <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={manualUrl}
          onChange={(event) => setManualUrl(event.target.value)}
          placeholder="ou cola o link de um GIF/imagem (https://…)"
          spellCheck={false}
          autoFocus={providerOff}
          className="input-terminal h-8 min-w-0 flex-1 rounded-brutal px-2 text-xs"
        />
        <button
          type="submit"
          disabled={!manualUrl.trim()}
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-brutal border-2 border-acid bg-acid/10 px-2 py-1.5',
            'font-mono text-[11.5px] uppercase tracking-widest text-acid transition-colors',
            'hover:bg-acid/20 disabled:cursor-not-allowed disabled:opacity-40'
          )}
        >
          <ImagePlus className="h-3 w-3" />
          usar
        </button>
      </form>
    </div>
  )
}
