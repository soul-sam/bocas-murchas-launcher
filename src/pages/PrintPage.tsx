import * as React from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Hourglass,
  Images,
  Layers,
  Lightbulb,
  LightbulbOff,
  ListOrdered,
  Moon,
  Palette,
  Pause,
  Play,
  Printer,
  ReceiptText,
  RefreshCw,
  Square,
  Trash2,
  Upload,
  Video,
  VideoOff,
  WifiOff,
  Wrench
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FilamentTab } from '@/components/print/FilamentTab'
import { GalleryTab } from '@/components/print/GalleryTab'
import { MaintenanceTab } from '@/components/print/MaintenanceTab'
import { RequestsTab } from '@/components/print/RequestsTab'
import { FilamentChips, PrintThumb } from '@/components/print/print-bits'
import { SchedulePicker, crossesNight, describeSchedule } from '@/components/print/SchedulePicker'
import { useAuth } from '@/lib/auth-context'
import { usePrint } from '@/lib/print-context'
import { useSocket } from '@/lib/socket-context'
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
 * **Quem chega aqui tem o cargo "Impressora Murcha"** — a barra lateral só
 * mostra a aba pra quem tem, e a rota tem guarda (ver App.tsx). Foi uma
 * mudança de rumo: antes a aba aparecia pra todo mundo com um card explicando
 * o rateio, na ideia de que esconder só geraria "não tá funcionando". O grupo
 * preferiu o contrário — a impressora é de quem rachou, e ela não fica
 * piscando pra quem não tem nada a ver com ela.
 *
 * O `NoAccessCard` ficou, e não é código morto: cobre a janela em que alguém
 * está com a aba aberta e o admin tira o cargo. Nesse caso a tela explica em
 * vez de quebrar, e o próximo passo pelo app já não tem mais a aba.
 *
 * As leituras (o que está imprimindo, a fila, o histórico) continuam abertas
 * no servidor de propósito: uma fila que se diz justa só é justa se todos os
 * donos podem conferir a conta.
 */
const TABS = ['fila', 'mural', 'encomendas', 'filamento', 'manutencao'] as const
type PrintTab = (typeof TABS)[number]

function isTab(value: string | null): value is PrintTab {
  return !!value && (TABS as readonly string[]).includes(value)
}

