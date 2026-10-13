import * as React from 'react'
import { BookOpen, ChevronDown, ChevronUp, Loader2, Plus, Radio, Timer, Users } from 'lucide-react'
import { MurchosIcon, TrophyIcon } from '@/lib/bocas-icons'
import { UserAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/ui/tooltip'
import { resolveAssetUrl } from '@/lib/api'
import {
  CARTAS_SPEED_LABEL,
  VARIANT_LABEL,
  cartas as api,
  stakeLabel,
  type CardGame,
  type CartasLeaderboardEntry,
  type CartasLobbyTable,
  type CartasRules,
  type CartasSpeed,
  type CartasStats,
  type TrucoVariant
} from '@/lib/api-cartas'
import { useAuth } from '@/lib/auth-context'
import { useCartas } from '@/lib/cartas-context'
import { useGamification } from '@/lib/gamification-context'
import { useMembers } from '@/lib/members-context'
import { cn } from '@/lib/utils'
import { PlayingCard } from '@/components/poker/PlayingCard'

/**
 * O SAGUÃO do truco ou da cacheta — as mesas abertas daquele jogo, abrir uma
 * nova, e o placar. Mesmo desenho do saguão do pôquer.
 *
 * Diferente do pôquer não há buy-in: cada um CASA um valor fixo (ou nada, na
 * amistosa) quando a partida começa, e quem ganha leva o bolo.
 */

export function CartasLobby({ game, rules, onOpenRules }: { game: CardGame; rules: CartasRules | null; onOpenRules: () => void }) {
  const { tables, ready, openTable, seatedAt } = useCartas()
  const { profile } = useGamification()
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const visible = React.useMemo(() => tables.filter((t) => t.game === game), [tables, game])
  const balance = profile?.coins ?? null

  return (
    <div className="scroll-stable flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-brutal border border-burn/60 bg-burn/10 px-3 py-1.5 font-mono text-sm text-burn">
          <MurchosIcon className="h-4 w-4" aria-hidden />
          {balance === null ? '…' : balance.toLocaleString('pt-BR')}
          <span className="text-[11.5px] opacity-70">murchos</span>
        </div>
        <button
          type="button"
          onClick={onOpenRules}
          className="ml-auto flex items-center gap-1.5 rounded-brutal border border-line px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-acid/60 hover:text-foreground"
        >
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          Colinha e regras
        </button>
      </div>

      {error && <p className="rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{error}</p>}

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <section className="min-w-0">
          <div className="mb-1.5 flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Radio className={cn('h-3.5 w-3.5', visible.length > 0 ? 'text-destructive' : 'text-muted-foreground')} aria-hidden />
              Mesas abertas
              <span className="font-mono text-xs text-muted-foreground">{visible.length}</span>
            </h4>
            <Button size="sm" onClick={() => setCreating((v) => !v)} variant={creating ? 'secondary' : 'default'}>
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
              {creating ? 'Fechar' : 'Abrir mesa'}
            </Button>
          </div>

          {creating && (
            <CreateForm game={game} rules={rules} balance={balance} onDone={() => setCreating(false)} onError={setError} />
          )}

          {!ready ? (
            <p className="flex items-center gap-2 rounded-brutal border border-line bg-void/60 px-3 py-6 text-center text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Carregando as mesas…
            </p>
          ) : visible.length === 0 ? (
            <div className="rounded-brutal border border-line bg-void/60 px-3 py-6 text-center">
              <p className="text-xs text-foreground">Nenhuma mesa de {game === 'truco' ? 'truco' : 'cacheta'} aberta agora.</p>
              <p className="mt-1 text-[11.5px] text-muted-foreground">Abra uma: ela aparece aqui pra todo mundo e vira um card no canal de jogos.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {visible.map((t) => (
                <TableRow
                  key={t.id}
                  table={t}
                  mine={seatedAt?.id === t.id}
                  onOpen={() => void openTable(t.id).then((ack) => !ack.ok && setError(ack.error ?? 'Deu ruim.'))}
                />
              ))}
            </ul>
          )}
        </section>

        <Scoreboard game={game} />
      </div>
    </div>
  )
}

function TableRow({ table, mine, onOpen }: { table: CartasLobbyTable; mine: boolean; onOpen: () => void }) {
  const { byId } = useMembers()
  const full = table.seated >= table.maxSeats
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-brutal border px-3 py-2',
        mine ? 'border-acid/60 bg-acid/[0.06]' : table.playing ? 'border-burn/40 bg-burn/[0.04]' : 'border-line bg-void/60'
      )}
    >
      <div className="flex shrink-0 -space-x-2">
        {table.players.slice(0, 4).map((p) => {
          const m = byId[p.userId]
          return (
            <UserAvatar
              key={p.userId}
              userId={p.userId}
              src={resolveAssetUrl(m?.avatar ?? p.avatar)}
              name={m?.displayName ?? p.displayName}
              ringColor={m?.profileColor ?? undefined}
              frame={m?.avatarFrame}
              frameColor={m?.profileColor}
              className="h-7 w-7 border-2 border-void"
            />
          )
        })}
        {table.players.length === 0 && (
          <span className="flex h-7 w-7 items-center justify-center rounded-brutal border border-dashed border-line-strong text-muted-foreground">
            <Users className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">
          {table.name}
          {mine && <span className="text-acid"> · você está aqui</span>}
        </p>
        <p className="truncate text-[11.5px] text-muted-foreground">
          {table.game === 'truco' && table.variant && <>{VARIANT_LABEL[table.variant]} · </>}
          {table.game === 'truco' ? (table.maxSeats === 4 ? '2x2' : '1x1') : `${table.startPoints} pontos`}
          {' · '}
          <span className="font-mono">
            {table.seated}/{table.maxSeats}
          </span>{' '}
          lugares · {stakeLabel(table.stake)}
          {' · '}
          <Timer className="inline h-3 w-3" aria-hidden /> {CARTAS_SPEED_LABEL[table.speed]}
          {table.playing ? (
            table.summary && <span className="text-burn"> · {table.summary}</span>
          ) : (
            <span className="text-acid-text"> · esperando começar — dá tempo de sentar</span>
          )}
        </p>
      </div>
      <Button size="sm" variant={mine ? 'default' : full || table.playing ? 'secondary' : 'default'} onClick={onOpen}>
        {mine ? 'Voltar' : full || table.playing ? 'Assistir' : 'Entrar'}
      </Button>
    </li>
  )
}

function Pick<T extends string | number>({
  value,
  options,
  onChange,
  render
}: {
  value: T
  options: readonly T[]
  onChange: (v: T) => void
  render: (v: T) => React.ReactNode
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={o === value}
          className={cn(
            'rounded-brutal border px-2.5 py-1 text-xs transition-colors',
            o === value ? 'border-acid/60 bg-acid/10 text-acid' : 'border-line text-muted-foreground hover:text-foreground'
          )}
        >
          {render(o)}
        </button>
      ))}
    </div>
  )
}

