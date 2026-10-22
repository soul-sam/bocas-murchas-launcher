import * as React from 'react'
import { AlertTriangle, Check, Loader2, Ticket, Users } from 'lucide-react'
import { ShopIcon } from '@/lib/bocas-icons'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { bankApi, type ConsortiumPlanView, type ConsortiumView, type MembershipView } from '@/lib/api-bank'
import { cartaChance, percentText } from '@/lib/bank-math'
import { useAuth } from '@/lib/auth-context'
import { useGamification } from '@/lib/gamification-context'
import { useOverlays } from '@/lib/overlay-context'
import { cn } from '@/lib/utils'

/**
 * CONSÓRCIO — a aba do Banco pra juntar em grupo e comprar o épico, o
 * lendário ou o supremo antes de ter o valor inteiro.
 *
 * A Casa abre grupos de modelo fixo; começa no domingo com 4+ pessoas e dura
 * uma semana por pessoa. Todo domingo a parcela sai do saldo e UM é sorteado
 * com a carta, que só vale na lojinha. Nada aqui cria murcho: tudo que entra
 * no caixa do grupo sai como carta. As regras vêm do servidor.
 */

const fmt = (n: number): string => n.toLocaleString('pt-BR')
const day = (iso: string): string => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

export function ConsortiumTab() {
  const { token } = useAuth()
  const { pushToast, loadShop } = useGamification()
  const [view, setView] = React.useState<ConsortiumView | null | undefined>(undefined)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    if (!token) return
    try {
      setView(await bankApi.consortium(token))
    } catch {
      setView((prev) => (prev === undefined ? null : prev))
    }
  }, [token])

  React.useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 60_000)
    return () => clearInterval(timer)
  }, [refresh])

  /** Roda uma ação do painel: um botão por vez, o erro do servidor na tela. */
  const act = async (key: string, run: () => Promise<{ consortium: ConsortiumView }>, done?: () => void): Promise<void> => {
    if (busy) return
    setBusy(key)
    setError(null)
    try {
      const res = await run()
      setView(res.consortium)
      done?.()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não deu agora — tente de novo.')
    } finally {
      setBusy(null)
    }
  }

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
        Não deu pra abrir o consórcio agora.
      </p>
    )
  }
  if (!token) return null

  return (
    <>
      {view.arrears > 0 && (
        <Arrears
          amount={view.arrears}
          busy={busy === 'arrears'}
          // O débito já aparece no aviso de murchos (socket), com o rótulo da parcela.
          onPay={() => void act('arrears', () => bankApi.payArrears(token))}
        />
      )}
      {view.carta > 0 && <Carta amount={view.carta} />}

      {view.mine.map((m) => (
        <Membership
          key={m.memberId}
          m={m}
          rules={view.rules}
          busy={busy}
          onLeave={() =>
            void act(`leave:${m.groupId}`, async () => {
              const res = await bankApi.leave(token, m.groupId)
              pushToast({
                kind: 'info',
                title: res.result === 'left' ? `Você saiu do ${m.name} #${m.number}` : `Você desistiu do ${m.name} #${m.number}`,
                body: res.result === 'quit' ? 'O que você pagou volta no fim do grupo, menos a multa.' : undefined
              })
              return res
            })
          }
          onCashOut={() =>
            void act(
              `cash:${m.memberId}`,
              async () => {
                const res = await bankApi.cashOut(token, m.memberId)
                pushToast({ kind: 'coins', title: `+${fmt(res.net)} murchos`, body: `Carta sacada (${fmt(res.fee)} de desconto).` })
                return res
              },
              () => void loadShop()
            )
          }
        />
      ))}

      <section>
        <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">Grupos da Casa</h4>
        {!view.eligible && view.reason && <p className="mb-1.5 text-[11.5px] text-muted-foreground">{view.reason}</p>}
        <div className="space-y-1.5">
          {view.plans.map((plan) => (
            <Plan
              key={plan.id}
              plan={plan}
              rules={view.rules}
              disabled={!view.eligible || plan.joined}
              busy={busy === `join:${plan.id}`}
              onJoin={() =>
                void act(`join:${plan.id}`, async () => {
                  const res = await bankApi.join(token, plan.id)
                  pushToast({
                    kind: 'info',
                    title: `Você entrou no ${plan.name}`,
                    body: `Começa no domingo em que tiver ${view.rules.minMembers} pessoas ou mais.`
                  })
                  return res
                })
              }
            />
          ))}
        </div>
      </section>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <Rules view={view} />
    </>
  )
}

