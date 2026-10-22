import * as React from 'react'
import { CalendarClock, Loader2, PiggyBank, Snowflake, TrendingUp } from 'lucide-react'
import { MurchosIcon } from '@/lib/bocas-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ApiError } from '@/lib/api'
import { bankApi, type CdbView, type DepositView, type InvestView, type TermView } from '@/lib/api-bank'
import { daysUntil, parseLoanAmount, percentText } from '@/lib/bank-math'
import { useAuth } from '@/lib/auth-context'
import { useGamification } from '@/lib/gamification-context'
import { cn } from '@/lib/utils'

/**
 * CDB DA CASA — a aba Investir do Banco.
 *
 * Dois produtos, regras do servidor (`invest.cdb.rules`):
 *   - DIÁRIO: 10% ao mês compostos por dia, resgate a qualquer hora. Com o
 *     "CDB automático" ligado, às 23h o saldo inteiro vem pra cá.
 *   - CONGELADO: 7/15/30/60 dias com rendimento do prazo travado na hora.
 *     Sair antes leva só uma fatia do que já rendeu (a tela mostra quanto).
 * O murcho aplicado vira reserva do Banco, e a Casa sempre devolve.
 *
 * O CDB antigo (2/4 semanas, rendimento do pote) só aparece pra quem ainda
 * tem aplicação aberta nele.
 */

const fmt = (n: number): string => n.toLocaleString('pt-BR')
const day = (iso: string): string => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
/** "0,32%" — taxa pequena com duas casas. */
const pct2 = (fraction: number): string => `${(fraction * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`

/** Campo de murchos: só dígitos, até `max`. Sem teto de aplicação, o limite é o saldo. */
function AmountInput({
  value,
  onChange,
  max,
  min,
  label
}: {
  value: string
  onChange: (next: string) => void
  max: number
  min: number
  label: string
}) {
  return (
    <div className="relative">
      <MurchosIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        inputMode="numeric"
        placeholder={max >= min ? `De ${fmt(min)} a ${fmt(max)}` : `Mínimo ${fmt(min)}`}
        value={value}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 9)
          onChange(digits === '' ? '' : String(Math.min(Number(digits), Math.max(max, 0))))
        }}
        className="pl-9 font-mono"
        aria-label={label}
      />
    </div>
  )
}

