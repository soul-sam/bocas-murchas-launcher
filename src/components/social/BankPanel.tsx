import * as React from 'react'
import { AlertTriangle, CalendarClock, Landmark, Loader2, ShieldCheck } from 'lucide-react'
import { MurchosIcon } from '@/lib/bocas-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Hint } from '@/components/ui/tooltip'
import { ApiError } from '@/lib/api'
import { bankApi, type BankView, type LoanView } from '@/lib/api-bank'
import { daysUntil, loanInterest, loanTotalAtTerm, parseLoanAmount, percentText } from '@/lib/bank-math'
import { formatCompact } from '@/lib/api-gamification'
import { useAuth } from '@/lib/auth-context'
import { useGamification } from '@/lib/gamification-context'
import { useLayout } from '@/lib/layout-context'
import { cn } from '@/lib/utils'
import { ArenaHeader, ArenaTabs } from './ArenaChrome'

/**
 * BANCO DA CASA — empréstimo de murcho, de reserva integral.
 *
 * O Banco só empresta o que tem na reserva (o cofre da Casa enche ela no
 * fechamento de domingo e com o juro que recebe): pegar emprestado não cria
 * murcho, só move. As regras vêm todas do servidor (`bank.rules`); a tela só
 * mostra a prévia — juro, total no prazo, o que trava enquanto deve.
 *
 * Dois estados: sem dívida, a oferta (quanto dá, por quanto tempo, quanto
 * volta); com dívida, quanto falta, quando vence e o pagamento. Busca ao
 * abrir, depois de cada ação e de minuto em minuto com o painel aberto — o
 * desconto automático mexe na dívida sem ninguém clicar.
 */

const fmt = (n: number): string => n.toLocaleString('pt-BR')

export function BankPanel() {
  const { closeBank: close } = useLayout()
  const { token } = useAuth()
  const { profile, pushToast } = useGamification()

  // undefined = buscando · null = falhou
  const [bank, setBank] = React.useState<BankView | null | undefined>(undefined)

  const refresh = React.useCallback(async () => {
    if (!token) return
    try {
      setBank(await bankApi.view(token))
    } catch {
      setBank((prev) => (prev === undefined ? null : prev))
    }
  }, [token])

  React.useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 60_000)
    return () => clearInterval(timer)
  }, [refresh])

  const coins = profile?.coins ?? 0

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-void xl:w-80">
      <ArenaHeader title="Banco da Casa" onClose={close} />
      <ArenaTabs current="bank" />

      <div className="scroll-stable min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {bank === undefined && (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
        {bank === null && (
          <p className="rounded-brutal border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Não deu pra abrir o Banco agora.
          </p>
        )}
        {bank && (
          <>
            <Reserve bank={bank} />
            {bank.loan ? (
              <Debt
                bank={bank}
                loan={bank.loan}
                coins={coins}
                onPaid={(closed) => {
                  // O débito já aparece no aviso de murchos (socket); quitar merece o seu.
                  if (closed) pushToast({ kind: 'coins', title: 'Empréstimo quitado', body: 'Nada mais travado.' })
                  void refresh()
                }}
              />
            ) : (
              <Offer
                bank={bank}
                onTaken={(loan) => {
                  pushToast({
                    kind: 'coins',
                    title: `Empréstimo de ${fmt(loan.principal)} murchos`,
                    body: `Vence em ${loan.termDays} dias.`
                  })
                  void refresh()
                }}
              />
            )}
            <Rules bank={bank} />
            {bank.history.length > 0 && <History loans={bank.history} />}
          </>
        )}
      </div>
    </aside>
  )
}

/** A reserva: quanto o Banco tem pra emprestar e quanto está na rua. */
function Reserve({ bank }: { bank: BankView }) {
  return (
    <section className="rounded-brutal border border-acid-dark/60 bg-acid/[0.05] p-3">
      <h4 className="flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        <Landmark className="h-3.5 w-3.5 text-acid-text" aria-hidden />
        Reserva do Banco
      </h4>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <p className="font-mono text-3xl leading-none tabular-nums text-acid-text">{fmt(bank.reserve)}</p>
        <span className="text-xs text-muted-foreground">murchos</span>
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">
        {bank.lent > 0 ? (
          <>
            <span className="font-mono text-foreground">{fmt(bank.lent)}</span> emprestados agora.{' '}
          </>
        ) : null}
        O Banco só empresta o que tem aqui: pegar emprestado não cria murcho, só move.
      </p>
    </section>
  )
}

const TERM_LABEL: Record<number, string> = { 7: '1 semana', 14: '2 semanas', 28: '4 semanas' }

