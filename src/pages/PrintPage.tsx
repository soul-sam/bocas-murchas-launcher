import * as React from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Hourglass,
  Layers,
  Pause,
  Play,
  Printer,
  RefreshCw,
  Square,
  Trash2,
  Upload,
  WifiOff
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { usePrint } from '@/lib/print-context'
import {
  formatSeconds,
  printApi,
  type PrintHistoryItem,
  type PrintQueueItem,
  type PrintRunning,
  type PrinterInfo,
  type PrintQuota
} from '@/lib/api-print'
import { cn } from '@/lib/utils'

/**
 * Aba da impressora 3D.
 *
 * A aba aparece pra TODO MUNDO, e as leituras (o que está imprimindo, a fila,
 * o histórico) são abertas de propósito — ver o que o outro está imprimindo é
 * metade da graça, e esconder a aba de quem não rachou a impressora só gera
 * "não tá funcionando". Quem não tem acesso vê um card explicando, e não uma
 * tela vazia.
 */
export function PrintPage() {
  const { user } = useAuth()
  const { state, loading, error, refresh, refreshing } = usePrint()

  if (loading && !state) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
          Falando com a impressora<span className="terminal-cursor" />
        </div>
      </div>
    )
  }

  if (error && !state) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="font-mono text-xs uppercase tracking-widest text-destructive">{error}</p>
        <Button variant="ghost" size="sm" onClick={() => void refresh()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar de novo
        </Button>
      </div>
    )
  }

  if (!state) return null

  return (
    <div className="flex flex-1 flex-col overflow-auto p-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Printer className="h-9 w-9 text-acid drop-shadow-[0_0_10px_rgba(106,255,0,0.5)]" />
          <div>
            <h1 className="title-brutal text-3xl">Impressora 3D</h1>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {state.printer.model} · rateio do grupo
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
          Atualizar
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5">
        {/* "Ocupada" não vira faixa: o card logo abaixo já mostra a peça, o
            progresso e de quem é. Faixa pra dizer o que está na tela é ruído,
            e ruído constante faz a galera parar de ler as faixas que importam. */}
        {state.globalBlockText && state.globalBlock !== 'printer_busy' && (
          <BlockBanner text={state.globalBlockText} reason={state.globalBlock} />
        )}

        <PrinterCard printer={state.printer} running={state.running} canOperate={state.me.canOperate} />

        {state.me.canQueue ? (
          <>
            <QuotaCard quota={state.quota} />
            <NewJobCard />
          </>
        ) : (
          <NoAccessCard />
        )}

        <QueueCard queue={state.queue} meId={user?.id} isAdmin={state.me.isAdmin} />

        <HistoryCard />
      </main>
    </div>
  )
}

// ============================================
// FAIXA DE BLOQUEIO
// ============================================

function BlockBanner({ text, reason }: { text: string; reason: string | null }) {
  // "Ocupada" não é problema — é a impressora trabalhando. Não merece susto.
  const calm = reason === 'printer_busy'
  const Icon = reason === 'agent_offline' ? WifiOff : reason === 'bed_dirty' ? AlertTriangle : Hourglass

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-brutal border-2 px-4 py-2.5',
        calm
          ? 'border-acid-dark bg-acid/5 text-foreground'
          : 'border-burn/60 bg-burn/10 text-foreground'
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', calm ? 'text-acid' : 'text-burn')} />
      <span className="font-mono text-xs uppercase tracking-widest">
        {text}
        {reason === 'agent_offline' && (
          <span className="ml-2 normal-case tracking-normal text-muted-foreground">
            — a fila continua aceitando peças, mas nada vai começar até a ponte voltar.
          </span>
        )}
      </span>
    </div>
  )
}

// ============================================
// ESTADO DA IMPRESSORA
// ============================================

