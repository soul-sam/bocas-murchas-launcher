import * as React from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import {
  DASH,
  fmtCompact,
  fmtDuration,
  fmtKda,
  fmtNumber,
  fmtPercent,
  lol as lolApi,
  lolQueueLabel,
  type LolMatchWire,
  type LolQuery,
  type LolSort
} from '@/lib/api-lol'
import { Empty, PlayerChip, ResultPill, ScoreBadge, Td, Th } from './parts'

/**
 * AS PARTIDAS, UMA A UMA.
 *
 * A lista compacta (`MatchLine`) é a que aparece nos destaques da visão geral;
 * a tabela é a aba inteira, ordenável por qualquer coluna. A ordenação acontece
 * no SERVIDOR, não aqui: ordenar em memória só ordenaria a página carregada, e
 * "a partida com mais dano" é do histórico todo, não das 25 na tela.
 */

function whenLabel(iso: string): string {
  const date = new Date(iso)
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days === 0) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'ontem'
  if (days < 7) return `${days} d`
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function MatchLine({ match, rank }: { match: LolMatchWire; rank?: number }) {
  return (
    <div className="flex items-center gap-2 rounded-brutal border border-line bg-void/40 px-2 py-1.5">
      {rank !== undefined && (
        <span className="w-4 shrink-0 text-right font-mono text-[11px] text-muted-foreground">{rank}</span>
      )}
      <ResultPill result={match.result} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <PlayerChip player={match.user} />
          <span className="shrink-0 text-[11.5px] text-muted-foreground">
            de {match.champion ?? 'campeão desconhecido'}
          </span>
        </div>
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          {match.queueLabel ?? lolQueueLabel(match.queue)} · {fmtDuration(match.durationSec)} ·{' '}
          {whenLabel(match.endedAt)}
          {match.killParticipation !== null && ` · ${fmtPercent(match.killParticipation)} dos abates`}
        </p>
      </div>
      <p className="shrink-0 font-mono text-[11.5px]">
        <span className="text-foreground">{match.kills}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-destructive">{match.deaths}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-foreground">{match.assists}</span>
      </p>
      <span className="w-10 shrink-0 text-right font-mono text-[11.5px] text-muted-foreground">
        {match.perfect ? 'perf.' : fmtKda(match.kda)}
      </span>
      <ScoreBadge score={match.score} />
    </div>
  )
}

const COLUMNS: Array<{ key: LolSort | null; label: string; title?: string }> = [
  { key: null, label: '' },
  { key: null, label: 'Quem' },
  { key: null, label: 'Campeão' },
  { key: 'kda', label: 'KDA', title: '(abates + assistências) ÷ mortes' },
  { key: 'score', label: 'Nota', title: 'Atuação comparada com as outras partidas do filtro' },
  { key: 'killParticipation', label: 'Part.', title: 'Participação nos abates do time' },
  { key: 'damage', label: 'Dano' },
  { key: 'damagePerMin', label: 'Dano/min' },
  { key: 'cs', label: 'CS' },
  { key: 'csPerMin', label: 'CS/min' },
  { key: 'gold', label: 'Ouro' },
  { key: 'vision', label: 'Visão' },
  { key: 'duration', label: 'Duração' },
  { key: 'recent', label: 'Quando' }
]

export function MatchTable({ query }: { query: LolQuery }) {
  const { token } = useAuth()
  const [sort, setSort] = React.useState<LolSort>('recent')
  const [order, setOrder] = React.useState<'asc' | 'desc'>('desc')
  /**
   * A página vem carimbada com o recorte em que foi escolhida. Trocar filtro ou
   * ordem invalida o carimbo e a página volta a ser a primeira NA HORA da
   * renderização — com um efeito de reset, a busca antiga ainda sairia com a
   * página 7 e o servidor responderia duas vezes por clique.
   */
  const [pageState, setPageState] = React.useState({ scope: '', page: 0 })
  const [rows, setRows] = React.useState<LolMatchWire[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const pageSize = 25
  const scope = JSON.stringify({ query, sort, order })
  const page = pageState.scope === scope ? pageState.page : 0
  const setPage = (next: number): void => setPageState({ scope, page: next })

  React.useEffect(() => {
    if (!token) return
    let alive = true
    setLoading(true)
    setError(null)
    lolApi
      .matches(token, { ...query, sort, order, limit: pageSize, offset: page * pageSize })
      .then((res) => {
        if (!alive) return
        setRows(res.matches)
        setTotal(res.total)
      })
      .catch(() => alive && setError('Não consegui carregar as partidas'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [token, scope, page])

  const changeSort = (key: string): void => {
    const next = key as LolSort
    if (next === sort) {
      setOrder((current) => (current === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSort(next)
    // Duração e mortes se leem de baixo pra cima com a mesma frequência; o
    // padrão continua "maior primeiro", que é o que se procura na maioria.
    setOrder('desc')
  }

  if (error) return <Empty>{error}</Empty>
  if (!loading && rows.length === 0) {
    return <Empty>Nenhuma partida nesse recorte. Afrouxe os filtros.</Empty>
  }

  const pages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-brutal border border-line">
        <table className="w-full sm:min-w-[900px] border-collapse">
          <thead>
            <tr className="border-b border-line">
              {COLUMNS.map((column, index) => (
                <Th
                  key={column.label + index}
                  sortKey={column.key ?? undefined}
                  active={column.key === sort}
                  order={order}
                  onSort={column.key ? changeSort : undefined}
                  align={index <= 2 ? 'left' : 'right'}
                  title={column.title}
                >
                  {column.label}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody className={cn(loading && 'opacity-50')}>
            {rows.map((match) => (
              <tr key={match.id} className="border-b border-line/60 last:border-0 hover:bg-void-light">
                <Td align="left" className="w-6">
                  <ResultPill result={match.result} />
                </Td>
                <Td align="left">
                  <PlayerChip player={match.user} />
                </Td>
                <Td align="left" className="text-foreground">
                  {match.champion ?? DASH}
                </Td>
                <Td title={`${match.kills}/${match.deaths}/${match.assists}`}>
                  {match.perfect ? 'perf.' : fmtKda(match.kda)}
                </Td>
                <Td>
                  <ScoreBadge score={match.score} />
                </Td>
                <Td>{fmtPercent(match.killParticipation)}</Td>
                <Td>{fmtCompact(match.damage)}</Td>
                <Td>{fmtNumber(match.damagePerMin, 0)}</Td>
                <Td>{fmtNumber(match.cs, 0)}</Td>
                <Td>{fmtNumber(match.csPerMin, 1)}</Td>
                <Td>{fmtCompact(match.gold)}</Td>
                <Td>{fmtNumber(match.visionScore, 0)}</Td>
                <Td>{fmtDuration(match.durationSec)}</Td>
                <Td className="text-muted-foreground">{whenLabel(match.endedAt)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
        {loading && <Loader2 className="h-3 w-3 animate-spin" />}
        <span>
          {total} {total === 1 ? 'partida' : 'partidas'} no filtro
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage(Math.max(0, page - 1))}
            aria-label="Página anterior"
            className="rounded-brutal border border-line-strong p-1 transition-colors hover:text-foreground disabled:opacity-40"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <span className="font-mono">
            {page + 1}/{pages}
          </span>
          <button
            type="button"
            disabled={page + 1 >= pages}
            onClick={() => setPage(page + 1)}
            aria-label="Próxima página"
            className="rounded-brutal border border-line-strong p-1 transition-colors hover:text-foreground disabled:opacity-40"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </span>
      </div>
    </div>
  )
}