/** Sem dívida: quanto dá pra pegar, por quanto tempo e quanto volta. */
function Offer({ bank, onTaken }: { bank: BankView; onTaken: (loan: LoanView) => void }) {
  const { token } = useAuth()
  const { offer, rules } = bank
  const terms = rules.terms.length > 0 ? rules.terms : [7, 14, 28]
  const [amount, setAmount] = React.useState('')
  const [term, setTerm] = React.useState<number>(terms[1] ?? terms[0])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const value = parseLoanAmount(amount, rules.minLoan, offer.max)
  // Um quarto e metade, redondos; a última ficha é o máximo EXATO (arredondar
  // ela também mostrava 2.400 pra quem podia pegar 2.425).
  const quick = React.useMemo(() => {
    const parts = [0.25, 0.5].map((f) => Math.floor((offer.max * f) / 50) * 50)
    return [...new Set([...parts, offer.max])].filter((n) => n >= rules.minLoan)
  }, [offer.max, rules.minLoan])

  if (!offer.eligible) {
    return (
      <section className="rounded-brutal border border-line bg-void/60 p-3">
        <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
          Pegar emprestado
        </h4>
        <p className="text-xs leading-snug text-muted-foreground">{offer.reason ?? 'O Banco não pode emprestar agora.'}</p>
        {offer.income > 0 && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Sua renda de atividade nos últimos {rules.incomeWindowDays} dias:{' '}
            <span className="font-mono text-foreground">{fmt(offer.income)}</span>
          </p>
        )}
      </section>
    )
  }

  const submit = async (): Promise<void> => {
    if (!token || value === null || busy) return
    setBusy(true)
    setError(null)
    try {
      const { loan } = await bankApi.take(token, value, term)
      setAmount('')
      onTaken(loan)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não deu pra pegar o empréstimo agora.')
    } finally {
      setBusy(false)
    }
  }

  const preview = value ?? 0

  return (
    <section className="rounded-brutal border border-line bg-void/60 p-3">
      <h4 className="mb-1 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        Pegar emprestado
      </h4>
      <p className="text-[11.5px] leading-snug text-muted-foreground">
        Você pode pegar até <span className="font-mono text-burn">{fmt(offer.max)}</span>
        {offer.max < offer.limit ? (
          <> agora (seu limite é {fmt(offer.limit)}, mas a reserva tem menos)</>
        ) : (
          <> — {percentText(rules.incomeShare)} do que você ganhou nos últimos {rules.incomeWindowDays} dias</>
        )}
        .
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
            placeholder={`De ${rules.minLoan} a ${fmt(offer.max)}`}
            value={amount}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 5)
              setAmount(digits === '' ? '' : String(Math.min(Number(digits), offer.max)))
              setError(null)
            }}
            className="pl-9 font-mono"
            aria-label="Quantos murchos pegar"
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
              {n === offer.max ? `${fmt(n)} (máx.)` : fmt(n)}
            </button>
          ))}
        </div>

        <div role="radiogroup" aria-label="Prazo" className="grid grid-cols-3 gap-1">
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
              {TERM_LABEL[t] ?? `${t} dias`}
            </button>
          ))}
        </div>

        <div className="rounded-brutal border border-line bg-surface-raised/40 px-2.5 py-2 text-[11.5px] leading-snug text-muted-foreground">
          {preview > 0 ? (
            <>
              Quitando no prazo, você devolve{' '}
              <span className="font-mono text-foreground">{fmt(loanTotalAtTerm(preview, term, rules))}</span>{' '}
              (<span className="font-mono">{fmt(loanInterest(preview, term, rules))}</span> de juro). Quitar antes
              paga menos: são {percentText(rules.dailyRate)} por dia, no mínimo {rules.minDays} dias.
            </>
          ) : (
            <>
              Juro de {percentText(rules.dailyRate)} por dia corrido (mínimo {rules.minDays} dias). Quitar antes paga
              menos.
            </>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={value === null || busy}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <MurchosIcon className="mr-1.5 h-4 w-4" />}
          {value !== null ? `Pegar ${fmt(value)}` : 'Pegar emprestado'}
        </Button>
      </form>
    </section>
  )
}

