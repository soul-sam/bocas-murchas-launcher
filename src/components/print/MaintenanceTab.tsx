import * as React from 'react'
import { CheckCircle2, Loader2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { printApi, type MaintenanceTask } from '@/lib/api-print'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

/**
 * MANUTENÇÃO — máquina de rateio é de todo mundo, então a manutenção não é
 * de ninguém. Aqui ela vence pelas HORAS de impressão (o odômetro sai das
 * peças cobradas), avisa quem opera uma vez, e fica registrado quem fez.
 */
export function MaintenanceTab({ canOperate, isAdmin }: { canOperate: boolean; isAdmin: boolean }) {
  const { token } = useAuth()
  const [data, setData] = React.useState<{ odometerHours: number; tasks: MaintenanceTask[] } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      setData(await printApi.maintenance(token))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra ler a manutenção')
    }
  }, [token])

  React.useEffect(() => {
    void load()
  }, [load])

  if (error) return <p className="text-xs text-destructive">{error}</p>
  if (!data) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const due = data.tasks.filter((task) => task.due).length

  return (
    <div className="card-gradient rounded-brutal p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 font-display text-sm uppercase tracking-wider text-foreground">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          Manutenção
        </span>
        <span className="text-[11.5px] text-muted-foreground">
          {Math.round(data.odometerHours)} h de impressão no total
          {due > 0 ? ` · ${due} vencida${due > 1 ? 's' : ''}` : ''}
        </span>
      </div>

      <ul className="space-y-2">
        {data.tasks.map((task) => (
          <TaskRow key={task.id} task={task} canOperate={canOperate} isAdmin={isAdmin} onChanged={load} />
        ))}
      </ul>
    </div>
  )
}

function TaskRow({
  task,
  canOperate,
  isAdmin,
  onChanged
}: {
  task: MaintenanceTask
  canOperate: boolean
  isAdmin: boolean
  onChanged: () => Promise<void>
}) {
  const { token } = useAuth()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState(false)
  const [hours, setHours] = React.useState(String(task.intervalHours))

  const pct = Math.min(100, task.ratio * 100)
  const tone = task.due ? 'bg-burn' : task.ratio > 0.8 ? 'bg-burn/60' : 'bg-acid'

  async function run(fn: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={cn('rounded-brutal border px-3 py-2', task.due ? 'border-burn/60 bg-burn/5' : 'border-line bg-void/40')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground">{task.label}</p>
          {task.detail && <p className="text-[11.5px] leading-snug text-muted-foreground">{task.detail}</p>}
        </div>
        {canOperate && (
          <Button
            size="sm"
            variant={task.due ? 'default' : 'ghost'}
            className={task.due ? 'btn-acid' : undefined}
            disabled={busy}
            onClick={() => void run(() => printApi.maintenanceDone(token, task.id))}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Fiz
          </Button>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-brutal bg-void">
          <div className={cn('h-full', tone)} style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {task.hoursSince.toLocaleString('pt-BR')} / {task.intervalHours} h
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>
          {task.lastDoneByName
            ? `feita por ${task.lastDoneByName} em ${new Date(task.lastDoneAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
            : 'nunca marcada'}
        </span>
        {isAdmin &&
          (editing ? (
            <span className="flex items-center gap-1">
              a cada
              <input
                type="number"
                min={1}
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                className="input-terminal w-16 rounded-brutal px-1.5 py-0.5 text-[11px] tabular-nums"
                aria-label="Intervalo em horas"
              />
              h
              <button
                type="button"
                className="text-acid-text hover:underline"
                onClick={() => {
                  setEditing(false)
                  void run(() => printApi.setMaintenanceInterval(token, task.id, Number(hours) || task.intervalHours))
                }}
              >
                salvar
              </button>
            </span>
          ) : (
            <button type="button" className="hover:text-foreground hover:underline" onClick={() => setEditing(true)}>
              mudar intervalo
            </button>
          ))}
        {error && <span className="text-destructive">{error}</span>}
      </div>
    </li>
  )
}
