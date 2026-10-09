import * as React from 'react'
import { AlertTriangle, ChevronDown, Loader2, Lock, Pencil, Plus, Repeat, Scale, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { printApi, type FilamentGroupRow, type FilamentSpoolRow, type PrintFilament } from '@/lib/api-print'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import { GroupHeader, NewGroupForm } from './FilamentGroups'
import { SwapRequestForm, SwapRequestList } from './SwapRequests'
import { ColorDot, gramsLabel } from './print-bits'

/**
 * FILAMENTO — o que está no ACE agora, os pedidos de troca e o estoque.
 *
 * O ACE conta sozinho o que tem em cada slot (quando o agente da impressora
 * é novo o bastante pra repassar); o rolo marcado aqui é o que guarda o SALDO
 * em gramas, descontado a cada peça. Com os dois, a fila sabe se a próxima
 * peça bate com o que está carregado — e avisa "slot 2 precisa de PETG" em
 * vez de imprimir na cor errada.
 *
 * O estoque tem duas camadas: o GERAL, de todo mundo que rachou a impressora,
 * e os GRUPOS, de rolo que só parte da galera pagou.
 */

const SLOT_COUNT = 4
const STOCK_OPEN_KEY = 'print.filament.stockOpen'

function readStockOpen(): boolean {
  try {
    return localStorage.getItem(STOCK_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

export function FilamentTab({
  filament,
  canOperate,
  canQueue,
  acceptedFilaments,
  onChanged
}: {
  filament: PrintFilament | undefined
  canOperate: boolean
  canQueue: boolean
  acceptedFilaments: string[]
  onChanged: () => Promise<void>
}) {
  const [adding, setAdding] = React.useState<string | null | false>(false)
  const [newGroup, setNewGroup] = React.useState(false)
  const [asking, setAsking] = React.useState<{
    spoolId?: string
    slot?: number
  } | null>(null)
  const [asked, setAsked] = React.useState<string | null>(null)
  // Slot com a lista de rolos aberta (só quem opera troca direto).
  const [picking, setPicking] = React.useState<number | null>(null)
  // Estoque começa fechado: o dia a dia é trocar slot, não rolar a lista.
  const [stockOpen, setStockOpen] = React.useState(readStockOpen)

  function toggleStock(): void {
    setStockOpen((open) => {
      try {
        localStorage.setItem(STOCK_OPEN_KEY, open ? '0' : '1')
      } catch {
        // sem storage: só não lembra
      }
      return !open
    })
  }

  if (!filament) {
    return <p className="text-xs text-muted-foreground">O servidor ainda não conhece o estoque de filamento.</p>
  }

  // Servidor antigo não manda grupo nem pedido de troca: a aba volta a ser o
  // que era, sem botão que daria 404.
  const modern = filament.groups !== undefined && filament.swaps !== undefined
  const groups = filament.groups ?? []
  const swaps = filament.swaps ?? []
  const slots = filament.slots.slice(0, Math.max(SLOT_COUNT, filament.slots.length))
  const slotCount = slots.length

  // Rolo de grupo que sumiu da lista (arquivado entre uma leitura e outra)
  // cai no Geral em vez de desaparecer da tela.
  const known = new Set(groups.map((group) => group.id))
  const groupOf = (spool: FilamentSpoolRow): string | null =>
    spool.groupId && known.has(spool.groupId) ? spool.groupId : null

  const general = filament.spools.filter((spool) => groupOf(spool) === null)

  function ask(spoolId?: string, slot?: number): void {
    setAsked(null)
    setAsking({ spoolId, slot })
  }

  const activeSpools = filament.spools.filter((spool) => spool.status === 'active')
  const stockGrams = activeSpools.reduce((sum, spool) => sum + spool.remainingGrams, 0)

  const newSpoolForm = (groupId: string | null) => (
    <SpoolForm
      key={groupId ?? 'geral'}
      acceptedFilaments={acceptedFilaments}
      groups={groups}
      defaultGroupId={groupId}
      slotCount={slotCount}
      onDone={async () => {
        setAdding(false)
        await onChanged()
      }}
      onCancel={() => setAdding(false)}
    />
  )

  const spoolList = (spools: FilamentSpoolRow[], emptyText: string) => {
    const active = spools.filter((spool) => spool.status === 'active')
    const empty = spools.filter((spool) => spool.status === 'empty')
    return (
      <>
        {active.length === 0 ? (
          <p className="text-xs text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="space-y-2">
            {active.map((spool) => (
              <SpoolRow
                key={spool.id}
                spool={spool}
                groups={groups}
                acceptedFilaments={acceptedFilaments}
                slotCount={slotCount}
                canOperate={canOperate}
                canAsk={modern && canQueue}
                onAsk={() => ask(spool.id)}
                onChanged={onChanged}
              />
            ))}
          </ul>
        )}
        {empty.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[11.5px] text-muted-foreground">
              {empty.length} rolo{empty.length > 1 ? 's' : ''} acabado
              {empty.length > 1 ? 's' : ''}
            </summary>
            <ul className="mt-2 space-y-2">
              {empty.map((spool) => (
                <SpoolRow
                  key={spool.id}
                  spool={spool}
                  groups={groups}
                  acceptedFilaments={acceptedFilaments}
                  slotCount={slotCount}
                  canOperate={canOperate}
                  canAsk={false}
                  onAsk={() => undefined}
                  onChanged={onChanged}
                />
              ))}
            </ul>
          </details>
        )}
      </>
    )
  }

  return (
    <div className="space-y-5">
      <section className="card-gradient rounded-brutal p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="font-display text-sm uppercase tracking-wider text-foreground">No ACE agora</span>
          <span className="text-[11.5px] text-muted-foreground">
            {filament.aceFresh
              ? `a máquina contou ${describeAgo(filament.aceReportedAt)}`
              : 'a máquina não contou — vale o que foi marcado aqui'}
          </span>
        </div>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {slots.map((slot) => {
            const spool = filament.spools.find((s) => s.id === slot.spoolId) ?? null
            return (
              <li
                key={slot.slot}
                className={cn(
                  'rounded-brutal border px-3 py-2',
                  slot.stale
                    ? 'border-burn/60 bg-burn/5'
                    : filament.aceLoadedSlot === slot.slot
                      ? 'border-acid-dark bg-acid/5'
                      : 'border-line bg-void/40'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">slot {slot.slot + 1}</span>
                  {filament.aceLoadedSlot === slot.slot && <span className="text-[11px] text-acid-text">no bico</span>}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <ColorDot hex={slot.empty ? null : slot.colorHex} className="h-5 w-5" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {slot.empty ? 'vazio' : (slot.type ?? (slot.source === 'none' ? '?' : '—'))}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {spool
                        ? `${spool.colorName} · ${gramsLabel(spool.remainingGrams) ?? '0 g'}`
                        : slot.source === 'ace'
                          ? 'sem rolo marcado'
                          : 'nada marcado'}
                    </p>
                  </div>
                </div>
                {slot.stale ? (
                  // O ACE e o rolo marcado discordam: alguém trocou na máquina
                  // e não marcou aqui. O dono do que está lá virou palpite.
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-burn">
                    <AlertTriangle className="h-3 w-3 shrink-0" />a máquina diz outra coisa
                  </p>
                ) : (
                  slot.group && (
                    <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                      <Lock className="h-3 w-3 shrink-0" />
                      {slot.group.name}
                    </p>
                  )
                )}
                {canOperate ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn('mt-2 h-7 w-full px-2 text-xs', picking === slot.slot && 'bg-acid/10 text-acid-text')}
                    onClick={() => setPicking(picking === slot.slot ? null : slot.slot)}
                  >
                    <Repeat className="mr-1.5 h-3.5 w-3.5" />
                    Trocar filamento
                  </Button>
                ) : (
                  modern &&
                  canQueue && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 h-7 w-full px-2 text-xs"
                      onClick={() => ask(undefined, slot.slot)}
                    >
                      <Repeat className="mr-1.5 h-3.5 w-3.5" />
                      Pedir troca
                    </Button>
                  )
                )}
              </li>
            )
          })}
        </ul>

        {canOperate && picking !== null && (
          <SlotPicker
            key={picking}
            slot={picking}
            spools={activeSpools}
            groups={groups}
            groupOf={groupOf}
            onDone={async () => {
              setPicking(null)
              await onChanged()
            }}
            onCancel={() => setPicking(null)}
          />
        )}
      </section>

      {modern && (swaps.length > 0 || canQueue) && (
        <section className="card-gradient rounded-brutal p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <span className="font-display text-sm uppercase tracking-wider text-foreground">Pedidos de troca</span>
            {canQueue && !asking && (
              <Button variant="ghost" size="sm" onClick={() => ask()}>
                <Repeat className="mr-2 h-4 w-4" />
                Pedir troca
              </Button>
            )}
          </div>

          {asking && (
            <div className="mb-3">
              <SwapRequestForm
                // Trocar de rolo pelo botão da linha remonta o formulário já
                // com ele escolhido.
                key={`${asking.spoolId ?? 'livre'}:${asking.slot ?? ''}`}
                filament={filament}
                defaultSpoolId={asking.spoolId}
                defaultSlot={asking.slot}
                onDone={async (message) => {
                  setAsking(null)
                  setAsked(message)
                  await onChanged()
                }}
                onCancel={() => setAsking(null)}
              />
            </div>
          )}

          {asked && <p className="mb-3 text-xs text-acid-text">{asked}</p>}

          {swaps.length === 0 ? (
            !asking && (
              <p className="text-xs text-muted-foreground">
                Nenhum pedido aberto. Precisa de outra cor na máquina? Pede aqui e quem opera é avisado.
              </p>
            )
          ) : (
            <SwapRequestList swaps={swaps} canOperate={canOperate} onChanged={onChanged} />
          )}
        </section>
      )}

      <button
        type="button"
        onClick={toggleStock}
        aria-expanded={stockOpen}
        className="card-gradient flex w-full items-center justify-between gap-2 rounded-brutal p-4 text-left"
      >
        <span className="font-display text-sm uppercase tracking-wider text-foreground">Estoque</span>
        <span className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
          {activeSpools.length} rolo{activeSpools.length === 1 ? '' : 's'}
          {groups.length > 0 && ` · ${groups.length} grupo${groups.length === 1 ? '' : 's'}`}
          {' · '}
          {gramsLabel(stockGrams) ?? '0 g'}
          <ChevronDown className={cn('h-4 w-4 transition-transform', stockOpen && 'rotate-180')} />
        </span>
      </button>

      {stockOpen && (
        <>
          <section className="card-gradient rounded-brutal p-4">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <span className="font-display text-sm uppercase tracking-wider text-foreground">Estoque geral</span>
              {canOperate && adding === false && (
                <Button variant="ghost" size="sm" onClick={() => setAdding(null)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Cadastrar rolo
                </Button>
              )}
            </div>

            {adding === null && newSpoolForm(null)}

            {spoolList(
              general,
              'Nenhum rolo no estoque geral. Cadastrar e marcar o slot é o que faz a fila descontar o que cada peça gasta.'
            )}
          </section>

          {groups.map((group) => (
            <section key={group.id} className="card-gradient rounded-brutal p-4">
              <GroupHeader group={group} canOperate={canOperate} onChanged={onChanged} />
              {/* O form abre no grupo onde foi clicado — no Geral ele ficava fora da tela. */}
              {adding === group.id && newSpoolForm(group.id)}
              {spoolList(
                filament.spools.filter((spool) => groupOf(spool) === group.id),
                'Nenhum rolo nesse grupo ainda.'
              )}
              {canOperate && adding === false && (
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAdding(group.id)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Cadastrar rolo nesse grupo
                </Button>
              )}
            </section>
          ))}

          {modern && canOperate && (
            <section className="rounded-brutal border border-dashed border-line-strong p-4">
              {newGroup ? (
                <NewGroupForm
                  onDone={async () => {
                    setNewGroup(false)
                    await onChanged()
                  }}
                  onCancel={() => setNewGroup(false)}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Alguém comprou rolo por fora do rateio? Cria um grupo: só quem faz parte imprime com ele.
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => setNewGroup(true)}>
                    <Users className="mr-2 h-4 w-4" />
                    Novo grupo
                  </Button>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Lista de rolos pra um slot, separada por dono (Geral e cada grupo). Escolher
 * marca o rolo no slot; o servidor tira de lá o que estava (volta pra
 * prateleira). O rolo que já está no slot aparece marcado e dá pra esvaziar.
 */
function SlotPicker({
  slot,
  spools,
  groups,
  groupOf,
  onDone,
  onCancel
}: {
  slot: number
  spools: FilamentSpoolRow[]
  groups: FilamentGroupRow[]
  groupOf: (spool: FilamentSpoolRow) => string | null
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const { token } = useAuth()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const current = spools.find((spool) => spool.slot === slot) ?? null

  async function place(spoolId: string, target: number | null): Promise<void> {
    setBusy(spoolId)
    setError(null)
    try {
      await printApi.updateSpool(token, spoolId, { slot: target })
      await onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu')
      setBusy(null)
    }
  }

  /**
   * Mais um rolo do mesmo filamento direto neste slot — pra quem tem dois
   * rolos iguais e quer os dois no ACE sem tirar o outro do slot dele. Rolo
   * novo começa cheio; "Pesei" acerta depois.
   */
  async function cloneHere(spool: FilamentSpoolRow): Promise<void> {
    setBusy(spool.id)
    setError(null)
    try {
      await printApi.createSpool(token, {
        material: spool.material,
        colorName: spool.colorName,
        colorHex: spool.colorHex,
        brand: spool.brand ?? undefined,
        totalGrams: spool.totalGrams,
        slot,
        groupId: spool.groupId ?? null
      })
      await onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu')
      setBusy(null)
    }
  }

  const sections = [
    { id: null as string | null, name: 'Estoque geral' },
    ...groups.map((group) => ({
      id: group.id as string | null,
      name: group.name
    }))
  ]
    .map((section) => ({
      ...section,
      spools: spools.filter((spool) => groupOf(spool) === section.id)
    }))
    .filter((section) => section.spools.length > 0)

  return (
    <div className="mt-3 rounded-brutal border border-acid-dark/60 bg-acid/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs text-foreground">
          O que vai no <span className="font-mono">slot {slot + 1}</span>?
        </span>
        <div className="flex items-center gap-1">
          {current && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground"
              disabled={busy !== null}
              onClick={() => void place(current.id, null)}
            >
              Esvaziar slot
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onCancel} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum rolo ativo no estoque. Cadastra um primeiro.</p>
      ) : (
        <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
          {sections.map((section) => (
            <div key={section.id ?? 'geral'}>
              <p className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                {section.id ? <Lock className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                {section.name}
              </p>
              <ul className="grid gap-1 sm:grid-cols-2">
                {section.spools.map((spool) => {
                  const here = spool.slot === slot
                  const elsewhere = !here && spool.slot !== null
                  return (
                    <li key={spool.id} className="flex items-stretch gap-1">
                      <button
                        type="button"
                        disabled={here || busy !== null}
                        onClick={() => void place(spool.id, slot)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-brutal border px-2 py-1.5 text-left transition-colors',
                          here
                            ? 'cursor-default border-acid-dark bg-acid/10'
                            : 'border-line bg-void/40 hover:border-acid-dark/60 disabled:opacity-60'
                        )}
                      >
                        <ColorDot hex={spool.colorHex} className="h-4 w-4" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs text-foreground">
                            {spool.material} {spool.colorName}
                            {spool.brand && <span className="text-muted-foreground"> · {spool.brand}</span>}
                          </span>
                          <span className="block truncate font-mono text-[11px] text-muted-foreground">
                            {gramsLabel(spool.remainingGrams) ?? '0 g'}
                            {here
                              ? ' · já está aqui'
                              : spool.slot !== null
                                ? ` · sai do slot ${spool.slot + 1}`
                                : ' · prateleira'}
                          </span>
                        </span>
                        {busy === spool.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                        {spool.low && !busy && <AlertTriangle className="h-3.5 w-3.5 text-burn" />}
                      </button>
                      {elsewhere && (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void cloneHere(spool)}
                          title={`Tem mais um rolo igual? Cadastra outro aqui sem tirar o do slot ${spool.slot! + 1}`}
                          aria-label="Outro rolo igual neste slot"
                          className="flex shrink-0 items-center rounded-brutal border border-line bg-void/40 px-2 text-muted-foreground transition-colors hover:border-acid-dark/60 hover:text-foreground disabled:opacity-60"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-[11.5px] text-destructive">{error}</p>}
    </div>
  )
}

function SpoolRow({
  spool,
  groups,
  acceptedFilaments,
  slotCount,
  canOperate,
  canAsk,
  onAsk,
  onChanged
}: {
  spool: FilamentSpoolRow
  groups: FilamentGroupRow[]
  acceptedFilaments: string[]
  slotCount: number
  canOperate: boolean
  /** Pode pedir troca (tem o cargo da impressora). */
  canAsk: boolean
  onAsk: () => void
  onChanged: () => Promise<void>
}) {
  const { token } = useAuth()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [weighing, setWeighing] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  // "Outro rolo": cadastro novo já preenchido com este — pra quem tem mais
  // de um rolo do mesmo filamento e quer os dois no ACE.
  const [cloning, setCloning] = React.useState(false)
  const [grams, setGrams] = React.useState(String(spool.remainingGrams))

  const pct = spool.totalGrams > 0 ? Math.min(100, (spool.remainingGrams / spool.totalGrams) * 100) : 0
  // `usable` ausente = API velha, sem grupo: todo rolo era de todo mundo.
  const usable = spool.usable !== false

  async function update(patch: Parameters<typeof printApi.updateSpool>[2]): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await printApi.updateSpool(token, spool.id, patch)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-brutal border border-line bg-void/40 px-3 py-2">
      <div className="flex items-center gap-3">
        <ColorDot hex={spool.colorHex} className="h-6 w-6" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm text-foreground">
              {spool.material} {spool.colorName}
            </span>
            {spool.brand && <span className="text-[11px] text-muted-foreground">{spool.brand}</span>}
            {spool.low && (
              <span className="flex items-center gap-1 text-[11px] text-burn">
                <AlertTriangle className="h-3 w-3" />
                acabando
              </span>
            )}
            {!usable && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3" />
                não é do seu grupo
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-brutal bg-void">
              <div className={cn('h-full', spool.low ? 'bg-burn' : 'bg-acid')} style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {gramsLabel(spool.remainingGrams) ?? '0 g'} / {gramsLabel(spool.totalGrams)}
            </span>
          </div>
        </div>

        {canOperate && spool.status === 'active' ? (
          <select
            aria-label="Slot do ACE"
            value={spool.slot ?? ''}
            disabled={busy}
            onChange={(event) =>
              void update({
                slot: event.target.value === '' ? null : Number(event.target.value)
              })
            }
            className="input-terminal shrink-0 rounded-brutal px-2 py-1 text-xs"
          >
            <option value="">prateleira</option>
            {Array.from({ length: slotCount }, (_, index) => (
              <option key={index} value={index}>
                slot {index + 1}
              </option>
            ))}
          </select>
        ) : (
          spool.status === 'active' && (
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {spool.slot !== null ? `slot ${spool.slot + 1}` : 'prateleira'}
            </span>
          )
        )}
      </div>

      {(canOperate || (canAsk && usable)) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {canAsk && usable && spool.status === 'active' && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onAsk}>
              <Repeat className="mr-2 h-3.5 w-3.5" />
              Pedir no ACE
            </Button>
          )}
          {canOperate && (
            <>
              {weighing ? (
                <>
                  <input
                    type="number"
                    min={0}
                    value={grams}
                    onChange={(event) => setGrams(event.target.value)}
                    className="input-terminal w-24 rounded-brutal px-2 py-1 text-xs tabular-nums"
                    aria-label="Gramas que sobraram"
                  />
                  <span className="text-[11px] text-muted-foreground">g (sem o carretel)</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setWeighing(false)
                      void update({ remainingGrams: Number(grams) || 0 })
                    }}
                  >
                    Salvar
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setWeighing(true)}>
                  <Scale className="mr-2 h-3.5 w-3.5" />
                  Pesei
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={busy || editing} onClick={() => setEditing(true)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Editar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || cloning}
                title="Cadastra mais um rolo igual a este (mesmo filamento, saldo próprio)"
                onClick={() => setCloning(true)}
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Outro rolo
              </Button>
              {spool.status === 'active' ? (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void update({ status: 'empty' })}>
                  Acabou
                </Button>
              ) : (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void update({ status: 'active' })}>
                  Voltou a ter
                </Button>
              )}
              {groups.length > 0 && (
                <select
                  aria-label="Grupo do rolo"
                  value={spool.groupId ?? ''}
                  disabled={busy}
                  onChange={(event) => void update({ groupId: event.target.value || null })}
                  className="input-terminal rounded-brutal px-2 py-1 text-xs"
                >
                  <option value="">estoque geral</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                disabled={busy}
                onClick={() => void update({ status: 'archived' })}
              >
                Tirar da lista
              </Button>
            </>
          )}
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {error && <span className="text-[11.5px] text-destructive">{error}</span>}
        </div>
      )}

      {canOperate && editing && (
        <SpoolForm
          spool={spool}
          acceptedFilaments={acceptedFilaments}
          groups={groups}
          defaultGroupId={spool.groupId ?? null}
          slotCount={slotCount}
          onDone={async () => {
            setEditing(false)
            await onChanged()
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      {canOperate && cloning && (
        <SpoolForm
          template={spool}
          acceptedFilaments={acceptedFilaments}
          groups={groups}
          defaultGroupId={spool.groupId ?? null}
          slotCount={slotCount}
          onDone={async () => {
            setCloning(false)
            await onChanged()
          }}
          onCancel={() => setCloning(false)}
        />
      )}
    </li>
  )
}

/**
 * Cadastro de rolo — ou edição, quando vem `spool`. Editando, slot e grupo
 * ficam de fora: já se trocam direto na linha do rolo.
 *
 * `template` é cadastro novo já preenchido com outro rolo (mesmo filamento,
 * mais um rolo físico): cada rolo tem o seu saldo, por isso não é "um rolo
 * em dois slots" e sim dois rolos iguais.
 */
function SpoolForm({
  spool,
  template,
  acceptedFilaments,
  groups,
  defaultGroupId,
  slotCount,
  onDone,
  onCancel
}: {
  spool?: FilamentSpoolRow
  template?: FilamentSpoolRow
  acceptedFilaments: string[]
  groups: FilamentGroupRow[]
  defaultGroupId: string | null
  slotCount: number
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const { token } = useAuth()
  const editing = spool !== undefined
  const base = spool ?? template
  const [material, setMaterial] = React.useState(base?.material ?? acceptedFilaments[0] ?? 'PLA')
  const [colorName, setColorName] = React.useState(base?.colorName ?? '')
  const [colorHex, setColorHex] = React.useState(base?.colorHex ?? '#000000')
  const [brand, setBrand] = React.useState(base?.brand ?? '')
  const [total, setTotal] = React.useState(String(base?.totalGrams ?? 1000))
  const [slot, setSlot] = React.useState<string>('')
  const [groupId, setGroupId] = React.useState<string>(defaultGroupId ?? '')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Material que saiu da lista aceita continua escolhível no rolo que já o tem.
  const baseMaterials = acceptedFilaments.length ? acceptedFilaments : ['PLA', 'PETG', 'TPU']
  const materials = baseMaterials.includes(material) ? baseMaterials : [material, ...baseMaterials]

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      if (spool) {
        await printApi.updateSpool(token, spool.id, {
          material,
          colorName: colorName.trim(),
          colorHex,
          brand: brand.trim() || null,
          totalGrams: Number(total) || spool.totalGrams
        })
      } else {
        await printApi.createSpool(token, {
          material,
          colorName: colorName.trim(),
          colorHex,
          brand: brand.trim() || undefined,
          totalGrams: Number(total) || 1000,
          slot: slot === '' ? null : Number(slot),
          groupId: groupId || null
        })
      }
      await onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu')
      setBusy(false)
    }
  }

  return (
    <div
      className={cn('space-y-2 rounded-brutal border border-acid-dark/60 bg-acid/5 p-3', editing ? 'mt-2' : 'mb-3')}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <select
          value={material}
          onChange={(event) => setMaterial(event.target.value)}
          className="input-terminal rounded-brutal px-2 py-1.5 text-sm"
          aria-label="Material"
        >
          {materials.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <input
          value={colorName}
          onChange={(event) => setColorName(event.target.value)}
          placeholder="cor (ex.: preto)"
          className="input-terminal rounded-brutal px-2 py-1.5 text-sm"
          maxLength={40}
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="color"
            value={colorHex}
            onChange={(event) => setColorHex(event.target.value)}
            className="h-8 w-10 cursor-pointer rounded-brutal border border-line bg-transparent"
            aria-label="Cor"
          />
          {colorHex}
        </label>
        <input
          value={brand}
          onChange={(event) => setBrand(event.target.value)}
          placeholder="marca (opcional)"
          className="input-terminal rounded-brutal px-2 py-1.5 text-sm"
          maxLength={40}
        />
        <input
          type="number"
          min={50}
          value={total}
          onChange={(event) => setTotal(event.target.value)}
          className="input-terminal rounded-brutal px-2 py-1.5 text-sm tabular-nums"
          aria-label="Peso do rolo em gramas"
        />
        {!editing && (
          <select
            value={slot}
            onChange={(event) => setSlot(event.target.value)}
            className="input-terminal rounded-brutal px-2 py-1.5 text-sm"
            aria-label="Slot do ACE"
          >
            <option value="">na prateleira</option>
            {Array.from({ length: slotCount }, (_, index) => (
              <option key={index} value={index}>
                no slot {index + 1}
              </option>
            ))}
          </select>
        )}
        {!editing && groups.length > 0 && (
          <select
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            className="input-terminal rounded-brutal px-2 py-1.5 text-sm"
            aria-label="De quem é o rolo"
          >
            <option value="">estoque geral</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="btn-acid"
          onClick={() => void save()}
          disabled={busy || colorName.trim().length === 0}
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {editing ? 'Salvar' : template ? 'Cadastrar outro rolo' : 'Cadastrar'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        {error && <span className="text-[11.5px] text-destructive">{error}</span>}
      </div>
    </div>
  )
}

function describeAgo(iso: string | null): string {
  if (!iso) return 'agora'
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  return `há ${Math.round(minutes / 60)}h`
}
