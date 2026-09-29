import * as React from 'react'
import { AlertTriangle, Loader2, Lock, Plus, Repeat, Scale, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  printApi,
  type FilamentGroupRow,
  type FilamentSpoolRow,
  type PrintFilament
} from '@/lib/api-print'
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
  const [asking, setAsking] = React.useState<{ spoolId?: string } | null>(null)
  const [asked, setAsked] = React.useState<string | null>(null)

  if (!filament) {
    return <p className="text-xs text-muted-foreground">O servidor ainda não conhece o estoque de filamento.</p>
  }

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

  function ask(spoolId?: string): void {
    setAsked(null)
    setAsking({ spoolId })
  }

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
                slotCount={slotCount}
                canOperate={canOperate}
                canAsk={canQueue}
                onAsk={() => ask(spool.id)}
                onChanged={onChanged}
              />
            ))}
          </ul>
        )}
        {empty.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[11.5px] text-muted-foreground">
              {empty.length} rolo{empty.length > 1 ? 's' : ''} acabado{empty.length > 1 ? 's' : ''}
            </summary>
            <ul className="mt-2 space-y-2">
              {empty.map((spool) => (
                <SpoolRow
                  key={spool.id}
                  spool={spool}
                  groups={groups}
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
                  {filament.aceLoadedSlot === slot.slot && (
                    <span className="text-[11px] text-acid-text">no bico</span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <ColorDot hex={slot.empty ? null : slot.colorHex} className="h-5 w-5" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {slot.empty ? 'vazio' : slot.type ?? (slot.source === 'none' ? '?' : '—')}
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
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    a máquina diz outra coisa
                  </p>
                ) : (
                  slot.group && (
                    <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                      <Lock className="h-3 w-3 shrink-0" />
                      {slot.group.name}
                    </p>
                  )
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {(swaps.length > 0 || canQueue) && (
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
                key={asking.spoolId ?? 'livre'}
                filament={filament}
                defaultSpoolId={asking.spoolId}
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

        {adding !== false && (
          <NewSpoolForm
            key={adding ?? 'geral'}
            acceptedFilaments={acceptedFilaments}
            groups={groups}
            defaultGroupId={adding}
            slotCount={slotCount}
            onDone={async () => {
              setAdding(false)
              await onChanged()
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        {spoolList(
          general,
          'Nenhum rolo no estoque geral. Cadastrar e marcar o slot é o que faz a fila descontar o que cada peça gasta.'
        )}
      </section>

      {groups.map((group) => (
        <section key={group.id} className="card-gradient rounded-brutal p-4">
          <GroupHeader group={group} canOperate={canOperate} onChanged={onChanged} />
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

      {canOperate && (
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
    </div>
  )
}

function SpoolRow({
  spool,
  groups,
  slotCount,
  canOperate,
  canAsk,
  onAsk,
  onChanged
}: {
  spool: FilamentSpoolRow
  groups: FilamentGroupRow[]
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
              <div
                className={cn('h-full', spool.low ? 'bg-burn' : 'bg-acid')}
                style={{ width: `${pct}%` }}
              />
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
            onChange={(event) => void update({ slot: event.target.value === '' ? null : Number(event.target.value) })}
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
    </li>
  )
}

function NewSpoolForm({
  acceptedFilaments,
  groups,
  defaultGroupId,
  slotCount,
  onDone,
  onCancel
}: {
  acceptedFilaments: string[]
  groups: FilamentGroupRow[]
  defaultGroupId: string | null
  slotCount: number
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const { token } = useAuth()
  const [material, setMaterial] = React.useState(acceptedFilaments[0] ?? 'PLA')
  const [colorName, setColorName] = React.useState('')
  const [colorHex, setColorHex] = React.useState('#000000')
  const [brand, setBrand] = React.useState('')
  const [total, setTotal] = React.useState('1000')
  const [slot, setSlot] = React.useState<string>('')
  const [groupId, setGroupId] = React.useState<string>(defaultGroupId ?? '')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await printApi.createSpool(token, {
        material,
        colorName: colorName.trim(),
        colorHex,
        brand: brand.trim() || undefined,
        totalGrams: Number(total) || 1000,
        slot: slot === '' ? null : Number(slot),
        groupId: groupId || null
      })
      await onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu')
      setBusy(false)
    }
  }

  return (
    <div className="mb-3 space-y-2 rounded-brutal border border-acid-dark/60 bg-acid/5 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <select
          value={material}
          onChange={(event) => setMaterial(event.target.value)}
          className="input-terminal rounded-brutal px-2 py-1.5 text-sm"
          aria-label="Material"
        >
          {(acceptedFilaments.length ? acceptedFilaments : ['PLA', 'PETG', 'TPU']).map((option) => (
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
        {groups.length > 0 && (
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
        <Button size="sm" className="btn-acid" onClick={() => void save()} disabled={busy || colorName.trim().length === 0}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Cadastrar
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
