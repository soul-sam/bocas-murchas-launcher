import * as React from 'react'
import {
  Plus,
  Trash2,
  Check,
  X,
  Pencil,
  Loader2,
  Upload,
  Smile,
  Sticker as StickerIcon
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
import { resolveAssetUrl } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useEmojis, type CustomEmoji, type StickerPack } from '@/lib/emoji-context'
import { EmojiImage } from './CustomEmojiImg'

/**
 * Gerenciador de emojis e stickers do servidor.
 *
 * Duas abas na mesma modal porque quem vai subir um emoji costuma subir um
 * sticker da mesma imagem em seguida (e vice-versa). Abre a partir dos dois
 * pickers do compositor, cada um na sua aba.
 *
 * Quem pode o que segue a API: emoji e apagado/renomeado por quem subiu ou
 * por admin; pack e sticker so admin apaga (o banco nao guarda dono de pack).
 * Os botoes que a pessoa nao pode usar nem aparecem — um botao que da 403 e
 * pior que botao nenhum.
 */

export type ManagerTab = 'emojis' | 'stickers'

/** Mesmas regras da API: 2 a 32 de a-z, 0-9 e _. */
const EMOJI_NAME_RE = /^[a-z0-9_]{2,32}$/
const MAX_EMOJI_BYTES = 256_000
const MAX_STICKER_BYTES = 1_000_000

/** Digitou "KEKW!" ou "Pog Champ" -> "kekw", "pog_champ". */
function toEmojiName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 32)
}

/** "pepe-triste.PNG" -> "pepe_triste" — chute inicial pro campo de nome. */
function nameFromFile(file: File): string {
  return toEmojiName(file.name.replace(/\.[^.]+$/, ''))
}

function formatKb(bytes: number): string {
  return Math.round(bytes / 1000) + ' KB'
}

export function EmojiManager({
  open,
  onClose,
  initialTab = 'emojis'
}: {
  open: boolean
  onClose: () => void
  initialTab?: ManagerTab
}) {
  const [tab, setTab] = React.useState<ManagerTab>(initialTab)

  // Quem abre escolhe a aba; depois disso a pessoa troca a vontade.
  React.useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="h-[82vh] max-w-2xl">
        <DialogHeader>
          <DialogTitle>Emojis & stickers</DialogTitle>
          <DialogDescription>
            o que o servidor tem de <span className="font-mono text-foreground">:kekw:</span> e
            figurinha
          </DialogDescription>
        </DialogHeader>

        <div className="mb-3 flex shrink-0 gap-1 border-b border-line">
          <TabButton active={tab === 'emojis'} onClick={() => setTab('emojis')}>
            <Smile className="h-3.5 w-3.5" />
            Emojis
          </TabButton>
          <TabButton active={tab === 'stickers'} onClick={() => setTab('stickers')}>
            <StickerIcon className="h-3.5 w-3.5" />
            Stickers
          </TabButton>
        </div>

        {tab === 'emojis' ? <EmojisTab /> : <StickersTab />}
      </DialogContent>
    </Dialog>
  )
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 border-b-2 px-3 py-1.5 font-mono text-[11.5px] uppercase tracking-widest transition-colors',
        active
          ? 'border-acid text-acid'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

// ============================================
// ABA: EMOJIS
// ============================================