export function PrintPage() {
  const { user } = useAuth()
  const { state, loading, error, refresh, refreshing } = usePrint()
  // A aba mora na URL (`?aba=encomendas`): o card da encomenda no chat manda
  // a pessoa direto pra lá.
  const [params, setParams] = useSearchParams()
  const tab: PrintTab = isTab(params.get('aba')) ? (params.get('aba') as PrintTab) : 'fila'
  const changeTab = React.useCallback(
    (value: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value === 'fila') next.delete('aba')
          else next.set('aba', value)
          return next
        },
        { replace: true }
      )
    },
    [setParams]
  )
  const lowSpools = state?.filament?.spools.filter((spool) => spool.low).length ?? 0

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
        <p className="text-xs text-destructive">{error}</p>
        <Button variant="ghost" size="sm" onClick={() => void refresh()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar de novo
        </Button>
      </div>
    )
  }

  if (!state) return null

  return (
    <div className="flex flex-1 flex-col overflow-auto p-4 sm:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Printer className="h-9 w-9 text-muted-foreground drop-shadow-[0_0_10px_rgb(var(--neon-rgb)/0.3)]" />
          <div>
            <h1 className="title-brutal text-3xl">Impressora 3D</h1>
            <p className="text-xs text-muted-foreground">
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
        <Tabs value={tab} onValueChange={changeTab} className="flex flex-col gap-5">
          <TabsList className="flex-wrap">
            <TabsTrigger value="fila">
              <ListOrdered className="mr-1.5 inline h-3 w-3" />
              Fila
            </TabsTrigger>
            <TabsTrigger value="mural">
              <Images className="mr-1.5 inline h-3 w-3" />
              Mural
            </TabsTrigger>
            <TabsTrigger value="encomendas">
              <ReceiptText className="mr-1.5 inline h-3 w-3" />
              Encomendas
            </TabsTrigger>
            <TabsTrigger value="filamento">
              <Palette className="mr-1.5 inline h-3 w-3" />
              Filamento
              {lowSpools > 0 && <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-burn" aria-label="rolo acabando" />}
            </TabsTrigger>
            <TabsTrigger value="manutencao">
              <Wrench className="mr-1.5 inline h-3 w-3" />
              Manutenção
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fila" className="mt-0 flex-none overflow-visible pt-0">
            <div className="flex flex-col gap-5">
              {/* "Ocupada" não vira faixa: o card logo abaixo já mostra a peça, o
                  progresso e de quem é. Faixa pra dizer o que está na tela é ruído,
                  e ruído constante faz a galera parar de ler as faixas que importam. */}
              {state.globalBlockText && state.globalBlock !== 'printer_busy' && (
                <BlockBanner text={state.globalBlockText} reason={state.globalBlock} />
              )}

              <PrinterCard printer={state.printer} running={state.running} canOperate={state.me.canOperate} />

              {state.me.canQueue && <CameraCard printer={state.printer} />}

              {state.me.canQueue ? (
                <>
                  <QuotaCard quota={state.quota} />
                  <NewJobCard />
                </>
              ) : (
                <NoAccessCard />
              )}

              <QueueCard
                queue={state.queue}
                meId={user?.id}
                isAdmin={state.me.isAdmin}
                canOperate={state.me.canOperate}
              />

              <HistoryCard />
            </div>
          </TabsContent>

          <TabsContent value="mural" className="mt-0 flex-none overflow-visible pt-0">
            {tab === 'mural' && <GalleryTab canQueue={state.me.canQueue} />}
          </TabsContent>

          <TabsContent value="encomendas" className="mt-0 flex-none overflow-visible pt-0">
            {tab === 'encomendas' && <RequestsTab canQueue={state.me.canQueue} />}
          </TabsContent>

          <TabsContent value="filamento" className="mt-0 flex-none overflow-visible pt-0">
            <FilamentTab
              filament={state.filament}
              canOperate={state.me.canOperate}
              acceptedFilaments={state.printer.acceptedFilaments}
              onChanged={refresh}
            />
          </TabsContent>

          <TabsContent value="manutencao" className="mt-0 flex-none overflow-visible pt-0">
            {tab === 'manutencao' && <MaintenanceTab canOperate={state.me.canOperate} isAdmin={state.me.isAdmin} />}
          </TabsContent>
        </Tabs>
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
      <span className="text-xs">
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
    ? 'bg-surface-strong'
    : // Mesa suja é "online, mas parada esperando gente" — âmbar, não verde.
      // Verde aqui faria a pessoa achar que está tudo andando.
      !printer.bedClear
      ? 'bg-burn shadow-[0_0_10px_rgba(242,183,5,0.7)]'
      : running
        ? 'bg-acid shadow-[0_0_12px_rgb(var(--neon-rgb)/0.3)] animate-pulse'
        : 'bg-acid shadow-[0_0_8px_rgb(var(--neon-rgb)/0.3)]'

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
            <p className="text-[11.5px] text-muted-foreground">
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
          <span className="rounded-brutal border border-destructive/60 px-2 py-0.5 text-[11px] text-destructive">
            {printer.lastErrorMessage}
          </span>
        )}
      </div>

      {running ? (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate font-display text-base text-acid-text">{running.title}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              de {running.owner.displayName}
            </span>
          </div>

          {/*
            A peça ainda está INDO pra máquina: o G-code sai da VPS, passa pelo
            Raspberry e sobe pra impressora. Num wifi doméstico isso leva
            minutos, e uma barra parada em 0% nesse tempo parece travamento —
            daí a etapa aparecer com nome e porcentagem próprios.
          */}
          {running.stage ? (
            <div className="space-y-1">
              <div className="h-3 overflow-hidden rounded-brutal border-2 border-border bg-void">
                <div
                  className="h-full bg-acid-dark transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, running.stagePercent ?? 0))}%` }}
                />
              </div>
              <p className="text-[11.5px] text-muted-foreground">
                {running.stage === 'downloading'
                  ? 'Baixando o arquivo no raspberry'
                  : 'Mandando o arquivo pra impressora'}{' '}
                <span className="font-mono text-acid-text">{running.stagePercent ?? 0}%</span>
              </p>
            </div>
          ) : (
            <div className="h-3 overflow-hidden rounded-brutal border-2 border-acid-dark bg-void">
              <div
                className="h-full bg-acid transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, running.progress))}%` }}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
            <span className="text-acid-text">{running.progress}%</span>
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
        <p className="text-xs text-muted-foreground">
          {printer.bedClear ? 'Nada imprimindo agora.' : 'Peça pronta na mesa, esperando alguém tirar.'}
        </p>
      )}

      {/* A barra de operador só existe quando há o que operar. Sem esta
          condição a borda superior aparecia sozinha embaixo do card, com a
          impressora livre — uma linha solta que não significa nada. */}
      {canOperate && (!printer.bedClear || running !== null || msg !== null) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
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
          {msg && <span className="font-mono text-[11.5px] text-muted-foreground">{msg}</span>}
        </div>
      )}
    </div>
  )
}

