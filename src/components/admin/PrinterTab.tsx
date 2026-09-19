import * as React from 'react'
import {
  Copy,
  Cpu,
  HardDrive,
  Loader2,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Timer,
  Trash2,
  WifiOff
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { usePrint } from '@/lib/print-context'
import { useCargos } from '@/lib/cargos-context'
import {
  formatSeconds,
  printApi,
  type PrintAccessRow,
  type PrintAgentRow,
  type PrinterInfo
} from '@/lib/api-print'
import { API_ORIGIN, resolveAssetUrl } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { UserAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import {
  copyText,
  ErrorBox,
  errorMessage,
  formatRelative,
  InlineConfirm,
  useCue
} from './shared'

/**
 * ABA IMPRESSORA — o que o admin ajusta na Kobra S1 do rateio.
 *
 * As rotas `/print/admin/*` existiam desde a v0.10.0 e **nenhuma tela as
 * chamava**: liberar alguém, mudar cota ou desligar o auto-start só dava por
 * curl. Isto é essa tela.
 *
 * ## O que NÃO se faz aqui
 *
 * Liberar quem imprime. Isso é o cargo "Impressora Murcha", na aba Cargos — o
 * servidor recusa `canQueue` neste endpoint de propósito, porque aceitar em
 * silêncio deixaria o admin achando que liberou alguém e o próximo boot
 * desfaria (ver modules/cargos.ts no backend). Aqui se mexe no CONTRATO de
 * cada pessoa: cota de horas, quantas peças em fila, prioridade e se o upload
 * dela precisa de aprovação.
 *
 * A distinção importa na prática: o cargo é "essa pessoa é dona da máquina", e
 * a cota é "quanto ela usa por semana". São perguntas diferentes, com respostas
 * que mudam em ritmos diferentes.
 */
export function PrinterTab() {
  const { token } = useAuth()
  const { state, refresh: refreshState } = usePrint()
  const cue = useCue()

  const [rows, setRows] = React.useState<PrintAccessRow[] | null>(null)
  const [defaultWindow, setDefaultWindow] = React.useState<number | null>(null)
  const [connection, setConnection] = React.useState<{
    host: string | null
    hasApiKey: boolean
  } | null>(null)
  const [agents, setAgents] = React.useState<PrintAgentRow[] | null>(null)
  const [storage, setStorage] = React.useState<Awaited<
    ReturnType<typeof printApi.storage>
  > | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [reloading, setReloading] = React.useState(false)

  const load = React.useCallback(async () => {
    if (!token) return
    setReloading(true)
    try {
      // As três em paralelo, e uma falhando não derruba as outras: o painel
      // sem o número de armazenamento ainda serve pra mexer em cota.
      const [access, store, agentList] = await Promise.allSettled([
        printApi.listAccess(token),
        printApi.storage(token),
        printApi.listAgents(token)
      ])
      if (access.status === 'fulfilled') {
        setRows(access.value.members)
        setDefaultWindow(access.value.printer.defaultWindowSeconds)
        setConnection({
          host: access.value.printer.host,
          hasApiKey: access.value.printer.hasApiKey
        })
        setError(null)
      } else {
        setError(errorMessage(access.reason, 'Falha ao carregar o acesso'))
      }
      if (store.status === 'fulfilled') setStorage(store.value)
      if (agentList.status === 'fulfilled') setAgents(agentList.value.agents)
    } finally {
      setReloading(false)
    }
  }, [token])

  React.useEffect(() => {
    void load()
  }, [load])

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await Promise.all([load(), refreshState()])
      cue('self-join')
    } catch (err) {
      cue('self-leave')
      setError(errorMessage(err, 'Não deu certo'))
    } finally {
      setBusy(false)
    }
  }

  /**
   * `/print/admin/access` devolve TODO MUNDO do grupo, com as colunas zeradas
   * pra quem nunca encostou na impressora — é o formato certo pra uma tela que
   * *liberava* gente, que era o que essa rota servia antes do cargo existir.
   *
   * Aqui a liberação é o cargo, e listar o grupo inteiro enterraria as cinco
   * pessoas que interessam. Fica quem tem o cargo (canQueue/canOperate) e quem
   * tem contrato próprio guardado — este segundo caso é justamente quem PERDEU
   * o cargo mas ainda tem cota combinada e histórico no banco, e é a única
   * tela onde o admin vê isso pra decidir se limpa.
   */
  const donos = React.useMemo(
    () =>
      (rows ?? []).filter(
        (row) =>
          row.canQueue ||
          row.canOperate ||
          row.windowSeconds !== null ||
          row.maxQueuedJobs !== null ||
          row.priority > 0 ||
          row.requiresApproval ||
          row.usedSeconds > 0
      ),
    [rows]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11.5px] text-muted-foreground">
          {state?.printer.name ?? 'Impressora'}
        </p>
        <button
          onClick={() => void load()}
          disabled={reloading}
          className="font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {reloading ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}

      {state && <MachineSection printer={state.printer} busy={busy} run={run} />}

      {connection && (
        <ConnectionSection
          host={connection.host}
          hasApiKey={connection.hasApiKey}
          busy={busy}
          run={run}
        />
      )}

      <AgentsSection agents={agents} busy={busy} run={run} reload={load} />

      <section className="space-y-2">
        <h3 className="font-mono text-[11.5px] uppercase tracking-widest text-acid">
          Cota de cada um
        </h3>
        {rows === null ? (
          <p className="p-3 text-center font-mono text-xs text-muted-foreground">
            Carregando<span className="terminal-cursor" />
          </p>
        ) : donos.length === 0 ? (
          <p className="rounded-brutal border-2 border-dashed border-line-strong p-4 font-mono text-xs leading-relaxed text-muted-foreground">
            Ninguém tem o cargo da impressora ainda. Dá o cargo{' '}
            <span className="text-acid">Impressora Murcha</span> na aba Cargos —
            é ele que abre a fila, e a linha de cota aparece aqui em seguida.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {donos.map((row) => (
              <AccessRow
                key={row.user.id}
                row={row}
                defaultWindow={defaultWindow ?? 0}
                busy={busy}
                run={run}
              />
            ))}
          </ul>
        )}
      </section>

      {storage && (
        <section className="rounded-brutal border-2 border-border px-3 py-2">
          <p className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <HardDrive className="h-3 w-3" />
            {storage.files} {storage.files === 1 ? 'arquivo' : 'arquivos'} ·{' '}
            {(storage.bytes / 1024 / 1024).toFixed(0)} MB de{' '}
            {(storage.budgetBytes / 1024 / 1024).toFixed(0)} MB · guarda{' '}
            {storage.retentionDays} dias
          </p>
        </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// A máquina
// ---------------------------------------------------------------------------

function MachineSection({
  printer,
  busy,
  run
}: {
  printer: PrinterInfo
  busy: boolean
  run: (action: () => Promise<void>) => Promise<void>
}) {
  const { token } = useAuth()
  const [forcing, setForcing] = React.useState(false)

  return (
    <section className="space-y-2 rounded-brutal border-2 border-border p-3">
      <div className="flex items-center gap-2">
        <Printer className="h-4 w-4 text-acid" />
        <span className="flex-1 text-sm">{printer.model}</span>
        <span
          className={cn(
            'flex items-center gap-1 text-[11.5px]',
            printer.agentOnline ? 'text-acid' : 'text-muted-foreground'
          )}
        >
          {!printer.agentOnline && <WifiOff className="h-3 w-3" />}
          {printer.agentOnline
            ? 'agente online'
            : `agente offline · ${formatRelative(printer.agentLastSeenAt)}`}
        </span>
      </div>

      <label className="flex items-center justify-between gap-3 py-1">
        <span className="min-w-0">
          <span className="block text-xs text-foreground">Começar peça sozinho</span>
          <span className="block font-mono text-[11.5px] leading-snug text-muted-foreground">
            Desliga quando for mexer na máquina: a fila continua enfileirando e
            nada é despachado.
          </span>
        </span>
        <Switch
          checked={printer.autoStart}
          disabled={busy}
          onCheckedChange={(value) =>
            void run(() => printApi.setPrinter(token, { autoStart: value }).then(() => undefined))
          }
        />
      </label>

      <div className="flex items-center justify-between gap-3 border-t-2 border-border/50 pt-2">
        <span className="min-w-0">
          <span className="block text-xs text-foreground">Destravar a fila</span>
          <span className="block font-mono text-[11.5px] leading-snug text-muted-foreground">
            Larga o job preso no despacho e volta a impressora pra ociosa. É pro
            caso do agente morrer no pior instante.
          </span>
        </span>
        {forcing ? (
          <InlineConfirm
            question="Destravar?"
            busy={busy}
            onYes={() => {
              void run(() => printApi.forceIdle(token).then(() => undefined))
              setForcing(false)
            }}
            onNo={() => setForcing(false)}
          />
        ) : (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setForcing(true)}>
            <RotateCcw className="mr-1.5 h-3 w-3" />
            Destravar
          </Button>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Onde a máquina mora
// ---------------------------------------------------------------------------

/**
 * IP e chave da impressora.
 *
 * Isto NÃO fica no cartão SD do Pi de propósito. O IP da impressora muda toda
 * vez que alguém reinicia o roteador, e a alternativa seria abrir SSH no
 * aparelho a cada mudança. Guardado aqui, o agente recebe o valor novo no mesmo
 * segundo em que este botão é apertado.
 *
 * A chave nunca volta do servidor — o campo em branco quer dizer "não mexer".
 */
function ConnectionSection({
  host,
  hasApiKey,
  busy,
  run
}: {
  host: string | null
  hasApiKey: boolean
  busy: boolean
  run: (action: () => Promise<void>) => Promise<void>
}) {
  const { token } = useAuth()
  const [ip, setIp] = React.useState(host ?? '')
  const [key, setKey] = React.useState('')

  React.useEffect(() => setIp(host ?? ''), [host])

  const dirty = ip.trim() !== (host ?? '') || key.trim().length > 0

  return (
    <section className="space-y-2 rounded-brutal border-2 border-border p-3">
      <h3 className="font-mono text-[11.5px] uppercase tracking-widest text-acid">
        Onde a máquina está
      </h3>

      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-[11.5px] text-muted-foreground">
            IP na rede de casa
          </span>
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value.trim())}
            placeholder="192.168.0.50"
            disabled={busy}
            className="w-40 rounded-brutal border-2 border-border bg-void px-2 py-1 font-mono text-[11px] outline-none focus:border-acid-dark"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11.5px] text-muted-foreground">
            Chave da API da impressora
          </span>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value.trim())}
            placeholder={hasApiKey ? '•••••• (guardada)' : 'em branco = sem chave'}
            disabled={busy}
            className="w-56 rounded-brutal border-2 border-border bg-void px-2 py-1 font-mono text-[11px] outline-none focus:border-acid-dark"
          />
        </label>

        <Button
          size="sm"
          disabled={busy || !dirty}
          onClick={() =>
            void run(async () => {
              await printApi.setPrinter(token, {
                host: ip,
                ...(key ? { printerApiKey: key } : {})
              })
              setKey('')
            })
          }
        >
          <Save className="mr-1.5 h-3 w-3" />
          Salvar
        </Button>
      </div>

      <p className="font-mono text-[11px] leading-snug text-muted-foreground">
        Quem fala com a impressora é o agente, não o servidor — a VPS não
        alcança a sua rede. Estes dois campos são o que ele recebe ao conectar,
        e valem na hora: não precisa mexer no Raspberry.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Os agentes
// ---------------------------------------------------------------------------

/**
 * Os Raspberry Pi que fazem a ponte.
 *
 * O token aparece UMA vez, na criação. Não existe "ver de novo" porque o
 * servidor guarda só o hash — perdeu, cria outro e revoga o velho, que é
 * exatamente o que a gente quer que aconteça quando um aparelho some.
 */
function AgentsSection({
  agents,
  busy,
  run,
  reload
}: {
  agents: PrintAgentRow[] | null
  busy: boolean
  run: (action: () => Promise<void>) => Promise<void>
  reload: () => Promise<void>
}) {
  const { token } = useAuth()
  const cue = useCue()
  const [label, setLabel] = React.useState('')
  const [fresh, setFresh] = React.useState<{ label: string; token: string } | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [revoking, setRevoking] = React.useState<string | null>(null)

  const vivos = (agents ?? []).filter((agent) => !agent.revokedAt)

  const create = async (): Promise<void> => {
    const name = label.trim()
    if (!name) return
    const result = await printApi.createAgent(token, name)
    setFresh({ label: result.agent.label, token: result.token })
    setLabel('')
    await reload()
  }

  return (
    <section className="space-y-2 rounded-brutal border-2 border-border p-3">
      <h3 className="font-mono text-[11.5px] uppercase tracking-widest text-acid">
        Agentes (Raspberry Pi)
      </h3>

      {agents === null ? (
        <p className="font-mono text-xs text-muted-foreground">
          Carregando<span className="terminal-cursor" />
        </p>
      ) : vivos.length === 0 ? (
        <p className="rounded-brutal border-2 border-dashed border-line-strong p-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
          Nenhum aparelho ligado à impressora ainda. Enquanto não existir um, as
          peças ficam empilhadas em <span className="text-acid">na fila</span> —
          que é um estado legítimo, não um defeito. O programa que roda no
          aparelho está em{' '}
          <span className="text-foreground">bocasmurchas.com.br/agente-impressora.zip</span>.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {vivos.map((agent) => (
            <li
              key={agent.id}
              className="flex items-center gap-2 rounded-brutal border-2 border-border px-2 py-1.5"
            >
              <Cpu className="h-3.5 w-3.5 shrink-0 text-acid" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs">{agent.label}</span>
                <span className="block font-mono text-[11px] text-muted-foreground">
                  {agent.tokenPrefix}… · {agent.agentVersion ?? 'versão ?'} ·{' '}
                  {agent.lastSeenAt ? `visto ${formatRelative(agent.lastSeenAt)}` : 'nunca conectou'}
                  {agent.lastIp ? ` · ${agent.lastIp}` : ''}
                </span>
              </span>

              {revoking === agent.id ? (
                <InlineConfirm
                  question="Revogar?"
                  busy={busy}
                  onYes={() => {
                    void run(() => printApi.revokeAgent(token, agent.id).then(() => undefined))
                    setRevoking(null)
                  }}
                  onNo={() => setRevoking(null)}
                />
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setRevoking(agent.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <label className="block flex-1">
          <span className="mb-1 block text-[11.5px] text-muted-foreground">
            Aparelho novo
          </span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value.slice(0, 60))}
            placeholder="raspberry da sala"
            disabled={busy}
            className="w-full rounded-brutal border-2 border-border bg-void px-2 py-1 font-mono text-[11px] outline-none focus:border-acid-dark"
          />
        </label>
        <Button size="sm" disabled={busy || !label.trim()} onClick={() => void run(create)}>
          <Plus className="mr-1.5 h-3 w-3" />
          Criar token
        </Button>
      </div>

      {fresh && (
        <div className="space-y-2 rounded-brutal border-2 border-acid-dark bg-void p-2">
          <p className="font-mono text-[11px] leading-snug text-acid">
            Token de "{fresh.label}" — copia agora, ele não aparece de novo.
          </p>
          <pre className="overflow-x-auto whitespace-pre rounded-brutal border-2 border-border p-2 font-mono text-[11px] leading-relaxed text-foreground">
{`[server]
api_url = ${API_ORIGIN}
token = ${fresh.token}`}
          </pre>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void copyText(
                  `[server]\napi_url = ${API_ORIGIN}\ntoken = ${fresh.token}\n`
                ).then((ok) => {
                  setCopied(ok)
                  cue(ok ? 'self-join' : 'self-leave')
                })
              }}
            >
              <Copy className="mr-1.5 h-3 w-3" />
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFresh(null)}>
              Já guardei
            </Button>
          </div>
          <p className="font-mono text-[11px] leading-snug text-muted-foreground">
            Isso é o <span className="text-foreground">agent.conf</span> do aparelho que fica
            ligado junto da impressora. Num PC: o arquivo dentro da pasta{' '}
            <span className="text-foreground">windows</span>, e depois feche e abra o{' '}
            <span className="text-foreground">agente.bat</span>. Num Raspberry:{' '}
            <span className="text-foreground">/etc/bocas-agent/agent.conf</span> e{' '}
            <span className="text-foreground">sudo systemctl restart bocas-agent</span>.
          </p>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Linha de uma pessoa
// ---------------------------------------------------------------------------

/** Horas -> segundos, aceitando "14" e "14,5". */
function hoursToSeconds(raw: string): number | null {
  const value = Number(raw.replace(',', '.'))
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 3600)
}

function AccessRow({
  row,
  defaultWindow,
  busy,
  run
}: {
  row: PrintAccessRow
  defaultWindow: number
  busy: boolean
  run: (action: () => Promise<void>) => Promise<void>
}) {
  const { token } = useAuth()
  const { cargosOf } = useCargos()
  const [open, setOpen] = React.useState(false)

  const [hours, setHours] = React.useState(
    row.windowSeconds === null ? '' : String(row.windowSeconds / 3600)
  )
  const [maxJobs, setMaxJobs] = React.useState(
    row.maxQueuedJobs === null ? '' : String(row.maxQueuedJobs)
  )
  const [priority, setPriority] = React.useState(String(row.priority))
  const [grantHours, setGrantHours] = React.useState('')
  const [grantReason, setGrantReason] = React.useState('')

  const cargos = cargosOf(row.user.id)
  const usedPct = row.effectiveWindowSeconds
    ? Math.min(100, Math.round((row.usedSeconds / row.effectiveWindowSeconds) * 100))
    : 0

  const save = (): void => {
    void run(() =>
      printApi
        .setAccess(token, row.user.id, {
          // Vazio = usa o padrão da impressora. `null` é o que o servidor
          // entende por "sem override", e é diferente de zero.
          windowSeconds: hours.trim() === '' ? null : hoursToSeconds(hours),
          maxQueuedJobs: maxJobs.trim() === '' ? null : Number(maxJobs),
          priority: Number(priority) || 0
        })
        .then(() => undefined)
    )
  }

  return (
    <li className="rounded-brutal border-2 border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <UserAvatar
          src={resolveAssetUrl(row.user.avatar)}
          name={row.user.displayName}
          ringColor={row.user.profileColor}
          className="h-7 w-7"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm">{row.user.displayName}</span>
            {row.requiresApproval && (
              <span
                title="O upload dessa pessoa está esperando aprovação de admin — a estimativa estourou o real várias vezes. Quase sempre é perfil de fatiamento desalinhado, não má-fé."
                className="shrink-0 rounded-brutal border border-burn/60 bg-burn/10 px-1 text-[11px] text-burn"
              >
                aprovação
              </span>
            )}
          </span>
          <span className="block text-[11.5px] text-muted-foreground">
            {formatSeconds(row.usedSeconds)} de {formatSeconds(row.effectiveWindowSeconds)}
            {row.windowSeconds === null && ' (padrão)'}
            {row.priority > 0 && ` · prioridade ${row.priority}`}
            {cargos.length > 0 ? (
              ` · ${cargos[0].name}`
            ) : (
              // Sem cargo mas com linha: perdeu o cargo e o contrato ficou. A
              // tela precisa dizer isso, senão parece cota fantasma.
              <span className="text-burn"> · sem cargo</span>
            )}
          </span>
        </span>

        {/* Barrinha de consumo: é o número que o grupo mais confere, e ler
            "4h37 de 14h" dá menos ideia do que ver a barra. */}
        <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-raised">
          <span
            className={cn('block h-full', usedPct >= 100 ? 'bg-destructive' : 'bg-acid')}
            style={{ width: `${usedPct}%` }}
          />
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t-2 border-border/50 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <SmallField
              label="Cota (horas)"
              hint={`vazio = padrão (${formatSeconds(defaultWindow)})`}
              value={hours}
              onChange={setHours}
              width="w-16"
            />
            <SmallField
              label="Peças na fila"
              hint="vazio = padrão"
              value={maxJobs}
              onChange={setMaxJobs}
              width="w-14"
            />
            <SmallField
              label="Prioridade"
              hint="0 a 10"
              value={priority}
              onChange={setPriority}
              width="w-14"
            />
            <Button size="sm" className="btn-acid" disabled={busy} onClick={save}>
              {busy ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3 w-3" />
              )}
              Salvar
            </Button>
          </div>

          <label className="flex items-center justify-between gap-3 border-t-2 border-border/50 pt-2">
            <span className="min-w-0">
              <span className="block text-xs text-foreground">Exigir aprovação no upload</span>
              <span className="block font-mono text-[11.5px] leading-snug text-muted-foreground">
                Liga sozinho quando a estimativa dessa pessoa estoura o real
                várias vezes ({row.driftStrikes}{' '}
                {row.driftStrikes === 1 ? 'vez' : 'vezes'} até agora). É
                diagnóstico de perfil de fatiamento, não castigo.
              </span>
            </span>
            <Switch
              checked={row.requiresApproval}
              disabled={busy}
              onCheckedChange={(value) =>
                void run(() =>
                  printApi
                    .setAccess(token, row.user.id, { requiresApproval: value })
                    .then(() => undefined)
                )
              }
            />
          </label>

          <div className="border-t-2 border-border/50 pt-2">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <Timer className="h-3 w-3" />
              Ajuste manual de horas
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={grantHours}
                onChange={(e) => setGrantHours(e.target.value.replace(/[^0-9,.-]/g, ''))}
                placeholder="-2"
                className="w-16 rounded-brutal border-2 border-border bg-void px-2 py-1 font-mono text-[11px] outline-none focus:border-acid-dark"
              />
              <input
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                placeholder="motivo (vai pro histórico)"
                maxLength={200}
                className="min-w-0 flex-1 rounded-brutal border-2 border-border bg-void px-2 py-1 text-xs outline-none focus:border-acid-dark"
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || !grantReason.trim() || !grantHours.trim()}
                onClick={() => {
                  const value = Number(grantHours.replace(',', '.'))
                  if (!Number.isFinite(value) || value === 0) return
                  void run(async () => {
                    await printApi.grantHours(
                      token,
                      row.user.id,
                      Math.round(value * 3600),
                      grantReason.trim()
                    )
                    setGrantHours('')
                    setGrantReason('')
                  })
                }}
              >
                Lançar
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Negativo DÁ hora, positivo tira — é consumo, não saldo. O motivo é
              obrigatório de propósito: cota mexida sem explicação é o começo de
              uma discussão no domingo à noite.
            </p>
          </div>
        </div>
      )}
    </li>
  )
}

function SmallField({
  label,
  hint,
  value,
  onChange,
  width
}: {
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
  width: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9,.]/g, ''))}
        className={cn(
          width,
          'rounded-brutal border-2 border-border bg-void px-2 py-1 font-mono text-[11px] outline-none focus:border-acid-dark'
        )}
      />
      <span className="mt-1 block text-[11px] text-muted-foreground">
        {hint}
      </span>
    </label>
  )
}
