import * as React from 'react'
import {
  CheckCircle2,
  ClipboardCopy,
  Plus,
  Shield,
  Trash2,
  X,
  XCircle
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { admin, ApiError, type InviteSummary } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useSound } from '@/lib/use-sound'

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  })
}

function inviteState(inv: InviteSummary): { label: string; tone: 'ok' | 'spent' | 'off' } {
  if (!inv.isActive) return { label: 'Desativado', tone: 'off' }
  if (inv.uses >= inv.maxUses) return { label: 'Usado', tone: 'spent' }
  if (inv.expiresAt && new Date(inv.expiresAt) < new Date()) {
    return { label: 'Expirado', tone: 'spent' }
  }
  return { label: 'Ativo', tone: 'ok' }
}

export function AdminPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token } = useAuth()
  const playSound = useSound()

  const [invites, setInvites] = React.useState<InviteSummary[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloading, setReloading] = React.useState(false)

  const [maxUses, setMaxUses] = React.useState<number>(1)
  const [expiresInDays, setExpiresInDays] = React.useState<number>(0)
  const [creating, setCreating] = React.useState(false)
  const [createError, setCreateError] = React.useState<string | null>(null)
  const [justCreated, setJustCreated] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    if (!token) return
    setReloading(true)
    setLoadError(null)
    try {
      const list = await admin.listInvites(token)
      setInvites(list)
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Falha ao carregar convites')
    } finally {
      setReloading(false)
    }
  }, [token])

  React.useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  async function handleCreate() {
    if (!token) return
    setCreating(true)
    setCreateError(null)
    setJustCreated(null)
    try {
      const inv = await admin.createInvite(token, {
        maxUses,
        ...(expiresInDays > 0 ? { expiresInDays } : {})
      })
      setJustCreated(inv.code)
      playSound('success')
      await refresh()
    } catch (err) {
      playSound('error')
      setCreateError(err instanceof ApiError ? err.message : 'Falha ao criar convite')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeactivate(id: string) {
    if (!token) return
    try {
      await admin.deactivateInvite(token, id)
      await refresh()
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Falha ao desativar')
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      playSound('click')
    } catch {
      // ignore
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/85 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card-acid w-full max-w-2xl rounded-brutal p-6 scanlines"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-acid drop-shadow-[0_0_8px_rgba(106,255,0,0.5)]" />
            <div>
              <p className="font-display text-base uppercase tracking-widest text-foreground">
                Painel Admin
              </p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Códigos de convite
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-brutal border-2 border-border text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-6 rounded-brutal border-2 border-acid-dark bg-void p-4">
          <p className="mb-3 font-display text-sm uppercase tracking-widest text-acid">
            Gerar novo convite
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Usos máximos
              </span>
              <input
                type="number"
                min={1}
                max={50}
                value={maxUses}
                onChange={(e) =>
                  setMaxUses(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
                }
                className="input-terminal w-20 rounded-brutal px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Expira em (dias, 0 = nunca)
              </span>
              <input
                type="number"
                min={0}
                max={365}
                value={expiresInDays}
                onChange={(e) =>
                  setExpiresInDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))
                }
                className="input-terminal w-28 rounded-brutal px-3 py-2 font-mono text-sm"
              />
            </label>
            <Button onClick={() => void handleCreate()} disabled={creating} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              {creating ? 'Gerando…' : 'Gerar'}
            </Button>
          </div>
          {justCreated && (
            <div className="mt-3 flex items-center justify-between rounded-brutal border-2 border-acid bg-acid/10 px-3 py-2">
              <span className="font-mono text-sm tracking-widest text-acid">{justCreated}</span>
              <button
                type="button"
                onClick={() => void copy(justCreated)}
                className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-acid hover:underline"
              >
                <ClipboardCopy className="h-3 w-3" />
                Copiar
              </button>
            </div>
          )}
          {createError && (
            <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-destructive">
              {createError}
            </p>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="font-display text-sm uppercase tracking-widest text-foreground">
              Convites existentes
            </p>
            <button
              onClick={() => void refresh()}
              disabled={reloading}
              className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-acid disabled:opacity-50"
            >
              {reloading ? 'Atualizando…' : 'Atualizar'}
            </button>
          </div>

          {loadError && (
            <div className="mb-3 rounded-brutal border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-destructive">
              {loadError}
            </div>
          )}

          <div className="max-h-72 overflow-y-auto rounded-brutal border-2 border-border">
            {invites === null ? (
              <div className="p-4 text-center font-mono text-xs text-muted-foreground">
                Carregando<span className="terminal-cursor" />
              </div>
            ) : invites.length === 0 ? (
              <div className="p-4 text-center font-mono text-xs text-muted-foreground">
                Nenhum convite gerado ainda.
              </div>
            ) : (
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="border-b border-border bg-void/60 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Usos</th>
                    <th className="px-3 py-2">Expira</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((inv) => {
                    const s = inviteState(inv)
                    return (
                      <tr key={inv.id} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2 tracking-widest text-acid">{inv.code}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider ${
                              s.tone === 'ok'
                                ? 'text-acid'
                                : s.tone === 'spent'
                                  ? 'text-burn'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {s.tone === 'ok' ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {s.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {inv.uses}/{inv.maxUses}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatDate(inv.expiresAt)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => void copy(inv.code)}
                              className="text-muted-foreground hover:text-acid"
                              title="Copiar código"
                              aria-label="Copiar código"
                            >
                              <ClipboardCopy className="h-4 w-4" />
                            </button>
                            {inv.isActive && (
                              <button
                                type="button"
                                onClick={() => void handleDeactivate(inv.id)}
                                className="text-muted-foreground hover:text-destructive"
                                title="Desativar convite"
                                aria-label="Desativar convite"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
