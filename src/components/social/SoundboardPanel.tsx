import * as React from 'react'
import { Play, Plus, Trash2, Loader2, Volume2, TriangleAlert } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useSoundboard, readAudioDuration } from '@/lib/soundboard-context'
import { useSettings } from '@/lib/settings-context'
import { useAuth } from '@/lib/auth-context'
import { useVoice } from '@/lib/voice-context'
import { HotkeyRecorder } from './HotkeyRecorder'
import type { Sound } from '@/lib/api'

const MAX_DURATION_MS = 8_000

/**
 * Painel do soundboard.
 *
 * Clicar toca pra sala inteira (passa pelo servidor). O botao de preview toca
 * so pra quem clicou — util pra conferir o som antes de soltar na call.
 */
export function SoundboardPanel() {
  const { sounds, loading, play, preview, remove, cooldownMessage, recent } = useSoundboard()
  const { settings, update } = useSettings()
  const { user } = useAuth()
  const { connected: inVoice } = useVoice()

  const [uploadOpen, setUploadOpen] = React.useState(false)

  const bindHotkey = (soundId: string, accelerator: string): void => {
    void update({ hotkeys: { ...settings.hotkeys, sounds: { [soundId]: accelerator } } })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 pb-3">
        <div>
          <h2 className="title-brutal text-lg">Soundboard</h2>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {inVoice ? 'toca pra sala toda' : 'entra numa call pra tocar'}
          </p>
        </div>

        <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Novo som
        </Button>
      </header>

      {cooldownMessage && (
        <div className="mb-3 flex shrink-0 items-center gap-2 rounded-brutal border border-burn/50 bg-burn/10 px-3 py-2 text-xs text-burn">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          {cooldownMessage}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : sounds.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhum som ainda. Sobe o primeiro aí.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
            {sounds.map((sound) => (
              <SoundTile
                key={sound.id}
                sound={sound}
                hotkey={settings.hotkeys.sounds[sound.id] ?? ''}
                canDelete={sound.uploadedBy.id === user?.id || user?.role === 'admin'}
                disabled={!inVoice}
                onPlay={() => void play(sound.id)}
                onPreview={() => preview(sound)}
                onBind={(accelerator) => bindHotkey(sound.id, accelerator)}
                onDelete={() => void remove(sound.id)}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="mt-3 shrink-0 space-y-2 border-t border-[#1a1a1a] pt-3">
        <label className="flex items-center gap-2">
          <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
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
          <span className="w-8 text-right font-mono text-[10px] text-muted-foreground">
            {Math.round(settings.soundboardVolume * 100)}
          </span>
        </label>

        {recent.length > 0 && (
          <p className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {recent[0].soundEmoji} {recent[0].soundName} — {recent[0].playedBy}
          </p>
        )}
      </footer>

      <UploadSoundDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  )
}

function SoundTile({
  sound,
  hotkey,
  canDelete,
  disabled,
  onPlay,
  onPreview,
  onBind,
  onDelete
}: {
  sound: Sound
  hotkey: string
  canDelete: boolean
  disabled: boolean
  onPlay: () => void
  onPreview: () => void
  onBind: (accelerator: string) => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        'group flex flex-col gap-1.5 rounded-brutal border-2 border-[#1a1a1a] p-2',
        'transition-colors hover:border-acid/50'
      )}
    >
      <button
        type="button"
        onClick={onPlay}
        disabled={disabled}
        title={disabled ? 'Entre num canal de voz' : `Tocar "${sound.name}" pra sala`}
        className={cn(
          'flex items-center gap-2 rounded-brutal px-1 py-1 text-left transition-colors',
          disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-acid/10'
        )}
      >
        <span className="text-xl leading-none">{sound.emoji}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {sound.name}
          </span>
          <span className="block font-mono text-[10px] text-muted-foreground">
            {(sound.durationMs / 1000).toFixed(1)}s · {sound.playCount}x
          </span>
        </span>
      </button>

      <div className="flex items-center gap-1">
        <HotkeyRecorder
          value={hotkey}
          onChange={onBind}
          placeholder="Atalho"
          className="min-w-0 flex-1"
        />

        <button
          type="button"
          onClick={onPreview}
          title="Ouvir só eu"
          className="shrink-0 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-acid"
        >
          <Play className="h-3 w-3" />
        </button>

        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="Apagar som"
            className="shrink-0 rounded-brutal p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}

function UploadSoundDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { upload } = useSoundboard()

  const [file, setFile] = React.useState<File | null>(null)
  const [name, setName] = React.useState('')
  const [emoji, setEmoji] = React.useState('🔊')
  const [duration, setDuration] = React.useState<number | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const reset = (): void => {
    setFile(null)
    setName('')
    setEmoji('🔊')
    setDuration(null)
    setError(null)
  }

  const handleFile = async (picked: File | null): Promise<void> => {
    setFile(picked)
    setDuration(null)
    setError(null)
    if (!picked) return

    // Sem o nome preenchido, usa o do arquivo — economiza um passo.
    if (!name) setName(picked.name.replace(/\.[^.]+$/, '').slice(0, 24))

    try {
      const ms = await readAudioDuration(picked)
      setDuration(ms)
      if (ms > MAX_DURATION_MS) {
        setError(
          `Som de ${(ms / 1000).toFixed(1)}s. O máximo é ${MAX_DURATION_MS / 1000}s.`
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Arquivo inválido')
    }
  }

  const canSubmit =
    !!file && !!name.trim() && !!duration && duration <= MAX_DURATION_MS && !busy

  const handleSubmit = async (): Promise<void> => {
    if (!file || !canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await upload({ file, name: name.trim(), emoji })
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo som</DialogTitle>
          <DialogDescription>
            mp3, ogg, wav, m4a… · até {MAX_DURATION_MS / 1000}s · até 4 MB
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sound-file">Arquivo</Label>
            <input
              id="sound-file"
              type="file"
              // Extensoes junto com os MIME: o Windows nao sabe o MIME de
              // .ogg/.opus/.m4a e o arquivo ficava cinza no seletor.
              accept="audio/*,.mp3,.ogg,.opus,.wav,.webm,.m4a,.aac,.flac"
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
              className="input-terminal w-full rounded-brutal p-2 text-xs file:mr-2 file:rounded-brutal file:border-0 file:bg-acid file:px-2 file:py-1 file:text-[10px] file:font-bold file:uppercase file:text-void"
            />
            {duration !== null && (
              <p
                className={cn(
                  'font-mono text-[10px] uppercase tracking-widest',
                  duration > MAX_DURATION_MS ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                {(duration / 1000).toFixed(1)}s
              </p>
            )}
          </div>

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