// ============================================
// CÂMERA
// ============================================

const CAMERA_PREF_KEY = 'print.camera.open'
/** Sem quadro novo há isso tudo: a imagem na tela já não é "ao vivo". */
const CAMERA_STALE_MS = 8_000

function readCameraPref(): boolean {
  try {
    return localStorage.getItem(CAMERA_PREF_KEY) !== '0'
  } catch {
    return true
  }
}

/**
 * Câmera da impressora, ao vivo.
 *
 * Os quadros vêm pelo socket: o agente na impressora lê o snapshot da câmera e
 * manda pra API, que repassa pra quem está na sala. O agente SÓ manda enquanto
 * alguém está olhando, então esta tela sai da sala quando a janela some (vai
 * pra bandeja, minimiza) — senão o roteador de quem hospeda a impressora
 * subiria imagem o dia inteiro pra ninguém.
 */
function CameraCard({ printer }: { printer: PrinterInfo }) {
  const { token } = useAuth()
  const { socket } = useSocket()
  const [open, setOpen] = React.useState(readCameraPref)
  const [visible, setVisible] = React.useState(() => !document.hidden)
  const [frameUrl, setFrameUrl] = React.useState<string | null>(null)
  const [lastFrameAt, setLastFrameAt] = React.useState<number | null>(null)
  const [now, setNow] = React.useState(() => Date.now())
  const [error, setError] = React.useState<string | null>(null)
  const [lightBusy, setLightBusy] = React.useState(false)
  const [lightMsg, setLightMsg] = React.useState<string | null>(null)

  const watching = open && visible && printer.agentOnline

  React.useEffect(() => {
    const onVisibility = (): void => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  React.useEffect(() => {
    if (!socket || !watching) return

    let current: string | null = null
    const onFrame = (payload: { jpeg?: ArrayBuffer }): void => {
      if (!payload?.jpeg) return
      const url = URL.createObjectURL(new Blob([payload.jpeg], { type: 'image/jpeg' }))
      // Um blob por quadro: sem revogar o anterior, duas horas de câmera
      // aberta seguram gigas de JPEG na memória do renderer.
      if (current) URL.revokeObjectURL(current)
      current = url
      setFrameUrl(url)
      setLastFrameAt(Date.now())
    }

    const join = (): void => {
      socket.emit('print:camera:watch', {}, (res: { ok?: boolean; error?: string }) => {
        setError(res?.ok ? null : (res?.error ?? 'Não deu pra abrir a câmera.'))
      })
    }

    socket.on('print:camera:frame', onFrame)
    // Reconectou (queda de rede, deploy da API): a sala era do socket antigo.
    socket.on('connect', join)
    join()

    return () => {
      socket.off('print:camera:frame', onFrame)
      socket.off('connect', join)
      socket.emit('print:camera:unwatch', {})
      if (current) URL.revokeObjectURL(current)
      setFrameUrl(null)
      setLastFrameAt(null)
    }
  }, [socket, watching])

  // Relógio só pra decidir "ao vivo" × "congelou"; parado quando fechada.
  React.useEffect(() => {
    if (!watching) return
    const timer = setInterval(() => setNow(Date.now()), 2_000)
    return () => clearInterval(timer)
  }, [watching])

  function toggleOpen(): void {
    setOpen((prev) => {
      const next = !prev
      try {
        localStorage.setItem(CAMERA_PREF_KEY, next ? '1' : '0')
      } catch {
        // Sem storage: vale só pra esta sessão.
      }
      return next
    })
  }

  async function toggleLight(): Promise<void> {
    if (printer.lightOn == null) return
    setLightBusy(true)
    setLightMsg(null)
    try {
      await printApi.light(token, !printer.lightOn)
    } catch (err) {
      setLightMsg(err instanceof Error ? err.message : 'Não deu')
    } finally {
      setLightBusy(false)
    }
  }

  const live = lastFrameAt !== null && now - lastFrameAt < CAMERA_STALE_MS
  const lightKnown = printer.agentOnline && printer.lightOn != null

  return (
    <div className="card-gradient rounded-brutal p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-display text-sm uppercase tracking-wider text-foreground">Câmera</span>
          {watching && (
            <span
              className={cn(
                'flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest',
                live ? 'text-acid-text' : 'text-muted-foreground'
              )}
            >
              <span
                className={cn('h-1.5 w-1.5 rounded-full', live ? 'animate-pulse bg-acid' : 'bg-surface-strong')}
                aria-hidden
              />
              {live ? 'ao vivo' : frameUrl ? 'congelou' : 'conectando'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void toggleLight()}
            disabled={!lightKnown || lightBusy}
            title={lightKnown ? undefined : 'A impressora ainda não disse como está a luz'}
          >
            {printer.lightOn ? (
              <Lightbulb className="mr-2 h-4 w-4 text-burn" />
            ) : (
              <LightbulbOff className="mr-2 h-4 w-4" />
            )}
            {printer.lightOn ? 'Apagar luz' : 'Acender luz'}
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleOpen}>
            {open ? <VideoOff className="mr-2 h-4 w-4" /> : <Video className="mr-2 h-4 w-4" />}
            {open ? 'Fechar' : 'Ver ao vivo'}
          </Button>
        </div>
      </div>

      {lightMsg && <p className="mt-2 font-mono text-[11.5px] text-destructive">{lightMsg}</p>}

      {open && (
        <div className="relative mt-3 aspect-video overflow-hidden rounded-brutal border-2 border-border bg-void">
          {frameUrl ? (
            <img
              src={frameUrl}
              alt="Câmera da impressora"
              className={cn('h-full w-full object-contain', !live && 'opacity-60')}
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-muted-foreground">
              {!printer.agentOnline
                ? 'Sem contato com a impressora — a câmera volta junto com a ponte.'
                : (error ?? 'Esperando a primeira imagem…')}
            </div>
          )}
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
        <span className="text-[11.5px] text-muted-foreground">
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

      <p className="mt-3 text-[11.5px] text-muted-foreground">
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
      <div className="text-[11.5px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  )
}

function NoAccessCard() {
  return (
    <div className="rounded-brutal border-2 border-dashed border-line-strong p-4">
      <p className="font-display text-sm uppercase tracking-wider text-foreground">
        Seu cargo da impressora saiu
      </p>
      <p className="mt-1 font-mono text-xs leading-relaxed text-muted-foreground">
        A impressora foi comprada em rateio, então quem imprime é quem tem o
        cargo <span className="text-acid">Impressora Murcha</span>. O seu não
        está mais aí — fala com um admin. Enquanto isso dá pra acompanhar a
        fila, e a aba some na próxima vez que você abrir o launcher.
      </p>
    </div>
  )
}

// ============================================
// NOVA PEÇA
// ============================================

function NewJobCard() {
  const { token } = useAuth()
  const { state, refresh } = usePrint()
  const [file, setFile] = React.useState<File | null>(null)
  const [title, setTitle] = React.useState('')
  const [scheduledFor, setScheduledFor] = React.useState<Date | null>(null)
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
      const res = await printApi.enqueue(token, file, {
        title: title.trim() || undefined,
        scheduledFor: scheduledFor?.toISOString() ?? null
      })
      setResult({ ok: true, text: res.message })
      setFile(null)
      setTitle('')
      setScheduledFor(null)
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
        <span className="text-[11.5px] text-muted-foreground">
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
          <span className="max-w-full truncate font-mono text-xs text-foreground">{file.name}</span>
        ) : (
          <span className="text-center text-[11.5px] text-muted-foreground">
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
          <SchedulePicker
            value={scheduledFor}
            onChange={setScheduledFor}
            quiet={state?.printer ?? {}}
            disabled={sending}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" className="btn-acid" onClick={() => void send()} disabled={sending}>
              {sending ? 'Mandando…' : scheduledFor ? 'Agendar' : 'Botar na fila'}
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

      <p className="mt-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
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
  isAdmin,
  canOperate
}: {
  queue: PrintQueueItem[]
  meId?: string
  isAdmin: boolean
  canOperate: boolean
}) {
  const { token } = useAuth()
  const { state, refresh } = usePrint()
  const quiet = state?.printer ?? {}
  const [busy, setBusy] = React.useState<string | null>(null)
  /** Linha com o editor de horário aberto, e o horário sendo escolhido. */
  const [editing, setEditing] = React.useState<{ id: string; value: Date | null } | null>(null)
  const [scheduleError, setScheduleError] = React.useState<string | null>(null)

  async function saveSchedule(): Promise<void> {
    if (!editing) return
    setBusy(editing.id)
    setScheduleError(null)
    try {
      await printApi.schedule(token, editing.id, editing.value?.toISOString() ?? null)
      setEditing(null)
      await refresh()
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Não deu pra mudar o horário')
    } finally {
      setBusy(null)
    }
  }

  async function cancel(job: PrintQueueItem): Promise<void> {
    setBusy(job.id)
    try {
      await printApi.cancel(token, job.id)
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  /** "Tanto faz a cor": manda com o filamento que está carregado. */
  async function filamentOk(job: PrintQueueItem): Promise<void> {
    setBusy(job.id)
    try {
      await printApi.filamentOk(token, job.id)
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card-gradient rounded-brutal p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-display text-sm uppercase tracking-wider text-foreground">Fila</span>
        <span className="text-[11.5px] text-muted-foreground">
          {queue.length === 0 ? 'vazia' : `${queue.length} na espera`}
        </span>
      </div>

      {queue.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Fila limpa.
        </p>
      ) : (
        <ul className="space-y-2">
          {queue.map((job) => {
            const mine = job.owner.id === meId
            const scheduled = job.blockedReason === 'scheduled'
            const nightRun =
              !!job.etaStartAt && crossesNight(new Date(job.etaStartAt), job.estimatedSeconds, quiet)
            const editingThis = editing?.id === job.id
            return (
              <li key={job.id} className="rounded-brutal border border-line bg-void/40 px-3 py-2">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'w-6 shrink-0 text-center font-mono text-sm font-bold',
                      job.position === 1 ? 'text-acid' : 'text-muted-foreground'
                    )}
                  >
                    {job.position}
                  </span>

                  <PrintThumb url={job.thumbUrl} alt={job.title} className="h-10 w-10" />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate font-display text-sm text-foreground">{job.title}</span>
                      <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">
                        {job.owner.displayName}
                      </span>
                    </div>
                    {/* A explicação da posição vem PRONTA do servidor — a tela não
                        recalcula a regra de justiça. */}
                    <p
                      className={cn(
                        'truncate text-[11.5px]',
                        job.blockedReason === 'filament_mismatch' || job.blockedReason === 'quiet_overrun'
                          ? 'text-burn'
                          : scheduled
                            ? 'text-acid-text'
                            : 'text-muted-foreground'
                      )}
                    >
                      {formatSeconds(job.estimatedSeconds)}
                      {job.estimatedGrams ? ` · ${Math.round(job.estimatedGrams)}g` : ''}
                      {job.reasonText ? ` · ${job.reasonText}` : ''}
                    </p>
                    {job.filaments && job.filaments.length > 0 && (
                      <FilamentChips filaments={job.filaments} className="mt-1" />
                    )}
                  </div>

                  {job.blockedReason === 'filament_mismatch' && (canOperate || job.owner.id === meId) && (
                    <button
                      type="button"
                      title="Imprimir com o filamento que está carregado"
                      onClick={() => void filamentOk(job)}
                      disabled={busy === job.id}
                      className="shrink-0 rounded-brutal border border-burn/50 px-2 py-1 text-[11px] text-burn transition-colors hover:bg-burn/10"
                    >
                      tanto faz a cor
                    </button>
                  )}

                  {nightRun && (
                    <span title="Pela previsão, essa peça roda de noite" className="hidden shrink-0 text-burn sm:block">
                      <Moon className="h-3.5 w-3.5" aria-label="roda de noite" />
                    </span>
                  )}

                  {/* Agendada: o que quem agendou quer conferir é quando TERMINA
                      (e a hora de início já está na linha de baixo). */}
                  {scheduled && job.etaFinishAt ? (
                    <span className="hidden shrink-0 text-[11.5px] text-muted-foreground sm:block">
                      termina ~{describeSchedule(new Date(job.etaFinishAt))}
                    </span>
                  ) : job.etaStartAt ? (
                    <span className="hidden shrink-0 text-[11.5px] text-muted-foreground sm:block">
                      ~{new Date(job.etaStartAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  ) : null}

                  {(mine || isAdmin) && (
                    <button
                      type="button"
                      title={scheduled ? 'Mudar o horário' : 'Agendar'}
                      aria-label={scheduled ? 'Mudar o horário' : 'Agendar'}
                      aria-expanded={editingThis}
                      onClick={() => {
                        setScheduleError(null)
                        setEditing(
                          editingThis
                            ? null
                            : { id: job.id, value: job.scheduledFor ? new Date(job.scheduledFor) : null }
                        )
                      }}
                      disabled={busy === job.id}
                      className={cn(
                        'shrink-0 rounded-brutal p-1.5 transition-colors hover:bg-acid/10 hover:text-acid-text',
                        scheduled || editingThis ? 'text-acid-text' : 'text-muted-foreground'
                      )}
                    >
                      <CalendarClock className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {(mine || isAdmin) && (
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
                </div>

                {editingThis && editing && (
                  <div className="mt-2 space-y-2 border-t border-line pt-2">
                    <SchedulePicker
                      value={editing.value}
                      onChange={(value) => setEditing({ id: job.id, value })}
                      quiet={quiet}
                      estimatedSeconds={job.estimatedSeconds}
                      disabled={busy === job.id}
                    />
                    <div className="flex items-center gap-2">
                      <Button size="sm" className="btn-acid" onClick={() => void saveSchedule()} disabled={busy === job.id}>
                        {busy === job.id ? 'Salvando…' : 'Salvar horário'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={busy === job.id}>
                        cancelar
                      </Button>
                    </div>
                    {scheduleError && <p className="text-[11.5px] text-destructive">{scheduleError}</p>}
                  </div>
                )}
              </li>
            )
          })}
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
        <span className="text-[11.5px] text-muted-foreground">
          estimado vs. real
        </span>
      </div>

      {jobs.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nada impresso ainda.
        </p>
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
            {jobs.slice(0, 12).map((job) => {
              const over =
                job.billedSeconds !== null && job.billedSeconds > job.estimatedSeconds * 1.2
              return (
                <tr key={job.id} className="border-t border-line">
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
                    {job.refundedSeconds > 0 && <span className="text-acid-text"> (devolvido)</span>}
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
