import * as React from 'react'
import { AlertTriangle, CalendarClock, ChevronRight, Loader2, Ticket, Wallet } from 'lucide-react'
import { MurchosIcon } from '@/lib/bocas-icons'
import { bankApi, type BankView, type ConsortiumView, type InvestView, type MembershipView } from '@/lib/api-bank'
import { daysUntil } from '@/lib/bank-math'
import { useAuth } from '@/lib/auth-context'
import { useGamification } from '@/lib/gamification-context'
import { cn } from '@/lib/utils'

/**
 * CARTEIRA — a aba que o Banco abre: o retrato do que a pessoa tem e deve.
 *
 * Só leitura. Saldo, dívidas abertas (empréstimo e parcela atrasada),
 * consórcios que ainda correm (com a próxima parcela) e o CDB aplicado. Cada
 * bloco leva pro balcão onde se resolve; nenhuma ação mora aqui, pra não ter
 * duas portas pro mesmo pagamento. Busca os três balcões juntos, de minuto em
 * minuto.
 */

const fmt = (n: number): string => n.toLocaleString('pt-BR')
const day = (iso: string): string => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

type Go = (tab: 'loan' | 'invest' | 'consortium') => void

export function WalletTab({ onGo }: { onGo: Go }) {
  const { token } = useAuth()
  const { profile } = useGamification()

  // undefined = buscando · null = falhou (cada um por si: um cair não esconde o outro)
  const [bank, setBank] = React.useState<BankView | null | undefined>(undefined)
  const [consortium, setConsortium] = React.useState<ConsortiumView | null | undefined>(undefined)
  const [invest, setInvest] = React.useState<InvestView | null | undefined>(undefined)

  const refresh = React.useCallback(async () => {
    if (!token) return
    const [b, c, i] = await Promise.allSettled([bankApi.view(token), bankApi.consortium(token), bankApi.invest(token)])
    if (b.status === 'fulfilled') setBank(b.value)
    else setBank((prev) => (prev === undefined ? null : prev))
    if (c.status === 'fulfilled') setConsortium(c.value)
    else setConsortium((prev) => (prev === undefined ? null : prev))
    if (i.status === 'fulfilled') setInvest(i.value)
    else setInvest((prev) => (prev === undefined ? null : prev))
  }, [token])

  React.useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 60_000)
    return () => clearInterval(timer)
  }, [refresh])

  const coins = profile?.coins ?? 0
  const loading = bank === undefined || consortium === undefined || invest === undefined

  return (
    <>
      <Balance coins={coins} carta={consortium?.carta ?? 0} />
      {loading ? (
        <div className="flex justify-center py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <>
          <Debts bank={bank ?? null} consortium={consortium ?? null} onGo={onGo} />
          <Consortiums consortium={consortium ?? null} onGo={onGo} />
          <Deposits invest={invest ?? null} onGo={onGo} />
        </>
      )}
    </>
  )
}

function Balance({ coins, carta }: { coins: number; carta: number }) {
  return (
    <section className="rounded-brutal border border-acid-dark/60 bg-acid/[0.05] p-3">
      <h4 className="flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        <Wallet className="h-3.5 w-3.5 text-acid-text" aria-hidden />
        Saldo
      </h4>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <MurchosIcon className="h-5 w-5 self-center text-acid-text" aria-hidden />
        <p className="font-mono text-3xl leading-none tabular-nums text-acid-text">{fmt(coins)}</p>
        <span className="text-xs text-muted-foreground">murchos</span>
      </div>
      {carta > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <Ticket className="h-3.5 w-3.5 text-acid-text" aria-hidden />
          Mais <span className="font-mono text-foreground">{fmt(carta)}</span> de carta do consórcio, pra lojinha.
        </p>
      )}
    </section>
  )
}

/** Tudo que está devendo agora: o empréstimo e as parcelas de consórcio atrasadas. */
function Debts({ bank, consortium, onGo }: { bank: BankView | null; consortium: ConsortiumView | null; onGo: Go }) {
  const loan = bank?.loan ?? null
  const late = (consortium?.mine ?? []).filter((m) => m.arrears > 0)
  const none = !loan && late.length === 0

  return (
    <section className="rounded-brutal border border-line bg-void/60 p-3">
      <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">Dívidas ativas</h4>
      {bank === null && consortium === null ? (
        <p className="text-xs text-destructive">Não deu pra buscar agora.</p>
      ) : none ? (
        <p className="text-xs text-muted-foreground">Nenhuma. Tudo em dia.</p>
      ) : (
        <ul className="space-y-1.5">
          {loan && (
            <Row
              tone={loan.state.late ? 'late' : 'due'}
              title={loan.state.late ? 'Empréstimo vencido' : 'Empréstimo'}
              detail={`vence ${day(loan.dueAt)}${loan.state.late ? ' (vencido)' : dueIn(loan.dueAt)}`}
              amount={loan.state.owed}
              onClick={() => onGo('loan')}
            />
          )}
          {late.map((m) => (
            <Row
              key={m.memberId}
              tone="late"
              title={`Parcela atrasada · ${m.name} #${m.number}`}
              detail="desconta do que você ganhar"
              amount={m.arrears}
              onClick={() => onGo('consortium')}
            />
          ))}
        </ul>
      )}
      {bank === null && consortium !== null && (
        <p className="mt-1.5 text-[11px] text-destructive">Empréstimo não carregou.</p>
      )}
      {consortium === null && bank !== null && (
        <p className="mt-1.5 text-[11px] text-destructive">Consórcio não carregou.</p>
      )}
    </section>
  )
}

