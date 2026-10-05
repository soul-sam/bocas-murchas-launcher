import * as React from 'react'
import { CalendarClock, Check, Clock, Loader2, ShieldQuestion, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/ui/avatar'
import { ApiError, resolveAssetUrl } from '@/lib/api'
import { DEFAULT_NAME_COLOR, nameStyle } from '@/lib/api-gamification'
import { formatSeconds, printApi, type ApprovalAction, type PrintApproval } from '@/lib/api-print'
import { useAuth } from '@/lib/auth-context'
import { usePrint } from '@/lib/print-context'
import { PrintThumb } from './print-bits'

/**
 * AUTORIZAÇÃO DO OPERADOR.
 *
 * Peça que passa do limite de horas, ou que terminaria dentro do silêncio da
 * madrugada, não sai sozinha: alguém que opera a impressora decide. Esta camada
 * aparece no meio da tela de quem opera — em qualquer aba do app, porque o
 * pedido chega quando a pessoa está no chat ou jogando, não na tela da
 * impressora.
 *
 * Um pedido por vez, o mais antigo primeiro. "Ver depois" só esconde da camada
 * nesta sessão (a lista na aba Fila continua mostrando tudo) — reabrir o app
 * traz de volta, porque pedido esquecido é peça parada.
 *
 * Camada própria, sem Radix, pelo mesmo motivo do WhatsNewModal: ela abre
 * sozinha, a qualquer momento, e um Dialog arrancado da árvore aberto tranca o
 * `<body>`. Clique fora NÃO dispensa, de propósito: um clique perdido não pode
 * sumir com o pedido de alguém.
 */

// ---- formatação ----

/** "01:40" hoje; "amanhã 07:00"; "sáb 03:10" mais longe. */
export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  const startOf = (value: Date): number => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round((startOf(date) - startOf(today)) / 86_400_000)
  if (days === 0) return time
  if (days === 1) return `amanhã ${time}`
  const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  return `${weekday} ${time}`
}

/** Motivos em texto, na ordem em que pesam. */
export function approvalReasons(approval: PrintApproval): string[] {
  const out: string[] = []
  if (approval.reasons.longJob) out.push('passa do limite de 10h')
  if (approval.reasons.night) {
    out.push(
      approval.etaNow
        ? `terminaria ~${formatClock(approval.etaNow.finishAt)}, depois do silêncio`
        : 'terminaria depois do silêncio'
    )
  }
  return out
}

// ---- dados ----

/**
 * Pendentes pra quem opera. Relê ao montar e a cada `print:approval` (via
 * `approvalTick`). Quem não opera nem pergunta — o servidor responderia 403.
 */
export function useApprovals(enabled: boolean): {
  approvals: PrintApproval[]
  scheduleAt: string | null
  reload: () => Promise<void>
} {
  const { token } = useAuth()
  const { approvalTick } = usePrint()
  const [approvals, setApprovals] = React.useState<PrintApproval[]>([])
  const [scheduleAt, setScheduleAt] = React.useState<string | null>(null)

  const reload = React.useCallback(async () => {
    if (!enabled || !token) {
      setApprovals([])
      setScheduleAt(null)
      return
    }
    try {
      const res = await printApi.approvals(token)
      // O servidor já manda por ordem de chegada; ordenar aqui de novo é seguro
      // e barato, e o "mais antigo primeiro" não depende disso.
      setApprovals([...res.approvals].sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
      setScheduleAt(res.scheduleAt)
    } catch {
      // Falhou (rede, permissão tirada agora): mantém o que tinha. O próximo
      // `print:approval` ou a próxima decisão relê.
    }
  }, [enabled, token])

  React.useEffect(() => {
    void reload()
  }, [reload, approvalTick])

  return { approvals, scheduleAt, reload }
}

/**
 * A decisão, compartilhada entre a camada e a lista da aba Fila.
 *
 * `busy` e `error` são do pedido em andamento (id), pra lista saber qual linha
 * está girando. 409 = outra pessoa que opera já decidiu: não é erro pra
 * mostrar, é só reler e seguir.
 */
export function useApprovalActions(onChanged: () => Promise<void>): {
  decide: (id: string, action: ApprovalAction, note?: string) => Promise<boolean>
  busy: string | null
  error: { id: string; message: string } | null
} {
  const { token } = useAuth()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<{ id: string; message: string } | null>(null)

  const decide = React.useCallback(
    async (id: string, action: ApprovalAction, note?: string): Promise<boolean> => {
      setBusy(id)
      setError(null)
      try {
        const trimmed = note?.trim()
        await printApi.decideApproval(token, id, { action, note: trimmed ? trimmed.slice(0, 200) : undefined })
        await onChanged()
        return true
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          await onChanged()
          return true
        }
        setError({ id, message: err instanceof Error ? err.message : 'Não deu pra decidir' })
        return false
      } finally {
        setBusy(null)
      }
    },
    [token, onChanged]
  )

  return { decide, busy, error }
}

