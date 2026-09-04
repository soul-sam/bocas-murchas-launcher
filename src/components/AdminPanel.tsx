import * as React from 'react'
import {
  CheckCircle2,
  ClipboardCopy,
  KeyRound,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  ShieldMinus,
  ShieldPlus,
  Ticket,
  Trash2,
  Users,
  Volume2,
  Wrench,
  XCircle
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useSettings } from '@/lib/settings-context'
import { useSoundboard } from '@/lib/soundboard-context'
import {
  admin,
  ApiError,
  resolveAssetUrl,
  sounds as soundsApi,
  type InviteSummary,
  type Sound
} from '@/lib/api'
import { adminApi, generateTempPassword, type AdminUser } from '@/lib/api-admin'
import { playUiSound, type UiSound } from '@/lib/ui-sounds'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { UserAvatar } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

/**
 * Conteúdo do painel admin — as quatro abas. A moldura (camada fixa, fechar
 * com Esc/clique fora) é do AdminModal; aqui só o que vai dentro.
 *
 * Toda ação destrutiva confirma INLINE, no próprio botão, em vez de abrir
 * outra modal: já estamos numa camada por cima de tudo, e camada em cima de
 * camada é o caminho conhecido pro app travar sem clique (interaction-guard).
 */
export function AdminPanel() {
  return (
    <Tabs defaultValue="convites" className="flex min-h-0 flex-1 flex-col">
      <TabsList>
        <TabsTrigger value="convites">
          <Ticket className="mr-1.5 inline h-3 w-3" />
          Convites
        </TabsTrigger>
        <TabsTrigger value="membros">
          <Users className="mr-1.5 inline h-3 w-3" />
          Membros
        </TabsTrigger>
        <TabsTrigger value="sons">
          <Volume2 className="mr-1.5 inline h-3 w-3" />
          Sons
        </TabsTrigger>
        <TabsTrigger value="ferramentas">
          <Wrench className="mr-1.5 inline h-3 w-3" />
          Ferramentas
        </TabsTrigger>
      </TabsList>

      <TabsContent value="convites" className="pr-1">
        <InvitesTab />
      </TabsContent>
      <TabsContent value="membros" className="pr-1">
        <MembersTab />
      </TabsContent>
      <TabsContent value="sons" className="pr-1">
        <SoundsTab />
      </TabsContent>
      <TabsContent value="ferramentas" className="pr-1">
        <ToolsTab />
      </TabsContent>
    </Tabs>
  )
}

// ============================================
// UTILITÁRIOS
// ============================================

/** Avisos da interface no volume que a pessoa escolheu (0 quando desligado). */
function useCue(): (name: UiSound) => void {
  const { settings } = useSettings()
  const volume = settings.soundEnabled ? settings.soundVolume : 0
  return React.useCallback((name: UiSound) => playUiSound(name, volume), [volume])
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  })
}

/** "agora", "há 5 min", "há 3 h", "há 2 d" — depois disso a data mesmo. */
function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'nunca'
  const diff = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(diff)) return '—'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `há ${days} d`
  return formatDate(iso)
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 rounded-brutal border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-destructive">
      {children}
    </div>
  )
}

function IconButton({
  title,
  danger,
  onClick,
  disabled,
  children
}: {
  title: string
  danger?: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        'rounded-brutal p-1.5 text-muted-foreground transition-colors disabled:opacity-40',
        danger ? 'hover:bg-destructive/15 hover:text-destructive' : 'hover:bg-muted hover:text-acid'
      )}
    >
      {children}
    </button>
  )
}

/** Confirmação no lugar: "Fazer X? [Sim] [Não]". */
function InlineConfirm({
  question,
  tone = 'warn',
  busy,
  onYes,
  onNo
}: {
  question: string
  tone?: 'warn' | 'danger'
  busy?: boolean
  onYes: () => void
  onNo: () => void
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-2 rounded-brutal border px-2 py-1 font-mono text-[10px] uppercase tracking-wider',
        tone === 'danger'
          ? 'border-destructive/60 bg-destructive/10 text-destructive'
          : 'border-burn/60 bg-burn/10 text-burn'
      )}
    >
      <span>{question}</span>
      <button
        type="button"
        onClick={onYes}
        disabled={busy}
        className="font-bold underline-offset-2 hover:underline disabled:opacity-50"
      >
        {busy ? '…' : 'Sim'}
      </button>
      <button type="button" onClick={onNo} disabled={busy} className="hover:underline">
        Não
      </button>
    </span>
  )
}

