import * as React from 'react'
import { Loader2, PiggyBank, TrendingUp } from 'lucide-react'
import { MurchosIcon } from '@/lib/bocas-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { bankApi, type DepositView, type InvestView } from '@/lib/api-bank'
import { maxYield, parseLoanAmount, percentText } from '@/lib/bank-math'
import { useAuth } from '@/lib/auth-context'
import { useGamification } from '@/lib/gamification-context'
import { cn } from '@/lib/utils'

/**
 * CDB DA CASA — a aba Investir do Banco.
 *
 * Murcho aplicado fica travado 2 ou 4 semanas e rende no fechamento de
 * domingo. O rendimento NÃO é uma taxa prometida: sai do lucro da Casa na
 * semana (e de parte do juro do Banco), dividido entre quem aplicou, com teto
 * por semana. Por isso a tela diz "até" e mostra o que a última semana pagou.
 * As regras vêm do servidor (`invest.rules`).
 */

const fmt = (n: number): string => n.toLocaleString('pt-BR')
const day = (iso: string): string => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

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
  return (
    <>
      <Summary view={view} />
      <DepositForm
        view={view}
        coins={coins}
        onDone={(deposit) => {
          pushToast({
            kind: 'coins',
            title: `${fmt(deposit.amount)} murchos aplicados`,
            body: `Começa a render no fechamento de ${day(deposit.startsAt)} e vence em ${day(deposit.maturesAt)}.`
          })
          void refresh()
        }}
      />
      {view.open.length > 0 && (
        <OpenDeposits
          deposits={view.open}
          onWithdrawn={(forfeited) => {
            pushToast({
              kind: 'coins',
              title: 'Aplicação sacada',
              body: forfeited > 0 ? `O principal voltou; ${fmt(forfeited)} de rendimento foram queimados.` : 'O principal voltou inteiro.'
            })
            void refresh()
          }}
        />
      )}
      <InvestRules view={view} />
      {view.history.length > 0 && <History deposits={view.history} />}
    </>
  )
}

/** Quanto tenho aplicado e o que a última semana pagou. */
function Summary({ view }: { view: InvestView }) {
  const mine = view.open.reduce((sum, d) => sum + d.amount, 0)
  const earned = view.open.reduce((sum, d) => sum + d.earned, 0)
  const last = view.lastYield
  return (
    <section className="rounded-brutal border border-acid-dark/60 bg-acid/[0.05] p-3">
      <h4 className="flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        <PiggyBank className="h-3.5 w-3.5 text-acid-text" aria-hidden />
        CDB da Casa
      </h4>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <p className="font-mono text-3xl leading-none tabular-nums text-acid-text">{fmt(mine)}</p>
        <span className="text-xs text-muted-foreground">aplicados</span>
      </div>
      {earned > 0 && (
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          <span className="font-mono text-acid-text">+{fmt(earned)}</span> de rendimento travado até vencer
        </p>
      )}
      <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
        <TrendingUp className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        {last && last.paid > 0 ? (
          <span>
            Última semana rendeu <span className="font-mono text-foreground">{percentText(last.rate)}</span> (
            {fmt(last.paid)} murchos pra {fmt(last.eligible)} aplicados).
          </span>
        ) : (
          <span>Ainda não houve semana com rendimento pago.</span>
        )}
      </p>
    </section>
  )
}

const TERM_LABEL: Record<number, string> = { 2: '2 semanas', 4: '4 semanas' }