/** Consórcios que ainda correm (ou esperam gente), com a próxima parcela. */
function Consortiums({ consortium, onGo }: { consortium: ConsortiumView | null; onGo: Go }) {
  if (consortium === null) return null
  const active = consortium.mine.filter((m) => m.status === 'active' && m.groupStatus !== 'done')

  return (
    <section className="rounded-brutal border border-line bg-void/60 p-3">
      <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        Consórcios ativos
      </h4>
      {active.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum.{' '}
          <button
            type="button"
            onClick={() => onGo('consortium')}
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            Ver grupos da Casa
          </button>
        </p>
      ) : (
        <ul className="space-y-1.5">
          {active.map((m) => (
            <Row
              key={m.memberId}
              tone={m.arrears > 0 ? 'late' : 'ok'}
              title={`${m.name} #${m.number}`}
              detail={consortiumDetail(m)}
              amount={m.parcel.total}
              amountLabel="/sem."
              onClick={() => onGo('consortium')}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/** CDB aplicado: quanto, quanto já rendeu e quando vence. */
function Deposits({ invest, onGo }: { invest: InvestView | null; onGo: Go }) {
  if (invest === null) return null

  const savings = invest.cdb?.savings
  const terms = invest.cdb?.terms ?? []
  const empty = invest.open.length === 0 && terms.length === 0 && !(savings && savings.total > 0)

  return (
    <section className="rounded-brutal border border-line bg-void/60 p-3">
      <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">CDB aplicado</h4>
      {empty ? (
        <p className="text-xs text-muted-foreground">
          Nada aplicado.{' '}
          <button
            type="button"
            onClick={() => onGo('invest')}
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            Aplicar no CDB
          </button>
        </p>
      ) : (
        <ul className="space-y-1.5">
          {savings && savings.total > 0 && (
            <Row
              tone="ok"
              title={`Diário${savings.auto ? ' · automático' : ''}${savings.earned > 0 ? ` · +${fmt(savings.earned)} rendido` : ''}`}
              detail="resgate quando quiser"
              amount={savings.total}
              onClick={() => onGo('invest')}
            />
          )}
          {terms.map((t) => (
            <Row
              key={t.id}
              tone="ok"
              title={`Congelado ${t.termDays} dias · +${fmt(Math.floor(t.amount * t.rate))} no fim`}
              detail={`vence ${day(t.maturesAt)}${dueIn(t.maturesAt)}`}
              amount={t.amount}
              onClick={() => onGo('invest')}
            />
          ))}
          {invest.open.map((d) => {
            const started = new Date(d.startsAt).getTime() <= Date.now()
            return (
              <Row
                key={d.id}
                tone="ok"
                title={`${d.termWeeks} semanas${d.earned > 0 ? ` · +${fmt(d.earned)} rendido` : ''}`}
                detail={started ? `vence ${day(d.maturesAt)}${dueIn(d.maturesAt)}` : `rende a partir de ${day(d.startsAt)}`}
                amount={d.amount}
                onClick={() => onGo('invest')}
              />
            )
          })}
        </ul>
      )}
    </section>
  )
}

function consortiumDetail(m: MembershipView): string {
  if (m.groupStatus === 'forming') return `formando · ${m.members.length} pessoas`
  const next = m.nextAssembly ? `próxima ${day(m.nextAssembly)}, 21h` : 'sem data'
  const carta = m.contemplatedAt ? ' · já contemplado' : ''
  return `${next} · ${m.paidCount} de ${m.size} pagas${carta}`
}

function dueIn(iso: string): string {
  const days = daysUntil(iso)
  return days <= 1 ? ' (amanhã)' : ` (${days} dias)`
}

function Row({
  tone,
  title,
  detail,
  amount,
  amountLabel,
  onClick
}: {
  tone: 'ok' | 'due' | 'late'
  title: string
  detail: string
  amount: number
  amountLabel?: string
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-2 rounded-brutal border px-2.5 py-2 text-left transition-colors hover:bg-void-light',
          tone === 'late' ? 'border-destructive/50' : tone === 'due' ? 'border-burn/40' : 'border-line'
        )}
      >
        {tone === 'late' ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
        ) : (
          <CalendarClock className={cn('h-3.5 w-3.5 shrink-0', tone === 'due' ? 'text-burn' : 'text-muted-foreground')} aria-hidden />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs text-foreground">{title}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{detail}</span>
        </span>
        <span
          className={cn(
            'shrink-0 font-mono text-sm tabular-nums',
            tone === 'late' ? 'text-destructive' : tone === 'due' ? 'text-burn' : 'text-foreground'
          )}
        >
          {fmt(amount)}
          {amountLabel && <span className="text-[11px] text-muted-foreground">{amountLabel}</span>}
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  )
}