/** Com dívida: quanto falta, quando vence, o desconto automático e o pagamento. */
function Debt({
  bank,
  loan,
  coins,
  onPaid
}: {
  bank: BankView
  loan: LoanView
  coins: number
  onPaid: (closed: boolean) => void
}) {
  const { token } = useAuth()
  const { rules } = bank
  const { state } = loan
  const [amount, setAmount] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const cap = Math.min(state.owed, coins)
  const value = parseLoanAmount(amount, 1, cap)
  const days = daysUntil(loan.dueAt)
  const due = new Date(loan.dueAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const withhold = state.late ? rules.withhold.late : rules.withhold.current

  const pay = async (what: number | undefined): Promise<void> => {
    if (!token || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await bankApi.pay(token, what)
      setAmount('')
      onPaid(res.loan.status === 'paid')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não deu pra pagar agora.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className={cn(
        'rounded-brutal border p-3',
        state.late ? 'border-destructive/50 bg-destructive/[0.06]' : 'border-burn/40 bg-burn/[0.05]'
      )}
    >
      <h4 className="flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        {state.late ? (
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-hidden />
        ) : (
          <CalendarClock className="h-3.5 w-3.5 text-burn" aria-hidden />
        )}
        {state.late ? 'Empréstimo vencido' : 'Seu empréstimo'}
      </h4>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <p className={cn('font-mono text-3xl leading-none tabular-nums', state.late ? 'text-destructive' : 'text-burn')}>
          {fmt(state.owed)}
        </p>
        <span className="text-xs text-muted-foreground">pra quitar</span>
      </div>

      <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
        <dt className="text-muted-foreground">pegou</dt>
        <dd className="text-right font-mono text-foreground">{fmt(loan.principal)}</dd>
        <dt className="text-muted-foreground">juro ({state.days} dias)</dt>
        <dd className="text-right font-mono text-foreground">{fmt(state.interest)}</dd>
        {state.penalty > 0 && (
          <>
            <dt className="text-muted-foreground">multa do atraso</dt>
            <dd className="text-right font-mono text-destructive">{fmt(state.penalty)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">já pago</dt>
        <dd className="text-right font-mono text-foreground">{fmt(loan.principalPaid + loan.chargesPaid)}</dd>
        <dt className="text-muted-foreground">vence</dt>
        <dd className={cn('text-right font-mono', state.late ? 'text-destructive' : 'text-foreground')}>
          {due}
          {state.late ? ' (vencido)' : days <= 1 ? ' (amanhã)' : ` (${days} dias)`}
        </dd>
      </dl>

      <p className="mt-2.5 text-[11.5px] leading-snug text-muted-foreground">
        Desconto automático: <span className="text-foreground">{percentText(withhold)}</span> do que você ganhar
        (atividade e prêmio de aposta) vai direto pra dívida.
        {state.late
          ? ' Vencido: lojinha, aposta e mesa valendo ficam travadas até quitar.'
          : ` Enquanto deve: sem doação, gorjeta, presente nem mesa valendo, e aposta até ${rules.wagerCapWhileOwing}.`}
      </p>

      <form
        className="mt-2.5 space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (value !== null) void pay(value)
        }}
      >
        <div className="flex gap-1.5">
          <div className="relative min-w-0 flex-1">
            <MurchosIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              inputMode="numeric"
              placeholder={cap > 0 ? `Até ${fmt(cap)}` : 'Sem saldo'}
              value={amount}
              disabled={cap <= 0}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 5)
                setAmount(digits === '' ? '' : String(Math.min(Number(digits), Math.max(cap, 1))))
                setError(null)
              }}
              className="pl-9 font-mono"
              aria-label="Quanto pagar"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={value === null || busy}>
            Pagar
          </Button>
        </div>
        <Button
          type="button"
          className="w-full"
          disabled={busy || coins < state.owed}
          onClick={() => void pay(undefined)}
        >
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1.5 h-4 w-4" />}
          {coins >= state.owed ? `Quitar ${fmt(state.owed)}` : `Faltam ${fmt(state.owed - coins)} pra quitar`}
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </form>
    </section>
  )
}

/** As regras, do servidor: o que custa, o que trava e por quê. */
function Rules({ bank }: { bank: BankView }) {
  const { rules } = bank
  return (
    <section className="rounded-brutal border border-line bg-void/60 p-3">
      <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        Como funciona
      </h4>
      <ul className="space-y-1.5 text-xs leading-snug text-muted-foreground">
        <li>
          Limite: <span className="text-foreground">{percentText(rules.incomeShare)}</span> do que você ganhou em
          atividade nos últimos {rules.incomeWindowDays} dias, até {fmt(rules.maxPrincipal)}. Aposta e doação não
          contam.
        </li>
        <li>
          Juro simples de <span className="text-foreground">{percentText(rules.dailyRate)} ao dia</span>. Passou do
          prazo, multa de {percentText(rules.lateFee)}; juro e multa nunca passam de{' '}
          {percentText(rules.chargeCap)} do que você pegou.
        </li>
        <li>
          Metade do juro é queimada (segura a inflação); o resto volta pra reserva e pro{' '}
          <Hint label="Prêmio do Ano" description="Os três primeiros do recap do ano levam o Fundo do Ano." side="left">
            <span className="cursor-help text-foreground underline decoration-dotted underline-offset-2">Prêmio do Ano</span>
          </Hint>
          .
        </li>
        <li>Seu saldo nunca fica negativo: a dívida mora no Banco, e o desconto automático vai abatendo.</li>
      </ul>
    </section>
  )
}

function History({ loans }: { loans: LoanView[] }) {
  return (
    <section>
      <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        Empréstimos anteriores
      </h4>
      <ul className="divide-y divide-line rounded-brutal border border-line bg-void/60">
        {loans.map((loan) => (
          <li key={loan.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11.5px]">
            <span className="text-muted-foreground">
              {new Date(loan.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ·{' '}
              {loan.termDays} dias
            </span>
            <span className="font-mono text-foreground">
              {formatCompact(loan.principal)}
              <span className="text-muted-foreground"> + {formatCompact(loan.chargesPaid)} de juro</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
