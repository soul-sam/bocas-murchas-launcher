import * as React from 'react'
import { Minus, Plus, ThumbsDown, ThumbsUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DASH,
  fmtDuration,
  fmtKda,
  fmtNumber,
  fmtPercent,
  lolQueueLabel,
  type LolDuoRow,
  type LolGroupRow
} from '@/lib/api-lol'
import { Empty, PlayerChip, SectionTitle, Td, Th, WinBar, WinrateCell } from './parts'

/**
 * AS TABELAS — campeões, jogadores e duplas.
 *
 * Duas colunas de winrate de propósito:
 *
 *   - a CRUA, com a amostra colada nela ("62% /13"), que é o que aconteceu;
 *   - a AJUSTADA, que é a crua puxada pra média do grupo conforme a amostra é
 *     pequena. É por ela que o ranking ordena, senão o topo seria sempre um
 *     campeão jogado uma vez e ganho uma vez.
 *
 * O "mínimo de partidas" corta a cauda de campeão jogado uma vez — são dezenas
 * de linhas de ruído entre as que importam.
 */

type SortDir = 'asc' | 'desc'

interface Column {
  key: string
  label: string
  title?: string
  align?: 'left' | 'right'
  value: (row: LolGroupRow) => number | null
  render: (row: LolGroupRow) => React.ReactNode
}

const METRIC_COLUMNS: Column[] = [
  {
    key: 'games',
    label: 'P',
    title: 'Partidas no filtro',
    value: (row) => row.games,
    render: (row) => fmtNumber(row.games)
  },
  {
    key: 'record',
    label: 'V/D',
    title: 'Vitórias e derrotas',
    value: (row) => row.wins,
    render: (row) => <WinBar wins={row.wins} losses={row.losses} className="w-24" />
  },
  {
    key: 'winrate',
    label: 'Winrate',
    title: 'Winrate cru, com o número de partidas decididas ao lado',
    value: (row) => row.winrate,
    render: (row) => <WinrateCell row={row} />
  },
  {
    key: 'adjWinrate',
    label: 'Ajust.',
    title: 'Winrate encolhido contra a média do grupo — é o que ordena o ranking com pouca partida',
    value: (row) => row.adjWinrate,
    render: (row) => fmtPercent(row.adjWinrate)
  },
  {
    key: 'kda',
    label: 'KDA',
    title: '(abates + assistências) ÷ mortes, somando todas as partidas',
    value: (row) => row.kda,
    render: (row) => fmtKda(row.kda)
  },
  {
    key: 'avgScore',
    label: 'Nota',
    title: 'Nota média de atuação (50 é a média do filtro)',
    value: (row) => row.avgScore,
    render: (row) => fmtNumber(row.avgScore, 0)
  },
  {
    key: 'killParticipation',
    label: 'Part.',
    title: 'Participação média nos abates do time',
    value: (row) => row.killParticipation,
    render: (row) => fmtPercent(row.killParticipation)
  },
  {
    key: 'damageShare',
    label: 'Dano%',
    title: 'Fatia média do dano do time',
    value: (row) => row.damageShare,
    render: (row) => fmtPercent(row.damageShare)
  },
  {
    key: 'deathShare',
    label: 'Mortes%',
    title: 'Fatia média das mortes do time — quanto maior, mais a pessoa é a morte do time',
    value: (row) => row.deathShare,
    render: (row) => fmtPercent(row.deathShare)
  },
  {
    key: 'csPerMin',
    label: 'CS/min',
    value: (row) => row.csPerMin,
    render: (row) => fmtNumber(row.csPerMin, 1)
  },
  {
    key: 'damagePerMin',
    label: 'Dano/min',
    value: (row) => row.damagePerMin,
    render: (row) => fmtNumber(row.damagePerMin, 0)
  },
  {
    key: 'visionPerMin',
    label: 'Visão/min',
    value: (row) => row.visionPerMin,
    render: (row) => fmtNumber(row.visionPerMin, 2)
  },
  {
    key: 'avgDurationSec',
    label: 'Duração',
    title: 'Duração média das partidas',
    value: (row) => row.avgDurationSec,
    render: (row) => fmtDuration(row.avgDurationSec)
  },
  {
    key: 'multis',
    label: 'Multi',
    title: 'Pentas / quadras / triplos',
    value: (row) => row.pentaKills * 100 + row.quadraKills * 10 + row.tripleKills,
    render: (row) =>
      row.pentaKills + row.quadraKills + row.tripleKills === 0
        ? DASH
        : `${row.pentaKills}/${row.quadraKills}/${row.tripleKills}`
  },
  {
    key: 'perfectGames',
    label: 'Perf.',
    title: 'Partidas sem morrer nenhuma vez',
    value: (row) => row.perfectGames,
    render: (row) => (row.perfectGames > 0 ? fmtNumber(row.perfectGames) : DASH)
  }
]