function Arrears({ amount, busy, onPay }: { amount: number; busy: boolean; onPay: () => void }) {
  return (
    <section className="rounded-brutal border border-destructive/50 bg-destructive/[0.06] p-3">
      <h4 className="flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-hidden />
        Parcela atrasada
      </h4>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <p className="font-mono text-3xl leading-none tabular-nums text-destructive">{fmt(amount)}</p>
        <span className="text-xs text-muted-foreground">pra quitar</span>
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">
        Até quitar, o que você ganhar (atividade e prêmio de aposta) vai pra ela, e transferência fica travada.
      </p>
      <Button type="button" className="mt-2.5 w-full" disabled={busy} onClick={onPay}>
        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
        Pagar com o saldo
      </Button>
    </section>
  )
}

function Carta({ amount }: { amount: number }) {
  const { openShop, closeBank } = useOverlays()
  // Troca de modal: banco e lojinha são camadas irmãs, e o banco ficaria por cima.
  const goShop = (): void => {
    closeBank()
    openShop()
  }
  return (
    <section className="rounded-brutal border border-acid-dark/60 bg-acid/[0.05] p-3">
      <h4 className="flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        <Ticket className="h-3.5 w-3.5 text-acid-text" aria-hidden />
        Sua carta
      </h4>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <p className="font-mono text-3xl leading-none tabular-nums text-acid-text">{fmt(amount)}</p>
        <span className="text-xs text-muted-foreground">murchos na lojinha</span>
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">
        Compra e presente usam a carta antes do saldo.
      </p>
      <Button type="button" variant="secondary" className="mt-2.5 w-full" onClick={goShop}>
        <ShopIcon className="mr-1.5 h-4 w-4" />
        Abrir a lojinha
      </Button>
    </section>
  )
}

