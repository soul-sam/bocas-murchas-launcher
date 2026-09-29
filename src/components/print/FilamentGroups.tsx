import * as React from 'react'
import { Loader2, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { printApi, type FilamentGroupRow } from '@/lib/api-print'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'

/**
 * GRUPOS DE FILAMENTO — rolo que só parte da galera pagou.
 *
 * Quem opera a impressora cria o grupo e mexe nos membros. Quem é membro
 * imprime com os rolos do grupo; a peça de quem não é trava no slot, até
 * alguém do grupo liberar.
 *
 * O estoque geral não é um grupo: é o rolo sem grupo nenhum.
 */

/** Cabeçalho de um grupo: nome, quem faz parte e, pra quem opera, os botões. */
export function GroupHeader({
  group,
  canOperate,
  onChanged
}: {
  group: FilamentGroupRow
  canOperate: boolean
  onChanged: () => Promise<void>
}) {
  const { token } = useAuth()
  const { members } = useMembers()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [confirmArchive, setConfirmArchive] = React.useState(false)

  const inGroup = new Set(group.members.map((member) => member.id))
  const candidates = members
    .filter((member) => !inGroup.has(member.id))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'))

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await action()
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-sm uppercase tracking-wider text-foreground">
          {group.name}
          {group.mine && <span className="ml-2 text-[11px] normal-case tracking-normal text-acid-text">você faz parte</span>}
        </span>
        {canOperate && (
          <span className="flex items-center gap-1">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAdding((open) => !open)}>
              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
              Pôr gente
            </Button>
            {confirmArchive ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/15"
                  disabled={busy}
                  onClick={() => void run(() => printApi.updateGroup(token, group.id, { archived: true }))}
                >
                  Arquivar mesmo
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmArchive(false)}>
                  Não
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                disabled={busy}
                title="Os rolos voltam pro estoque geral"
                onClick={() => setConfirmArchive(true)}
              >
                Arquivar
              </Button>
            )}
          </span>
        )}
      </div>

      <ul className="flex flex-wrap gap-1.5">
        {group.members.length === 0 && (
          <li className="text-[11.5px] text-muted-foreground">Ninguém no grupo ainda — nenhuma peça usa esses rolos sem liberação.</li>
        )}
        {group.members.map((member) => (
          <li
            key={member.id}
            className="inline-flex items-center gap-1 rounded-brutal border border-line px-1.5 py-px text-[11.5px] text-foreground"
          >
            {member.displayName}
            {canOperate && (
              <button
                type="button"
                aria-label={`Tirar ${member.displayName} do grupo`}
                title="Tirar do grupo"
                disabled={busy}
                onClick={() => void run(() => printApi.removeGroupMember(token, group.id, member.id))}
                className="rounded-brutal p-0.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {adding && canOperate && (
        <select
          aria-label="Pessoa pra entrar no grupo"
          value=""
          disabled={busy || candidates.length === 0}
          onChange={(event) => {
            const userId = event.target.value
            if (!userId) return
            void run(() => printApi.addGroupMember(token, group.id, userId))
          }}
          className="input-terminal rounded-brutal px-2 py-1 text-xs"
        >
          <option value="">{candidates.length === 0 ? 'todo mundo já está no grupo' : 'escolhe a pessoa…'}</option>
          {candidates.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
            </option>
          ))}
        </select>
      )}

      {group.notes && <p className="text-[11.5px] text-muted-foreground">{group.notes}</p>}
      {error && <p className="text-[11.5px] text-destructive">{error}</p>}
    </div>
  )
}

/** Formulário de grupo novo: nome e quem rachou. */
export function NewGroupForm({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => void }) {
  const { token } = useAuth()
  const { members } = useMembers()
  const [name, setName] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const sorted = [...members].sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'))

  function toggle(id: string): void {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await printApi.createGroup(token, {
        name: name.trim(),
        notes: notes.trim() || undefined,
        memberIds: [...picked]
      })
      await onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-brutal border border-acid-dark/60 bg-acid/5 p-3">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="nome do grupo (ex.: Seda do Beto e da Bia)"
        className="input-terminal w-full rounded-brutal px-2 py-1.5 text-sm"
        maxLength={40}
        autoFocus
      />
      <input
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="recado (opcional)"
        className="input-terminal w-full rounded-brutal px-2 py-1.5 text-sm"
        maxLength={200}
      />
      <fieldset>
        <legend className="mb-1 text-[11.5px] text-muted-foreground">Quem rachou esses rolos</legend>
        <div className="flex max-h-36 flex-wrap gap-1.5 overflow-auto">
          {sorted.map((member) => {
            const on = picked.has(member.id)
            return (
              <button
                key={member.id}
                type="button"
                aria-pressed={on}
                disabled={busy}
                onClick={() => toggle(member.id)}
                className={
                  on
                    ? 'rounded-brutal border border-acid-dark bg-acid/10 px-1.5 py-px text-[11.5px] text-acid-text'
                    : 'rounded-brutal border border-line px-1.5 py-px text-[11.5px] text-muted-foreground hover:text-foreground'
                }
              >
                {member.displayName}
              </button>
            )
          })}
        </div>
      </fieldset>
      <div className="flex items-center gap-2">
        <Button size="sm" className="btn-acid" onClick={() => void save()} disabled={busy || name.trim().length < 2}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Criar grupo
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        {error && <span className="text-[11.5px] text-destructive">{error}</span>}
      </div>
    </div>
  )
}