export function MinGames({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <span className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
      mínimo
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        aria-label="Diminuir mínimo de partidas"
        className="rounded-brutal border border-line-strong p-0.5 transition-colors hover:text-foreground"
      >
        <Minus className="h-3 w-3" />
      </button>
      <span className="w-4 text-center font-mono text-foreground">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(20, value + 1))}
        aria-label="Aumentar mínimo de partidas"
        className="rounded-brutal border border-line-strong p-0.5 transition-colors hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
      </button>
      partidas
    </span>
  )
}

function GroupTable({
  rows,
  firstLabel,
  renderFirst,
  defaultSort = 'games'
}: {
  rows: LolGroupRow[]
  firstLabel: string
  renderFirst: (row: LolGroupRow) => React.ReactNode
  defaultSort?: string
}) {
  const [sort, setSort] = React.useState(defaultSort)
  const [dir, setDir] = React.useState<SortDir>('desc')

  const sorted = React.useMemo(() => {
    const column = METRIC_COLUMNS.find((c) => c.key === sort)
    if (!column) return rows
    return [...rows].sort((a, b) => {
      const va = column.value(a)
      const vb = column.value(b)
      // Linha sem o dado vai pro fim nas duas direções: "sem dado" não é o
      // menor valor, é ausência.
      if (va === null && vb === null) return b.games - a.games
      if (va === null) return 1
      if (vb === null) return -1
      return dir === 'asc' ? va - vb : vb - va
    })
  }, [rows, sort, dir])

  const changeSort = (key: string): void => {
    if (key === sort) {
      setDir((current) => (current === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSort(key)
    setDir('desc')
  }

  if (rows.length === 0) {
    return <Empty>Nada acima do mínimo de partidas. Baixe o mínimo ou amplie o período.</Empty>
  }

  return (
    <div className="overflow-x-auto rounded-brutal border border-line">
      <table className="w-full sm:min-w-[980px] border-collapse">
        <thead>
          <tr className="border-b border-line">
            <Th align="left">{firstLabel}</Th>
            {METRIC_COLUMNS.map((column) => (
              <Th
                key={column.key}
                sortKey={column.key}
                active={sort === column.key}
                order={dir}
                onSort={changeSort}
                title={column.title}
              >
                {column.label}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.key} className="border-b border-line/60 last:border-0 hover:bg-void-light">
              <Td align="left" className="text-foreground">
                {renderFirst(row)}
              </Td>
              {METRIC_COLUMNS.map((column) => (
                <Td key={column.key} align={column.align ?? 'right'}>
                  {column.render(row)}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** O melhor e o pior de um recorte, lado a lado, antes da tabela. */
function Extremes({ rows, kind }: { rows: LolGroupRow[]; kind: 'campeão' | 'pessoa' }) {
  const ranked = rows.filter((row) => row.adjWinrate !== null)
  if (ranked.length < 2) return null

  const sorted = [...ranked].sort((a, b) => (b.adjWinrate ?? 0) - (a.adjWinrate ?? 0))
  const best = sorted[0]
  const worst = sorted[sorted.length - 1]

  const Card = ({ row, tone }: { row: LolGroupRow; tone: 'good' | 'bad' }) => (
    <div
      className={cn(
        'flex items-center gap-2 rounded-brutal border px-2.5 py-2',
        tone === 'good' ? 'border-acid/50 bg-acid/5' : 'border-destructive/50 bg-destructive/5'
      )}
    >
      {tone === 'good' ? (
        <ThumbsUp className="h-4 w-4 shrink-0 text-acid" />
      ) : (
        <ThumbsDown className="h-4 w-4 shrink-0 text-destructive" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">
          {tone === 'good' ? `Melhor ${kind}` : `Pior ${kind}`} do filtro
        </p>
        <p className="truncate font-display text-base leading-tight text-foreground">
          {row.user ? row.user.displayName : row.label}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={cn('font-mono text-sm', tone === 'good' ? 'text-acid-text' : 'text-destructive')}>
          {fmtPercent(row.winrate)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {row.decided}p · KDA {fmtKda(row.kda)}
        </p>
      </div>
    </div>
  )

  return (
    <div className="mb-2 grid gap-1.5 sm:grid-cols-2">
      <Card row={best} tone="good" />
      <Card row={worst} tone="bad" />
    </div>
  )
}

export function ChampionsTab({
  rows,
  minGames,
  onMinGames
}: {
  rows: LolGroupRow[]
  minGames: number
  onMinGames: (next: number) => void
}) {
  const filtered = rows.filter((row) => row.games >= minGames)

  return (
    <div className="space-y-2">
      <SectionTitle
        title="Campeões"
        hint={`${rows.length} campeões no filtro · ${filtered.length} acima do mínimo`}
        right={<MinGames value={minGames} onChange={onMinGames} />}
      />
      <Extremes rows={filtered} kind="campeão" />
      <GroupTable rows={filtered} firstLabel="Campeão" renderFirst={(row) => row.label} />
    </div>
  )
}

export function PlayersTab({ rows, duos }: { rows: LolGroupRow[]; duos: LolDuoRow[] }) {
  return (
    <div className="space-y-5">
      <div>
        <SectionTitle title="Quem joga" hint="cada linha é uma pessoa do grupo no recorte filtrado" />
        <Extremes rows={rows} kind="pessoa" />
        <GroupTable
          rows={rows}
          firstLabel="Pessoa"
          renderFirst={(row) => <PlayerChip player={row.user} fallback={row.label} size="md" />}
        />
      </div>

      <div>
        <SectionTitle
          title="Duplas"
          hint="quem jogou junto (mesma partida ou Riot ID no time) e o que isso mudou"
        />
        {duos.length === 0 ? (
          <Empty>Ninguém jogou junto o bastante nesse recorte pra dar pra comparar.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-brutal border border-line">
            <table className="w-full sm:min-w-[560px] border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <Th align="left">Dupla</Th>
                  <Th title="Partidas jogadas juntos">P</Th>
                  <Th>V/D</Th>
                  <Th title="Winrate da dupla, com a amostra ao lado">Winrate</Th>
                  <Th title="Winrate juntos menos o que os dois fazem separados, em pontos percentuais">
                    Efeito
                  </Th>
                </tr>
              </thead>
              <tbody>
                {duos.map((duo) => (
                  <tr key={duo.key} className="border-b border-line/60 last:border-0 hover:bg-void-light">
                    <Td align="left">
                      <span className="flex items-center gap-2">
                        <PlayerChip player={duo.a} />
                        <span className="text-muted-foreground">+</span>
                        <PlayerChip player={duo.b} />
                      </span>
                    </Td>
                    <Td>{duo.games}</Td>
                    <Td>
                      <WinBar wins={duo.wins} losses={duo.losses} className="w-24" />
                    </Td>
                    <Td>
                      <WinrateCell row={{ winrate: duo.winrate, decided: duo.games }} />
                    </Td>
                    <Td
                      className={cn(
                        duo.lift === null
                          ? 'text-muted-foreground'
                          : duo.lift > 0
                            ? 'text-acid-text'
                            : duo.lift < 0
                              ? 'text-destructive'
                              : 'text-foreground'
                      )}
                    >
                      {duo.lift === null ? DASH : `${duo.lift > 0 ? '+' : ''}${Math.round(duo.lift)} pp`}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export function QueuesTable({ rows }: { rows: LolGroupRow[] }) {
  if (rows.length === 0) return <Empty>Sem fila registrada no período.</Empty>
  return (
    <GroupTable rows={rows} firstLabel="Fila" renderFirst={(row) => lolQueueLabel(row.key)} />
  )
}
