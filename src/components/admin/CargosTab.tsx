import * as React from 'react'
import { Check, Loader2, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { useCargos } from '@/lib/cargos-context'
import { cargosApi, type Cargo, type PermissionDef } from '@/lib/api-cargos'
import { CargoChip, CargoIcon, CARGO_ICON_NAMES } from '@/lib/cargo-icons'
import { resolveAssetUrl } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { ErrorBox, errorMessage, IconButton, InlineConfirm, useCue } from './shared'

/**
 * ABA CARGOS — criar crachá, escolher o que ele libera, e dar pra quem.
 *
 * A tela é deliberadamente uma coluna só, com o cargo selecionado abrindo os
 * membros embaixo: a pergunta que se faz aqui é sempre "quem tem o cargo X?",
 * nunca "quais cargos o Fulano tem?" (essa se responde no cartão de perfil,
 * que já mostra os chips).
 *
 * ## Por que a permissão aparece com o texto do servidor
 *
 * A lista de permissões vem de `GET /cargos/permissions`, não de uma constante
 * daqui. Um launcher novo contra um servidor velho ofereceria caixinha que o
 * servidor não confere: o admin marcaria, a tela diria "salvo", e nada
 * aconteceria. É o tipo de bug que só aparece semanas depois, quando alguém
 * reclama que não consegue usar o que o painel diz que ele pode.
 */
export function CargosTab() {
  const { token } = useAuth()
  const { cargos, refresh } = useCargos()
  const cue = useCue()

  const [permissions, setPermissions] = React.useState<PermissionDef[] | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [reloading, setReloading] = React.useState(false)

  React.useEffect(() => {
    if (!token) return
    void cargosApi
      .permissions(token)
      .then((r) => setPermissions(r.permissions))
      .catch(() => setPermissions([]))
  }, [token])

  // O primeiro cargo já vem aberto: painel que abre vazio faz a pessoa clicar
  // pra descobrir que tem conteúdo.
  React.useEffect(() => {
    if (!selectedId && cargos.length > 0) setSelectedId(cargos[0].id)
  }, [cargos, selectedId])

  const selected = cargos.find((c) => c.id === selectedId) ?? null

  const reload = async (): Promise<void> => {
    setReloading(true)
    try {
      await refresh()
    } finally {
      setReloading(false)
    }
  }

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await action()
      // O socket já traz `cargos:updated`, mas o refresh explícito cobre o
      // caso do socket caído — o painel do admin não pode mentir sobre o que
      // acabou de acontecer.
      await refresh()
      cue('self-join')
    } catch (err) {
      cue('self-leave')
      setError(errorMessage(err, 'Não deu certo'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {cargos.length} {cargos.length === 1 ? 'cargo' : 'cargos'}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-acid"
          >
            <Plus className="h-3 w-3" />
            Novo cargo
          </button>
          <button
            onClick={() => void reload()}
            disabled={reloading}
            className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-acid disabled:opacity-50"
          >
            {reloading ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}

      {creating && (
        <CargoForm
          permissions={permissions ?? []}
          busy={busy}
          onCancel={() => setCreating(false)}
          onSubmit={async (values) => {
            await run(async () => {
              const { cargo } = await cargosApi.create(token, values)
              setSelectedId(cargo.id)
              setCreating(false)
            })
          }}
        />
      )}

      <div className="space-y-1.5">
        {cargos.map((cargo) => (
          <CargoRow
            key={cargo.id}
            cargo={cargo}
            open={cargo.id === selectedId}
            permissions={permissions ?? []}
            busy={busy}
            onToggle={() => setSelectedId(cargo.id === selectedId ? null : cargo.id)}
            onSave={(patch) => run(() => cargosApi.update(token, cargo.id, patch).then(() => undefined))}
            onDelete={() =>
              run(async () => {
                await cargosApi.remove(token, cargo.id)
                if (selectedId === cargo.id) setSelectedId(null)
              })
            }
          />
        ))}

        {cargos.length === 0 && (
          <p className="rounded-brutal border-2 border-dashed border-[#2a2a2a] p-4 text-center font-mono text-xs text-muted-foreground">
            Nenhum cargo. Estranho — os do sistema são semeados no boot do
            servidor.
          </p>
        )}
      </div>

      {selected && <MembersOfCargo cargo={selected} busy={busy} run={run} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Linha do cargo
// ---------------------------------------------------------------------------

function CargoRow({
  cargo,
  open,
  permissions,
  busy,
  onToggle,
  onSave,
  onDelete
}: {
  cargo: Cargo
  open: boolean
  permissions: PermissionDef[]
  busy: boolean
  onToggle: () => void
  onSave: (patch: Parameters<typeof cargosApi.update>[2]) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [editing, setEditing] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)
  const { cargosOf } = useCargos()
  const { members } = useMembers()

  const count = members.filter((m) => cargosOf(m.id).some((c) => c.id === cargo.id)).length

  return (
    <div
      className={cn(
        'rounded-brutal border-2 transition-colors',
        open ? 'border-acid-dark bg-acid/[0.03]' : 'border-border'
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-brutal border"
            style={{
              color: cargo.color,
              borderColor: `${cargo.color}66`,
              backgroundColor: `${cargo.color}24`
            }}
          >
            <CargoIcon icon={cargo.icon} className="h-3.5 w-3.5" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm" style={{ color: cargo.color }}>
              {cargo.name}
            </span>
            <span className="block truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {count} {count === 1 ? 'pessoa' : 'pessoas'}
              {cargo.permissions.length > 0 && ` · ${cargo.permissions.join(' · ')}`}
              {cargo.builtin && ' · do sistema'}
            </span>
          </span>
        </button>

        {confirming ? (
          <InlineConfirm
            question="Apagar o cargo?"
            tone="danger"
            busy={busy}
            onYes={() => {
              void onDelete()
              setConfirming(false)
            }}
            onNo={() => setConfirming(false)}
          />
        ) : (
          <>
            <IconButton title="Editar" onClick={() => setEditing((v) => !v)}>
              <RefreshCw className="h-3.5 w-3.5" />
            </IconButton>
            {/* Cargo do sistema não tem lixeira, e o motivo aparece no title:
                é ele que tranca a impressora, e apagar deixaria o grupo sem
                saber recriar com o id que o código referencia. */}
            {cargo.builtin ? (
              <span
                title="Cargo do sistema: dá pra renomear, recolorir e mudar permissão, mas não apagar — é ele que libera a impressora."
                className="p-1.5 opacity-30"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </span>
            ) : (
              <IconButton title="Apagar cargo" danger onClick={() => setConfirming(true)}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            )}
          </>
        )}
      </div>

      {editing && (
        <div className="border-t-2 border-border/50 p-3">
          <CargoForm
            initial={cargo}
            permissions={permissions}
            busy={busy}
            onCancel={() => setEditing(false)}
            onSubmit={async (values) => {
              await onSave(values)
              setEditing(false)
            }}
          />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------

const PRESET_COLORS = [
  '#6AFF00',
  '#FF6A00',
  '#FF2D55',
  '#00D4FF',
  '#B14AFF',
  '#FFD400',
  '#FF7AB8',
  '#8A8A8A'
]

function CargoForm({
  initial,
  permissions,
  busy,
  onCancel,
  onSubmit
}: {
  initial?: Cargo
  permissions: PermissionDef[]
  busy: boolean
  onCancel: () => void
  onSubmit: (values: {
    name: string
    description?: string
    color?: string
    icon?: string
    permissions?: string[]
    priority?: number
  }) => Promise<void>
}) {
  const [name, setName] = React.useState(initial?.name ?? '')
  const [description, setDescription] = React.useState(initial?.description ?? '')
  const [color, setColor] = React.useState(initial?.color ?? PRESET_COLORS[0])
  const [icon, setIcon] = React.useState(initial?.icon ?? 'Shield')
  const [priority, setPriority] = React.useState(String(initial?.priority ?? 0))
  const [perms, setPerms] = React.useState<string[]>(initial?.permissions ?? [])

  const valid = name.trim().length >= 2 && name.trim().length <= 40

  const preview: Cargo = {
    id: initial?.id ?? 'preview',
    name: name.trim() || 'Cargo novo',
    description: description.trim() || null,
    color,
    icon,
    permissions: perms,
    priority: Number(priority) || 0,
    builtin: initial?.builtin ?? false
  }

  return (
    <div className="space-y-3 rounded-brutal border-2 border-acid-dark bg-void/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-acid">
          {initial ? 'Editando' : 'Cargo novo'}
        </p>
        {/* A amostra é o ponto: cor hex escolhida no escuro engana, e o chip é
            como o cargo vai aparecer na lista de membros de todo mundo. */}
        <CargoChip cargo={preview} />
      </div>

      <Field label="Nome">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Impressora Murcha"
          className="w-full rounded-brutal border-2 border-border bg-void px-2 py-1.5 text-sm outline-none focus:border-acid-dark"
        />
        {initial && (
          <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            Renomear não muda o id ({initial.id}) — quem tem o cargo continua
            tendo.
          </p>
        )}
      </Field>

      <Field label="Descrição">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          placeholder="Rachou a Kobra S1."
          className="w-full rounded-brutal border-2 border-border bg-void px-2 py-1.5 text-sm outline-none focus:border-acid-dark"
        />
      </Field>

      <Field label="Cor">
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              title={c}
              className={cn(
                'h-6 w-6 rounded-brutal border-2 transition-transform',
                color === c ? 'scale-110 border-dirty-white' : 'border-transparent'
              )}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            value={color}
            onChange={(e) => setColor(e.target.value.toUpperCase())}
            maxLength={7}
            className="w-20 rounded-brutal border-2 border-border bg-void px-2 py-1 font-mono text-[11px] uppercase outline-none focus:border-acid-dark"
          />
        </div>
      </Field>

      <Field label="Ícone">
        <div className="flex flex-wrap gap-1">
          {CARGO_ICON_NAMES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setIcon(n)}
              title={n}
              className={cn(
                'rounded-brutal border-2 p-1.5 transition-colors',
                icon === n
                  ? 'border-acid-dark bg-acid/10 text-acid'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              <CargoIcon icon={n} className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </Field>

      <Field label="O que libera">
        {permissions.length === 0 ? (
          <p className="font-mono text-[10px] text-muted-foreground">
            Este servidor não declarou permissão nenhuma. Cargo sem permissão
            ainda serve como crachá.
          </p>
        ) : (
          <div className="space-y-1.5">
            {permissions.map((perm) => {
              const on = perms.includes(perm.key)
              return (
                <button
                  key={perm.key}
                  type="button"
                  onClick={() =>
                    setPerms((prev) =>
                      on ? prev.filter((k) => k !== perm.key) : [...prev, perm.key]
                    )
                  }
                  className={cn(
                    'flex w-full items-start gap-2 rounded-brutal border-2 px-2 py-1.5 text-left transition-colors',
                    on ? 'border-acid-dark bg-acid/[0.06]' : 'border-border hover:border-[#3a3a3a]'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] border',
                      on ? 'border-acid bg-acid text-void' : 'border-[#3a3a3a]'
                    )}
                  >
                    {on && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs text-foreground">{perm.label}</span>
                    <span className="block font-mono text-[10px] leading-snug text-muted-foreground">
                      {perm.description}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </Field>

      <Field label="Prioridade">
        <input
          value={priority}
          onChange={(e) => setPriority(e.target.value.replace(/[^0-9-]/g, ''))}
          className="w-20 rounded-brutal border-2 border-border bg-void px-2 py-1 font-mono text-[11px] outline-none focus:border-acid-dark"
        />
        <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          Maior aparece primeiro e é o que pinta o nome de quem não escolheu cor
          de perfil.
        </p>
      </Field>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="btn-acid"
          disabled={!valid || busy}
          onClick={() =>
            void onSubmit({
              name: name.trim(),
              description: description.trim(),
              color,
              icon,
              permissions: perms,
              priority: Number(priority) || 0
            })
          }
        >
          {busy ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
          {initial ? 'Salvar' : 'Criar cargo'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  )
}

// ---------------------------------------------------------------------------
// Quem tem o cargo
// ---------------------------------------------------------------------------

function MembersOfCargo({
  cargo,
  busy,
  run
}: {
  cargo: Cargo
  busy: boolean
  run: (action: () => Promise<void>) => Promise<void>
}) {
  const { token } = useAuth()
  const { members } = useMembers()
  const { cargosOf } = useCargos()
  const [term, setTerm] = React.useState('')

  const has = (userId: string): boolean => cargosOf(userId).some((c) => c.id === cargo.id)

  const filtered = React.useMemo(() => {
    const needle = term.trim().toLowerCase()
    const list = needle
      ? members.filter(
          (m) =>
            m.displayName.toLowerCase().includes(needle) ||
            m.username.toLowerCase().includes(needle)
        )
      : members
    // Quem TEM o cargo primeiro: a pergunta mais comum é "quem está nesse
    // cargo?", e rolar a lista inteira pra descobrir é trabalho jogado fora.
    return [...list].sort((a, b) => {
      const diff = Number(has(b.id)) - Number(has(a.id))
      return diff !== 0 ? diff : a.displayName.localeCompare(b.displayName, 'pt-BR')
    })
  }, [members, term, cargosOf, cargo.id])

  return (
    <div className="rounded-brutal border-2 border-border">
      <div className="flex items-center gap-2 border-b-2 border-border/50 px-3 py-2">
        <p className="flex-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Quem é <span style={{ color: cargo.color }}>{cargo.name}</span>
        </p>
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="filtrar"
          className="w-28 rounded-brutal border-2 border-border bg-void px-2 py-1 font-mono text-[10px] outline-none focus:border-acid-dark"
        />
      </div>

      <ul className="max-h-64 divide-y divide-border/40 overflow-y-auto">
        {filtered.map((member) => {
          const on = has(member.id)
          return (
            <li key={member.id} className="flex items-center gap-2 px-3 py-1.5">
              <UserAvatar
                src={resolveAssetUrl(member.avatar)}
                name={member.displayName}
                className="h-6 w-6"
              />
              <span className="min-w-0 flex-1 truncate text-sm">{member.displayName}</span>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    on
                      ? cargosApi.revoke(token, cargo.id, member.id).then(() => undefined)
                      : cargosApi.grant(token, cargo.id, member.id).then(() => undefined)
                  )
                }
                className={cn(
                  'flex shrink-0 items-center gap-1 rounded-brutal border-2 px-2 py-0.5',
                  'font-mono text-[10px] uppercase tracking-widest transition-colors disabled:opacity-40',
                  on
                    ? 'border-acid-dark bg-acid/10 text-acid hover:border-destructive hover:bg-destructive/10 hover:text-destructive'
                    : 'border-border text-muted-foreground hover:border-acid-dark hover:text-acid'
                )}
              >
                {on ? (
                  <>
                    <X className="h-2.5 w-2.5" />
                    Tirar
                  </>
                ) : (
                  <>
                    <Plus className="h-2.5 w-2.5" />
                    Dar
                  </>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {/* O reboque do cargo da impressora dito em voz alta: quem dá o cargo
          está abrindo cota de horas numa máquina que o grupo rachou, e essa
          consequência não pode ficar só no código. */}
      {cargo.permissions.includes('print') && (
        <p className="border-t-2 border-border/50 px-3 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
          Dar este cargo abre a aba da impressora e a cota de horas de quem
          recebe. Cota, prioridade e aprovação por pessoa ficam na aba{' '}
          <span className="text-acid">Impressora</span>.
        </p>
      )}
    </div>
  )
}