function Chips({ options, value, onPick }: { options: Array<{ n: number; label: string }>; value: number | null; onPick: (n: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onPick(o.n)}
          className={cn(
            'rounded-brutal border px-2 py-1 font-mono text-[11.5px] transition-colors',
            value === o.n
              ? 'border-burn bg-burn/15 text-burn'
              : 'border-line text-muted-foreground hover:border-burn/50 hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** 25%, 50% e tudo do saldo, redondos (o "tudo" é exato). */
function quickOf(coins: number, min: number): Array<{ n: number; label: string }> {
  const parts = [0.25, 0.5].map((f) => Math.floor((coins * f) / 50) * 50)
  return [...new Set([...parts, coins])]
    .filter((n) => n >= min)
    .map((n) => ({ n, label: n === coins ? `${fmt(n)} (tudo)` : fmt(n) }))
}

export function InvestTab() {
  const { token } = useAuth()
  const { profile, pushToast } = useGamification()
  // undefined = buscando · null = falhou
  const [view, setView] = React.useState<InvestView | null | undefined>(undefined)

  const refresh = React.useCallback(async () => {
    if (!token) return
    try {
      setView(await bankApi.invest(token))
    } catch {
      setView((prev) => (prev === undefined ? null : prev))
    }
  }, [token])

  React.useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 60_000)
    return () => clearInterval(timer)
  }, [refresh])

  if (view === undefined) {
    return (
      <div className="flex justify-center py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }
  if (view === null) {
    return (
      <p className="rounded-brutal border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        Não deu pra abrir o investimento agora.
      </p>
    )
  }

  const coins = profile?.coins ?? 0
  const cdb = view.cdb
  const toast = (title: string, body: string): void => {
    pushToast({ kind: 'coins', title, body })
    void refresh()
  }

  return (
    <>
      {cdb && (
        <>
          <Daily cdb={cdb} coins={coins} onDone={toast} />
          <TermForm cdb={cdb} coins={coins} onDone={toast} />
          {cdb.terms.length > 0 && <OpenTerms terms={cdb.terms} onDone={toast} />}
        </>
      )}
      {view.open.length > 0 && (
        <LegacyDeposits
          deposits={view.open}
          onWithdrawn={(forfeited) =>
            toast(
              'Aplicação sacada',
              forfeited > 0 ? `O principal voltou; ${fmt(forfeited)} de rendimento foram queimados.` : 'O principal voltou inteiro.'
            )
          }
        />
      )}
      {cdb && <CdbRules cdb={cdb} />}
      {((cdb?.termHistory.length ?? 0) > 0 || view.history.length > 0) && (
        <History terms={cdb?.termHistory ?? []} legacy={view.history} />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Diário
// ---------------------------------------------------------------------------

function Daily({ cdb, coins, onDone }: { cdb: CdbView; coins: number; onDone: (title: string, body: string) => void }) {
  const { token } = useAuth()
  const { savings, rules } = cdb
  const [amount, setAmount] = React.useState('')
  const [busy, setBusy] = React.useState<'in' | 'out' | 'auto' | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  // O switch responde na hora; o servidor confirma (ou desfaz) depois.
  const [auto, setAuto] = React.useState(savings.auto)
  React.useEffect(() => setAuto(savings.auto), [savings.auto])

  const max = Math.max(coins, savings.total)
  const value = parseLoanAmount(amount, 1, max)
  const canIn = cdb.eligible && value !== null && value >= rules.minDeposit && value <= coins
  const canOut = savings.total > 0 && (value === null || value <= savings.total)

  const run = async (kind: 'in' | 'out'): Promise<void> => {
    if (!token || busy) return
    setBusy(kind)
    setError(null)
    try {
      if (kind === 'in' && value !== null) {
        await bankApi.savingsDeposit(token, value)
        onDone(`${fmt(value)} no CDB diário`, 'Começa a render depois de um dia inteiro aplicado.')
      } else {
        const res = await bankApi.savingsWithdraw(token, value ?? undefined)
        onDone(`${fmt(res.paid)} resgatados`, 'Voltaram pro seu saldo.')
      }
      setAmount('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não deu agora.')
    } finally {
      setBusy(null)
    }
  }

  const toggleAuto = async (on: boolean): Promise<void> => {
    if (!token || busy) return
    setAuto(on)
    setBusy('auto')
    setError(null)
    try {
      await bankApi.savingsAuto(token, on)
      onDone(
        on ? 'CDB automático ligado' : 'CDB automático desligado',
        on ? `Todo dia às ${rules.sweepHour}h seu saldo vem pro CDB diário.` : 'Seu saldo fica onde está.'
      )
    } catch (err) {
      setAuto(!on)
      setError(err instanceof ApiError ? err.message : 'Não deu pra mudar agora.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="rounded-brutal border border-acid-dark/60 bg-acid/[0.05] p-3">
      <h4 className="flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        <PiggyBank className="h-3.5 w-3.5 text-acid-text" aria-hidden />
        CDB diário
      </h4>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <p className="font-mono text-3xl leading-none tabular-nums text-acid-text">{fmt(savings.total)}</p>
        <span className="text-xs text-muted-foreground">aplicados</span>
      </div>
      <p className="mt-1 flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
        <TrendingUp className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        <span>
          {percentText(rules.monthlyRate)} ao mês ({pct2(rules.dailyRate)} ao dia, compostos), resgate quando quiser.
          {savings.pending > 0 && (
            <>
              {' '}
              <span className="font-mono text-foreground">{fmt(savings.pending)}</span> começam a render depois de um dia
              inteiro.
            </>
          )}
          {savings.earned > 0 && (
            <>
              {' '}
              Já rendeu <span className="font-mono text-acid-text">+{fmt(savings.earned)}</span>.
            </>
          )}
        </span>
      </p>

      <label className="mt-2.5 flex cursor-pointer items-center justify-between gap-3 rounded-brutal border border-line bg-void/60 px-2.5 py-2">
        <span className="min-w-0">
          <span className="block text-xs font-medium text-foreground">CDB automático</span>
          <span className="block text-[11px] leading-snug text-muted-foreground">
            Todo dia às {rules.sweepHour}h o seu saldo inteiro vem pra cá. Pra gastar, resgate.
          </span>
        </span>
        <Switch checked={auto} disabled={busy !== null} onCheckedChange={(on) => void toggleAuto(on)} />
      </label>

      <form
        className="mt-2.5 space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (canIn) void run('in')
        }}
      >
        <AmountInput value={amount} onChange={(v) => { setAmount(v); setError(null) }} max={max} min={1} label="Quantos murchos" />
        <Chips
          options={[
            ...(coins >= rules.minDeposit ? [{ n: coins, label: `saldo ${fmt(coins)}` }] : []),
            ...(savings.total > 0 && savings.total !== coins ? [{ n: savings.total, label: `CDB ${fmt(savings.total)}` }] : [])
          ]}
          value={value}
          onPick={(n) => setAmount(String(n))}
        />
        {!cdb.eligible && cdb.reason && <p className="text-[11.5px] text-muted-foreground">{cdb.reason}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-1.5">
          <Button type="submit" className="flex-1" disabled={!canIn || busy !== null}>
            {busy === 'in' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PiggyBank className="mr-1.5 h-4 w-4" />}
            Aplicar
          </Button>
          <Button type="button" variant="secondary" className="flex-1" disabled={!canOut || busy !== null} onClick={() => void run('out')}>
            {busy === 'out' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {value === null ? 'Resgatar tudo' : 'Resgatar'}
          </Button>
        </div>
      </form>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Congelado
// ---------------------------------------------------------------------------

function TermForm({ cdb, coins, onDone }: { cdb: CdbView; coins: number; onDone: (title: string, body: string) => void }) {
  const { token } = useAuth()
  const { rules } = cdb
  const [amount, setAmount] = React.useState('')
  const [days, setDays] = React.useState<number>(rules.terms[rules.terms.length - 1]?.days ?? 30)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const value = parseLoanAmount(amount, rules.minDeposit, coins)
  const term = rules.terms.find((t) => t.days === days) ?? rules.terms[0]
  const quick = React.useMemo(() => quickOf(coins, rules.minDeposit), [coins, rules.minDeposit])

  if (!cdb.eligible || coins < rules.minDeposit) {
    return (
      <section className="rounded-brutal border border-line bg-void/60 p-3">
        <h4 className="mb-1.5 flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
          <Snowflake className="h-3.5 w-3.5" aria-hidden />
          CDB congelado
        </h4>
        <p className="text-xs leading-snug text-muted-foreground">
          {cdb.reason ?? `A aplicação mínima é ${fmt(rules.minDeposit)} murchos.`}
        </p>
      </section>
    )
  }

  const submit = async (): Promise<void> => {
    if (!token || value === null || busy || !term) return
    setBusy(true)
    setError(null)
    try {
      const { deposit } = await bankApi.termDeposit(token, value, term.days)
      setAmount('')
      onDone(
        `${fmt(deposit.amount)} congelados por ${deposit.termDays} dias`,
        `Voltam ${fmt(deposit.amount + Math.floor(deposit.amount * deposit.rate))} em ${day(deposit.maturesAt)}.`
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não deu pra aplicar agora.')
    } finally {
      setBusy(false)
    }
  }

  const preview = value ?? 0
  const maturity = new Date(Date.now() + (term?.days ?? 0) * 86_400_000).toISOString()
  return (
    <section className="rounded-brutal border border-line bg-void/60 p-3">
      <h4 className="mb-1 flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        <Snowflake className="h-3.5 w-3.5" aria-hidden />
        CDB congelado
      </h4>
      <p className="text-[11.5px] leading-snug text-muted-foreground">
        Rende mais, mas fica travado. Sair antes leva só parte do que rendeu.
      </p>

      <form
        className="mt-2.5 space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <AmountInput value={amount} onChange={(v) => { setAmount(v); setError(null) }} max={coins} min={rules.minDeposit} label="Quantos murchos congelar" />
        <Chips options={quick} value={value} onPick={(n) => setAmount(String(n))} />

        <div role="radiogroup" aria-label="Prazo" className="grid grid-cols-2 gap-1">
          {rules.terms.map((t) => (
            <button
              key={t.days}
              type="button"
              role="radio"
              aria-checked={days === t.days}
              onClick={() => setDays(t.days)}
              className={cn(
                'flex items-baseline justify-between gap-1 rounded-brutal border px-2 py-1.5 text-[11.5px] transition-colors',
                days === t.days
                  ? 'border-acid/60 bg-acid/10 text-acid'
                  : 'border-line text-muted-foreground hover:bg-void-light hover:text-foreground'
              )}
            >
              <span>{t.days} dias</span>
              <span className="font-mono">+{percentText(t.rate)}</span>
            </button>
          ))}
        </div>

        <div className="rounded-brutal border border-line bg-surface-raised/40 px-2.5 py-2 text-[11.5px] leading-snug text-muted-foreground">
          {preview > 0 && term ? (
            <>
              Em {day(maturity)} voltam{' '}
              <span className="font-mono text-foreground">{fmt(preview + Math.floor(preview * term.rate))}</span> (
              <span className="font-mono text-acid-text">+{fmt(Math.floor(preview * term.rate))}</span>).
            </>
          ) : (
            <>Quanto mais tempo congelado, mais rende: até {percentText(rules.terms[rules.terms.length - 1]?.rate ?? 0)}.</>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={value === null || busy}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Snowflake className="mr-1.5 h-4 w-4" />}
          {value !== null ? `Congelar ${fmt(value)}` : 'Congelar'}
        </Button>
      </form>
    </section>
  )
}

/** Congelados abertos: quanto rendeu até agora e quanto leva saindo já. */
function OpenTerms({ terms, onDone }: { terms: TermView[]; onDone: (title: string, body: string) => void }) {
  const { token } = useAuth()
  const [confirming, setConfirming] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const withdraw = async (id: string): Promise<void> => {
    if (!token || busy) return
    setBusy(id)
    setError(null)
    try {
      const res = await bankApi.termWithdraw(token, id)
      setConfirming(null)
      onDone(
        `${fmt(res.paid)} de volta`,
        res.lost > 0 ? `Saindo antes você deixou ${fmt(res.lost)} de rendimento.` : 'Voltou com todo o rendimento.'
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não deu pra sair agora.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section>
      <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">Seus congelados</h4>
      <ul className="space-y-1.5">
        {terms.map((t) => {
          const full = Math.floor(t.amount * t.rate)
          const left = daysUntil(t.maturesAt)
          return (
            <li key={t.id} className="rounded-brutal border border-line bg-void/60 px-2.5 py-2 text-[11.5px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-sm text-foreground">{fmt(t.amount)}</span>
                <span className="font-mono text-acid-text">+{fmt(full)}</span>
              </div>
              <p className="mt-0.5 flex items-center gap-1 text-muted-foreground">
                <CalendarClock className="h-3 w-3" aria-hidden />
                {t.termDays} dias · vence {day(t.maturesAt)}
                {left > 0 ? ` (${left === 1 ? 'amanhã' : `${left} dias`})` : ''}
              </p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-void-light" aria-hidden>
                <div className="h-full bg-acid" style={{ width: `${Math.round(t.now.fraction * 100)}%` }} />
              </div>
              {confirming === t.id ? (
                <div className="mt-1.5 space-y-1.5">
                  <p className="text-muted-foreground">
                    Saindo agora ({percentText(t.now.fraction)} do prazo) você leva{' '}
                    <span className="font-mono text-foreground">{fmt(t.now.total)}</span>:{' '}
                    {t.now.share > 0 ? (
                      <>
                        {percentText(t.now.share)} dos {fmt(t.now.accrued)} que já rendeu.
                      </>
                    ) : (
                      <>só o que aplicou, sem rendimento.</>
                    )}
                  </p>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="flex-1"
                      disabled={busy !== null}
                      onClick={() => void withdraw(t.id)}
                    >
                      {busy === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Sair agora'}
                    </Button>
                    <Button type="button" size="sm" variant="secondary" disabled={busy !== null} onClick={() => setConfirming(null)}>
                      Não
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(t.id)
                    setError(null)
                  }}
                  className="mt-1 text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                >
                  Sair antes do prazo
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </section>
  )
}

// ---------------------------------------------------------------------------
// CDB antigo (2/4 semanas): só pra quem ainda tem aplicação aberta
// ---------------------------------------------------------------------------

function LegacyDeposits({ deposits, onWithdrawn }: { deposits: DepositView[]; onWithdrawn: (forfeited: number) => void }) {
  const { token } = useAuth()
  const [confirming, setConfirming] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const withdraw = async (id: string): Promise<void> => {
    if (!token || busy) return
    setBusy(id)
    setError(null)
    try {
      const res = await bankApi.withdraw(token, id)
      setConfirming(null)
      onWithdrawn(res.forfeited)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não deu pra sacar agora.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section>
      <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        CDB antigo (2 e 4 semanas)
      </h4>
      <ul className="space-y-1.5">
        {deposits.map((d) => {
          const started = new Date(d.startsAt).getTime() <= Date.now()
          return (
            <li key={d.id} className="rounded-brutal border border-line bg-void/60 px-2.5 py-2 text-[11.5px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-sm text-foreground">{fmt(d.amount)}</span>
                <span className={cn('font-mono', d.earned > 0 ? 'text-acid-text' : 'text-muted-foreground')}>
                  +{fmt(d.earned)}
                </span>
              </div>
              <p className="mt-0.5 text-muted-foreground">
                {d.termWeeks} semanas · {started ? `vence ${day(d.maturesAt)}` : `rende a partir de ${day(d.startsAt)}`} ·
                segue as regras antigas até vencer
              </p>
              {confirming === d.id ? (
                <div className="mt-1.5 space-y-1.5">
                  <p className="text-muted-foreground">
                    Sacar antes devolve os {fmt(d.amount)} e{' '}
                    {d.earned > 0 ? <>queima os {fmt(d.earned)} de rendimento.</> : <>não rendeu nada ainda.</>}
                  </p>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="flex-1"
                      disabled={busy !== null}
                      onClick={() => void withdraw(d.id)}
                    >
                      {busy === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Sacar'}
                    </Button>
                    <Button type="button" size="sm" variant="secondary" disabled={busy !== null} onClick={() => setConfirming(null)}>
                      Não
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(d.id)
                    setError(null)
                  }}
                  className="mt-1 text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                >
                  Sacar antes do prazo
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </section>
  )
}

function CdbRules({ cdb }: { cdb: CdbView }) {
  const { rules } = cdb
  const [first, second, third] = [...rules.early].sort((a, b) => a.from - b.from)
  return (
    <section className="rounded-brutal border border-line bg-void/60 p-3">
      <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">Como funciona</h4>
      <ul className="space-y-1.5 text-xs leading-snug text-muted-foreground">
        <li>
          Diário: <span className="text-foreground">{percentText(rules.monthlyRate)} ao mês</span>, compostos todo dia à
          meia-noite. Rende o que ficou um dia inteiro aplicado. Resgate a qualquer hora, sem multa.
        </li>
        <li>
          Congelado: {rules.terms.map((t) => `${t.days} dias +${percentText(t.rate)}`).join(' · ')}. A taxa fica
          travada no dia em que você aplica.
        </li>
        {first && second && third && (
          <li>
            Sair do congelado antes: com menos de {percentText(first.from)} do prazo, sem rendimento; até{' '}
            {percentText(second.from)}, leva {percentText(first.share)} do que já rendeu; até {percentText(third.from)},{' '}
            {percentText(second.share)}; depois disso, {percentText(third.share)}.
          </li>
        )}
        <li>Sem teto: aplique quanto quiser. O murcho aplicado vira reserva do Banco, e a Casa sempre devolve.</li>
        <li>Quem deve ao Banco ou ao consórcio não aplica, mas resgatar sempre pode.</li>
      </ul>
    </section>
  )
}

function History({ terms, legacy }: { terms: TermView[]; legacy: DepositView[] }) {
  const rows = [
    ...terms.map((t) => ({
      id: t.id,
      at: t.closedAt ?? t.createdAt,
      label: `${t.termDays} dias · ${t.status === 'withdrawn' ? 'saiu antes' : 'venceu'}`,
      amount: t.amount,
      gain: t.paid - t.amount
    })),
    ...legacy.map((d) => ({
      id: d.id,
      at: d.closedAt ?? d.createdAt,
      label: `${d.termWeeks} semanas · ${d.status === 'withdrawn' ? 'sacada antes' : 'venceu'}`,
      amount: d.amount,
      gain: d.status === 'redeemed' ? d.earned : 0
    }))
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <section>
      <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        Aplicações anteriores
      </h4>
      <ul className="divide-y divide-line rounded-brutal border border-line bg-void/60">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11.5px]">
            <span className="text-muted-foreground">
              {day(r.at)} · {r.label}
            </span>
            <span className="font-mono text-foreground">
              {fmt(r.amount)}
              {r.gain > 0 && <span className="text-acid-text"> +{fmt(r.gain)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
