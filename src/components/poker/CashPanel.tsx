import * as React from 'react'
import { ArrowLeft, Check, Coins, Copy, Loader2, QrCode, RefreshCw, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import {
  CASH_KIND_LABEL,
  PIX_KEY_TYPES,
  cash as api,
  estimateNet,
  formatBrl,
  type CashDeposit,
  type CashState,
  type CashTx,
  type CashWithdrawal,
  type PixKeyType
} from '@/lib/api-cash'
import { useAuth } from '@/lib/auth-context'
import { useGamification } from '@/lib/gamification-context'
import { useSocket } from '@/lib/socket-context'
import { useTicker } from '@/lib/use-now'
import { cn } from '@/lib/utils'

/**
 * O CAIXA — depositar por Pix, cadastrar a chave Pix, sacar e ver o extrato.
 *
 * TRANSPARÊNCIA ACIMA DE TUDO: dinheiro de verdade, de amigos. Cada tela diz
 * o que o Asaas vai descontar ANTES do clique — o depósito mostra o líquido
 * que entra (vem da tabela de taxas da conta, e a cobrança gerada confirma),
 * o saque mostra a taxa de transferência e o que chega na conta da pessoa.
 * A casa (o dono da conta) não fica com nada.
 *
 * O depósito é uma cobrança Pix: QR na tela + "copia e cola". O launcher
 * fica perguntando ao servidor se caiu (e o servidor pergunta ao Asaas se o
 * webhook não chegou), e o saldo muda sozinho quando cai.
 */

const DEPOSIT_PRESETS = [500, 1000, 2000, 5000]
const POLL_MS = 4_000

type View = 'home' | 'deposit' | 'pix' | 'withdraw' | 'history'

export function CashPanel({ onBack }: { onBack: () => void }) {
  const { token } = useAuth()
  const { socket } = useSocket()
  const { pushToast } = useGamification()
  const [state, setState] = React.useState<CashState | null>(null)
  const [view, setView] = React.useState<View>('home')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const refresh = React.useCallback(async (): Promise<CashState | null> => {
    if (!token) return null
    try {
      const next = await api.me(token)
      setState(next)
      return next
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra abrir o caixa.')
      return null
    } finally {
      setLoading(false)
    }
  }, [token])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    if (!socket) return
    const onChanged = (data: { balanceCents?: number; kind?: string; deltaCents?: number }): void => {
      if (typeof data?.balanceCents !== 'number') return
      setState((prev) => (prev ? { ...prev, balanceCents: data.balanceCents! } : prev))
      if (data.kind === 'deposit' && (data.deltaCents ?? 0) > 0) {
        pushToast({ kind: 'coins', title: `Pix caiu: +${formatBrl(data.deltaCents!)}`, body: 'já está no seu caixa' })
      }
      if (data.kind === 'withdraw_failed') {
        pushToast({ kind: 'error', title: 'Saque devolvido', body: 'o Asaas não concluiu a transferência; o valor voltou pro caixa' })
      }
    }
    socket.on('cash:changed', onChanged)
    return () => {
      socket.off('cash:changed', onChanged)
    }
  }, [socket, pushToast])

  if (!token) return null

  return (
    <div className="scroll-stable flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={view === 'home' ? onBack : () => setView('home')}
          className="flex items-center gap-1 rounded-brutal px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {view === 'home' ? 'Saguão' : 'Caixa'}
        </button>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Wallet className="h-4 w-4 text-burn" aria-hidden />
          Caixa da mesa valendo
        </h3>
        {state?.sandbox && (
          <span className="rounded-full border border-burn/60 bg-burn/10 px-2 font-mono text-[11px] text-burn">sandbox</span>
        )}
        <div className="ml-auto flex items-center gap-1.5 rounded-brutal border border-burn/60 bg-burn/10 px-3 py-1.5 font-mono text-sm text-burn">
          <Coins className="h-4 w-4" aria-hidden />
          {state ? formatBrl(state.balanceCents) : '…'}
        </div>
      </div>

      {error && (
        <p className="rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{error}</p>
      )}

      {loading && !state ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Abrindo o caixa…
        </p>
      ) : !state ? null : !state.enabled ? (
        <p className="rounded-brutal border border-line bg-void/60 px-3 py-4 text-center text-xs text-muted-foreground">
          A mesa valendo está desligada neste servidor (sem chave do Asaas).
        </p>
      ) : view === 'home' ? (
        <Home state={state} onGo={setView} />
      ) : view === 'deposit' ? (
        <Deposit token={token} state={state} onRefresh={refresh} onError={setError} />
      ) : view === 'pix' ? (
        <PixKeyForm token={token} state={state} onSaved={refresh} onError={setError} />
      ) : view === 'withdraw' ? (
        <Withdraw token={token} state={state} onDone={refresh} onError={setError} onNeedKey={() => setView('pix')} />
      ) : (
        <History token={token} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Home({ state, onGo }: { state: CashState; onGo: (v: View) => void }) {
  const fees = state.fees
  const pending = state.pendingDeposits[0]
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <section className="rounded-brutal border border-line bg-void/60 p-3">
        <h4 className="text-sm font-semibold text-foreground">Depositar</h4>
        <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
          Pix pra conta do Asaas do grupo. Entre {formatBrl(state.limits.minDepositCents)} e {formatBrl(state.limits.maxDepositCents)}.
          {fees && (fees.pixInFixedCents > 0 || fees.pixInPercent > 0) ? (
            <>
              {' '}
              Taxa do Asaas por Pix recebido:{' '}
              <span className="font-mono text-foreground">
                {fees.pixInFixedCents > 0 ? formatBrl(fees.pixInFixedCents) : ''}
                {fees.pixInFixedCents > 0 && fees.pixInPercent > 0 ? ' + ' : ''}
                {fees.pixInPercent > 0 ? `${fees.pixInPercent}%` : ''}
              </span>
              , descontada do que entra.
            </>
          ) : fees ? (
            ' Sem taxa de recebimento nesta conta.'
          ) : null}
        </p>
        {pending && (
          <p className="mt-2 rounded-brutal border border-burn/40 bg-burn/[0.06] px-2 py-1 text-[11.5px] text-burn">
            Pix de {formatBrl(pending.valueCents)} aguardando pagamento.
          </p>
        )}
        <Button size="sm" className="mt-3" onClick={() => onGo('deposit')}>
          <QrCode className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {pending ? 'Ver o Pix pendente' : 'Gerar Pix'}
        </Button>
      </section>

      <section className="rounded-brutal border border-line bg-void/60 p-3">
        <h4 className="text-sm font-semibold text-foreground">Sacar</h4>
        <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
          Transferência Pix da conta do grupo pra sua chave. Mínimo {formatBrl(state.limits.minWithdrawCents)}.
          {fees ? (
            fees.transferFeeCents > 0 ? (
              <>
                {' '}
                Taxa de transferência do Asaas: <span className="font-mono text-foreground">{formatBrl(fees.transferFeeCents)}</span>
                {fees.monthlyTransfersWithoutFee > 0 ? ` (as ${fees.monthlyTransfersWithoutFee} primeiras do mês são grátis)` : ''}, descontada do saque.
              </>
            ) : (
              ' Sem taxa de transferência nesta conta.'
            )
          ) : null}
        </p>
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          Chave Pix:{' '}
          {state.pixKey ? (
            <span className="font-mono text-foreground">
              {state.pixKeyType} · {maskKey(state.pixKey)}
            </span>
          ) : (
            <span className="text-destructive">não cadastrada</span>
          )}{' '}
          <button type="button" onClick={() => onGo('pix')} className="text-acid-text underline-offset-2 hover:underline">
            {state.pixKey ? 'trocar' : 'cadastrar'}
          </button>
        </p>
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => onGo(state.pixKey ? 'withdraw' : 'pix')}>
          Sacar
        </Button>
      </section>

      <section className="rounded-brutal border border-line bg-void/60 p-3 sm:col-span-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">Como funciona</h4>
          <button type="button" onClick={() => onGo('history')} className="text-xs text-acid-text underline-offset-2 hover:underline">
            Ver extrato
          </button>
        </div>
        <ul className="mt-1 space-y-1 text-[11.5px] leading-snug text-muted-foreground">
          <li>O saldo do caixa é o que você tem pra sentar numa mesa valendo. Teto: {formatBrl(state.limits.tableCapCents)} por pessoa por mesa, recargas incluídas.</li>
          <li>Ao levantar da mesa, a pilha volta pro caixa. A casa não tira nada do pote.</li>
          <li>Os únicos descontos são as taxas do Asaas, mostradas acima e antes de cada confirmação.</li>
          <li>Na primeira vez o Asaas pede nome e CPF pra emitir a cobrança; o CPF vai pra lá e não fica guardado aqui.</li>
        </ul>
      </section>
    </div>
  )
}

