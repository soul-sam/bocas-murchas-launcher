import * as React from 'react'
import {
  Play,
  Plus,
  Trash2,
  Loader2,
  Volume2,
  TriangleAlert,
  Square,
  MoreHorizontal,
  Ban,
  Check,
  Headphones
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useSoundboard } from '@/lib/soundboard-context'
import { useSettings } from '@/lib/settings-context'
import { useAuth } from '@/lib/auth-context'
import { useVoice } from '@/lib/voice-context'
import { useHotkeys } from '@/lib/hotkeys-context'
import { HotkeyRecorder } from './HotkeyRecorder'
import { AudioTrimmer, type TrimRange } from './AudioTrimmer'
import {
  MAX_SOURCE_BYTES,
  TRIM_MIN_MS,
  decodeAudioFile,
  estimateWavBytes,
  trimToFile
} from '@/lib/audio-trim'
import type { Sound } from '@/lib/api'

/** Os dois tetos do servidor (routes/sounds.routes.ts). Repetidos aqui pra
 *  recusar antes de subir 4 MB pra ouvir "não". */
const MAX_DURATION_MS = 8_000
const MAX_UPLOAD_BYTES = 4_000_000

/** Aba "todas" — não é categoria de verdade, é a ausência de filtro. */
const ALL = '*'

/**
 * Painel do soundboard.
 *
 * Clicar toca pra sala inteira (passa pelo servidor). O botao de preview toca
 * so pra quem clicou — util pra conferir o som antes de soltar na call.
 */
