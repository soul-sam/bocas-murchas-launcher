import * as React from 'react'
import { Check, Loader2, Repeat, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { printApi, type PrintFilament, type SwapRequestRow } from '@/lib/api-print'
import { useAuth } from '@/lib/auth-context'
import { ColorDot } from './print-bits'

/**
 * PEDIDO DE TROCA — "põe este rolo neste slot".
 *
 * O launcher não fala com o ACE: quem troca o rolo é uma pessoa, na frente da
 * máquina. O pedido serve pra ela saber O QUE trocar, e pra o rolo já sair
 * marcado no slot certo quando ela confirma.
 */

const SLOT_COUNT = 4

/** Formulário: escolhe um rolo que a pessoa pode usar e o slot. */
export function SwapRequestForm({
  filament,
  defaultSpoolId,
  defaultSlot,
  jobId,
  onDone,
  onCancel
}: {
  filament: PrintFilament
  defaultSpoolId?: string
  defaultSlot?: number
  /** Peça que motivou o pedido, quando veio da fila. */
  jobId?: string
  onDone: (message: string) => Promise<void> | void
  onCancel: () => void
}) {
  const { token } = useAuth()
  const slotCount = Math.max(SLOT_COUNT, filament.slots.length)

  // Só rolo que o servidor aceitaria: ativo e do Geral ou de um grupo da
  // pessoa. `usable` ausente = API velha, que não tinha grupo.
  const spools = filament.spools.filter((spool) => spool.status === 'active' && spool.usable !== false)
  const taken = new Set((filament.swaps ?? []).map((swap) => swap.slot))

  // O slot que a peça precisa pode já ter pedido de outra pessoa. Abrir o
  // formulário nele, com o botão apagado, não explica nada: começa no
  // primeiro slot livre e diz por quê.
  const wanted = defaultSlot ?? 0
  const blocking = (filament.swaps ?? []).find((swap) => swap.slot === wanted)
  const firstFree = Array.from({ length: slotCount }, (_, index) => index).find((index) => !taken.has(index))

  const [spoolId, setSpoolId] = React.useState(defaultSpoolId ?? spools[0]?.id ?? '')
  const [slot, setSlot] = React.useState<number>(blocking ? firstFree ?? wanted : wanted)
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const chosen = spools.find((spool) => spool.id === spoolId)
  const alreadyThere = !!chosen && chosen.slot === slot

  async function send(): Promise<void> {
    if (!spoolId) return
    setBusy(true)
    setError(null)
    try {
      const res = await printApi.createSwap(token, { spoolId, slot, jobId, note: note.trim() || undefined })
      await onDone(res.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra pedir a troca')
      setBusy(false)
    }
  }

  if (spools.length === 0) {
    return (
      <div className="space-y-2 rounded-brutal border border-line bg-void/40 p-3">
        <p className="text-xs text-muted-foreground">
          Não tem rolo cadastrado que você possa usar. Fala com quem opera a impressora.
        </p>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Fechar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-brutal border border-acid-dark/60 bg-acid/5 p-3">
      {blocking && (
        <p className="text-[11.5px] text-burn">
          O slot {wanted + 1} já tem um pedido aberto
          {blocking.mine ? ' seu' : ` de ${blocking.requester.displayName}`}
          {blocking.spool ? ` (${blocking.spool.material} ${blocking.spool.colorName})` : ''}.{' '}
          {firstFree === undefined ? 'Todos os slots têm pedido: espera um ser atendido.' : 'Dá pra pedir em outro slot.'}
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <select
          value={spoolId}
          onChange={(event) => setSpoolId(event.target.value)}
          className="input-terminal rounded-brutal px-2 py-1.5 text-sm"
          aria-label="Rolo"
          disabled={busy}
        >
          {spools.map((spool) => (
            <option key={spool.id} value={spool.id}>
              {spool.material} {spool.colorName}
              {spool.slot !== null ? ` (está no slot ${spool.slot + 1})` : ''}
            </option>
          ))}
        </select>
        <select
          value={slot}
          onChange={(event) => setSlot(Number(event.target.value))}
          className="input-terminal rounded-brutal px-2 py-1.5 text-sm"
          aria-label="Slot do ACE"
          disabled={busy}
        >
          {Array.from({ length: slotCount }, (_, index) => (
            <option key={index} value={index} disabled={taken.has(index)}>
              no slot {index + 1}
              {taken.has(index) ? ' (já tem pedido)' : ''}
            </option>
          ))}
        </select>
      </div>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="recado pra quem vai trocar (opcional)"
        className="input-terminal w-full rounded-brutal px-2 py-1.5 text-sm"
        maxLength={200}
        disabled={busy}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="btn-acid"
          onClick={() => void send()}
          disabled={busy || !spoolId || alreadyThere || taken.has(slot)}
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Pedir troca
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        {alreadyThere && <span className="text-[11.5px] text-muted-foreground">esse rolo já está nesse slot</span>}
        {error && <span className="text-[11.5px] text-destructive">{error}</span>}
      </div>
    </div>
  )
}

/** Pedidos em aberto. Quem opera atende; quem pediu pode desistir. */
export function SwapRequestList({
  swaps,
  canOperate,
  onChanged
}: {
  swaps: SwapRequestRow[]
  canOperate: boolean
  onChanged: () => Promise<void>
}) {
  if (swaps.length === 0) return null
  return (
    <ul className="space-y-2">
      {swaps.map((swap) => (
        <SwapRow key={swap.id} swap={swap} canOperate={canOperate} onChanged={onChanged} />
      ))}
    </ul>
  )
}

function SwapRow({
  swap,
  canOperate,
  onChanged
}: {
  swap: SwapRequestRow
  canOperate: boolean
  onChanged: () => Promise<void>
}) {
  const { token } = useAuth()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [declining, setDeclining] = React.useState(false)
  const [reason, setReason] = React.useState('')

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await action()
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-brutal border border-line bg-void/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Repeat className="h-3.5 w-3.5 shrink-0 text-acid-text" aria-hidden />
        <ColorDot hex={swap.spool?.colorHex} className="h-5 w-5" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-foreground">
            {swap.spool ? `${swap.spool.material} ${swap.spool.colorName}` : 'rolo que saiu da lista'}
            <span className="text-muted-foreground"> no slot {swap.slot + 1}</span>
          </p>
          <p className="truncate text-[11.5px] text-muted-foreground">
            {swap.mine ? 'você pediu' : `${swap.requester.displayName} pediu`}
            {swap.note ? ` · "${swap.note}"` : ''}
          </p>
        </div>

        {canOperate && !declining && (
          <>
            <Button size="sm" className="btn-acid" disabled={busy} onClick={() => void run(() => printApi.swapDone(token, swap.id))}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Troquei
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDeclining(true)}>
              Recusar
            </Button>
          </>
        )}
        {swap.mine && !declining && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            disabled={busy}
            onClick={() => void run(() => printApi.swapCancel(token, swap.id))}
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            Desistir
          </Button>
        )}
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {declining && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="por que não dá?"
            className="input-terminal min-w-0 flex-1 rounded-brutal px-2 py-1 text-xs"
            maxLength={200}
            autoFocus
          />
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/15"
            disabled={busy || reason.trim().length === 0}
            onClick={() => void run(() => printApi.swapDecline(token, swap.id, reason.trim()))}
          >
            Recusar pedido
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDeclining(false)}>
            Voltar
          </Button>
        </div>
      )}

      {error && <p className="mt-1 text-[11.5px] text-destructive">{error}</p>}
    </li>
  )
}