function DepositForm({ view, coins, onDone }: { view: InvestView; coins: number; onDone: (d: DepositView) => void }) {
  const { token } = useAuth()
  const { rules } = view
  const terms = rules.terms.length > 0 ? rules.terms : [2, 4]
  const max = Math.min(view.room, coins)
  const [amount, setAmount] = React.useState('')
  const [term, setTerm] = React.useState<number>(terms[terms.length - 1])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const value = parseLoanAmount(amount, rules.minDeposit, max)
  const quick = React.useMemo(() => {
    const parts = [0.25, 0.5].map((f) => Math.floor((max * f) / 50) * 50)
    return [...new Set([...parts, max])].filter((n) => n >= rules.minDeposit)
  }, [max, rules.minDeposit])

  if (!view.eligible || max < rules.minDeposit) {
    return (
      <section className="rounded-brutal border border-line bg-void/60 p-3">
        <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">Aplicar</h4>
        <p className="text-xs leading-snug text-muted-foreground">
          {view.reason ??
            (coins < rules.minDeposit
              ? `A aplicação mínima é ${fmt(rules.minDeposit)} murchos.`
              : 'Não dá pra aplicar agora.')}
        </p>
      </section>
    )
  }

  const submit = async (): Promise<void> => {
    if (!token || value === null || busy) return
    setBusy(true)
    setError(null)
    try {
      const { deposit } = await bankApi.deposit(token, value, term)
      setAmount('')
      onDone(deposit)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não deu pra aplicar agora.')
    } finally {
      setBusy(false)
    }
  }

  const preview = value ?? 0
  return (
    <section className="rounded-brutal border border-line bg-void/60 p-3">
      <h4 className="mb-1 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">Aplicar</h4>
      <p className="text-[11.5px] leading-snug text-muted-foreground">
        Você pode aplicar até <span className="font-mono text-burn">{fmt(max)}</span>
        {view.room < coins ? <> (o teto é {fmt(rules.maxOpen)} por pessoa)</> : null}.
      </p>

      <form
        className="mt-2.5 space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className="relative">
          <MurchosIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            inputMode="numeric"
            placeholder={`De ${rules.minDeposit} a ${fmt(max)}`}
            value={amount}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 5)
              setAmount(digits === '' ? '' : String(Math.min(Number(digits), max)))
              setError(null)
            }}
            className="pl-9 font-mono"
            aria-label="Quantos murchos aplicar"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {quick.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setAmount(String(n))}
              className={cn(
                'rounded-brutal border px-2 py-1 font-mono text-[11.5px] transition-colors',
                value === n
                  ? 'border-burn bg-burn/15 text-burn'
                  : 'border-line text-muted-foreground hover:border-burn/50 hover:text-foreground'
              )}
            >
              {n === max ? `${fmt(n)} (máx.)` : fmt(n)}
            </button>
          ))}
        </div>

        <div role="radiogroup" aria-label="Prazo" className="grid grid-cols-2 gap-1">
          {terms.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={term === t}
              onClick={() => setTerm(t)}
              className={cn(
                'rounded-brutal border px-1 py-1.5 text-[11.5px] transition-colors',
                term === t
                  ? 'border-acid/60 bg-acid/10 text-acid'
                  : 'border-line text-muted-foreground hover:bg-void-light hover:text-foreground'
              )}
            >
              {TERM_LABEL[t] ?? `${t} semanas`}
            </button>
          ))}
        </div>

        <div className="rounded-brutal border border-line bg-surface-raised/40 px-2.5 py-2 text-[11.5px] leading-snug text-muted-foreground">
          {preview > 0 ? (
            <>
              Rende <span className="text-foreground">até</span>{' '}
              <span className="font-mono text-foreground">{fmt(maxYield(preview, term, rules.maxWeeklyRate))}</span> em{' '}
              {term} semanas. O rendimento sai do lucro da Casa em cada domingo: semana fraca rende menos.
            </>
          ) : (
            <>
              Rende até {percentText(rules.maxWeeklyRate)} por semana, a partir da semana que vem. Fica travado até
              vencer.
            </>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={value === null || busy}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PiggyBank className="mr-1.5 h-4 w-4" />}
          {value !== null ? `Aplicar ${fmt(value)}` : 'Aplicar'}
        </Button>
      </form>
    </section>
  )
}

/** As aplicações abertas, com o saque antecipado (que pede confirmação). */
function OpenDeposits({ deposits, onWithdrawn }: { deposits: DepositView[]; onWithdrawn: (forfeited: number) => void }) {
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
        Suas aplicações
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
                {d.termWeeks} semanas · {started ? `vence ${day(d.maturesAt)}` : `rende a partir de ${day(d.startsAt)}`}
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

function InvestRules({ view }: { view: InvestView }) {
  const { rules } = view
  return (
    <section className="rounded-brutal border border-line bg-void/60 p-3">
      <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">Como funciona</h4>
      <ul className="space-y-1.5 text-xs leading-snug text-muted-foreground">
        <li>
          O rendimento sai do lucro da Casa: <span className="text-foreground">{percentText(rules.yieldShare)}</span> do
          que a banca junta acima da reserva no domingo, mais um quarto do juro do Banco. Nada é impresso.
        </li>
        <li>
          Dividido entre quem aplicou, em proporção ao valor, até{' '}
          <span className="text-foreground">{percentText(rules.maxWeeklyRate)} por semana</span>. O que passar disso é
          queimado.
        </li>
        <li>
          Até {fmt(rules.maxOpen)} por pessoa: quem tem muito murcho parado não leva o rendimento de todo mundo.
        </li>
        <li>Começa a render na semana seguinte à aplicação. Sacar antes devolve o principal e queima o rendimento.</li>
        <li>Quem deve ao Banco ou ao consórcio não aplica.</li>
      </ul>
    </section>
  )
}

function History({ deposits }: { deposits: DepositView[] }) {
  return (
    <section>
      <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        Aplicações anteriores
      </h4>
      <ul className="divide-y divide-line rounded-brutal border border-line bg-void/60">
        {deposits.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11.5px]">
            <span className="text-muted-foreground">
              {d.closedAt ? day(d.closedAt) : day(d.createdAt)} · {d.status === 'withdrawn' ? 'sacada antes' : 'venceu'}
            </span>
            <span className="font-mono text-foreground">
              {fmt(d.amount)}
              {d.status === 'redeemed' && <span className="text-acid-text"> +{fmt(d.earned)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