const PHASE_LABEL: Record<string, string> = {
  preheating: 'aquecendo',
  auto_leveling: 'nivelando a mesa',
  vibrating: 'medindo vibração',
  flow_calibrating: 'calibrando fluxo',
  printing: 'imprimindo',
  pausing: 'pausando',
  paused: 'pausada',
  resuming: 'retomando',
  stopping: 'parando',
  // "stoped" com um p só é a grafia que vem no fio da impressora, não erro nosso.
  stoped: 'parada',
  finished: 'terminou',
  failed: 'falhou'
}

function PrinterCard({
  printer,
  running,
  canOperate
}: {
  printer: PrinterInfo
  running: PrintRunning | null
  canOperate: boolean
}) {
  const { refresh } = usePrint()
  const { token } = useAuth()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [msg, setMsg] = React.useState<string | null>(null)

  const online = printer.agentOnline
  const dotClass = !online
    ? 'bg-[#3a3a3a]'
    : // Mesa suja é "online, mas parada esperando gente" — âmbar, não verde.
      // Verde aqui faria a pessoa achar que está tudo andando.
      !printer.bedClear
      ? 'bg-burn shadow-[0_0_10px_rgba(242,183,5,0.7)]'
      : running
        ? 'bg-acid shadow-[0_0_12px_rgba(106,255,0,0.8)] animate-pulse'
        : 'bg-acid shadow-[0_0_8px_rgba(106,255,0,0.5)]'

  async function act(action: 'pause' | 'resume' | 'stop' | 'bed'): Promise<void> {
    setBusy(action)
    setMsg(null)
    try {
      const result =
        action === 'bed' ? await printApi.bedClear(token) : await printApi.control(token, action)
      setMsg(result.message)
      await refresh()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Não deu')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card-gradient rounded-brutal p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={cn('h-3 w-3 rounded-full', dotClass)} aria-hidden />
          <div>
            <span className="font-display text-sm uppercase tracking-wider text-foreground">
              {printer.name}
            </span>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {!online
                ? printer.agentLastSeenAt
                  ? `sem contato desde ${new Date(printer.agentLastSeenAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                  : 'ponte nunca conectou'
                : running
                  ? (PHASE_LABEL[running.printerPhase ?? ''] ?? running.status)
                  : printer.bedClear
                    ? 'livre'
                    : 'esperando alguém tirar a peça'}
            </p>
          </div>
        </div>

        {printer.lastErrorMessage && (
          <span className="rounded-brutal border border-destructive/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-destructive">
            {printer.lastErrorMessage}
          </span>
        )}
      </div>

      {running ? (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate font-display text-base text-acid">{running.title}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              de {running.owner.displayName}
            </span>
          </div>

          <div className="h-3 overflow-hidden rounded-brutal border-2 border-acid-dark bg-void">
            <div
              className="h-full bg-acid transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, running.progress))}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span className="text-acid">{running.progress}%</span>
            {running.currLayer !== null && running.totalLayers !== null && (
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                camada {running.currLayer}/{running.totalLayers}
              </span>
            )}
            {running.remainSeconds !== null && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                faltam {formatSeconds(running.remainSeconds)}
              </span>
            )}
            {running.telemetryStale && (
              <span className="text-burn">
                sem progresso novo — a peça provavelmente continua
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {printer.bedClear ? 'Nada imprimindo agora.' : 'Peça pronta na mesa, esperando alguém tirar.'}
        </p>
      )}

      {/* A barra de operador só existe quando há o que operar. Sem esta
          condição a borda superior aparecia sozinha embaixo do card, com a
          impressora livre — uma linha solta que não significa nada. */}
      {canOperate && (!printer.bedClear || running !== null || msg !== null) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#1a1a1a] pt-3">
          {!printer.bedClear && (
            // O botão que destrava a fila. Fica em destaque porque é a única
            // coisa aqui que exige uma pessoa presente na frente da máquina.
            <Button
              size="sm"
              className="btn-acid"
              onClick={() => void act('bed')}
              disabled={busy !== null}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Tirei da mesa
            </Button>
          )}
          {running && running.status === 'printing' && (
            <Button variant="ghost" size="sm" onClick={() => void act('pause')} disabled={busy !== null}>
              <Pause className="mr-2 h-4 w-4" />
              Pausar
            </Button>
          )}
          {running && running.status === 'paused' && (
            <Button variant="ghost" size="sm" onClick={() => void act('resume')} disabled={busy !== null}>
              <Play className="mr-2 h-4 w-4" />
              Retomar
            </Button>
          )}
          {running && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/15"
              onClick={() => void act('stop')}
              disabled={busy !== null}
            >
              <Square className="mr-2 h-4 w-4" />
              Parar
            </Button>
          )}
          {msg && <span className="font-mono text-[10px] text-muted-foreground">{msg}</span>}
        </div>
      )}
    </div>
  )
}

// ============================================
// MINHA COTA
// ============================================

function QuotaCard({ quota }: { quota: PrintQuota }) {
  const usedPct = Math.min(100, (quota.usedSeconds / quota.quotaSeconds) * 100)
  const reservedPct = Math.min(100 - usedPct, (quota.reservedSeconds / quota.quotaSeconds) * 100)

  return (
    <div className="card-gradient rounded-brutal p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-display text-sm uppercase tracking-wider text-foreground">
          Minhas horas
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          janela de {quota.windowDays} dias
        </span>
      </div>

      {/* Usado (acid) e reservado (burn) separados de propósito: sem isso vem
          o "mas eu não imprimi nada ainda" de quem só tem peça na fila. */}
      <div className="flex h-3 overflow-hidden rounded-brutal border-2 border-acid-dark bg-void">
        <div className="h-full bg-acid" style={{ width: `${usedPct}%` }} />
        <div className="h-full bg-burn/70" style={{ width: `${reservedPct}%` }} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 font-mono text-xs">
        <Metric label="usado" value={formatSeconds(quota.usedSeconds)} tone="acid" />
        <Metric label="na fila" value={formatSeconds(quota.reservedSeconds)} tone="burn" />
        <Metric
          label={quota.overSeconds > 0 ? 'passou' : 'sobra'}
          value={
            quota.overSeconds > 0
              ? `-${formatSeconds(quota.overSeconds)}`
              : formatSeconds(quota.availableSeconds)
          }
          tone={quota.overSeconds > 0 ? 'destructive' : 'muted'}
        />
      </div>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        cota de {formatSeconds(quota.quotaSeconds)}
        {quota.nextReleaseAt && (
          <>
            {' · '}
            {formatSeconds(quota.nextReleaseSeconds)} voltam{' '}
            {describeWhen(quota.nextReleaseAt)}
          </>
        )}
      </p>
    </div>
  )
}

function Metric({
  label,
  value,
  tone
}: {
  label: string
  value: string
  tone: 'acid' | 'burn' | 'muted' | 'destructive'
}) {
  const color =
    tone === 'acid'
      ? 'text-acid'
      : tone === 'burn'
        ? 'text-burn'
        : tone === 'destructive'
          ? 'text-destructive'
          : 'text-foreground'

  return (
    <div>
      <div className={cn('text-lg font-bold', color)}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  )
}

function NoAccessCard() {
  return (
    <div className="rounded-brutal border-2 border-dashed border-[#2a2a2a] p-4">
      <p className="font-display text-sm uppercase tracking-wider text-foreground">
        Você não está na lista da impressora
      </p>
      <p className="mt-1 font-mono text-xs leading-relaxed text-muted-foreground">
        A impressora foi comprada em rateio, então quem imprime é quem entrou.
        Fala com um admin pra te liberar — dá pra continuar vendo a fila e o que
        a galera está imprimindo aqui de qualquer jeito.
      </p>
    </div>
  )
}

// ============================================
// NOVA PEÇA
// ============================================

function NewJobCard() {
  const { token } = useAuth()
  const { refresh } = usePrint()
  const [file, setFile] = React.useState<File | null>(null)
  const [title, setTitle] = React.useState('')
  const [dragging, setDragging] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  function pick(chosen: File | null): void {
    setFile(chosen)
    setResult(null)
    if (chosen && !title) {
      setTitle(chosen.name.replace(/\.(gcode|gcode\.3mf|3mf)$/i, '').replace(/[-_]+/g, ' '))
    }
  }

  async function send(): Promise<void> {
    if (!file) return
    setSending(true)
    setResult(null)
    try {
      const res = await printApi.enqueue(token, file, { title: title.trim() || undefined })
      setResult({ ok: true, text: res.message })
      setFile(null)
      setTitle('')
      if (inputRef.current) inputRef.current.value = ''
      await refresh()
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : 'Não deu pra enfileirar' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="card-gradient rounded-brutal p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-display text-sm uppercase tracking-wider text-foreground">
          Mandar uma peça
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          .gcode ou .gcode.3mf
        </span>
      </div>

      <div
        // preventDefault no dragOver é OBRIGATÓRIO: sem cancelar o padrão, o
        // Electron ABRE o arquivo largado e troca a página do app por ele — e
        // sem barra de endereço não tem volta. Mesmo motivo comentado no
        // MessageComposer.
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const dropped = e.dataTransfer.files?.[0]
          if (dropped) pick(dropped)
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-brutal border-2 border-dashed px-4 py-6 transition-colors',
          dragging ? 'border-acid bg-acid/5' : 'border-acid-dark/60'
        )}
      >
        <Upload className={cn('h-6 w-6', dragging ? 'text-acid' : 'text-muted-foreground')} />
        {file ? (
          <span className="max-w-full truncate font-mono text-xs text-acid">{file.name}</span>
        ) : (
          <span className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            arrasta o arquivo fatiado aqui
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".gcode,.3mf"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
        <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
          escolher arquivo
        </Button>
      </div>

      {file && (
        <div className="mt-3 space-y-2">
          <input
            className="input-terminal w-full"
            placeholder="o que é essa peça?"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" className="btn-acid" onClick={() => void send()} disabled={sending}>
              {sending ? 'Mandando…' : 'Botar na fila'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => pick(null)} disabled={sending}>
              cancelar
            </Button>
          </div>
        </div>
      )}

      {result && (
        <p
          className={cn(
            'mt-3 font-mono text-xs leading-relaxed',
            result.ok ? 'text-acid' : 'text-destructive'
          )}
        >
          {result.text}
        </p>
      )}

      <p className="mt-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
        O tempo e as gramas saem do próprio arquivo — fatia no OrcaSlicer com o
        perfil da Kobra S1. Fatiar STL aqui dentro vem na próxima.
      </p>
    </div>
  )
}

// ============================================
// FILA
// ============================================

function QueueCard({
  queue,
  meId,
  isAdmin
}: {
  queue: PrintQueueItem[]
  meId?: string
  isAdmin: boolean
}) {
  const { token } = useAuth()
  const { refresh } = usePrint()
  const [busy, setBusy] = React.useState<string | null>(null)

  async function cancel(job: PrintQueueItem): Promise<void> {
    setBusy(job.id)
    try {
      await printApi.cancel(token, job.id)
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card-gradient rounded-brutal p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-display text-sm uppercase tracking-wider text-foreground">Fila</span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {queue.length === 0 ? 'vazia' : `${queue.length} na espera`}
        </span>
      </div>

      {queue.length === 0 ? (
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Fila limpa.
        </p>
      ) : (
        <ul className="space-y-2">
          {queue.map((job) => (
            <li
              key={job.id}
              className="flex items-center gap-3 rounded-brutal border border-[#1a1a1a] bg-void/40 px-3 py-2"
            >
              <span
                className={cn(
                  'w-6 shrink-0 text-center font-mono text-sm font-bold',
                  job.position === 1 ? 'text-acid' : 'text-muted-foreground'
                )}
              >
                {job.position}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate font-display text-sm text-foreground">{job.title}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {job.owner.displayName}
                  </span>
                </div>
                {/* A explicação da posição vem PRONTA do servidor — a tela não
                    recalcula a regra de justiça. */}
                <p className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {formatSeconds(job.estimatedSeconds)}
                  {job.estimatedGrams ? ` · ${Math.round(job.estimatedGrams)}g` : ''}
                  {job.reasonText ? ` · ${job.reasonText}` : ''}
                </p>
              </div>

              {job.etaStartAt && (
                <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:block">
                  ~{new Date(job.etaStartAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}

              {(job.owner.id === meId || isAdmin) && (
                <button
                  type="button"
                  title="Tirar da fila"
                  aria-label="Tirar da fila"
                  onClick={() => void cancel(job)}
                  disabled={busy === job.id}
                  className="shrink-0 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ============================================
// HISTÓRICO
// ============================================

function HistoryCard() {
  const { token } = useAuth()
  const [jobs, setJobs] = React.useState<PrintHistoryItem[] | null>(null)

  React.useEffect(() => {
    let alive = true
    void printApi
      .history(token)
      .then((res) => {
        if (alive) setJobs(res.jobs)
      })
      .catch(() => {
        if (alive) setJobs([])
      })
    return () => {
      alive = false
    }
  }, [token])

  if (!jobs) return null

  return (
    <div className="card-gradient rounded-brutal p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-display text-sm uppercase tracking-wider text-foreground">
          Já impresso
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          estimado vs. real
        </span>
      </div>

      {jobs.length === 0 ? (
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Nada impresso ainda.
        </p>
      ) : (
        <table className="w-full font-mono text-[11px]">
          <thead>
            <tr className="bg-void/60 text-[9px] uppercase tracking-widest text-muted-foreground">
              <th className="px-2 py-1 text-left">peça</th>
              <th className="px-2 py-1 text-left">quem</th>
              <th className="px-2 py-1 text-right">estimado</th>
              <th className="px-2 py-1 text-right">real</th>
              <th className="px-2 py-1 text-right">fim</th>
            </tr>
          </thead>
          <tbody>
            {jobs.slice(0, 12).map((job) => {
              const over =
                job.billedSeconds !== null && job.billedSeconds > job.estimatedSeconds * 1.2
              return (
                <tr key={job.id} className="border-t border-[#1a1a1a]">
                  <td className="max-w-[160px] truncate px-2 py-1">
                    <span className={statusTone(job.status)}>{job.title}</span>
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">{job.owner.displayName}</td>
                  <td className="px-2 py-1 text-right text-muted-foreground">
                    {formatSeconds(job.estimatedSeconds)}
                  </td>
                  {/* Estourar a estimativa fica visível pro grupo: é a
                      auditoria que resolve o problema sozinha. */}
                  {/* "0 min" para peça que nunca subiu na máquina é enganoso:
                      parece que imprimiu de graça. Sem cobrança é sem
                      cobrança. */}
                  <td className={cn('px-2 py-1 text-right', over ? 'text-burn' : 'text-foreground')}>
                    {job.billedSeconds === null || job.billedSeconds === 0 ? (
                      <span className="text-muted-foreground">
                        {job.status === 'cancelled' ? 'não começou' : '—'}
                      </span>
                    ) : (
                      formatSeconds(job.billedSeconds)
                    )}
                    {job.refundedSeconds > 0 && <span className="text-acid"> (devolvido)</span>}
                  </td>
                  <td className="px-2 py-1 text-right text-muted-foreground">
                    {job.finishedAt
                      ? new Date(job.finishedAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit'
                        })
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

/** "hoje 21:40", "quinta 21:40", "12/09 21:40". */
function describeWhen(iso: string): string {
  const when = new Date(iso)
  const hours = (when.getTime() - Date.now()) / 3_600_000
  const time = when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (hours <= 12) return `hoje ${time}`
  if (hours <= 24 * 6) return `${when.toLocaleDateString('pt-BR', { weekday: 'long' })} ${time}`
  return `${when.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`
}
