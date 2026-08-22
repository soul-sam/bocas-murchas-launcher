import * as React from 'react'
import { Loader2, Upload, Plus, X, Link as LinkIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UserAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import {
  users as usersApi,
  uploads as uploadsApi,
  parseLinks,
  resolveAssetUrl,
  type ProfileLink
} from '@/lib/api'

const PRESET_COLORS = [
  '#6AFF00',
  '#F2B705',
  '#FF4D4D',
  '#4DA6FF',
  '#B84DFF',
  '#FF4DA6',
  '#00E5C0',
  '#EAEAEA'
]

const MAX_LINKS = 5

/**
 * Editor do perfil: avatar, banner, cor, bio, pronomes, links e recado.
 *
 * Imagens sobem como arquivo (endpoint /uploads) em vez de base64 no JSON —
 * base64 incharia cada listagem de usuarios com o avatar inteiro embutido.
 */
export function ProfileEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token, user, applyUser } = useAuth()

  const [displayName, setDisplayName] = React.useState('')
  const [bio, setBio] = React.useState('')
  const [pronouns, setPronouns] = React.useState('')
  const [customStatus, setCustomStatus] = React.useState('')
  const [profileColor, setProfileColor] = React.useState<string>('#6AFF00')
  const [avatar, setAvatar] = React.useState<string | null>(null)
  const [banner, setBanner] = React.useState<string | null>(null)
  const [links, setLinks] = React.useState<ProfileLink[]>([])

  const [busy, setBusy] = React.useState(false)
  const [uploading, setUploading] = React.useState<'avatar' | 'banner' | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Recarrega do usuario toda vez que abre: descarta edicao abandonada.
  React.useEffect(() => {
    if (!open || !user) return
    setDisplayName(user.displayName ?? '')
    setBio(user.bio ?? '')
    setPronouns(user.pronouns ?? '')
    setCustomStatus(user.customStatus ?? '')
    setProfileColor(user.profileColor ?? '#6AFF00')
    setAvatar(user.avatar ?? null)
    setBanner(user.banner ?? null)
    setLinks(parseLinks(user.links))
    setError(null)
  }, [open, user])

  const handleImage = async (kind: 'avatar' | 'banner', file: File | null): Promise<void> => {
    if (!file || !token) return
    setUploading(kind)
    setError(null)
    try {
      const { url } = await uploadsApi.image(token, kind, file)
      if (kind === 'avatar') setAvatar(url)
      else setBanner(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao subir imagem')
    } finally {
      setUploading(null)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!token) return
    if (!displayName.trim()) {
      setError('O nome de exibição não pode ficar vazio')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const updated = await usersApi.updateProfile(token, {
        displayName: displayName.trim(),
        bio: bio.trim() || null,
        pronouns: pronouns.trim() || null,
        customStatus: customStatus.trim() || null,
        profileColor,
        avatar,
        banner,
        // Link sem nome ou sem url é lixo; o servidor descartaria de qualquer jeito.
        links: links.filter((l) => l.name.trim() && l.url.trim())
      })
      applyUser(updated)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar perfil')
    } finally {
      setBusy(false)
    }
  }

  const updateLink = (index: number, patch: Partial<ProfileLink>): void => {
    setLinks((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Seu perfil</DialogTitle>
          <DialogDescription>É o que a galera vê quando clica em você</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          {/* Prévia */}
          <div className="overflow-hidden rounded-brutal border-2 border-[#1a1a1a]">
            <div
              className="relative h-20 bg-void-light"
              style={
                banner
                  ? {
                      backgroundImage: `url(${resolveAssetUrl(banner)})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    }
                  : { background: `linear-gradient(135deg, ${profileColor}22, transparent)` }
              }
            >
              <label className="absolute right-2 top-2 cursor-pointer rounded-brutal border border-[#1a1a1a] bg-void/80 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-acid">
                {uploading === 'banner' ? 'enviando…' : 'trocar capa'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleImage('banner', e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div className="flex items-end gap-3 px-3 pb-3">
              <label className="group relative -mt-6 cursor-pointer">
                <UserAvatar
                  src={resolveAssetUrl(avatar)}
                  name={displayName || user?.username || '??'}
                  ringColor={profileColor}
                  className="h-16 w-16 border-2"
                />
                <span className="absolute inset-0 flex items-center justify-center rounded-brutal bg-black/70 opacity-0 transition-opacity group-hover:opacity-100">
                  {uploading === 'avatar' ? (
                    <Loader2 className="h-4 w-4 animate-spin text-acid" />
                  ) : (
                    <Upload className="h-4 w-4 text-acid" />
                  )}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleImage('avatar', e.target.files?.[0] ?? null)}
                />
              </label>

              <div className="min-w-0 flex-1 pb-0.5">
                <p className="truncate font-display text-base" style={{ color: profileColor }}>
                  {displayName || 'Sem nome'}
                </p>
                <p className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  @{user?.username}
                  {pronouns && ` · ${pronouns}`}
                </p>
              </div>
            </div>
          </div>

          {/* Cor */}
          <div className="space-y-1.5">
            <Label>Cor do perfil</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setProfileColor(color)}
                  title={color}
                  style={{ backgroundColor: color }}
                  className={cn(
                    'h-6 w-6 rounded-brutal border-2 transition-transform',
                    profileColor === color
                      ? 'scale-110 border-dirty-white'
                      : 'border-transparent hover:scale-105'
                  )}
                />
              ))}
              <input
                type="color"
                value={profileColor}
                onChange={(e) => setProfileColor(e.target.value)}
                title="Cor personalizada"
                className="h-6 w-8 cursor-pointer rounded-brutal border-2 border-[#1a1a1a] bg-transparent p-0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Nome de exibição</Label>
              <Input
                id="p-name"
                value={displayName}
                maxLength={32}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-pronouns">Pronomes</Label>
              <Input
                id="p-pronouns"
                value={pronouns}
                maxLength={24}
                placeholder="ele/dele"
                onChange={(e) => setPronouns(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-status">Recado</Label>
            <Input
              id="p-status"
              value={customStatus}
              maxLength={64}
              placeholder="jogando, no trampo, dormindo…"
              onChange={(e) => setCustomStatus(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-bio">Bio</Label>
            <textarea
              id="p-bio"
              value={bio}
              maxLength={300}
              rows={3}
              onChange={(e) => setBio(e.target.value)}
              className="input-terminal w-full resize-none rounded-brutal p-2 text-sm"
            />
            <p className="text-right font-mono text-[10px] text-muted-foreground">
              {bio.length}/300
            </p>
          </div>

          {/* Links */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Links</Label>
              {links.length < MAX_LINKS && (
                <button
                  type="button"
                  onClick={() => setLinks((prev) => [...prev, { name: '', url: '' }])}
                  className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-acid"
                >
                  <Plus className="h-3 w-3" />
                  adicionar
                </button>
              )}
            </div>

            {links.length === 0 ? (
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                nenhum link
              </p>
            ) : (
              <div className="space-y-1.5">
                {links.map((link, index) => (
                  <div key={index} className="flex items-center gap-1.5">
                    <LinkIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <Input
                      value={link.name}
                      placeholder="Nome"
                      maxLength={32}
                      onChange={(e) => updateLink(index, { name: e.target.value })}
                      className="h-8 w-28 text-xs"
                    />
                    <Input
                      value={link.url}
                      placeholder="https://…"
                      onChange={(e) => updateLink(index, { url: e.target.value })}
                      className="h-8 flex-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setLinks((prev) => prev.filter((_, i) => i !== index))}
                      className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              só http(s) · máximo {MAX_LINKS}
            </p>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={busy || !!uploading}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
