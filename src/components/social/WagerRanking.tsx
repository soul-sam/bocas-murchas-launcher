import * as React from 'react'
import { Loader2, TrendingDown, TrendingUp } from 'lucide-react'
import { MedalIcon } from '@/lib/bocas-icons'
import { UserAvatar } from '@/components/ui/avatar'
import { Hint } from '@/components/ui/tooltip'
import { resolveAssetUrl } from '@/lib/api'
import {
  gamification as api,
  formatCompact,
  type LeaderboardPeriod,
  type WagerRankingEntry
} from '@/lib/api-gamification'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { cn } from '@/lib/utils'
import { NameEffect } from './NameEffect'
import { NameEmoji } from './NameEmoji'

/**
 * RANKING DE APOSTAS — dentro do painel Recap, seguindo a semana na tela.
 *
 * Três leituras da mesma lista (GET /gamification/wagers/ranking):
 *   - Saldo: o que voltou − o que foi apostado (pote incluso). Pode ser negativo.
 *   - % vitórias: acertos ÷ apostas decididas.
 *   - % derrotas: o mesmo ao contrário — o pé-frio do grupo.
 *
 * Devolução (remake) não entra no aproveitamento. Nas porcentagens só entra
 * quem tem um mínimo de apostas decididas: 1 de 1 não é 100% de verdade.
 */

type Mode = 'net' | 'winRate' | 'lossRate'

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'net', label: 'Saldo', hint: 'Quanto cada um ganhou ou perdeu de verdade: o que voltou das apostas (e do pote) menos o que apostou.' },
  { id: 'winRate', label: '% vitórias', hint: 'Acertos sobre apostas decididas. Remake devolve e não conta.' },
  { id: 'lossRate', label: '% derrotas', hint: 'Erros sobre apostas decididas. Quem lidera aqui é o pé-frio.' }
]

/** Mínimo de apostas decididas pra entrar nas porcentagens. */
const MIN_DECIDED: Record<LeaderboardPeriod, number> = { week: 3, all: 5 }

interface Row {
  entry: WagerRankingEntry
  decided: number
  winRate: number
  lossRate: number
}