// ---- pedaços compartilhados ----

/** Dono + horas dele. Usado na camada e na lista. */
export function ApprovalOwner({ approval }: { approval: PrintApproval }) {
  const { owner, ownerQuota } = approval
  return (
    <div className="flex min-w-0 items-center gap-2">
      <UserAvatar
        src={resolveAssetUrl(owner.avatar)}
        memberId={owner.id}
        name={owner.displayName}
        ringColor={owner.profileColor ?? DEFAULT_NAME_COLOR}
        className="h-8 w-8 border"
      />
      <div className="min-w-0">
        <p className="truncate text-sm" style={nameStyle(owner.profileColor)}>
          {owner.displayName}
        </p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          cota {formatSeconds(ownerQuota.quotaSeconds)} · usou {formatSeconds(ownerQuota.usedSeconds)} · tem{' '}
          {formatSeconds(ownerQuota.availableSeconds)}
        </p>
      </div>
    </div>
  )
}

/** As duas previsões: aprovar agora x programar pro fim do silêncio. */
export function ApprovalEtas({ approval, scheduleAt }: { approval: PrintApproval; scheduleAt: string | null }) {
  return (
    <div className="space-y-0.5 font-mono text-[11.5px] text-muted-foreground">
      <p>
        <span className="text-foreground">agora</span> →{' '}
        {approval.etaNow ? `termina ${formatClock(approval.etaNow.finishAt)}` : 'sem previsão'}
      </p>
      {scheduleAt && (
        <p>
          <span className="text-foreground">às {formatClock(scheduleAt)}</span> →{' '}
          {approval.etaScheduled ? `termina ${formatClock(approval.etaScheduled.finishAt)}` : 'sem previsão'}
        </p>
      )}
    </div>
  )
}

/**
 * Botões de decisão. "Recusar" abre o campo do motivo (opcional) antes de
 * confirmar. `onLater` ausente = sem "Ver depois" (a lista não tem).
 */
export function ApprovalButtons({
  approval,
  scheduleAt,
  busy,
  onDecide,
  onLater,
  size = 'sm'
}: {
  approval: PrintApproval
  scheduleAt: string | null
  busy: boolean
  onDecide: (action: ApprovalAction, note?: string) => void
  onLater?: () => void
  size?: 'sm' | 'default'
}) {
  const [declining, setDeclining] = React.useState(false)
  const [reason, setReason] = React.useState('')

  // Trocou de pedido (camada passou pro próximo): o campo do motivo recomeça.
  React.useEffect(() => {
    setDeclining(false)
    setReason('')
  }, [approval.id])

  if (declining) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="motivo (opcional)"
          className="input-terminal min-w-0 flex-1 rounded-brutal px-2 py-1 text-xs"
          maxLength={200}
          autoFocus
          disabled={busy}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !busy) onDecide('deny', reason)
            // Esc no motivo só fecha o campo; não deve virar "Ver depois".
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              setDeclining(false)
            }
          }}
        />
        <Button
          size={size}
          variant="ghost"
          className="text-destructive hover:bg-destructive/15"
          disabled={busy}
          onClick={() => onDecide('deny', reason)}
        >
          Confirmar recusa
        </Button>
        <Button size={size} variant="ghost" disabled={busy} onClick={() => setDeclining(false)}>
          Voltar
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size={size} className="btn-acid" disabled={busy} onClick={() => onDecide('approve')}>
        <Check className="mr-1.5 h-3.5 w-3.5" />
        Aceitar
      </Button>
      {scheduleAt && (
        <Button size={size} variant="outline" disabled={busy} onClick={() => onDecide('schedule')}>
          <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
          Programar pra {formatClock(scheduleAt)}
        </Button>
      )}
      <Button
        size={size}
        variant="ghost"
        className="text-destructive hover:bg-destructive/15"
        disabled={busy}
        onClick={() => setDeclining(true)}
      >
        <X className="mr-1.5 h-3.5 w-3.5" />
        Recusar
      </Button>
      {onLater && (
        <Button size={size} variant="ghost" className="text-muted-foreground" disabled={busy} onClick={onLater}>
          <Clock className="mr-1.5 h-3.5 w-3.5" />
          Ver depois
        </Button>
      )}
    </div>
  )
}

