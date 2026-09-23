import * as React from 'react'
import { AlertTriangle, Loader2, Plus, Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { printApi, type FilamentSpoolRow, type PrintFilament } from '@/lib/api-print'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import { ColorDot, gramsLabel } from './print-bits'

/**
 * FILAMENTO — o que está no ACE agora e o estoque de rolos do grupo.
 *
 * O ACE conta sozinho o que tem em cada slot (quando o agente da impressora
 * é novo o bastante pra repassar); o rolo marcado aqui é o que guarda o SALDO
 * em gramas, descontado a cada peça. Com os dois, a fila sabe se a próxima
 * peça bate com o que está carregado — e avisa "slot 2 precisa de PETG" em
 * vez de imprimir na cor errada.
 */

const SLOT_COUNT = 4

export function FilamentTab({
  filament,
  canOperate,
  acceptedFilaments,
  onChanged
}: {
  filament: PrintFilament | undefined
  canOperate: boolean
  acceptedFilaments: string[]
  onChanged: () => Promise<void>
}) {
  const [adding, setAdding] = React.useState(false)

  if (!filament) {
    return <p className="text-xs text-muted-foreground">O servidor ainda não conhece o estoque de filamento.</p>
  }

  const active = filament.spools.filter((spool) => spool.status === 'active')
  const empty = filament.spools.filter((spool) => spool.status === 'empty')
  const slots = filament.slots.slice(0, Math.max(SLOT_COUNT, filament.slots.length))

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
                  filament.aceLoadedSlot === slot.slot ? 'border-acid-dark bg-acid/5' : 'border-line bg-void/40'
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
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card-gradient rounded-brutal p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <span className="font-display text-sm uppercase tracking-wider text-foreground">Rolos do grupo</span>
          {canOperate && !adding && (
            <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Cadastrar rolo
            </Button>
          )}
        </div>

        {adding && (
          <NewSpoolForm
            acceptedFilaments={acceptedFilaments}
            onDone={async () => {
              setAdding(false)
              await onChanged()
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        {active.length === 0 && !adding ? (
          <p className="text-xs text-muted-foreground">
            Nenhum rolo cadastrado. Cadastrar e marcar o slot é o que faz a fila descontar o que cada peça gasta.
          </p>
        ) : (
          <ul className="space-y-2">
            {active.map((spool) => (
              <SpoolRow key={spool.id} spool={spool} canOperate={canOperate} onChanged={onChanged} />
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
                <SpoolRow key={spool.id} spool={spool} canOperate={canOperate} onChanged={onChanged} />
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  )
}

function SpoolRow({
  spool,
  canOperate,
  onChanged
}: {
  spool: FilamentSpoolRow
  canOperate: boolean
  onChanged: () => Promise<void>
}) {
  const { token } = useAuth()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [weighing, setWeighing] = React.useState(false)
  const [grams, setGrams] = React.useState(String(spool.remainingGrams))

  const pct = spool.totalGrams > 0 ? Math.min(100, (spool.remainingGrams / spool.totalGrams) * 100) : 0

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

        {canOperate && spool.status === 'active' && (
          <select
            aria-label="Slot do ACE"
            value={spool.slot ?? ''}
            disabled={busy}
            onChange={(event) => void update({ slot: event.target.value === '' ? null : Number(event.target.value) })}
            className="input-terminal shrink-0 rounded-brutal px-2 py-1 text-xs"
          >
            <option value="">prateleira</option>
            {Array.from({ length: SLOT_COUNT }, (_, index) => (
              <option key={index} value={index}>
                slot {index + 1}
              </option>
            ))}
          </select>
        )}
      </div>

      {canOperate && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
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
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            disabled={busy}
            onClick={() => void update({ status: 'archived' })}
          >
            Tirar da lista
          </Button>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {error && <span className="text-[11.5px] text-destructive">{error}</span>}
        </div>
      )}
    </li>
  )
}

function NewSpoolForm({
  acceptedFilaments,
  onDone,
  onCancel
}: {
  acceptedFilaments: string[]
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
        slot: slot === '' ? null : Number(slot)
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
          {Array.from({ length: SLOT_COUNT }, (_, index) => (
            <option key={index} value={index}>
              no slot {index + 1}
            </option>
          ))}
        </select>
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