// ============================================
// CONVITES
// ============================================

function inviteState(inv: InviteSummary): { label: string; tone: 'ok' | 'spent' | 'off' } {
  if (!inv.isActive) return { label: 'Desativado', tone: 'off' }
  if (inv.uses >= inv.maxUses) return { label: 'Usado', tone: 'spent' }
  if (inv.expiresAt && new Date(inv.expiresAt) < new Date()) {
    return { label: 'Expirado', tone: 'spent' }
  }
  return { label: 'Ativo', tone: 'ok' }
}

function InvitesTab() {
  const { token } = useAuth()
  const cue = useCue()

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
      setInvites(await admin.listInvites(token))
    } catch (err) {
      setLoadError(errorMessage(err, 'Falha ao carregar convites'))
    } finally {
      setReloading(false)
    }
  }, [token])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const handleCreate = async (): Promise<void> => {
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
      cue('self-join')
      await refresh()
    } catch (err) {
      cue('self-leave')
      setCreateError(errorMessage(err, 'Falha ao criar convite'))
    } finally {
      setCreating(false)
    }
  }

  const handleDeactivate = async (id: string): Promise<void> => {
    if (!token) return
    try {
      await admin.deactivateInvite(token, id)
      await refresh()
    } catch (err) {
      setLoadError(errorMessage(err, 'Falha ao desativar'))
    }
  }

  const copy = async (code: string): Promise<void> => {
    if (await copyText(code)) cue('message')
  }

  return (
    <div className="space-y-5">
      <div className="rounded-brutal border-2 border-acid-dark bg-void p-4">
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

        {loadError && <ErrorBox>{loadError}</ErrorBox>}

        <div className="rounded-brutal border-2 border-border">
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
                          className={cn(
                            'inline-flex items-center gap-1 text-[10px] uppercase tracking-wider',
                            s.tone === 'ok'
                              ? 'text-acid'
                              : s.tone === 'spent'
                                ? 'text-burn'
                                : 'text-muted-foreground'
                          )}
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
                        <div className="flex items-center justify-end gap-1">
                          <IconButton title="Copiar código" onClick={() => void copy(inv.code)}>
                            <ClipboardCopy className="h-4 w-4" />
                          </IconButton>
                          {inv.isActive && (
                            <IconButton
                              title="Desativar convite"
                              danger
                              onClick={() => void handleDeactivate(inv.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
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
  )
}

// ============================================
// MEMBROS
// ============================================

type MemberConfirm =
  | { kind: 'role'; id: string; to: 'admin' | 'member' }
  | { kind: 'remove'; id: string; step: 1 | 2 }

function MembersTab() {
  const { token, user: me } = useAuth()
  const cue = useCue()

  const [users, setUsers] = React.useState<AdminUser[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [reloading, setReloading] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [confirm, setConfirm] = React.useState<MemberConfirm | null>(null)
  /** Senha temporária gerada — aparece UMA vez, some ao fechar ou trocar de linha. */
  const [tempPassword, setTempPassword] = React.useState<{ id: string; value: string } | null>(
    null
  )
  const [copied, setCopied] = React.useState(false)

  const refresh = React.useCallback(async () => {
    if (!token) return
    setReloading(true)
    setError(null)
    try {
      setUsers(await adminApi.listUsers(token))
    } catch (err) {
      setError(errorMessage(err, 'Falha ao carregar membros'))
    } finally {
      setReloading(false)
    }
  }, [token])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (id: string, action: () => Promise<void>, okCue: UiSound = 'self-join') => {
    if (!token) return
    setBusyId(id)
    setError(null)
    try {
      await action()
      cue(okCue)
    } catch (err) {
      cue('self-leave')
      setError(errorMessage(err, 'Não deu certo'))
    } finally {
      setBusyId(null)
      setConfirm(null)
    }
  }

  const changeRole = (target: AdminUser, to: 'admin' | 'member'): Promise<void> =>
    run(target.id, async () => {
      await adminApi.setRole(token!, target.id, to)
      setUsers((prev) =>
        prev ? prev.map((u) => (u.id === target.id ? { ...u, role: to } : u)) : prev
      )
    })

  const resetPassword = (target: AdminUser): Promise<void> =>
    run(target.id, async () => {
      const value = generateTempPassword()
      await adminApi.resetPassword(token!, target.id, value)
      setTempPassword({ id: target.id, value })
      setCopied(false)
    })

  const removeUser = (target: AdminUser): Promise<void> =>
    run(
      target.id,
      async () => {
        await adminApi.removeUser(token!, target.id)
        setUsers((prev) => (prev ? prev.filter((u) => u.id !== target.id) : prev))
      },
      'user-leave'
    )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {users ? `${users.length} ${users.length === 1 ? 'pessoa' : 'pessoas'}` : '…'}
        </p>
        <button
          onClick={() => void refresh()}
          disabled={reloading}
          className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-acid disabled:opacity-50"
        >
          {reloading ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="rounded-brutal border-2 border-border">
        {users === null ? (
          <div className="p-4 text-center font-mono text-xs text-muted-foreground">
            Carregando<span className="terminal-cursor" />
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {users.map((member) => {
              const isMe = member.id === me?.id
              const isAdmin = member.role === 'admin'
              const busy = busyId === member.id
              const mine = confirm && confirm.id === member.id ? confirm : null
              const shownPassword = tempPassword?.id === member.id ? tempPassword.value : null

              return (
                <li key={member.id} className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      src={resolveAssetUrl(member.avatar)}
                      name={member.displayName}
                      status={member.status}
                      className="h-9 w-9"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {member.displayName}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-brutal border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest',
                            isAdmin
                              ? 'border-acid/60 bg-acid/10 text-acid'
                              : 'border-[#1a1a1a] text-muted-foreground'
                          )}
                        >
                          {isAdmin ? 'admin' : 'membro'}
                        </span>
                        {isMe && (
                          <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                            você
                          </span>
                        )}
                      </div>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">
                        @{member.username} · {member.email}
                      </p>
                      <p className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        visto {formatRelative(member.lastSeen)}
                        {member.inviteUsed?.code && (
                          <>
                            {' · '}convite{' '}
                            <span className="text-acid/80">{member.inviteUsed.code}</span>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5">
                      {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin text-acid" />}
                      {!isMe && (
                        <IconButton
                          title={isAdmin ? 'Rebaixar pra membro' : 'Promover a admin'}
                          disabled={busy}
                          onClick={() =>
                            setConfirm({
                              kind: 'role',
                              id: member.id,
                              to: isAdmin ? 'member' : 'admin'
                            })
                          }
                        >
                          {isAdmin ? (
                            <ShieldMinus className="h-4 w-4" />
                          ) : (
                            <ShieldPlus className="h-4 w-4" />
                          )}
                        </IconButton>
                      )}
                      <IconButton
                        title="Resetar senha"
                        disabled={busy}
                        onClick={() => void resetPassword(member)}
                      >
                        <KeyRound className="h-4 w-4" />
                      </IconButton>
                      {!isMe && (
                        <IconButton
                          title="Remover do clube"
                          danger
                          disabled={busy}
                          onClick={() => setConfirm({ kind: 'remove', id: member.id, step: 1 })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      )}
                    </div>
                  </div>

                  {mine?.kind === 'role' && (
                    <div className="mt-2 flex justify-end">
                      <InlineConfirm
                        question={
                          mine.to === 'admin'
                            ? `Promover ${member.displayName} a admin?`
                            : `Rebaixar ${member.displayName} pra membro?`
                        }
                        busy={busy}
                        onYes={() => void changeRole(member, mine.to)}
                        onNo={() => setConfirm(null)}
                      />
                    </div>
                  )}

                  {mine?.kind === 'remove' && (
                    <div className="mt-2 flex justify-end">
                      <InlineConfirm
                        tone="danger"
                        question={
                          mine.step === 1
                            ? `Remover ${member.displayName}?`
                            : 'Certeza? Apaga mensagens, sons e tudo. Não volta.'
                        }
                        busy={busy}
                        onYes={() =>
                          mine.step === 1
                            ? setConfirm({ kind: 'remove', id: member.id, step: 2 })
                            : void removeUser(member)
                        }
                        onNo={() => setConfirm(null)}
                      />
                    </div>
                  )}

                  {shownPassword && (
                    <div className="mt-2 flex items-center justify-between gap-3 rounded-brutal border-2 border-acid bg-acid/10 px-3 py-2">
                      <div className="min-w-0">
                        <p className="font-mono text-[9px] uppercase tracking-widest text-acid/80">
                          senha temporária — só aparece agora
                        </p>
                        <p className="select-all font-mono text-sm tracking-widest text-acid">
                          {shownPassword}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void copyText(shownPassword).then((ok) => {
                              setCopied(ok)
                              if (ok) cue('message')
                            })
                          }
                          className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-acid hover:underline"
                        >
                          <ClipboardCopy className="h-3 w-3" />
                          {copied ? 'Copiado' : 'Copiar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setTempPassword(null)}
                          className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                        >
                          Fechar
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

// ============================================
// SONS
// ============================================

function SoundsTab() {
  const { token } = useAuth()
  const { preview } = useSoundboard()
  const cue = useCue()

  const [sounds, setSounds] = React.useState<Sound[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [reloading, setReloading] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    if (!token) return
    setReloading(true)
    setError(null)
    try {
      setSounds(await adminApi.listAllSounds(token))
    } catch (err) {
      setError(errorMessage(err, 'Falha ao carregar sons'))
    } finally {
      setReloading(false)
    }
  }, [token])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const setBlocked = async (sound: Sound, isBlocked: boolean): Promise<void> => {
    if (!token) return
    setBusyId(sound.id)
    setError(null)
    // Otimista: o switch tem que virar na hora, o servidor confirma depois.
    setSounds((prev) => prev?.map((s) => (s.id === sound.id ? { ...s, isBlocked } : s)) ?? prev)
    try {
      const updated = await adminApi.setSoundBlocked(token, sound.id, isBlocked)
      setSounds((prev) => prev?.map((s) => (s.id === sound.id ? updated : s)) ?? prev)
      cue(isBlocked ? 'mute' : 'unmute')
    } catch (err) {
      setSounds((prev) => prev?.map((s) => (s.id === sound.id ? sound : s)) ?? prev)
      setError(errorMessage(err, 'Falha ao bloquear'))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (sound: Sound): Promise<void> => {
    if (!token) return
    setBusyId(sound.id)
    setError(null)
    try {
      await soundsApi.remove(token, sound.id)
      setSounds((prev) => prev?.filter((s) => s.id !== sound.id) ?? prev)
      cue('user-leave')
    } catch (err) {
      setError(errorMessage(err, 'Falha ao apagar'))
    } finally {
      setBusyId(null)
      setConfirmDelete(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {sounds
            ? `${sounds.length} sons · ${sounds.filter((s) => s.isBlocked).length} bloqueados`
            : '…'}
        </p>
        <button
          onClick={() => void refresh()}
          disabled={reloading}
          className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-acid disabled:opacity-50"
        >
          {reloading ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="rounded-brutal border-2 border-border">
        {sounds === null ? (
          <div className="p-4 text-center font-mono text-xs text-muted-foreground">
            Carregando<span className="terminal-cursor" />
          </div>
        ) : sounds.length === 0 ? (
          <div className="p-4 text-center font-mono text-xs text-muted-foreground">
            Nenhum som no servidor.
          </div>
        ) : (
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="border-b border-border bg-void/60 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-3 py-2">Som</th>
                <th className="px-3 py-2">Quem subiu</th>
                <th className="px-3 py-2 text-right">Tocado</th>
                <th className="px-3 py-2 text-center">Bloqueado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sounds.map((sound) => {
                const busy = busyId === sound.id
                return (
                  <tr
                    key={sound.id}
                    className={cn(
                      'border-b border-border/50 last:border-0',
                      sound.isBlocked && 'opacity-60'
                    )}
                  >
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <span className="text-lg leading-none">{sound.emoji}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-foreground">
                            {sound.name}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
                            {sound.category} · {(sound.durationMs / 1000).toFixed(1)}s
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {sound.uploadedBy.displayName}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {sound.playCount}x
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Switch
                        checked={sound.isBlocked}
                        disabled={busy}
                        onCheckedChange={(next) => void setBlocked(sound, next)}
                        aria-label={sound.isBlocked ? 'Desbloquear som' : 'Bloquear som'}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {confirmDelete === sound.id ? (
                        <div className="flex justify-end">
                          <InlineConfirm
                            tone="danger"
                            question="Apagar?"
                            busy={busy}
                            onYes={() => void remove(sound)}
                            onNo={() => setConfirmDelete(null)}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-0.5">
                          <IconButton title="Ouvir só eu" onClick={() => preview(sound)}>
                            <Play className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton
                            title="Apagar som"
                            danger
                            disabled={busy}
                            onClick={() => setConfirmDelete(sound.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ============================================
// FERRAMENTAS
// ============================================

interface ToolOutcome {
  ok: boolean
  text: string
}

function ToolsTab() {
  const { token } = useAuth()
  const cue = useCue()
  const [version, setVersion] = React.useState<string | null>(null)

  React.useEffect(() => {
    void window.bocas.app.version().then(setVersion).catch(() => setVersion('?'))
  }, [])

  const runTool = async (action: () => Promise<string>): Promise<ToolOutcome> => {
    try {
      const text = await action()
      cue('self-join')
      return { ok: true, text }
    } catch (err) {
      cue('self-leave')
      return {
        ok: false,
        text:
          err instanceof ApiError && err.status === 404
            ? 'O servidor ainda não tem essa rota — atualiza a API.'
            : errorMessage(err, 'Não deu certo')
      }
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-brutal border border-[#1a1a1a] bg-void/60 px-3 py-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Launcher
        </p>
        <p className="font-mono text-sm text-acid">v{version ?? '…'}</p>
      </div>

      <section className="space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Servidor
        </p>

        <ToolRow
          title="Rodar recap da semana agora"
          hint="Fecha a semana de XP e posta o resumo no chat, sem esperar domingo."
          run={() =>
            runTool(async () => {
              const res = await adminApi.runRecap(token!)
              return res.message ?? 'Recap rodado.'
            })
          }
        />
        <ToolRow
          title="Semear missões padrão"
          hint="Cria as missões diárias/semanais de fábrica. Pode rodar de novo sem duplicar."
          run={() =>
            runTool(async () => {
              const res = await adminApi.seedMissions(token!)
              return res.message ?? 'Missões criadas.'
            })
          }
        />
      </section>

      <section className="space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Este PC
        </p>
        <ToolRow
          title="Verificar atualização"
          hint="Procura versão nova do launcher agora. Se achar, começa a baixar sozinho."
          run={() =>
            runTool(async () => {
              const status = await window.bocas.updater.check()
              switch (status.stage) {
                case 'available':
                case 'downloading':
                  return `Versão ${status.newVersion ?? 'nova'} disponível — baixando.`
                case 'downloaded':
                  return `Versão ${status.newVersion ?? 'nova'} baixada — reinicie pra aplicar.`
                case 'not-available':
                  return 'Já está na última versão.'
                case 'error':
                  throw new ApiError(0, status.error ?? 'Falha ao checar atualização')
                default:
                  return 'Checando…'
              }
            })
          }
        />
      </section>
    </div>
  )
}

function ToolRow({
  title,
  hint,
  run
}: {
  title: string
  hint: string
  run: () => Promise<ToolOutcome>
}) {
  const [busy, setBusy] = React.useState(false)
  const [outcome, setOutcome] = React.useState<ToolOutcome | null>(null)

  const handle = async (): Promise<void> => {
    setBusy(true)
    setOutcome(null)
    try {
      setOutcome(await run())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-brutal border-2 border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs leading-snug text-muted-foreground">{hint}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void handle()} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3 w-3" />
          )}
          Rodar
        </Button>
      </div>
      {outcome && (
        <p
          className={cn(
            'mt-2 font-mono text-[11px]',
            outcome.ok ? 'text-acid' : 'text-destructive'
          )}
        >
          {outcome.ok ? '✓ ' : '✗ '}
          {outcome.text}
        </p>
      )}
    </div>
  )
}