function Membership({
  m,
  rules,
  busy,
  onLeave,
  onCashOut
}: {
  m: MembershipView
  rules: ConsortiumView['rules']
  busy: string | null
  onLeave: () => void
  onCashOut: () => void
}) {
  const [confirming, setConfirming] = React.useState(false)
  const contemplated = m.contemplatedAt !== null
  const pending = m.members.filter((x) => !x.contemplated && !x.quit).length
  const forming = m.groupStatus === 'forming'
  const done = m.groupStatus === 'done'
  const quit = m.status === 'quit'
  const leaving = busy === `leave:${m.groupId}`

  return (
    <section
      className={cn(
        'rounded-brutal border p-3',
        contemplated ? 'border-acid-dark/60 bg-acid/[0.04]' : 'border-burn/40 bg-burn/[0.04]'
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
          {m.name} #{m.number}
        </h4>
        <span className="text-[11px] text-muted-foreground">
          {forming
            ? `formando · ${m.members.length} de ${rules.maxMembers}`
            : done
              ? 'encerrado'
              : `assembleia ${m.done} de ${m.size}`}
        </span>
      </div>

      <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">
        {quit ? (
          'Você desistiu: o que pagou volta no fim do grupo, menos a multa.'
        ) : forming ? (
          <>
            Começa no domingo em que tiver {rules.minMembers}+ pessoas. Com {Math.max(rules.minMembers, m.members.length)},
            a parcela fica em <span className="font-mono text-foreground">{fmt(m.parcel.total)}</span> por semana.
          </>
        ) : contemplated ? (
          <>
            Contemplado em {day(m.contemplatedAt!)}: carta de <span className="font-mono text-acid-text">{fmt(m.credit)}</span>
            {m.creditLeft < m.credit ? <> ({fmt(m.creditLeft)} ainda sem usar)</> : null}.
            {!done && <> As parcelas continuam até o fim do grupo.</>}
          </>
        ) : (
          <>
            Esperando a carta: chance de{' '}
            <span className="text-foreground">{percentText(cartaChance(pending))}</span> no próximo sorteio
            {m.nextAssembly ? <> ({day(m.nextAssembly)}, 21h)</> : null}.
          </>
        )}
      </p>

      {!forming && !done && !quit && (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
          <dt className="text-muted-foreground">parcela</dt>
          <dd className="text-right font-mono text-foreground">{fmt(m.parcel.total)}</dd>
          <dt className="text-muted-foreground">pagas</dt>
          <dd className="text-right font-mono text-foreground">
            {m.paidCount} de {m.size}
          </dd>
          {m.arrears > 0 && (
            <>
              <dt className="text-muted-foreground">atrasado</dt>
              <dd className="text-right font-mono text-destructive">{fmt(m.arrears)}</dd>
            </>
          )}
        </dl>
      )}

      <ul className="mt-2 flex flex-wrap gap-1">
        {m.members.map((x) => (
          <li
            key={x.userId}
            className={cn(
              'flex items-center gap-1 rounded-brutal border px-1.5 py-0.5 text-[11px]',
              x.quit
                ? 'border-line text-muted-foreground line-through'
                : x.contemplated
                  ? 'border-acid-dark/60 text-acid-text'
                  : 'border-line text-foreground'
            )}
          >
            {x.contemplated && <Check className="h-3 w-3" aria-label="contemplado" />}
            {x.displayName}
          </li>
        ))}
      </ul>

      {done && m.creditLeft > 0 && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-2.5 w-full"
          disabled={busy !== null}
          onClick={onCashOut}
        >
          {busy === `cash:${m.memberId}` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Sacar a carta em murchos (−{percentText(rules.cashOutFee)})
        </Button>
      )}
      {done && m.creditLeft > 0 && m.creditUntil && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Vale na lojinha até {day(m.creditUntil)}; depois vira murcho sozinha, com o mesmo desconto.
        </p>
      )}

      {!done && !quit && !contemplated && (
        confirming ? (
          <div className="mt-2.5 space-y-1.5">
            <p className="text-[11.5px] text-muted-foreground">
              {forming
                ? 'Sair agora é de graça: ninguém pagou nada ainda.'
                : `Desistir para as parcelas; o que você pagou volta no fim do grupo, menos ${percentText(rules.quitPenalty)}.`}
            </p>
            <div className="flex gap-1.5">
              <Button type="button" size="sm" variant="destructive" className="flex-1" disabled={busy !== null} onClick={onLeave}>
                {leaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : forming ? 'Sair' : 'Desistir'}
              </Button>
              <Button type="button" size="sm" variant="secondary" disabled={busy !== null} onClick={() => setConfirming(false)}>
                Não
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-2 text-[11.5px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {forming ? 'Sair do grupo' : 'Desistir'}
          </button>
        )
      )}
    </section>
  )
}

function Plan({
  plan,
  rules,
  disabled,
  busy,
  onJoin
}: {
  plan: ConsortiumPlanView
  rules: ConsortiumView['rules']
  disabled: boolean
  busy: boolean
  onJoin: () => void
}) {
  const totals = plan.parcels.map((p) => p.total)
  const low = Math.min(...totals)
  const high = Math.max(...totals)
  const people = plan.forming?.members.length ?? 0
  return (
    <div className="rounded-brutal border border-line bg-void/60 px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-foreground">{plan.name}</span>
        <span className="font-mono text-sm text-acid-text">{fmt(plan.carta)}</span>
      </div>
      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
        Parcela de {fmt(low)} a {fmt(high)} por semana ({rules.minMembers} a {rules.maxMembers} pessoas).
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Users className="h-3 w-3" aria-hidden />
          {plan.joined && people === 0 ? 'seu grupo já está rodando' : people > 0 ? `${people} esperando` : 'ninguém ainda'}
          {people > 0 && people < rules.minMembers ? ` · faltam ${rules.minMembers - people}` : ''}
        </span>
        <Button type="button" size="sm" variant="secondary" disabled={disabled || busy} onClick={onJoin}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : plan.joined ? 'Você está' : 'Entrar'}
        </Button>
      </div>
    </div>
  )
}

function Rules({ view }: { view: ConsortiumView }) {
  const { rules } = view
  return (
    <section className="rounded-brutal border border-line bg-void/60 p-3">
      <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">Como funciona</h4>
      <ul className="space-y-1.5 text-xs leading-snug text-muted-foreground">
        <li>
          Todo domingo, 21h, a parcela sai do saldo e UM do grupo é sorteado com a carta. O grupo dura uma semana por
          pessoa: todo mundo que fica até o fim recebe.
        </li>
        <li>
          A parcela é a carta dividida pelo grupo, mais {percentText(rules.adminFee)} de taxa (queimada) e{' '}
          {percentText(rules.reserveFee)} pro fundo de reserva, que volta no fim pra quem não atrasou.
        </li>
        <li>
          A carta só vale na lojinha até {rules.cartaGraceDays} dias depois do fim; aí vira murcho com{' '}
          {percentText(rules.cashOutFee)} de desconto.
        </li>
        <li>
          Parcela sem saldo vira atraso: o fundo e o Banco cobrem o grupo, e você paga com o que ganhar. De quem não foi
          sorteado, o atraso sai da carta.
        </li>
        <li>
          Desistir antes da carta para as parcelas; o que você pagou volta no fim, menos {percentText(rules.quitPenalty)}.
        </li>
      </ul>
    </section>
  )
}
