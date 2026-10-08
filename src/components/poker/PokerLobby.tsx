import * as React from 'react'
import { BookOpen, ChevronDown, ChevronUp, Coins, Loader2, Plus, Radio, Timer, Users, Wallet } from 'lucide-react'
import { MurchosIcon, TrophyIcon } from '@/lib/bocas-icons'
import { UserAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/ui/tooltip'
import { resolveAssetUrl } from '@/lib/api'
import {
  CATEGORY_LABEL,
  SPEED_LABEL,
  formatMoney,
  formatMoneyShort,
  poker as api,
  type LobbyTable,
  type PokerLeaderboardEntry,
  type PokerRules,
  type PokerStats,
  type StakePreset,
  type TableCurrency,
  type TimerSpeed
} from '@/lib/api-poker'
import { cash as cashApi, formatBrl } from '@/lib/api-cash'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { useGamification } from '@/lib/gamification-context'
import { usePoker } from '@/lib/poker-context'
import { useSocket } from '@/lib/socket-context'
import { cn } from '@/lib/utils'
import { PlayingCard } from './PlayingCard'

/**
 * O SAGUÃO — as mesas abertas, abrir uma nova, e o seu placar.
 *
 * Dois modos, duas abas: MURCHOS (o normal: fichas são a moeda do grupo, sem
 * teto além do saldo) e VALENDO (dinheiro de verdade pelo caixa do Asaas,
 * R$ 20 no máximo por pessoa por mesa). A aba valendo só aparece quando o
 * servidor tem o Asaas ligado — e mostra o saldo do caixa, não os murchos.
 */

export function PokerLobby({
  rules,
  onOpenRules,
  onOpenCash
}: {
  rules: PokerRules | null
  onOpenRules: () => void
  onOpenCash: () => void
}) {
  const { tables, ready, openTable, seatedAt } = usePoker()
  const { profile } = useGamification()
  const { token } = useAuth()
  const { socket } = useSocket()
  const cashEnabled = !!rules?.cashEnabled
  const [mode, setMode] = React.useState<TableCurrency>('murchos')
  const [creating, setCreating] = React.useState(false)
  const [cashBalance, setCashBalance] = React.useState<number | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const currency: TableCurrency = cashEnabled ? mode : 'murchos'

  // Saldo do caixa, só na aba valendo; acompanha o socket.
  const refreshCash = React.useCallback(async () => {
    if (!token || !cashEnabled) return
    try {
      setCashBalance((await cashApi.me(token)).balanceCents)
    } catch {
      setCashBalance(null)
    }
  }, [token, cashEnabled])

  React.useEffect(() => {
    if (currency === 'brl') void refreshCash()
  }, [currency, refreshCash])

  React.useEffect(() => {
    if (!socket) return
    const onChanged = (data: { balanceCents?: number }): void => {
      if (typeof data?.balanceCents === 'number') setCashBalance(data.balanceCents)
    }
    socket.on('cash:changed', onChanged)
    return () => {
      socket.off('cash:changed', onChanged)
    }
  }, [socket])

  const visible = React.useMemo(() => tables.filter((t) => t.currency === currency), [tables, currency])
  const balance = currency === 'brl' ? cashBalance : profile?.coins ?? null

  return (
    <div className="scroll-stable flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      {/* Modo + saldo + colinha */}
      <div className="flex flex-wrap items-center gap-2">
        {cashEnabled && (
          <div role="tablist" aria-label="Modo" className="grid grid-cols-2 gap-0.5 rounded-brutal border border-line bg-depth-2 p-0.5">
            <ModeTab active={currency === 'murchos'} onClick={() => setMode('murchos')} icon={<MurchosIcon className="h-3.5 w-3.5" aria-hidden />}>
              Murchos
            </ModeTab>
            <ModeTab active={currency === 'brl'} onClick={() => setMode('brl')} icon={<Coins className="h-3.5 w-3.5" aria-hidden />}>
              Valendo
            </ModeTab>
          </div>
        )}
        <div className="flex items-center gap-1.5 rounded-brutal border border-burn/60 bg-burn/10 px-3 py-1.5 font-mono text-sm text-burn">
          {currency === 'brl' ? <Coins className="h-4 w-4" aria-hidden /> : <MurchosIcon className="h-4 w-4" aria-hidden />}
          {balance === null ? '…' : formatMoney(balance, currency)}
          <span className="text-[11.5px] opacity-70">{currency === 'brl' ? 'no caixa' : 'murchos'}</span>
        </div>
        {currency === 'brl' && (
          <Button variant="secondary" size="sm" onClick={onOpenCash}>
            <Wallet className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Caixa: depositar e sacar
          </Button>
        )}
        <button
          type="button"
          onClick={onOpenRules}
          className="ml-auto flex items-center gap-1.5 rounded-brutal border border-line px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-acid/60 hover:text-foreground"
        >
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          Colinha e regras
        </button>
      </div>

      {currency === 'brl' && <RealModeNotice rules={rules} />}

      {error && (
        <p className="rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{error}</p>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        {/* Mesas */}
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
            <CreateTableForm
              rules={rules}
              currency={currency}
              balance={balance}
              onDone={() => setCreating(false)}
              onError={setError}
            />
          )}

          {!ready ? (
            <p className="flex items-center gap-2 rounded-brutal border border-line bg-void/60 px-3 py-6 text-center text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Carregando as mesas…
            </p>
          ) : visible.length === 0 ? (
            <div className="rounded-brutal border border-line bg-void/60 px-3 py-6 text-center">
              <p className="text-xs text-foreground">Nenhuma mesa {currency === 'brl' ? 'valendo' : 'de murchos'} aberta agora.</p>
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                Abra uma: ela aparece aqui pra todo mundo e vira um card no canal de jogos.
              </p>
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

        {/* Placar */}
        <Scoreboard currency={currency} />
      </div>
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  icon,
  children
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-brutal px-3 py-1 text-xs transition-colors',
        active ? 'bg-acid/10 text-acid' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function RealModeNotice({ rules }: { rules: PokerRules | null }) {
  const cap = rules?.tableCapCents ?? 2000
  return (
    <div className="rounded-brutal border border-burn/40 bg-burn/[0.05] px-3 py-2 text-[11.5px] leading-snug text-muted-foreground">
      <p>
        <span className="text-foreground">Dinheiro de verdade, só por diversão:</span> no máximo{' '}
        <span className="font-mono text-foreground">{formatBrl(cap)}</span> por pessoa por mesa, recargas incluídas. A casa
        não tira nada do pote. O que desconta é a <span className="text-foreground">taxa do Asaas</span> no depósito (e no
        saque, se o plano cobrar) — o caixa mostra o valor exato antes de você confirmar.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------

function TableRow({ table, mine, onOpen }: { table: LobbyTable; mine: boolean; onOpen: () => void }) {
  const { byId } = useMembers()
  const full = table.seated >= table.maxSeats
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-brutal border px-3 py-2',
        mine ? 'border-acid/60 bg-acid/[0.06]' : table.status === 'playing' ? 'border-burn/40 bg-burn/[0.04]' : 'border-line bg-void/60'
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
          blinds <span className="font-mono">{formatMoneyShort(table.smallBlind, table.currency)}/{formatMoneyShort(table.bigBlind, table.currency)}</span>
          {' · '}
          <span className="font-mono">{table.seated}/{table.maxSeats}</span> lugares
          {' · '}
          <Timer className="inline h-3 w-3" aria-hidden /> {SPEED_LABEL[table.speed]}
          {table.started === false && <span className="text-acid-text"> · esperando começar — dá tempo de sentar</span>}
          {table.pot > 0 && (
            <>
              {' · pote '}
              <span className="font-mono text-burn">{formatMoney(table.pot, table.currency)}</span>
            </>
          )}
          {table.handCount > 0 && (
            <>
              {' · '}
              <span className="font-mono">{table.handCount}</span> {table.handCount === 1 ? 'mão' : 'mãos'}
            </>
          )}
        </p>
      </div>
      <Button size="sm" variant={mine ? 'default' : full ? 'secondary' : 'default'} onClick={onOpen}>
        {mine ? 'Voltar' : full ? 'Assistir' : 'Entrar'}
      </Button>
    </li>
  )
}

// ---------------------------------------------------------------------------

function CreateTableForm({
  rules,
  currency,
  balance,
  onDone,
  onError
}: {
  rules: PokerRules | null
  currency: TableCurrency
  balance: number | null
  onDone: () => void
  onError: (error: string | null) => void
}) {
  const { createTable } = usePoker()
  const stakes = React.useMemo(() => (rules?.stakes ?? []).filter((s) => s.currency === currency), [rules, currency])
  const [stakeId, setStakeId] = React.useState(stakes[0]?.id ?? '')
  const [seats, setSeats] = React.useState(6)
  const [speed, setSpeed] = React.useState<TimerSpeed>('normal')
  const [name, setName] = React.useState('')
  const [sitNow, setSitNow] = React.useState(true)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!stakes.some((s) => s.id === stakeId)) setStakeId(stakes[0]?.id ?? '')
  }, [stakes, stakeId])

  const stake: StakePreset | undefined = stakes.find((s) => s.id === stakeId)
  const min = stake ? stake.minBuyInBb * stake.bigBlind : 0
  const max = stake ? Math.min(stake.maxBuyInBb * stake.bigBlind, stake.capPerSeat ?? Infinity) : 0
  const step = stake?.smallBlind ?? 1
  const [buyIn, setBuyIn] = React.useState(max)
  React.useEffect(() => setBuyIn(max), [max])

  const short = balance !== null && balance < min
  const cappedMax = balance !== null ? Math.max(min, Math.min(max, Math.floor(balance / step) * step)) : max

  const submit = async (): Promise<void> => {
    if (!stake || busy) return
    setBusy(true)
    onError(null)
    const ack = await createTable({
      name: name.trim() || undefined,
      stakeId: stake.id,
      maxSeats: seats,
      speed,
      buyIn: sitNow && !short ? Math.min(buyIn, cappedMax) : undefined,
      seat: 0
    })
    setBusy(false)
    if (!ack.ok) {
      onError(ack.error ?? 'Não deu pra abrir a mesa.')
      return
    }
    onDone()
  }

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
            placeholder={stake ? `${stake.name} de alguém` : 'Mesa'}
            className="input-terminal w-full rounded-brutal px-3 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] text-muted-foreground">Blinds</span>
          <div className="flex flex-wrap gap-1">
            {stakes.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStakeId(s.id)}
                className={cn(
                  'rounded-brutal border px-2 py-1 text-xs transition-colors',
                  s.id === stakeId ? 'border-acid/60 bg-acid/10 text-acid' : 'border-line text-muted-foreground hover:text-foreground'
                )}
              >
                {s.name.replace('Mesa ', '')}{' '}
                <span className="font-mono">
                  {formatMoneyShort(s.smallBlind, s.currency)}/{formatMoneyShort(s.bigBlind, s.currency)}
                </span>
              </button>
            ))}
          </div>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] text-muted-foreground">Lugares</span>
          <div className="flex gap-1">
            {[2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSeats(n)}
                className={cn(
                  'h-8 w-9 rounded-brutal border font-mono text-xs transition-colors',
                  n === seats ? 'border-acid/60 bg-acid/10 text-acid' : 'border-line text-muted-foreground hover:text-foreground'
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] text-muted-foreground">Relógio</span>
          <div className="flex gap-1">
            {(['normal', 'turbo'] as TimerSpeed[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={cn(
                  'rounded-brutal border px-2.5 py-1 text-xs transition-colors',
                  s === speed ? 'border-acid/60 bg-acid/10 text-acid' : 'border-line text-muted-foreground hover:text-foreground'
                )}
              >
                {SPEED_LABEL[s]} <span className="font-mono">{rules ? Math.round(rules.timers[s] / 1000) : s === 'normal' ? 60 : 20}s</span>
              </button>
            ))}
          </div>
        </label>
      </div>

      {stake && (
        <div className="rounded-brutal border border-line bg-depth-2 px-3 py-2">
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input type="checkbox" checked={sitNow} onChange={(e) => setSitNow(e.target.checked)} className="accent-[hsl(var(--acid))]" />
            Já sentar com um buy-in
          </label>
          {sitNow && (
            <>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="range"
                  className="poker-regua flex-1"
                  min={min}
                  max={cappedMax}
                  step={step}
                  value={Math.min(buyIn, cappedMax)}
                  disabled={short}
                  onChange={(e) => setBuyIn(Number(e.target.value))}
                  aria-label="Buy-in"
                />
                <span className="w-24 text-right font-mono text-sm text-foreground">{formatMoney(Math.min(buyIn, cappedMax), currency)}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                de {formatMoney(min, currency)} a {formatMoney(max, currency)}
                {short && <span className="text-destructive"> — seu saldo não dá pro mínimo</span>}
                {currency === 'brl' && stake.capPerSeat !== undefined && (
                  <> · teto de {formatBrl(stake.capPerSeat)} por pessoa nesta mesa</>
                )}
              </p>
            </>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy || !stake || (sitNow && short)}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : sitNow ? 'Abrir e sentar' : 'Abrir mesa'}
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------

function Scoreboard({ currency }: { currency: TableCurrency }) {
  const { token } = useAuth()
  const { byId } = useMembers()
  const [stats, setStats] = React.useState<PokerStats | null>(null)
  const [period, setPeriod] = React.useState<'week' | 'all'>('week')
  const [entries, setEntries] = React.useState<PokerLeaderboardEntry[] | null>(null)
  const [open, setOpen] = React.useState(true)

  React.useEffect(() => {
    if (!token) return
    let alive = true
    setStats(null)
    api.me(token, currency).then((s) => alive && setStats(s)).catch(() => alive && setStats(null))
    return () => {
      alive = false
    }
  }, [token, currency])

  React.useEffect(() => {
    if (!token) return
    let alive = true
    setEntries(null)
    api
      .leaderboard(token, period, currency)
      .then((r) => alive && setEntries(r.entries))
      .catch(() => alive && setEntries([]))
    return () => {
      alive = false
    }
  }, [token, period, currency])

  const fmt = (v: number): string => formatMoney(v, currency)
  const signed = (v: number): string => (v > 0 ? `+${fmt(v)}` : fmt(v))

  return (
    <aside className="space-y-3">
      <section className="rounded-brutal border border-line bg-void/60 p-3">
        <h4 className="mb-2 text-sm font-semibold text-foreground">Você na mesa</h4>
        {!stats ? (
          <p className="text-xs text-muted-foreground">…</p>
        ) : stats.hands === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma mão jogada {currency === 'brl' ? 'valendo' : 'ainda'}. Sente numa mesa.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <Stat label="mãos" value={String(stats.hands)} />
            <Stat label="potes levados" value={`${stats.wins} (${Math.round((stats.wins / stats.hands) * 100)}%)`} />
            <Stat label="saldo" value={signed(stats.net)} tone={stats.net > 0 ? 'good' : stats.net < 0 ? 'bad' : undefined} />
            <Stat label="maior pote" value={fmt(stats.biggestPot)} />
            <Stat label="showdowns" value={`${stats.showdownsWon}/${stats.showdowns}`} />
            <Stat label="roubos sem mostrar" value={String(stats.steals)} />
            <Stat label="all-ins" value={String(stats.allIns)} />
            <Stat label="melhor mão" value={stats.bestCategory ? CATEGORY_LABEL[stats.bestCategory] : '—'} />
          </dl>
        )}
      </section>

      <section className="rounded-brutal border border-line bg-void/60 p-3">
        <div className="mb-2 flex items-center gap-2">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <TrophyIcon className="h-3.5 w-3.5 text-burn" aria-hidden />
            Tubarões
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
                    <Hint label={`${e.hands} mãos · ${e.wins} potes`} description={`maior pote: ${fmt(e.biggestPot)}`} side="left">
                      <span className={cn('cursor-help font-mono', e.net > 0 ? 'text-acid-text' : e.net < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                        {signed(e.net)}
                      </span>
                    </Hint>
                  </li>
                )
              })}
            </ol>
          ))}
      </section>

      <section className="hidden rounded-brutal border border-line bg-void/60 p-3 lg:block">
        <h4 className="mb-2 text-sm font-semibold text-foreground">A mão que todo mundo quer</h4>
        <div className="flex items-center gap-2">
          {['Ts', 'Js', 'Qs', 'Ks', 'As'].map((c) => (
            <PlayingCard key={c} code={c} size="sm" />
          ))}
        </div>
        <p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">
          Royal flush: 1 em 31 mil mãos no river. Quem fizer ganha a badge lendária — e o direito de falar disso pra sempre.
        </p>
      </section>
    </aside>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
      <dd className={cn('truncate font-mono', tone === 'good' ? 'text-acid-text' : tone === 'bad' ? 'text-destructive' : 'text-foreground')}>
        {value}
      </dd>
    </div>
  )
}
