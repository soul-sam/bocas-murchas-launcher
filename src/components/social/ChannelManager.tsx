import * as React from 'react'
import {
  Hash,
  Volume2,
  Megaphone,
  Plus,
  Trash2,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  Loader2,
  Pencil
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { channels as channelsApi, type Channel, type ChannelType } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'

/**
 * Gerenciador de canais (admin).
 *
 * A API de criar, renomear e apagar canal já existia e não tinha NENHUM botão:
 * mexer na lista de canais exigia bater na API na mão. Aqui está a tela.
 *
 * A reordenação é por setas, não por arrastar. Numa lista de 5–10 itens dentro
 * de uma modal, arrastar é mais difícil de acertar do que clicar — e ainda
 * teria que funcionar com a lista rolando.
 */

const TYPE_META: Record<ChannelType, { icon: React.ReactNode; label: string }> = {
  text: { icon: <Hash className="h-3.5 w-3.5" />, label: 'Texto' },
  voice: { icon: <Volume2 className="h-3.5 w-3.5" />, label: 'Voz' },
  announcements: { icon: <Megaphone className="h-3.5 w-3.5" />, label: 'Avisos' },
  dm: { icon: <Hash className="h-3.5 w-3.5" />, label: 'Conversa' }
}

export function ChannelManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token, user } = useAuth()
  const { channels, refreshChannels } = useChat()

  const [draft, setDraft] = React.useState<Channel[]>([])
  const [newName, setNewName] = React.useState('')
  const [newType, setNewType] = React.useState<ChannelType>('text')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editName, setEditName] = React.useState('')
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null)

  /**
   * A lista local é um RASCUNHO.
   *
   * Reordenar mexe em vários canais de uma vez; salvar a cada clique de seta
   * mandaria uma requisição por passo e deixaria a ordem no servidor num estado
   * intermediário se alguma falhasse. Aqui a pessoa arruma tudo e salva uma vez.
   */
  React.useEffect(() => {
    if (!open) return
    setDraft(channels)
    setError(null)
    setEditingId(null)
    setConfirmDelete(null)
    setNewName('')
  }, [open, channels])

  const dirty = React.useMemo(
    () => draft.map((c) => c.id).join(',') !== channels.map((c) => c.id).join(','),
    [draft, channels]
  )

  const move = (index: number, direction: -1 | 1): void => {
    const target = index + direction
    if (target < 0 || target >= draft.length) return
    const next = [...draft]
    ;[next[index], next[target]] = [next[target], next[index]]
    setDraft(next)
  }

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refreshChannels()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deu ruim')
    } finally {
      setBusy(false)
    }
  }

  const create = (): void => {
    const name = newName.trim()
    if (!name || !token) return
    void run(async () => {
      await channelsApi.create(token, { name, type: newType })
      setNewName('')
    })
  }

  const rename = (id: string): void => {
    const name = editName.trim()
    setEditingId(null)
    if (!name || !token) return
    void run(() => channelsApi.update(token, id, { name }))
  }

  const remove = (id: string): void => {
    if (!token) return
    setConfirmDelete(null)
    void run(() => channelsApi.remove(token, id))
  }

  const saveOrder = (): void => {
    if (!token) return
    void run(() => channelsApi.reorder(token, draft.map((c) => c.id)))
  }

  if (user?.role !== 'admin') return null

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="h-[80vh] max-w-xl">
        <DialogHeader>
          <DialogTitle>Canais</DialogTitle>
          <DialogDescription>criar, renomear, reordenar e apagar</DialogDescription>
        </DialogHeader>

        <div className="mb-3 flex shrink-0 items-center gap-2">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') create()
            }}
            placeholder="nome do canal novo"
            className="input-terminal min-w-0 flex-1 rounded-brutal px-2 py-1.5 text-sm"
          />

          <select
            value={newType}
            onChange={(event) => setNewType(event.target.value as ChannelType)}
            className="input-terminal h-9 shrink-0 rounded-brutal px-2 text-xs"
          >
            <option value="text">Texto</option>
            <option value="voice">Voz</option>
            <option value="announcements">Avisos</option>
          </select>

          <Button size="sm" onClick={create} disabled={!newName.trim() || busy}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Criar
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {draft.map((channel, index) => {
            const meta = TYPE_META[channel.type]
            const isEditing = editingId === channel.id

            return (
              <div
                key={channel.id}
                className="flex items-center gap-2 rounded-brutal border border-line bg-void-light/30 px-2 py-1.5"
              >
                <span className="shrink-0 text-muted-foreground">{meta.icon}</span>

                {isEditing ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') rename(channel.id)
                      if (event.key === 'Escape') setEditingId(null)
                    }}
                    onBlur={() => rename(channel.id)}
                    className="input-terminal min-w-0 flex-1 rounded-brutal px-1.5 py-0.5 text-sm"
                  />
                ) : (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">
                      {channel.name}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {meta.label}
                      {channel._count ? ` · ${channel._count.messages} msg` : ''}
                    </span>
                  </span>
                )}

                <div className="flex shrink-0 items-center gap-0.5">
                  <IconButton
                    label="Subir"
                    disabled={index === 0 || busy}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </IconButton>

                  <IconButton
                    label="Descer"
                    disabled={index === draft.length - 1 || busy}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </IconButton>

                  <IconButton
                    label="Renomear"
                    disabled={busy}
                    onClick={() => {
                      setEditName(channel.name)
                      setEditingId(channel.id)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </IconButton>

                  {/* Apagar canal leva as mensagens junto (cascade no banco).
                      Por isso a confirmação vira o próprio botão em vez de
                      abrir outra modal por cima desta. */}
                  {confirmDelete === channel.id ? (
                    <>
                      <IconButton label="Confirmar" danger onClick={() => remove(channel.id)}>
                        <Check className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton label="Cancelar" onClick={() => setConfirmDelete(null)}>
                        <X className="h-3.5 w-3.5" />
                      </IconButton>
                    </>
                  ) : (
                    <IconButton
                      label="Apagar (leva as mensagens junto)"
                      danger
                      disabled={busy}
                      onClick={() => setConfirmDelete(channel.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  )}
                </div>
              </div>
            )
          })}

          {draft.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum canal ainda.
            </p>
          )}
        </div>

        {error && <p className="mt-2 shrink-0 text-xs text-destructive">{error}</p>}

        <div className="mt-3 flex shrink-0 items-center gap-2 border-t border-line pt-3">
          {confirmDelete && (
            <p className="flex-1 text-[11px] leading-tight text-destructive">
              Apagar o canal apaga todas as mensagens dele. Não tem volta.
            </p>
          )}

          <span className="flex-1" />

          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => setDraft(channels)} disabled={busy}>
              Desfazer
            </Button>
          )}

          <Button size="sm" onClick={saveOrder} disabled={!dirty || busy}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            Salvar ordem
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function IconButton({
  children,
  label,
  onClick,
  danger,
  disabled
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-brutal p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-30',
        danger
          ? 'text-muted-foreground hover:bg-destructive/15 hover:text-destructive'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}