// ---- a camada ----

export function ApprovalModal() {
  const { state } = usePrint()
  const canOperate = !!state?.me.canOperate
  const { approvals, scheduleAt, reload } = useApprovals(canOperate)
  const { decide, busy, error } = useApprovalActions(reload)

  // "Ver depois": memória da sessão, não persiste. Ref + contador pra
  // redesenhar sem recriar o conjunto.
  const dismissed = React.useRef<Set<string>>(new Set())
  const [, setDismissTick] = React.useState(0)

  const current = approvals.find((approval) => !dismissed.current.has(approval.id)) ?? null
  const remaining = approvals.filter((approval) => !dismissed.current.has(approval.id)).length

  const later = React.useCallback(() => {
    if (!current) return
    dismissed.current.add(current.id)
    setDismissTick((tick) => tick + 1)
  }, [current])

  React.useEffect(() => {
    if (!current) return
    const onKey = (event: KeyboardEvent): void => {
      // Outro overlay (Radix, WhatsNewModal, campo do motivo) já tratou o Esc.
      if (event.defaultPrevented) return
      if (event.key === 'Escape' && !busy) {
        event.preventDefault() // camadas abaixo não reagem ao mesmo Esc
        later()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, busy, later])

  if (!canOperate || !current) return null

  const reasons = approvalReasons(current)
  const isBusy = busy === current.id

  return (
    <div className="fixed inset-0 z-dialogo flex items-center justify-center bg-black/70 p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-title"
        className="card-acid scanlines relative w-full max-w-lg rounded-brutal p-6"
      >
        <div className="mb-4 flex items-center gap-3">
          <ShieldQuestion className="h-7 w-7 shrink-0 text-acid drop-shadow-[0_0_8px_rgb(var(--neon-rgb)/0.3)]" />
          <div className="min-w-0">
            <h2 id="approval-title" className="title-brutal text-2xl">
              Pedido de autorização
            </h2>
            <p className="text-[11.5px] text-muted-foreground">
              {remaining > 1 ? `${remaining} esperando — o mais antigo primeiro` : 'a peça espera você decidir'}
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-brutal border border-acid-dark bg-void p-4">
          <ApprovalOwner approval={current} />

          <div className="flex items-center gap-3">
            {current.job.thumbUrl && (
              <PrintThumb url={current.job.thumbUrl} alt={current.job.title} className="h-14 w-14" />
            )}
            <div className="min-w-0">
              <p className="truncate font-display text-base text-foreground">{current.job.title}</p>
              <p className="font-mono text-[11.5px] text-muted-foreground">
                estimativa {formatSeconds(current.job.estimatedSeconds)}
              </p>
            </div>
          </div>

          {reasons.length > 0 && (
            <ul className="space-y-1">
              {reasons.map((reason) => (
                <li key={reason} className="flex gap-2 font-mono text-[12px] text-burn">
                  <span className="shrink-0">›</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          )}

          <ApprovalEtas approval={current} scheduleAt={scheduleAt} />
        </div>

        <div className="mt-4 space-y-2">
          <ApprovalButtons
            approval={current}
            scheduleAt={scheduleAt}
            busy={isBusy}
            size="default"
            onDecide={(action, note) => void decide(current.id, action, note)}
            onLater={later}
          />
          {isBusy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {error?.id === current.id && <p className="text-[11.5px] text-destructive">{error.message}</p>}
        </div>
      </div>
    </div>
  )
}
