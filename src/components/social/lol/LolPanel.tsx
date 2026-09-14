import * as React from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { useSocket } from '@/lib/socket-context'
import { lol as lolApi, type LolFilterOptions, type LolQuery, type LolStats } from '@/lib/api-lol'
import { LolFilters } from './LolFilters'
import { LolOverview } from './LolOverview'
import { LolPatterns } from './LolPatterns'
import { MatchTable } from './LolMatches'
import { ChampionsTab, PlayersTab } from './LolTables'
import { Empty } from './parts'

/**
 * O PAINEL DO MURAL DO LOL.
 *
 * Uma consulta ao servidor por combinação de filtro, e o painel inteiro sai
 * dela: trocar de aba NÃO busca de novo (é o mesmo recorte visto de outro
 * ângulo), trocar de filtro busca. A exceção é a aba de partidas, que pagina e
 * ordena no servidor — a lista é o único lugar onde a ordem muda o que carrega.
 *
 * Partida nova chegando enquanto o painel está aberto não recarrega sozinha:
 * aparece um aviso pra atualizar. Números mudando sob o dedo de quem está
 * comparando duas linhas é pior do que números um minuto atrasados.
 */

type Tab = 'visao' | 'campeoes' | 'jogadores' | 'partidas' | 'padroes'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'visao', label: 'Visão geral' },
  { id: 'campeoes', label: 'Campeões' },
  { id: 'jogadores', label: 'Jogadores' },
  { id: 'partidas', label: 'Partidas' },
  { id: 'padroes', label: 'Padrões' }
]

const DEFAULT_QUERY: LolQuery = { period: '90d' }

export function LolPanel() {
  const { token } = useAuth()
  const { socket } = useSocket()

  const [query, setQuery] = React.useState<LolQuery>(DEFAULT_QUERY)
  /**
   * Mínimo de partidas pra um campeão entrar na tabela. Fica FORA do filtro do
   * servidor de propósito: ele não muda o que é carregado, só corta a cauda de
   * campeão jogado uma vez. Mandar junto faria cada clique no mais/menos
   * recarregar o painel inteiro.
   */
  const [minGames, setMinGames] = React.useState(3)
  const [tab, setTab] = React.useState<Tab>('visao')
  const [options, setOptions] = React.useState<LolFilterOptions | null>(null)
  const [stats, setStats] = React.useState<LolStats | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [stale, setStale] = React.useState(false)
  const [reloadKey, setReloadKey] = React.useState(0)

  React.useEffect(() => {
    if (!token) return
    let alive = true
    lolApi
      .options(token)
      .then((res) => alive && setOptions(res))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [token])

  React.useEffect(() => {
    if (!token) return
    let alive = true
    setLoading(true)
    setError(null)
    lolApi
      .stats(token, query)
      .then((res) => {
        if (!alive) return
        setStats(res)
        setStale(false)
      })
      .catch(() => alive && setError('Não consegui carregar as estatísticas'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [token, query, reloadKey])

  React.useEffect(() => {
    if (!socket) return
    const onMessage = (payload: { message?: { type?: string } }): void => {
      if (payload?.message?.type === 'game') setStale(true)
    }
    socket.on('messageCreated', onMessage)
    return () => {
      socket.off('messageCreated', onMessage)
    }
  }, [socket])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LolFilters
        query={query}
        options={options}
        onChange={setQuery}
        onReset={() => setQuery(DEFAULT_QUERY)}
      />

      <div className="flex shrink-0 items-center gap-1 border-b border-line px-3 py-1.5">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'rounded-brutal px-2 py-1 text-[11.5px] transition-colors',
              tab === item.id
                ? 'bg-acid/10 text-acid-text'
                : 'text-muted-foreground hover:bg-void-light hover:text-foreground'
            )}
          >
            {item.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {stale && !loading && (
            <span className="text-[11px] text-burn">partida nova desde que isto carregou</span>
          )}
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            title="Recarregar com as partidas mais recentes"
            aria-label="Recarregar"
            className={cn(
              'rounded-brutal p-1 transition-colors hover:bg-void-light hover:text-foreground',
              stale ? 'text-burn' : 'text-muted-foreground'
            )}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {error ? (
          <Empty>{error}</Empty>
        ) : !stats ? (
          <Skeleton />
        ) : tab === 'visao' ? (
          <LolOverview stats={stats} />
        ) : tab === 'campeoes' ? (
          <ChampionsTab
            rows={stats.champions}
            minGames={minGames}
            onMinGames={setMinGames}
          />
        ) : tab === 'jogadores' ? (
          <PlayersTab rows={stats.players} duos={stats.duos} />
        ) : tab === 'partidas' ? (
          <MatchTable query={query} />
        ) : (
          <LolPatterns stats={stats} />
        )}
      </div>
    </div>
  )
}

/**
 * Enquanto carrega, blocos do tamanho do que vem — e não um spinner no meio do
 * vazio. O painel tem muita coisa; a forma da tela já conta o que está vindo.
 */
function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="h-14 animate-pulse rounded-brutal border border-line bg-void/60" />
        ))}
      </div>
      <div className="h-24 animate-pulse rounded-brutal border border-line bg-void/40" />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="h-32 animate-pulse rounded-brutal border border-line bg-void/40" />
        <div className="h-32 animate-pulse rounded-brutal border border-line bg-void/40" />
      </div>
    </div>
  )
}
