import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { Chips, Vazio } from '@/components/futebol/comum'
import { resolveAssetUrl } from '@/lib/api'
import { LANGS, lingua, type Lang, type LinguaRanking, type RankingRow } from '@/lib/api-lingua'
import { useAuth } from '@/lib/auth-context'
import { errorCode, errorMessage, LANG_NAME } from '@/lib/lingua-ui'
import { cn } from '@/lib/utils'
import { Flag } from './Flag'

type Scope = 'all' | Lang
type Period = 'week' | 'total'

const SCOPES: Array<{ id: Scope; nome: string; extra?: React.ReactNode }> = [
  { id: 'all', nome: 'Geral' },
  ...LANGS.map((l) => ({ id: l, nome: LANG_NAME[l], extra: <Flag lang={l} size={10} /> }))
]

const PERIODS: Array<{ id: Period; nome: string }> = [
  { id: 'week', nome: 'Semana' },
  { id: 'total', nome: 'Total' }
]

/** Uma linha de ranking/pódio: lugar, foto, nome, XP (e o que mais vier no fim). */
export function RankLine({ row, me, children }: { row: RankingRow; me?: boolean; children?: React.ReactNode }) {
  return (
    <li
      className={cn(
        'flex items-center gap-2.5 rounded-brutal px-2.5 py-1.5',
        me ? 'bg-acid/10 text-acid' : 'text-foreground'
      )}
    >
      <span className="w-6 text-right font-mono text-xs text-muted-foreground">{row.place}º</span>
      <UserAvatar src={resolveAssetUrl(row.avatarUrl)} userId={row.userId} name={row.name} className="h-7 w-7" />
      <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
      {children}
      <span className="font-mono text-xs">{row.xp} XP</span>
    </li>
  )
}

/** Ranking de XP da Língua Murcha: geral ou por língua, semana ou total. */
export function RankingPanel() {
  const { token, user } = useAuth()
  const [scope, setScope] = React.useState<Scope>('all')
  const [period, setPeriod] = React.useState<Period>('week')
  const [data, setData] = React.useState<LinguaRanking | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!token) return
    let cancelled = false
    setData(null)
    setError(null)
    lingua
      .ranking(token, scope, period)
      .then((r) => !cancelled && setData(r))
      .catch((e) => !cancelled && setError(errorMessage(errorCode(e))))
    return () => {
      cancelled = true
    }
  }, [token, scope, period])

  const meInList = data?.rows.some((r) => r.userId === user?.id)

  return (
    <div className="space-y-3">
      <Chips opcoes={SCOPES} atual={scope} onChange={setScope} rotulo="Ranking de qual língua" />
      <Chips opcoes={PERIODS} atual={period} onChange={setPeriod} rotulo="Período" />

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : !data ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      ) : data.rows.length === 0 ? (
        <Vazio>Ninguém estudou {period === 'week' ? 'essa semana' : 'ainda'}. Bora ser o primeiro.</Vazio>
      ) : (
        <ol className="space-y-0.5">
          {data.rows.map((r) => (
            <RankLine key={r.userId} row={r} me={r.userId === user?.id} />
          ))}
        </ol>
      )}

      {data?.me && !meInList && (
        <p className="border-t border-line pt-2 text-xs text-muted-foreground">
          Você: {data.me.place}º com {data.me.xp} XP
        </p>
      )}
    </div>
  )
}
