import { Loader2, ShieldQuestion } from 'lucide-react'
import { formatSeconds } from '@/lib/api-print'
import {
  ApprovalButtons,
  ApprovalEtas,
  ApprovalOwner,
  approvalReasons,
  useApprovalActions,
  useApprovals
} from './ApprovalModal'
import { PrintThumb } from './print-bits'

/**
 * PEDIDOS DE AUTORIZAÇÃO NA ABA FILA.
 *
 * O mesmo que a camada do operador mostra, só que TODOS de uma vez — inclusive
 * os que a pessoa mandou "ver depois". É daqui que ela decide com calma, ou
 * resgata o que dispensou. Sem pendente, some.
 */
export function ApprovalList() {
  const { approvals, scheduleAt, reload } = useApprovals(true)
  const { decide, busy, error } = useApprovalActions(reload)

  if (approvals.length === 0) return null

  return (
    <section className="card-acid rounded-brutal p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldQuestion className="h-4 w-4 text-acid-text" aria-hidden />
        <h2 className="font-display text-sm text-foreground">
          {approvals.length === 1 ? 'Um pedido de autorização' : `${approvals.length} pedidos de autorização`}
        </h2>
      </div>

      <ul className="space-y-2">
        {approvals.map((approval) => (
          <li key={approval.id} className="space-y-2 rounded-brutal border border-line bg-void/40 px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {approval.job.thumbUrl && (
                <PrintThumb url={approval.job.thumbUrl} alt={approval.job.title} className="h-10 w-10" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm text-foreground">{approval.job.title}</p>
                <p className="text-[11.5px] text-burn">
                  {formatSeconds(approval.job.estimatedSeconds)}
                  {approvalReasons(approval).map((reason) => ` · ${reason}`)}
                </p>
              </div>
              <ApprovalOwner approval={approval} />
            </div>

            <ApprovalEtas approval={approval} scheduleAt={scheduleAt} />

            <div className="flex flex-wrap items-center gap-2">
              <ApprovalButtons
                approval={approval}
                scheduleAt={scheduleAt}
                busy={busy === approval.id}
                onDecide={(action, note) => void decide(approval.id, action, note)}
              />
              {busy === approval.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            {error?.id === approval.id && <p className="text-[11.5px] text-destructive">{error.message}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