function maskKey(key: string): string {
  if (key.length <= 6) return key
  return `${key.slice(0, 3)}…${key.slice(-3)}`
}

// ---------------------------------------------------------------------------

function Deposit({
  token,
  state,
  onRefresh,
  onError
}: {
  token: string
  state: CashState
  onRefresh: () => Promise<CashState | null>
  onError: (e: string | null) => void
}) {
  const [value, setValue] = React.useState(2000)
  const [custom, setCustom] = React.useState('')
  const [name, setName] = React.useState(state.holderName ?? '')
  const [doc, setDoc] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [deposit, setDeposit] = React.useState<CashDeposit | null>(state.pendingDeposits[0] ?? null)
  const [copied, setCopied] = React.useState(false)
  const now = useTicker(1_000, !!deposit && deposit.status === 'pending')

  const net = estimateNet(value, state.fees)
  const needsDoc = !state.hasCustomer

  // Pergunta se caiu, de tanto em tanto, enquanto estiver pendente.
  React.useEffect(() => {
    if (!deposit || deposit.status !== 'pending') return
    const timer = setInterval(() => {
      api
        .depositStatus(token, deposit.id)
        .then((r) => {
          setDeposit(r.deposit)
          if (r.deposit.status !== 'pending') void onRefresh()
        })
        .catch(() => undefined)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [deposit, token, onRefresh])

  const generate = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    onError(null)
    try {
      const created = await api.deposit(token, {
        valueCents: value,
        cpfCnpj: needsDoc ? doc : undefined,
        name: needsDoc ? name : undefined
      })
      setDeposit(created)
      void onRefresh()
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Não deu pra gerar o Pix.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (): Promise<void> => {
    if (!deposit?.qrPayload) return
    try {
      await navigator.clipboard.writeText(deposit.qrPayload)
      setCopied(true)
      setTimeout(() => setCopied(false), 2_000)
    } catch {
      onError('Não deu pra copiar. Selecione o código e copie na mão.')
    }
  }

  if (deposit) {
    const expiresIn = Math.max(0, new Date(deposit.expiresAt).getTime() - now)
    const received = deposit.status === 'received'
    return (
      <section className="rounded-brutal border border-line bg-void/60 p-3">
        <div className="flex flex-wrap items-start gap-4">
          {deposit.qrImage && !received && (
            <img
              src={`data:image/png;base64,${deposit.qrImage}`}
              alt="QR code do Pix"
              className="h-44 w-44 rounded-brutal border border-line bg-white p-1"
            />
          )}
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-foreground">
              {received ? 'Pix recebido' : deposit.status === 'pending' ? 'Pague o Pix' : 'Pix vencido'}
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Valor <span className="font-mono text-foreground">{formatBrl(deposit.valueCents)}</span>
              {deposit.netCents !== null && (
                <>
                  {' '}
                  · entra no caixa <span className="font-mono text-acid-text">{formatBrl(deposit.netCents)}</span>
                  {deposit.netCents < deposit.valueCents && (
                    <> (taxa do Asaas: {formatBrl(deposit.valueCents - deposit.netCents)})</>
                  )}
                </>
              )}
            </p>
            {received ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-acid">
                <Check className="h-3.5 w-3.5" aria-hidden /> Já está no seu caixa.
              </p>
            ) : deposit.status === 'pending' ? (
              <>
                <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Esperando o pagamento… vence em <span className="font-mono">{formatCountdown(expiresIn)}</span>
                </p>
                {deposit.qrPayload && (
                  <div className="mt-2">
                    <p className="mb-1 text-[11px] text-muted-foreground">Pix copia e cola</p>
                    <div className="flex items-start gap-1.5">
                      <code className="input-terminal max-h-16 min-w-0 flex-1 overflow-hidden break-all rounded-brutal px-2 py-1 font-mono text-[11px] text-foreground">
                        {deposit.qrPayload}
                      </code>
                      <Button size="sm" variant="secondary" onClick={() => void copy()}>
                        {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : null}
            <div className="mt-3 flex gap-2">
              {deposit.status !== 'pending' && (
                <Button size="sm" onClick={() => setDeposit(null)}>
                  Novo depósito
                </Button>
              )}
              {deposit.status === 'pending' && (
                <Button size="sm" variant="ghost" onClick={() => setDeposit(null)}>
                  Gerar outro valor
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-3 rounded-brutal border border-line bg-void/60 p-3">
      <div>
        <h4 className="text-sm font-semibold text-foreground">Quanto?</h4>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DEPOSIT_PRESETS.filter((v) => v >= state.limits.minDepositCents && v <= state.limits.maxDepositCents).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setValue(v)
                setCustom('')
              }}
              className={cn(
                'rounded-brutal border px-3 py-1.5 font-mono text-sm transition-colors',
                value === v && !custom ? 'border-acid/60 bg-acid/10 text-acid' : 'border-line text-muted-foreground hover:text-foreground'
              )}
            >
              {formatBrl(v)}
            </button>
          ))}
          <input
            inputMode="decimal"
            placeholder="outro (R$)"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value)
              const cents = Math.round(Number(e.target.value.replace(',', '.')) * 100)
              if (Number.isFinite(cents) && cents > 0) setValue(cents)
            }}
            className="input-terminal w-28 rounded-brutal px-2 py-1.5 font-mono text-sm"
          />
        </div>
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          Você paga <span className="font-mono text-foreground">{formatBrl(value)}</span>
          {net !== null ? (
            <>
              {' '}
              e entram <span className="font-mono text-acid-text">{formatBrl(net)}</span> no caixa
              {net < value && <> (taxa do Asaas: {formatBrl(value - net)})</>}
            </>
          ) : (
            <> — o líquido aparece na cobrança</>
          )}
          .
        </p>
      </div>

      {needsDoc && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-muted-foreground">Nome completo</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-terminal w-full rounded-brutal px-3 py-1.5 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-muted-foreground">CPF (só pro Asaas emitir a cobrança)</span>
            <input
              value={doc}
              inputMode="numeric"
              onChange={(e) => setDoc(e.target.value)}
              placeholder="000.000.000-00"
              className="input-terminal w-full rounded-brutal px-3 py-1.5 font-mono text-sm"
            />
          </label>
          <p className="text-[11px] leading-snug text-muted-foreground sm:col-span-2">
            O Asaas exige CPF ou CNPJ pra qualquer cobrança. O número vai direto pra lá; aqui fica só o id do cliente.
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={busy || value < state.limits.minDepositCents || value > state.limits.maxDepositCents || (needsDoc && (!name.trim() || doc.replace(/\D/g, '').length < 11))}
          onClick={() => void generate()}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <><QrCode className="mr-1.5 h-3.5 w-3.5" aria-hidden />Gerar Pix de {formatBrl(value)}</>}
        </Button>
      </div>
    </section>
  )
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------

function PixKeyForm({
  token,
  state,
  onSaved,
  onError
}: {
  token: string
  state: CashState
  onSaved: () => Promise<CashState | null>
  onError: (e: string | null) => void
}) {
  const [type, setType] = React.useState<PixKeyType>((state.pixKeyType as PixKeyType) || 'CPF')
  const [key, setKey] = React.useState(state.pixKey ?? '')
  const [holder, setHolder] = React.useState(state.holderName ?? '')
  const [busy, setBusy] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const hint = PIX_KEY_TYPES.find((t) => t.id === type)?.hint

  const save = async (): Promise<void> => {
    setBusy(true)
    onError(null)
    try {
      await api.setPixKey(token, { type, key, holderName: holder.trim() || undefined })
      await onSaved()
      setSaved(true)
      setTimeout(() => setSaved(false), 2_000)
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Não deu pra salvar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-brutal border border-line bg-void/60 p-3">
      <h4 className="text-sm font-semibold text-foreground">Sua chave Pix</h4>
      <p className="text-[11.5px] text-muted-foreground">É pra onde o saque vai. Tem que ser uma chave SUA — a transferência sai no seu nome.</p>
      <div className="flex flex-wrap gap-1">
        {PIX_KEY_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setType(t.id)}
            className={cn(
              'rounded-brutal border px-2.5 py-1 text-xs transition-colors',
              t.id === type ? 'border-acid/60 bg-acid/10 text-acid' : 'border-line text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11.5px] text-muted-foreground">Chave ({hint})</span>
          <input value={key} onChange={(e) => setKey(e.target.value)} className="input-terminal w-full rounded-brutal px-3 py-1.5 font-mono text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] text-muted-foreground">Nome do titular (opcional)</span>
          <input value={holder} onChange={(e) => setHolder(e.target.value)} className="input-terminal w-full rounded-brutal px-3 py-1.5 text-sm" />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" disabled={busy || !key.trim()} onClick={() => void save()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : saved ? <><Check className="mr-1 h-3.5 w-3.5" aria-hidden />Salvo</> : 'Salvar chave'}
        </Button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

function Withdraw({
  token,
  state,
  onDone,
  onError,
  onNeedKey
}: {
  token: string
  state: CashState
  onDone: () => Promise<CashState | null>
  onError: (e: string | null) => void
  onNeedKey: () => void
}) {
  const [value, setValue] = React.useState(state.balanceCents)
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<CashWithdrawal | null>(null)
  const fee = state.fees?.transferFeeCents ?? 0
  const net = value - fee
  const ok = value >= state.limits.minWithdrawCents && value <= state.balanceCents && net > 0

  if (!state.pixKey) {
    return (
      <section className="rounded-brutal border border-line bg-void/60 p-3">
        <p className="text-xs text-muted-foreground">Cadastre uma chave Pix antes de sacar.</p>
        <Button size="sm" className="mt-2" onClick={onNeedKey}>
          Cadastrar chave
        </Button>
      </section>
    )
  }

  const submit = async (): Promise<void> => {
    setBusy(true)
    onError(null)
    try {
      const r = await api.withdraw(token, value)
      setResult(r.withdrawal)
      void onDone()
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Não deu pra sacar.')
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <section className="rounded-brutal border border-line bg-void/60 p-3">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Check className="h-4 w-4 text-acid" aria-hidden />
          {result.status === 'done' ? 'Pix enviado' : 'Saque pedido'}
        </h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Saiu do caixa <span className="font-mono text-foreground">{formatBrl(result.valueCents)}</span>
          {result.feeCents > 0 && <> · taxa do Asaas {formatBrl(result.feeCents)}</>} · chega na sua chave{' '}
          <span className="font-mono text-acid-text">{formatBrl(result.netCents)}</span>.
          {result.status !== 'done' && ' O Asaas processa em instantes; se falhar, o valor volta pro caixa sozinho.'}
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-3 rounded-brutal border border-line bg-void/60 p-3">
      <h4 className="text-sm font-semibold text-foreground">Sacar pro Pix</h4>
      <p className="text-[11.5px] text-muted-foreground">
        Chave: <span className="font-mono text-foreground">{state.pixKeyType} · {maskKey(state.pixKey)}</span>
      </p>
      <div className="flex items-center gap-2">
        <input
          type="range"
          className="poker-regua flex-1"
          min={Math.min(state.limits.minWithdrawCents, state.balanceCents)}
          max={Math.max(state.limits.minWithdrawCents, state.balanceCents)}
          step={50}
          value={Math.min(value, state.balanceCents)}
          onChange={(e) => setValue(Number(e.target.value))}
          aria-label="Valor do saque"
        />
        <span className="w-24 text-right font-mono text-sm text-foreground">{formatBrl(value)}</span>
      </div>
      <p className="text-[11.5px] text-muted-foreground">
        Sai do caixa <span className="font-mono text-foreground">{formatBrl(value)}</span>
        {fee > 0 ? (
          <>
            {' '}
            · taxa de transferência do Asaas <span className="font-mono text-foreground">{formatBrl(fee)}</span> · chega{' '}
            <span className="font-mono text-acid-text">{formatBrl(Math.max(0, net))}</span>
          </>
        ) : (
          <> · chega inteiro na sua chave (sem taxa de transferência)</>
        )}
        .
      </p>
      <div className="flex justify-end">
        <Button size="sm" disabled={busy || !ok} onClick={() => void submit()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : `Sacar ${formatBrl(value)}`}
        </Button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

function History({ token }: { token: string }) {
  const [entries, setEntries] = React.useState<CashTx[] | null>(null)
  const [withdrawals, setWithdrawals] = React.useState<CashWithdrawal[] | null>(null)
  const load = React.useCallback(() => {
    api.history(token).then(setEntries).catch(() => setEntries([]))
    api.withdrawals(token).then(setWithdrawals).catch(() => setWithdrawals([]))
  }, [token])
  React.useEffect(load, [load])

  const date = (iso: string): string =>
    new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-3">
      <section className="rounded-brutal border border-line bg-void/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">Extrato</h4>
          <button type="button" onClick={load} aria-label="Atualizar" className="text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        {entries === null ? (
          <p className="text-xs text-muted-foreground">…</p>
        ) : entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nada ainda.</p>
        ) : (
          <ul className="divide-y divide-line text-xs">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-2 py-1.5">
                <span className="w-24 shrink-0 font-mono text-[11px] text-muted-foreground">{date(e.createdAt)}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {CASH_KIND_LABEL[e.kind] ?? e.kind}
                  {e.note && <span className="text-muted-foreground"> · {e.note}</span>}
                </span>
                <span className={cn('font-mono', e.deltaCents > 0 ? 'text-acid-text' : 'text-destructive')}>
                  {e.deltaCents > 0 ? '+' : ''}
                  {formatBrl(e.deltaCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {withdrawals && withdrawals.length > 0 && (
        <section className="rounded-brutal border border-line bg-void/60 p-3">
          <h4 className="mb-2 text-sm font-semibold text-foreground">Saques</h4>
          <ul className="divide-y divide-line text-xs">
            {withdrawals.map((w) => (
              <li key={w.id} className="flex items-center gap-2 py-1.5">
                <span className="w-24 shrink-0 font-mono text-[11px] text-muted-foreground">{date(w.createdAt)}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {formatBrl(w.netCents)} na chave
                  {w.feeCents > 0 && <span className="text-muted-foreground"> · taxa {formatBrl(w.feeCents)}</span>}
                  {w.failReason && <span className="text-destructive"> · {w.failReason}</span>}
                </span>
                <span
                  className={cn(
                    'rounded-full border px-1.5 font-mono text-[11px]',
                    w.status === 'done'
                      ? 'border-acid/50 text-acid'
                      : w.status === 'failed'
                        ? 'border-destructive/50 text-destructive'
                        : 'border-burn/50 text-burn'
                  )}
                >
                  {w.status === 'done' ? 'enviado' : w.status === 'failed' ? 'devolvido' : 'processando'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
