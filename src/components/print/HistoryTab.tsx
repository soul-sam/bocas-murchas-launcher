import * as React from 'react'
import { History, Loader2 } from 'lucide-react'
import { formatSeconds, printApi, type PrintHistoryItem } from '@/lib/api-print'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

/**
 * HISTÓRICO — tudo que já passou pela máquina, estimado vs. real.
 *
 * Estourar a estimativa fica visível pro grupo: é a auditoria que resolve o
 * problema sozinha. A leitura é aberta a todo dono de propósito — fila que
 * se diz justa só é justa se dá pra conferir a conta.
 */
export function HistoryTab() {
  const { token } = useAuth()
  const [jobs, setJobs] = React.useState<PrintHistoryItem[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let alive = true
    void printApi
      .history(token)
      .then((res) => {
        if (alive) setJobs(res.jobs)
      })
      .catch((err: unknown) => {
        if (!alive) return
        setJobs([])
        setError(err instanceof Error ? err.message : 'Não deu pra ler o histórico')
      })
    return () => {
      alive = false
    }
  }, [token])

  if (!jobs) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="card-gradient rounded-brutal p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 font-display text-sm uppercase tracking-wider text-foreground">
          <History className="h-4 w-4 text-muted-foreground" />
          Histórico
        </span>
        <span className="text-[11.5px] text-muted-foreground">
          {jobs.length > 0 ? `${jobs.length} peça${jobs.length > 1 ? 's' : ''} · ` : ''}estimado vs. real
        </span>
      </div>

      {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

      {jobs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nada impresso ainda.</p>
      ) : (
        <table className="w-full font-mono text-[11px]">
          <thead>
            <tr className="bg-void/60 text-[11px] uppercase tracking-widest text-muted-foreground">
              <th className="px-2 py-1 text-left">peça</th>
              <th className="px-2 py-1 text-left">quem</th>
              <th className="px-2 py-1 text-right">estimado</th>
              <th className="px-2 py-1 text-right">real</th>
              <th className="px-2 py-1 text-right">fim</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const over = job.billedSeconds !== null && job.billedSeconds > job.estimatedSeconds * 1.2
              return (
                <tr key={job.id} className="border-t border-line">
                  <td className="max-w-[160px] truncate px-2 py-1">
                    <span className={statusTone(job.status)}>{job.title}</span>
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">{job.owner.displayName}</td>
                  <td className="px-2 py-1 text-right text-muted-foreground">{formatSeconds(job.estimatedSeconds)}</td>
                  {/* "0 min" para peça que nunca subiu na máquina é enganoso:
                      parece que imprimiu de graça. Sem cobrança é sem cobrança. */}
                  <td className={cn('px-2 py-1 text-right', over ? 'text-burn' : 'text-foreground')}>
                    {job.billedSeconds === null || job.billedSeconds === 0 ? (
                      <span className="text-muted-foreground">
                        {job.status === 'cancelled' ? 'não começou' : '—'}
                      </span>
                    ) : (
                      formatSeconds(job.billedSeconds)
                    )}
                    {job.refundedSeconds > 0 && <span className="text-acid-text"> (devolvido)</span>}
                  </td>
                  <td className="px-2 py-1 text-right text-muted-foreground">
                    {job.finishedAt
                      ? new Date(job.finishedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function statusTone(status: string): string {
  if (status === 'finished') return 'text-foreground'
  if (status === 'failed') return 'text-destructive'
  return 'text-muted-foreground line-through'
}