export function SoundboardPanel() {
  const { sounds, byCategory, loading, play, preview, stopAll, cooldownMessage, recent } =
    useSoundboard()
  const { settings, update } = useSettings()
  const { user } = useAuth()
  const { connected: inVoice } = useVoice()

  const [uploadOpen, setUploadOpen] = React.useState(false)
  const [category, setCategory] = React.useState<string>(ALL)

  const isAdmin = user?.role === 'admin'

  const categories = React.useMemo(() => Object.keys(byCategory).sort(), [byCategory])

  // A categoria escolhida pode sumir (apagaram o último som dela): volta pra "todas".
  React.useEffect(() => {
    if (category !== ALL && !byCategory[category]) setCategory(ALL)
  }, [category, byCategory])

  const visible = category === ALL ? sounds : (byCategory[category] ?? [])

  /**
   * O mapa de atalhos INTEIRO tem que voltar no patch.
   *
   * Ele é um objeto só (`hotkeys.sounds`), não um campo por som: mandar
   * `{ [soundId]: tecla }` substituía o mapa e apagava o atalho de todos os
   * outros sons — amarrar o segundo som desamarrava o primeiro.
   */
  const bindHotkey = (soundId: string, accelerator: string): void => {
    const next = { ...settings.hotkeys.sounds }
    if (accelerator) next[soundId] = accelerator
    else delete next[soundId]
    void update({ hotkeys: { ...settings.hotkeys, sounds: next } })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 pb-2">
        <div className="min-w-0">
          <h2 className="title-brutal text-base leading-tight">Soundboard</h2>
          <p className="truncate text-[11.5px] text-muted-foreground">
            {inVoice ? 'toca pra sala toda' : 'entra numa call pra tocar'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* Só o que está tocando AQUI: o servidor não tem "parar" — cada
              launcher toca o arquivo localmente. */}
          <button
            type="button"
            onClick={stopAll}
            title="Parar os sons que estão tocando aqui"
            aria-label="Parar tudo"
            className="rounded-brutal p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Square className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            title="Novo som"
            aria-label="Novo som"
            className="rounded-brutal border border-line p-2 text-foreground transition-colors hover:border-acid/50 hover:bg-acid/10 hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </header>

      {cooldownMessage && (
        <div className="mb-3 flex shrink-0 items-center gap-2 rounded-brutal border border-burn/50 bg-burn/10 px-3 py-2 text-xs text-burn">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          {cooldownMessage}
        </div>
      )}

      {categories.length > 1 && (
        <div className="mb-3 flex shrink-0 flex-wrap gap-1">
          <CategoryChip active={category === ALL} onClick={() => setCategory(ALL)}>
            todas
          </CategoryChip>
          {categories.map((name) => (
            <CategoryChip
              key={name}
              active={category === name}
              onClick={() => setCategory(name)}
            >
              {name}
            </CategoryChip>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhum som ainda. Sobe o primeiro aí.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {visible.map((sound) => (
              <SoundTile
                key={sound.id}
                sound={sound}
                categories={categories}
                hotkey={settings.hotkeys.sounds[sound.id] ?? ''}
                canEdit={sound.uploadedBy.id === user?.id || isAdmin}
                isAdmin={isAdmin}
                disabled={!inVoice || sound.isBlocked}
                onPlay={() => void play(sound.id)}
                onPreview={() => preview(sound)}
                onBind={(accelerator) => bindHotkey(sound.id, accelerator)}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="mt-3 shrink-0 space-y-2 border-t border-line pt-3">
        <label className="flex items-center gap-2">
          <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-[11.5px] text-muted-foreground">
            Volume
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.soundboardVolume}
            onChange={(e) => void update({ soundboardVolume: Number(e.target.value) })}
            className="ram-slider ml-auto w-32"
          />
          <span className="w-8 text-right font-mono text-[11.5px] text-muted-foreground">
            {Math.round(settings.soundboardVolume * 100)}
          </span>
        </label>

        {recent.length > 0 && (
          <p className="truncate text-[11.5px] text-muted-foreground">
            {recent[0].soundEmoji} {recent[0].soundName} — {recent[0].playedBy}
          </p>
        )}
      </footer>

      <UploadSoundDialog
        open={uploadOpen}
        categories={categories}
        onClose={() => setUploadOpen(false)}
      />
    </div>
  )
}

function CategoryChip({
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
        'rounded-brutal border px-2 py-0.5 font-mono text-[11.5px] uppercase tracking-widest transition-colors',
        active
          ? 'border-acid bg-acid/10 text-acid'
          : 'border-line text-muted-foreground hover:border-acid/50 hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function SoundTile({
  sound,
  categories,
  hotkey,
  canEdit,
  isAdmin,
  disabled,
  onPlay,
  onPreview,
  onBind
}: {
  sound: Sound
  categories: string[]
  hotkey: string
  canEdit: boolean
  isAdmin: boolean
  disabled: boolean
  onPlay: () => void
  onPreview: () => void
  onBind: (accelerator: string) => void
}) {
  // Menu aberto segura as ações visíveis mesmo com o mouse fora do tile;
  // sem isso o botão "⋯" some debaixo do popover e parece bug.
  const [menuOpen, setMenuOpen] = React.useState(false)

  const info = `${(sound.durationMs / 1000).toFixed(1)}s · ${sound.playCount}x${hotkey ? ` · ${hotkey}` : ''}`

  return (
    <div
      className={cn(
        // min-w-0: item de grid nasce com min-width:auto, e nome comprido
        // empurrava o tile pra fora da coluna, em cima do vizinho.
        'group relative min-w-0',
        // Só admin vê som bloqueado — e vê apagado, pra saber que está fora do ar.
        sound.isBlocked && 'opacity-50'
      )}
    >
      <button
        type="button"
        onClick={onPlay}
        disabled={disabled}
        title={
          sound.isBlocked
            ? `Bloqueado — ninguém consegue tocar · ${info}`
            : disabled
              ? 'Entre num canal de voz'
              : `Tocar "${sound.name}" pra sala · ${info}`
        }
        className={cn(
          'flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border px-2.5 text-left transition-all',
          'border-line bg-void-light/40',
          sound.isBlocked && 'border-dashed',
          disabled
            ? 'cursor-not-allowed opacity-60'
            : 'hover:border-acid/40 hover:bg-void-light active:scale-[0.97]'
        )}
      >
        <span className="shrink-0 text-lg leading-none">{sound.emoji}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {sound.name}
        </span>
      </button>

      {/* Ações por cima do canto direito, só no hover: o tile fica limpo como
          botão e ainda dá pra ouvir sozinho ou editar.

          O ▶ FAZ O MESMO QUE O TILE de propósito. Ele cobre a direita do tile,
          e antes era o "ouvir só eu": quem mirava a seta pra soltar o som na
          call ouvia sozinho e achava que o botão estava quebrado. Um triângulo
          de play promete tocar pra sala — agora cumpre. Quem quer conferir
          antes tem o fone ao lado. */}
      <div
        className={cn(
          'absolute inset-y-1 right-1 flex items-center gap-0.5 rounded-md bg-void-light pl-1 transition-opacity',
          menuOpen ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100'
        )}
      >
        <button
          type="button"
          onClick={onPlay}
          disabled={disabled}
          title={disabled ? 'Entre num canal de voz' : `Tocar pra sala · ${info}`}
          aria-label="Tocar pra sala"
          className={cn(
            'rounded-md p-1.5 transition-colors',
            disabled
              ? 'cursor-not-allowed text-muted-foreground opacity-50'
              : 'text-acid hover:bg-acid/15'
          )}
        >
          <Play className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onPreview}
          title="Ouvir só eu — não vai pra sala"
          aria-label="Ouvir só eu"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Headphones className="h-3.5 w-3.5" />
        </button>
        <SoundMenu
          sound={sound}
          categories={categories}
          hotkey={hotkey}
          canEdit={canEdit}
          isAdmin={isAdmin}
          onBind={onBind}
          onOpenChange={setMenuOpen}
        />
      </div>
    </div>
  )
}

/**
 * Menu "⋯" do som: renomear, emoji, categoria, volume, apagar e (admin)
 * bloquear.
 *
 * Popover NÃO-modal de propósito: modal do Radix trava o <body> enquanto
 * aberto, e este menu vive num painel que troca de aba e some com o som
 * apagado por outra pessoa — exatamente o cenário que deixa o app sem clique
 * (ver lib/interaction-guard.ts).
 */
function SoundMenu({
  sound,
  categories,
  hotkey,
  canEdit,
  isAdmin,
  onBind,
  onOpenChange
}: {
  sound: Sound
  categories: string[]
  hotkey: string
  canEdit: boolean
  isAdmin: boolean
  onBind: (accelerator: string) => void
  onOpenChange: (open: boolean) => void
}) {
  const { update, remove, setBlocked } = useSoundboard()
  const { registrations } = useHotkeys()

  /**
   * O Windows pode recusar a tecla (já é de outro programa, ou de outro som).
   * Quando isso acontece o atalho fica salvo e MUDO, e o aviso só existia na
   * aba Atalhos das configurações — longe de onde a tecla foi escolhida.
   */
  const hotkeyProblem = registrations.find((r) => r.id === `sound:${sound.id}` && !r.ok)

  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState(sound.name)
  const [emoji, setEmoji] = React.useState(sound.emoji)
  const [category, setCategory] = React.useState(sound.category)
  const [volume, setVolume] = React.useState(sound.volume)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  // Abrir sempre parte do que está salvo, não do que ficou digitado da última vez.
  const handleOpenChange = (next: boolean): void => {
    if (next) {
      setName(sound.name)
      setEmoji(sound.emoji)
      setCategory(sound.category)
      setVolume(sound.volume)
      setError(null)
      setConfirmDelete(false)
    }
    setOpen(next)
    onOpenChange(next)
  }

  const dirty =
    name.trim() !== sound.name ||
    emoji !== sound.emoji ||
    category.trim() !== sound.category ||
    Math.abs(volume - sound.volume) > 0.001

  const save = async (): Promise<void> => {
    if (!dirty || busy) return
    setBusy(true)
    setError(null)
    try {
      await update(sound.id, {
        ...(name.trim() !== sound.name ? { name: name.trim() } : {}),
        ...(emoji !== sound.emoji ? { emoji } : {}),
        ...(category.trim() !== sound.category ? { category: category.trim() || 'geral' } : {}),
        ...(Math.abs(volume - sound.volume) > 0.001 ? { volume } : {})
      })
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra salvar')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await remove(sound.id)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra apagar')
      setBusy(false)
    }
  }

  const toggleBlocked = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await setBlocked(sound.id, !sound.isBlocked)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra bloquear')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={canEdit ? 'Atalho e edição' : 'Atalho'}
          aria-label={canEdit ? 'Atalho e edição' : 'Atalho'}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 space-y-3">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xl leading-none">{sound.emoji}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{sound.name}</span>
            <span className="block font-mono text-[11.5px] text-muted-foreground">
              {(sound.durationMs / 1000).toFixed(1)}s · {sound.playCount}x
              {sound.isBlocked && <span className="text-burn"> · bloqueado</span>}
            </span>
          </span>
        </div>

        {/* Atalho é configuração local: qualquer um pode, mesmo sem poder editar o som. */}
        <div className="space-y-1">
          <Label>Atalho</Label>
          <HotkeyRecorder value={hotkey} onChange={onBind} placeholder="Atalho" className="w-full" />
          {hotkeyProblem && (
            <p className="flex items-start gap-1.5 text-[11.5px] text-destructive">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              {hotkeyProblem.error ?? 'O Windows não aceitou essa tecla.'}
            </p>
          )}
        </div>

        {canEdit && (
          <>
            <div className="flex gap-2 border-t border-line pt-3">
              <div className="w-14 space-y-1">
                <Label htmlFor={`emoji-${sound.id}`}>Emoji</Label>
                <Input
                  id={`emoji-${sound.id}`}
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
                  className="h-8 px-1 text-center text-base"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor={`name-${sound.id}`}>Nome</Label>
                <Input
                  id={`name-${sound.id}`}
                  value={name}
                  maxLength={24}
                  onChange={(e) => setName(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor={`cat-${sound.id}`}>Categoria</Label>
              <Input
                id={`cat-${sound.id}`}
                value={category}
                maxLength={24}
                list={`cats-${sound.id}`}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="geral"
                className="h-8 text-xs"
              />
              {/* Sugere as que já existem — categoria nova é só digitar outra. */}
              <datalist id={`cats-${sound.id}`}>
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <label className="block space-y-1">
              <span className="flex items-center justify-between">
                <Label>Volume do som</Label>
                <span className="font-mono text-[11.5px] text-foreground">{Math.round(volume * 100)}%</span>
              </span>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="ram-slider w-full"
              />
            </label>

            {/* Não há mais preço aqui. Tocar som do soundboard é de graça —
                ver lib/rate-limit.ts no servidor. */}

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
              <div className="flex items-center gap-1">
                {confirmDelete ? (
                  <span className="flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-wider text-destructive">
                    apagar?
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      disabled={busy}
                      className="font-bold hover:underline"
                    >
                      sim
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="text-muted-foreground hover:underline"
                    >
                      não
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    title="Apagar som"
                    className="rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}

                {isAdmin && !confirmDelete && (
                  <button
                    type="button"
                    onClick={() => void toggleBlocked()}
                    disabled={busy}
                    title={sound.isBlocked ? 'Liberar pra todo mundo' : 'Bloquear pra todo mundo'}
                    className={cn(
                      'flex items-center gap-1 rounded-brutal px-1.5 py-1 font-mono text-[11.5px] uppercase tracking-wider transition-colors',
                      sound.isBlocked
                        ? 'text-acid hover:bg-acid/10'
                        : 'text-muted-foreground hover:bg-burn/10 hover:text-burn'
                    )}
                  >
                    <Ban className="h-3.5 w-3.5" />
                    {sound.isBlocked ? 'liberar' : 'bloquear'}
                  </button>
                )}
              </div>

              <Button size="sm" onClick={() => void save()} disabled={!dirty || busy}>
                {busy ? (
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-3 w-3" />
                )}
                Salvar
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

function UploadSoundDialog({
  open,
  categories,
  onClose
}: {
  open: boolean
  categories: string[]
  onClose: () => void
}) {
  const { upload } = useSoundboard()
  const { settings } = useSettings()

  const [file, setFile] = React.useState<File | null>(null)
  const [buffer, setBuffer] = React.useState<AudioBuffer | null>(null)
  const [range, setRange] = React.useState<TrimRange>({ startMs: 0, endMs: 0 })
  const [name, setName] = React.useState('')
  const [emoji, setEmoji] = React.useState('🔊')
  const [category, setCategory] = React.useState('')
  const [decoding, setDecoding] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  /**
   * Qual escolha de arquivo ainda vale.
   *
   * Decodificar um mp3 de minutos leva tempo, e trocar de arquivo no meio
   * disso é comum ("não era esse"). Sem o cartão, a decodificação abandonada
   * terminava depois e pintava a onda do arquivo errado.
   */
  const pickRef = React.useRef(0)

  const reset = (): void => {
    pickRef.current++
    setFile(null)
    setBuffer(null)
    setRange({ startMs: 0, endMs: 0 })
    setName('')
    setEmoji('🔊')
    setCategory('')
    setDecoding(false)
    setError(null)
  }

  const handleFile = async (picked: File | null): Promise<void> => {
    const ticket = ++pickRef.current

    setFile(picked)
    setBuffer(null)
    setError(null)
    if (!picked) return

    // Sem o nome preenchido, usa o do arquivo — economiza um passo.
    if (!name) setName(picked.name.replace(/\.[^.]+$/, '').slice(0, 24))

    setDecoding(true)
    try {
      const decoded = await decodeAudioFile(picked)
      if (pickRef.current !== ticket) return
      setBuffer(decoded)
      // Arquivo curto entra inteiro; comprido abre nos primeiros 8s, que é de
      // onde a pessoa arrasta até o trecho que quer.
      setRange({ startMs: 0, endMs: Math.min(decoded.duration * 1000, MAX_DURATION_MS) })
    } catch (err) {
      if (pickRef.current !== ticket) return
      setError(err instanceof Error ? err.message : 'Arquivo inválido')
    } finally {
      if (pickRef.current === ticket) setDecoding(false)
    }
  }

  const totalMs = buffer ? buffer.duration * 1000 : 0
  const lengthMs = range.endMs - range.startMs
  /** Não mexeu nas alças: não há o que renderizar. */
  const trimmed = !!buffer && lengthMs < totalMs - 1
  const outputBytes = buffer
    ? trimmed
      ? estimateWavBytes(buffer, lengthMs)
      : (file?.size ?? 0)
    : 0

  const canSubmit =
    !!file && !!buffer && !!name.trim() && lengthMs >= TRIM_MIN_MS && !busy && !decoding

  const handleSubmit = async (): Promise<void> => {
    if (!file || !buffer || !canSubmit) return
    setBusy(true)
    setError(null)
    try {
      /**
       * Arquivo que já cabe sobe COMO VEIO.
       *
       * Reencodar um mp3 de 3s em wav só pra passar pelo mesmo caminho
       * multiplicaria o tamanho por dez e perderia qualidade de graça. O
       * cortador só entra quando há corte de verdade.
       */
      const keepOriginal = !trimmed && file.size <= MAX_UPLOAD_BYTES
      const outgoing = keepOriginal
        ? file
        : await trimToFile(buffer, file.name, range.startMs, range.endMs)

      if (outgoing.size > MAX_UPLOAD_BYTES) {
        throw new Error(
          `O trecho ficou com ${formatBytes(outgoing.size)}. O máximo é ${formatBytes(
            MAX_UPLOAD_BYTES
          )} — encurta um pouco.`
        )
      }

      await upload({
        file: outgoing,
        name: name.trim(),
        emoji,
        durationMs: Math.round(lengthMs),
        ...(category.trim() ? { category: category.trim() } : {})
      })
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao subir o som')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset()
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo som</DialogTitle>
          <DialogDescription>
            mp3, ogg, wav, m4a… · escolhe {MAX_DURATION_MS / 1000}s de qualquer arquivo
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="sound-file">Arquivo</Label>
            <input
              id="sound-file"
              type="file"
              // Extensoes junto com os MIME: o Windows nao sabe o MIME de
              // .ogg/.opus/.m4a e o arquivo ficava cinza no seletor.
              accept="audio/*,.mp3,.ogg,.opus,.wav,.webm,.m4a,.aac,.flac"
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
              className="input-terminal w-full rounded-brutal p-2 text-xs file:mr-2 file:rounded-brutal file:border-0 file:bg-acid file:px-2 file:py-1 file:text-[11.5px] file:font-bold file:uppercase file:text-void"
            />
            <p className="text-[11.5px] text-muted-foreground">
              até {MAX_SOURCE_BYTES / 1_000_000} MB — o que passar de{' '}
              {MAX_DURATION_MS / 1000}s você corta aqui embaixo
            </p>
          </div>

          {decoding && (
            <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              lendo o áudio…
            </div>
          )}

          {buffer && (
            <div className="space-y-1.5">
              <Label>Trecho</Label>
              <AudioTrimmer
                buffer={buffer}
                range={range}
                maxDurationMs={MAX_DURATION_MS}
                volume={settings.soundboardVolume}
                onChange={setRange}
              />
              <p className="text-[11.5px] text-muted-foreground">
                {trimmed
                  ? `o trecho vira wav · ~${formatBytes(outputBytes)}`
                  : `sobe como veio · ${formatBytes(outputBytes)}`}
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <div className="w-20 space-y-1.5">
              <Label htmlFor="sound-emoji">Emoji</Label>
              <Input
                id="sound-emoji"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
                className="text-center text-lg"
              />
            </div>

            <div className="flex-1 space-y-1.5">
              <Label htmlFor="sound-name">Nome</Label>
              <Input
                id="sound-name"
                value={name}
                maxLength={24}
                onChange={(e) => setName(e.target.value)}
                placeholder="risada, buzina…"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sound-category">Categoria (opcional)</Label>
            <Input
              id="sound-category"
              value={category}
              maxLength={24}
              list="sound-category-options"
              onChange={(e) => setCategory(e.target.value)}
              placeholder="geral"
            />
            <datalist id="sound-category-options">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              reset()
              onClose()
            }}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Subir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatBytes(bytes: number): string {
  return bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} KB`
}