/** `weekStart`: a semana do recap que está na tela (sem ele, a corrente). */
export function WagerRanking({ weekStart }: { weekStart?: string }) {
  const { token } = useAuth()
  const [period, setPeriod] = React.useState<LeaderboardPeriod>('week')
  const [mode, setMode] = React.useState<Mode>('net')
  const [boards, setBoards] = React.useState<Record<string, WagerRankingEntry[]>>({})
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const key = period === 'week' ? `week:${weekStart ?? 'now'}` : 'all'
  const entries = boards[key]

  React.useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void api
      .wagerRanking(token, period, weekStart)
      .then((list) => {
        if (!cancelled) setBoards((prev) => ({ ...prev, [key]: list }))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Não deu pra carregar o ranking.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, period, weekStart, key])

  const min = MIN_DECIDED[period]
  const { rows, hidden } = React.useMemo(() => {
    const all: Row[] = (entries ?? []).map((entry) => {
      const decided = entry.wins + entry.losses
      return {
        entry,
        decided,
        winRate: decided > 0 ? entry.wins / decided : 0,
        lossRate: decided > 0 ? entry.losses / decided : 0
      }
    })
    if (mode === 'net') {
      return { rows: all.filter((r) => r.entry.bets > 0 || r.entry.jackpot > 0).sort((a, b) => b.entry.net - a.entry.net), hidden: 0 }
    }
    const eligible = all.filter((r) => r.decided >= min)
    const key = mode === 'winRate' ? 'winRate' : 'lossRate'
    // Empate na porcentagem: quem tem mais apostas decididas fica na frente.
    eligible.sort((a, b) => b[key] - a[key] || b.decided - a.decided)
    return { rows: eligible, hidden: all.filter((r) => r.decided > 0 && r.decided < min).length }
  }, [entries, mode, min])

  const current = MODES.find((m) => m.id === mode)!

  return (
    <section>
      <h4 className="mb-1.5 flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        <MedalIcon className="h-3 w-3" aria-hidden />
        Ranking de apostas
        {loading && entries && <Loader2 className="ml-auto h-3 w-3 animate-spin" aria-label="atualizando" />}
      </h4>

      <div className="space-y-2">
        <div role="tablist" aria-label="Período" className="grid grid-cols-2 gap-0.5 rounded-brutal border border-line bg-depth-2 p-0.5">
          {(['week', 'all'] as LeaderboardPeriod[]).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-[4px] py-1 text-xs font-medium transition-colors',
                period === p ? 'bg-acid/15 text-acid' : 'text-muted-foreground hover:bg-void-light hover:text-foreground'
              )}
            >
              {p === 'week' ? 'Nesta semana' : 'Desde sempre'}
            </button>
          ))}
        </div>

        <div>
          <div role="tablist" aria-label="Ordenar por" className="flex flex-wrap gap-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={mode === m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  'rounded-brutal border px-2 py-1 text-[11.5px] transition-colors',
                  mode === m.id
                    ? 'border-burn bg-burn/15 text-burn'
                    : 'border-line text-muted-foreground hover:border-line-strong hover:text-foreground'
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{current.hint}</p>
        </div>

        {error && !entries ? (
          <p className="rounded-brutal border border-destructive/40 bg-destructive/10 px-3 py-3 text-center text-xs text-destructive">
            {error}
          </p>
        ) : !entries ? (
          <div className="animate-pulse space-y-px overflow-hidden rounded-brutal" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-9 bg-surface-raised" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-brutal border border-line bg-void/60 px-3 py-5 text-center text-xs text-muted-foreground">
            {mode === 'net'
              ? `Nenhuma aposta liquidada ${period === 'week' ? 'nesta semana' : 'ainda'}.`
              : `Ninguém com ${min} ou mais apostas decididas ${period === 'week' ? 'nesta semana' : 'ainda'}.`}
          </p>
        ) : (
          <ol className={cn('divide-y divide-line rounded-brutal border border-line bg-void/60 transition-opacity', loading && 'opacity-70')}>
            {rows.map((row, i) => (
              <RankRow key={row.entry.userId} row={row} rank={i + 1} mode={mode} />
            ))}
          </ol>
        )}

        {entries && hidden > 0 && mode !== 'net' && (
          <p className="text-center text-[11px] text-muted-foreground">
            {hidden} {hidden === 1 ? 'pessoa fora' : 'pessoas fora'} — menos de {min} apostas decididas
          </p>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

function RankRow({ row, rank, mode }: { row: Row; rank: number; mode: Mode }) {
  const { user } = useAuth()
  const { byId } = useMembers()
  const { entry } = row
  const member = byId[entry.userId]
  const name = member?.displayName ?? entry.displayName
  const color = member?.profileColor ?? entry.profileColor ?? undefined
  const isMe = entry.userId === user?.id

  const pct = (v: number) => `${Math.round(v * 100)}%`
  const signed = (v: number) => (v > 0 ? `+${formatCompact(v)}` : v < 0 ? `−${formatCompact(-v)}` : '0')

  const detail = [
    `${entry.wins}V · ${entry.losses}D${entry.refunds > 0 ? ` · ${entry.refunds} devolvida${entry.refunds === 1 ? '' : 's'}` : ''}`,
    `apostou ${formatCompact(entry.staked)}`,
    `voltou ${formatCompact(entry.returned)}`,
    entry.jackpot > 0 ? `pote ${formatCompact(entry.jackpot)}` : null
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li
      className={cn(
        'px-2 py-1.5',
        isMe && 'bg-acid/[0.06] shadow-[inset_2px_0_0_hsl(var(--acid))]'
      )}
    >
      <Hint label={name} description={detail} side="left">
        <div className="flex cursor-help items-center gap-2">
          <span className="w-5 shrink-0 text-center font-mono text-[11.5px] text-muted-foreground">{rank}</span>
          <UserAvatar
            userId={entry.userId}
            src={resolveAssetUrl(member?.avatar ?? entry.avatar)}
            name={name}
            ringColor={color}
            frame={member?.avatarFrame}
            className="h-6 w-6"
          />
          <div className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1 text-sm leading-tight" style={color ? { color } : undefined}>
              <NameEffect effect={member?.nameEffect} className="truncate">
                {name}
              </NameEffect>
              <NameEmoji id={member?.emoji} />
            </span>
            {/* Vitórias × derrotas numa barra só: devolução fica de fora. */}
            {row.decided > 0 && (
              <div className="mt-1 flex h-1 overflow-hidden rounded-full bg-surface-raised" aria-hidden>
                <div className="bg-acid" style={{ width: pct(row.winRate) }} />
                <div className="bg-destructive" style={{ width: pct(row.lossRate) }} />
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            {mode === 'net' ? (
              <p
                className={cn(
                  'flex items-center justify-end gap-0.5 font-mono text-[11.5px]',
                  entry.net > 0 ? 'text-acid-text' : entry.net < 0 ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                {entry.net > 0 ? (
                  <TrendingUp className="h-3 w-3" aria-hidden />
                ) : entry.net < 0 ? (
                  <TrendingDown className="h-3 w-3" aria-hidden />
                ) : null}
                {signed(entry.net)}
              </p>
            ) : (
              <p className={cn('font-mono text-[11.5px]', mode === 'winRate' ? 'text-acid-text' : 'text-destructive')}>
                {pct(mode === 'winRate' ? row.winRate : row.lossRate)}
              </p>
            )}
            <p className="font-mono text-[11px] text-muted-foreground">
              {entry.wins}V {entry.losses}D
            </p>
          </div>
        </div>
      </Hint>
    </li>
  )
}