function EmojisTab() {
  const { token, user } = useAuth()
  const { emojis, uploadEmoji, renameEmoji, removeEmoji } = useEmojis()

  const [file, setFile] = React.useState<File | null>(null)
  const [preview, setPreview] = React.useState<string | null>(null)
  const [name, setName] = React.useState('')
  const [filter, setFilter] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editName, setEditName] = React.useState('')
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null)

  const isAdmin = user?.role === 'admin'

  // Preview local do arquivo escolhido; o objectURL e liberado na troca.
  React.useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const pickFile = (picked: File | undefined): void => {
    setError(null)
    if (!picked) return
    if (picked.size > MAX_EMOJI_BYTES) {
      setError(
        `Arquivo grande demais (${formatKb(picked.size)}). Emoji vai ate ${formatKb(MAX_EMOJI_BYTES)}.`
      )
      return
    }
    setFile(picked)
    if (!name) setName(nameFromFile(picked))
  }

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deu ruim')
    } finally {
      setBusy(false)
    }
  }

  const submit = (): void => {
    if (!file || !token) return
    const clean = toEmojiName(name)
    if (!EMOJI_NAME_RE.test(clean)) {
      setError('Nome: 2 a 32 letras minúsculas, números ou _ (ex: kekw, pog_2).')
      return
    }
    void run(async () => {
      await uploadEmoji(file, clean)
      setFile(null)
      setName('')
    })
  }

  const rename = (emoji: CustomEmoji): void => {
    const clean = toEmojiName(editName)
    setEditingId(null)
    if (!clean || clean === emoji.name) return
    if (!EMOJI_NAME_RE.test(clean)) {
      setError('Nome: 2 a 32 letras minúsculas, números ou _.')
      return
    }
    void run(() => renameEmoji(emoji.id, clean))
  }

  const remove = (id: string): void => {
    setConfirmDelete(null)
    void run(() => removeEmoji(id))
  }

  const visible = React.useMemo(() => {
    const term = filter.trim().toLowerCase()
    if (!term) return emojis
    return emojis.filter(
      (e) => e.name.includes(term) || e.uploadedBy.displayName.toLowerCase().includes(term)
    )
  }, [emojis, filter])

  return (
    <>
      {/* Formulario de upload */}
      <div className="mb-3 flex shrink-0 items-center gap-2 rounded-brutal border border-line bg-void-light/30 p-2">
        <label
          title="Escolher imagem (png, gif, webp ou jpg até 256 KB)"
          className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-brutal border border-dashed border-line-strong transition-colors hover:border-acid/60"
        >
          {preview ? (
            <img src={preview} alt="" className="h-10 w-10 object-contain" />
          ) : (
            <Upload className="h-4 w-4 text-muted-foreground" />
          )}
          <input
            type="file"
            accept="image/png,image/gif,image/webp,image/jpeg"
            className="hidden"
            onChange={(e) => {
              pickFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>

        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span className="font-mono text-sm text-muted-foreground">:</span>
          <input
            value={name}
            onChange={(e) => setName(toEmojiName(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            placeholder="nome_do_emoji"
            className="input-terminal min-w-0 flex-1 rounded-brutal px-2 py-1.5 text-sm"
          />
          <span className="font-mono text-sm text-muted-foreground">:</span>
        </div>

        <Button size="sm" onClick={submit} disabled={!file || !name || busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
          Subir
        </Button>
      </div>

      <p className="mb-2 shrink-0 font-mono text-[11.5px] text-muted-foreground">
        png, gif, webp ou jpg até 256 KB · qualquer um pode subir · {emojis.length}/300
      </p>

      {emojis.length > 12 && (
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filtrar por nome ou quem subiu"
          className="input-terminal mb-2 w-full shrink-0 rounded-brutal px-2 py-1.5 text-sm"
        />
      )}

      {error && <p className="mb-2 shrink-0 text-[11px] text-destructive">{error}</p>}

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {visible.map((emoji) => {
          const canEdit = isAdmin || emoji.uploadedBy.id === user?.id
          const isEditing = editingId === emoji.id

          return (
            <div
              key={emoji.id}
              className="flex items-center gap-2 rounded-brutal border border-line bg-void-light/30 px-2 py-1.5"
            >
              <EmojiImage emoji={emoji} className="h-7 w-7 shrink-0" />

              {isEditing ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(toEmojiName(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') rename(emoji)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onBlur={() => rename(emoji)}
                  className="input-terminal min-w-0 flex-1 rounded-brutal px-1.5 py-0.5 font-mono text-sm"
                />
              ) : (
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm text-foreground">
                    :{emoji.name}:
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {emoji.uploadedBy.displayName}
                  </span>
                </span>
              )}

              {canEdit && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <IconButton
                    label="Renomear"
                    disabled={busy}
                    onClick={() => {
                      setEditName(emoji.name)
                      setEditingId(emoji.id)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </IconButton>

                  {/* Confirmacao no proprio botao, sem modal em cima de modal. */}
                  {confirmDelete === emoji.id ? (
                    <>
                      <IconButton label="Confirmar" danger onClick={() => remove(emoji.id)}>
                        <Check className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton label="Cancelar" onClick={() => setConfirmDelete(null)}>
                        <X className="h-3.5 w-3.5" />
                      </IconButton>
                    </>
                  ) : (
                    <IconButton
                      label="Apagar"
                      danger
                      disabled={busy}
                      onClick={() => setConfirmDelete(emoji.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {visible.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {emojis.length === 0
              ? 'Nenhum emoji ainda. Sobe o primeiro aí em cima.'
              : 'Nada com esse nome.'}
          </p>
        )}
      </div>
    </>
  )
}

// ============================================
// ABA: STICKERS
// ============================================

function StickersTab() {
  const { token, user } = useAuth()
  const { packs, createPack, uploadSticker, removeSticker, removePack } = useEmojis()

  const [newName, setNewName] = React.useState('')
  const [newDescription, setNewDescription] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null)

  const isAdmin = user?.role === 'admin'
  const totalStickers = packs.reduce((sum, p) => sum + p.stickers.length, 0)

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await action()
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
      await createPack(name, newDescription.trim() || undefined)
      setNewName('')
      setNewDescription('')
    })
  }

  const addSticker = (pack: StickerPack, picked: File | undefined): void => {
    if (!picked) return
    if (picked.size > MAX_STICKER_BYTES) {
      setError(
        `Arquivo grande demais (${formatKb(picked.size)}). Sticker vai até ${formatKb(MAX_STICKER_BYTES)}.`
      )
      return
    }
    // O nome do sticker e so rotulo (tooltip); o nome do arquivo serve bem.
    const label = picked.name.replace(/\.[^.]+$/, '').slice(0, 32) || 'sticker'
    void run(() => uploadSticker(pack.id, picked, label))
  }

  return (
    <>
      {/* Criar pack */}
      <div className="mb-3 flex shrink-0 items-center gap-2 rounded-brutal border border-line bg-void-light/30 p-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value.slice(0, 32))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') create()
          }}
          placeholder="nome do pack novo"
          className="input-terminal min-w-0 flex-1 rounded-brutal px-2 py-1.5 text-sm"
        />
        <input
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value.slice(0, 120))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') create()
          }}
          placeholder="descrição (opcional)"
          className="input-terminal hidden min-w-0 flex-1 rounded-brutal px-2 py-1.5 text-sm sm:block"
        />
        <Button size="sm" onClick={create} disabled={!newName.trim() || busy}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Criar
        </Button>
      </div>

      <p className="mb-2 shrink-0 font-mono text-[11.5px] text-muted-foreground">
        png, gif ou webp até 1 MB · qualquer um cria pack e sobe sticker · só admin apaga ·{' '}
        {packs.length}/30 packs · {totalStickers}/300 stickers
      </p>

      {error && <p className="mb-2 shrink-0 text-[11px] text-destructive">{error}</p>}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {packs.map((pack) => (
          <div
            key={pack.id}
            className="rounded-brutal border border-line bg-void-light/30 p-2"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-sm uppercase tracking-wide text-foreground">
                  {pack.name}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {pack.stickers.length} sticker{pack.stickers.length === 1 ? '' : 's'}
                  {pack.description ? ` · ${pack.description}` : ''}
                </span>
              </span>

              <label
                title="Subir sticker neste pack (png, gif ou webp até 1 MB)"
                className={cn(
                  'flex cursor-pointer items-center gap-1 rounded-brutal border border-line px-2 py-1 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-acid/50 hover:text-foreground',
                  busy && 'pointer-events-none opacity-50'
                )}
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                subir
                <input
                  type="file"
                  accept="image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    addSticker(pack, e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </label>

              {isAdmin &&
                (confirmDelete === pack.id ? (
                  <>
                    <IconButton
                      label="Confirmar (leva os stickers junto)"
                      danger
                      onClick={() => {
                        setConfirmDelete(null)
                        void run(() => removePack(pack.id))
                      }}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton label="Cancelar" onClick={() => setConfirmDelete(null)}>
                      <X className="h-3.5 w-3.5" />
                    </IconButton>
                  </>
                ) : (
                  <IconButton
                    label="Apagar pack (leva os stickers junto)"
                    danger
                    disabled={busy}
                    onClick={() => setConfirmDelete(pack.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                ))}
            </div>

            {pack.stickers.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                Pack vazio — clica em "subir".
              </p>
            ) : (
              <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
                {pack.stickers.map((sticker) => (
                  <div
                    key={sticker.id}
                    title={sticker.name}
                    className="group/sticker relative flex aspect-square items-center justify-center rounded-brutal border border-transparent p-1 hover:border-line"
                  >
                    <img
                      src={resolveAssetUrl(sticker.url)}
                      alt={sticker.name}
                      loading="lazy"
                      draggable={false}
                      className="h-full w-full object-contain"
                    />
                    {isAdmin && (
                      <button
                        type="button"
                        title="Apagar sticker"
                        disabled={busy}
                        onClick={() => void run(() => removeSticker(sticker.id))}
                        className="absolute -right-1 -top-1 hidden rounded-brutal bg-void p-0.5 text-muted-foreground transition-colors hover:text-destructive group-hover/sticker:block"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {packs.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhum pack ainda. Cria o primeiro aí em cima.
          </p>
        )}
      </div>
    </>
  )
}

function IconButton({
  label,
  danger,
  disabled,
  onClick,
  children
}: {
  label: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-brutal p-1 text-muted-foreground transition-colors disabled:opacity-40',
        danger ? 'hover:bg-destructive/15 hover:text-destructive' : 'hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}
