import * as React from 'react'
import { Coins, ExternalLink, Loader2, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatSeconds, printApi, type PrintRequestRow, type PrintRequestStatus } from '@/lib/api-print'
import { useAuth } from '@/lib/auth-context'
import { useOverlays } from '@/lib/overlay-context'
import { useSocket } from '@/lib/socket-context'
import { cn } from '@/lib/utils'
import { PrintThumb, gramsLabel } from './print-bits'

/**
 * ENCOMENDAS — o mural de "alguém imprime isso pra mim?".
 *
 * Quem pede oferece murchos (que ficam guardados até a peça sair); quem tem a
 * impressora aceita e a peça entra na fila NA COTA DE QUEM ACEITOU. Sem
 * arquivo fatiado, quem aceitou sobe o .gcode por aqui.
 */

type Scope = 'active' | 'mine' | 'done'

const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: 'active', label: 'Abertas' },
  { id: 'mine', label: 'Minhas' },
  { id: 'done', label: 'Encerradas' }
]

const STATUS_LABEL: Record<PrintRequestStatus, string> = {
  open: 'procurando quem imprima',
  accepted: 'aceita',
  printing: 'na fila',
  delivered: 'entregue',
  cancelled: 'cancelada'
}

export function RequestsTab({ canQueue }: { canQueue: boolean }) {
  const { token, user } = useAuth()
  const { socket } = useSocket()
  const { openPrintRequestComposer } = useOverlays()
  const [scope, setScope] = React.useState<Scope>('active')
  const [rows, setRows] = React.useState<PrintRequestRow[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      const res = await printApi.requests(token, scope)
      setRows(res.requests)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra ler as encomendas')
    }
  }, [token, scope])

  React.useEffect(() => {
    setRows(null)
    void load()
  }, [load])

  // O card da encomenda muda pelo `messageUpdated`; aqui, a fila e o fim da
  // peça bastam pra saber que vale reler.
  React.useEffect(() => {
    if (!socket) return
    const reload = (): void => void load()
    socket.on('print:queue', reload)
    socket.on('print:job', reload)
    return () => {
      socket.off('print:queue', reload)
      socket.off('print:job', reload)
    }
  }, [socket, load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {SCOPES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setScope(option.id)}
              className={cn(
                'rounded-brutal border px-2.5 py-1 text-xs transition-colors',
                scope === option.id
                  ? 'border-acid bg-acid/10 text-foreground'
                  : 'border-line text-muted-foreground hover:border-line-strong hover:text-foreground'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Button size="sm" className="btn-acid" onClick={openPrintRequestComposer}>
          <Plus className="mr-2 h-4 w-4" />
          Nova encomenda
        </Button>
      </div>

      <p className="text-[11.5px] text-muted-foreground">
        Quem não tem a impressora também encomenda — pelo <span className="font-mono">/encomendar</span> no chat.
        A peça sai da cota de quem aceita, e os murchos só mudam de mão quando ela fica pronta.
      </p>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {!rows ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {scope === 'active' ? 'Nenhuma encomenda aberta.' : scope === 'mine' ? 'Você não tem encomendas.' : 'Nada encerrado ainda.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <RequestRow key={row.id} row={row} meId={user?.id} canQueue={canQueue} onChanged={load} />
          ))}
        </ul>
      )}
    </div>
  )
}

function RequestRow({
  row,
  meId,
  canQueue,
  onChanged
}: {
  row: PrintRequestRow
  meId?: string
  canQueue: boolean
  onChanged: () => Promise<void>
}) {
  const { token } = useAuth()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const mine = row.requester.id === meId
  const makingIt = row.maker?.id === meId
  const link = row.link && /^https?:\/\//i.test(row.link) ? row.link : null
  const grams = gramsLabel(row.estimatedGrams)

  async function run(action: string, fn: () => Promise<{ message: string }>): Promise<void> {
    setBusy(action)
    setNote(null)
    try {
      const res = await fn()
      setNote({ ok: true, text: res.message })
      await onChanged()
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : 'Não deu' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <li className="rounded-brutal border border-line bg-void/40 px-3 py-2.5">
      <div className="flex gap-3">
        <PrintThumb url={row.thumbUrl} alt={row.title} className="h-14 w-14" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="break-words font-display text-sm text-foreground">{row.title}</span>
            <span className="text-[11px] text-muted-foreground">{STATUS_LABEL[row.status]}</span>
          </div>
          <p className="text-[11.5px] text-muted-foreground">
            pedido por {row.requester.displayName}
            {row.maker ? ` · com ${row.maker.displayName}` : ''}
            {row.estimatedSeconds ? ` · ${formatSeconds(row.estimatedSeconds)}` : ''}
            {grams ? ` · ${grams}` : ''}
          </p>
          {row.detail && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{row.detail}</p>}
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex max-w-full items-center gap-1 text-[11.5px] text-acid-text hover:underline"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{link.replace(/^https?:\/\//, '')}</span>
            </a>
          )}
        </div>
        <div className="shrink-0 text-right">
          {row.offerCoins > 0 ? (
            <span className="flex items-center gap-1 font-mono text-sm text-burn">
              <Coins className="h-3.5 w-3.5" />
              {row.offerCoins}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">sem oferta</span>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {row.status === 'open' && !mine && canQueue && (
          <Button
            size="sm"
            className="btn-acid"
            disabled={busy !== null}
            onClick={() => void run('accept', () => printApi.acceptRequest(token, row.id))}
          >
            {busy === 'accept' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Eu imprimo
          </Button>
        )}

        {makingIt && row.status === 'accepted' && (
          <>
            {row.hasFile && (
              <Button
                size="sm"
                className="btn-acid"
                disabled={busy !== null}
                onClick={() => void run('job', () => printApi.requestJob(token, row.id))}
              >
                {busy === 'job' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Mandar pra fila
              </Button>
            )}
            <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
              {busy === 'upload' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {row.hasFile ? 'Mandar outro arquivo' : 'Subir o .gcode e mandar'}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".gcode,.3mf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void run('upload', () => printApi.requestJob(token, row.id, file))
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={() => void run('abandon', () => printApi.abandonRequest(token, row.id))}
            >
              Desistir
            </Button>
          </>
        )}

        {mine && (row.status === 'open' || row.status === 'accepted') && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/15"
            disabled={busy !== null}
            onClick={() => void run('cancel', () => printApi.cancelRequest(token, row.id))}
          >
            Cancelar
          </Button>
        )}

        {note && <span className={cn('text-[11.5px]', note.ok ? 'text-acid-text' : 'text-destructive')}>{note.text}</span>}
      </div>
    </li>
  )
}