function CreateForm({
  game,
  rules,
  balance,
  onDone,
  onError
}: {
  game: CardGame
  rules: CartasRules | null
  balance: number | null
  onDone: () => void
  onError: (error: string | null) => void
}) {
  const { createTable } = useCartas()
  const stakes = rules?.stakes ?? []
  const [stakeId, setStakeId] = React.useState('amistosa')
  const [variant, setVariant] = React.useState<TrucoVariant>('paulista')
  const seatOptions = rules?.seats[game] ?? (game === 'truco' ? [2, 4] : [2, 3, 4, 5, 6])
  const [seats, setSeats] = React.useState(game === 'truco' ? 4 : 4)
  const [speed, setSpeed] = React.useState<CartasSpeed>('normal')
  const pointOptions = rules?.cachetaPoints ?? [5, 10]
  const [points, setPoints] = React.useState(pointOptions[0] ?? 5)
  const [name, setName] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const stake = stakes.find((s) => s.id === stakeId)
  const short = !!stake && balance !== null && balance < stake.amount

  const submit = async (): Promise<void> => {
    if (busy || !stake) return
    setBusy(true)
    onError(null)
    const ack = await createTable({
      game,
      variant: game === 'truco' ? variant : undefined,
      name: name.trim() || undefined,
      stakeId,
      maxSeats: seats,
      speed,
      startPoints: game === 'cacheta' ? points : undefined,
      seat: 0
    })
    setBusy(false)
    if (!ack.ok) {
      onError(ack.error ?? 'Não deu pra abrir a mesa.')
      return
    }
    onDone()
  }

  const timer = (s: CartasSpeed): number => (rules ? Math.round(rules.timers[game][s] / 1000) : game === 'truco' ? (s === 'normal' ? 30 : 15) : s === 'normal' ? 45 : 20)

  return (
    <form
      className="mb-3 space-y-3 rounded-brutal border border-acid-dark bg-void/60 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11.5px] text-muted-foreground">Nome da mesa (opcional)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 32))}
            placeholder={game === 'truco' ? 'Truco da madrugada' : 'Cacheta de domingo'}
            className="input-terminal w-full rounded-brutal px-3 py-1.5 text-sm"
          />
        </label>
        {game === 'truco' && (
          <div>
            <span className="mb-1 block text-[11.5px] text-muted-foreground">Truco</span>
            <Pick
              value={variant}
              options={['paulista', 'mineiro'] as const}
              onChange={setVariant}
              render={(v) => (
                <>
                  {VARIANT_LABEL[v]} <span className="text-muted-foreground">{v === 'paulista' ? '· com vira' : '· manilha fixa'}</span>
                </>
              )}
            />
          </div>
        )}
        <div>
          <span className="mb-1 block text-[11.5px] text-muted-foreground">{game === 'truco' ? 'Formato' : 'Lugares'}</span>
          <Pick
            value={seats}
            options={seatOptions}
            onChange={setSeats}
            render={(n) => (game === 'truco' ? (n === 4 ? '2x2 (duplas)' : '1x1') : <span className="font-mono">{n}</span>)}
          />
        </div>
        {game === 'cacheta' && (
          <div>
            <span className="mb-1 block text-[11.5px] text-muted-foreground">Pontos de cada um</span>
            <Pick
              value={points}
              options={pointOptions}
              onChange={setPoints}
              render={(n) => (
                <>
                  <span className="font-mono">{n}</span> {n <= 5 ? '· partida curta' : '· clássica'}
                </>
              )}
            />
          </div>
        )}
        <div>
          <span className="mb-1 block text-[11.5px] text-muted-foreground">Valendo (cada um casa)</span>
          <Pick
            value={stakeId}
            options={stakes.map((s) => s.id)}
            onChange={setStakeId}
            render={(id) => {
              const s = stakes.find((x) => x.id === id)!
              return s.amount > 0 ? <span className="font-mono">{s.amount.toLocaleString('pt-BR')}</span> : 'Amistosa'
            }}
          />
        </div>
        <div>
          <span className="mb-1 block text-[11.5px] text-muted-foreground">Relógio</span>
          <Pick
            value={speed}
            options={['normal', 'turbo'] as const}
            onChange={setSpeed}
            render={(s) => (
              <>
                {CARTAS_SPEED_LABEL[s]} <span className="font-mono">{timer(s)}s</span>
              </>
            )}
          />
        </div>
      </div>

      <p className="text-[11.5px] leading-snug text-muted-foreground">
        {stake && stake.amount > 0 ? (
          <>
            Cada um casa <span className="font-mono text-foreground">{stake.amount.toLocaleString('pt-BR')}</span> murchos quando a partida começa; quem ganha
            leva o bolo{game === 'truco' && seats === 4 ? ' (a dupla divide)' : ''}. Levantar no meio é abandonar: o casado fica.
            {short && <span className="text-destructive"> Seu saldo não dá.</span>}
          </>
        ) : (
          <>Amistosa: ninguém casa nada, vale o XP e as conquistas.</>
        )}
      </p>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy || !stake || short}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : 'Abrir e sentar'}
        </Button>
      </div>
    </form>
  )
}

function Scoreboard({ game }: { game: CardGame }) {
  const { token } = useAuth()
  const { byId } = useMembers()
  const [stats, setStats] = React.useState<CartasStats | null>(null)
  const [period, setPeriod] = React.useState<'week' | 'all'>('week')
  const [entries, setEntries] = React.useState<CartasLeaderboardEntry[] | null>(null)
  const [open, setOpen] = React.useState(true)

  React.useEffect(() => {
    if (!token) return
    let alive = true
    setStats(null)
    api.me(token, game).then((s) => alive && setStats(s)).catch(() => alive && setStats({ matches: 0, wins: 0, net: 0 }))
    return () => {
      alive = false
    }
  }, [token, game])

  React.useEffect(() => {
    if (!token) return
    let alive = true
    setEntries(null)
    api
      .leaderboard(token, game, period)
      .then((r) => alive && setEntries(r))
      .catch(() => alive && setEntries([]))
    return () => {
      alive = false
    }
  }, [token, game, period])

  const signed = (v: number): string => (v > 0 ? `+${v.toLocaleString('pt-BR')}` : v.toLocaleString('pt-BR'))
  const showcase = game === 'truco' ? ['4c', '7h', 'As', '7d'] : ['7h', '8h', '9h', 'Ks', 'Kd', 'Kc']

  return (
    <aside className="space-y-3">
      <section className="rounded-brutal border border-line bg-void/60 p-3">
        <h4 className="mb-2 text-sm font-semibold text-foreground">Você na mesa</h4>
        {!stats ? (
          <p className="text-xs text-muted-foreground">…</p>
        ) : stats.matches === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma partida ainda. Sente numa mesa.</p>
        ) : (
          <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
            <Stat label="partidas" value={String(stats.matches)} />
            <Stat label="vitórias" value={`${stats.wins} (${Math.round((stats.wins / stats.matches) * 100)}%)`} />
            <Stat label="saldo" value={signed(stats.net)} tone={stats.net > 0 ? 'good' : stats.net < 0 ? 'bad' : undefined} />
          </dl>
        )}
      </section>

      <section className="rounded-brutal border border-line bg-void/60 p-3">
        <div className="mb-2 flex items-center gap-2">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <TrophyIcon className="h-3.5 w-3.5 text-burn" aria-hidden />
            {game === 'truco' ? 'Os bons de truco' : 'Os bons de cacheta'}
          </h4>
          <div role="tablist" className="ml-auto grid grid-cols-2 gap-0.5 rounded-brutal border border-line bg-depth-2 p-0.5">
            {(['week', 'all'] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={period === p}
                onClick={() => setPeriod(p)}
                className={cn('rounded-brutal px-2 py-0.5 text-[11.5px]', period === p ? 'bg-acid/10 text-acid' : 'text-muted-foreground')}
              >
                {p === 'week' ? 'semana' : 'sempre'}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-muted-foreground lg:hidden">
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
        {open &&
          (entries === null ? (
            <p className="text-xs text-muted-foreground">…</p>
          ) : entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">Ninguém jogou {period === 'week' ? 'esta semana' : 'ainda'}.</p>
          ) : (
            <ol className="space-y-1">
              {entries.slice(0, 10).map((e) => {
                const m = byId[e.userId]
                return (
                  <li key={e.userId} className="flex items-center gap-2 text-xs">
                    <span className="w-4 text-right font-mono text-muted-foreground">{e.rank}</span>
                    <UserAvatar
                      userId={e.userId}
                      src={resolveAssetUrl(m?.avatar ?? e.user?.avatar)}
                      name={m?.displayName ?? e.user?.displayName ?? '?'}
                      ringColor={m?.profileColor ?? e.user?.profileColor ?? undefined}
                      frame={m?.avatarFrame}
                      frameColor={m?.profileColor}
                      className="h-6 w-6"
                    />
                    <span className="min-w-0 flex-1 truncate text-foreground">{m?.displayName ?? e.user?.displayName ?? '?'}</span>
                    <Hint label={`${e.matches} partidas`} description={`saldo: ${signed(e.net)} murchos`} side="left">
                      <span className="cursor-help font-mono text-acid-text">
                        {e.wins} {e.wins === 1 ? 'vitória' : 'vitórias'}
                      </span>
                    </Hint>
                  </li>
                )
              })}
            </ol>
          ))}
      </section>

      <section className="hidden rounded-brutal border border-line bg-void/60 p-3 lg:block">
        <h4 className="mb-2 text-sm font-semibold text-foreground">{game === 'truco' ? 'As quatro do mineiro' : 'Sequência e trinca'}</h4>
        <div className="flex items-center gap-1.5">
          {showcase.map((c, i) => (
            <PlayingCard key={`${c}-${i}`} code={c} size="sm" />
          ))}
        </div>
        <p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">
          {game === 'truco'
            ? 'Zap, sete de copas, espadilha e pica-fumo: no mineiro elas são sempre as mais fortes. No paulista quem manda é a vira.'
            : 'Mesmo naipe em escada, ou o mesmo valor em naipes diferentes. Feche a mão inteira em jogos e bata: com as dez na mão, todo mundo perde dois pontos.'}
        </p>
      </section>
    </aside>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
      <dd className={cn('truncate font-mono', tone === 'good' ? 'text-acid-text' : tone === 'bad' ? 'text-destructive' : 'text-foreground')}>{value}</dd>
    </div>
  )
}
