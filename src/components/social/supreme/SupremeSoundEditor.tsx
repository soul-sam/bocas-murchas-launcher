import * as React from 'react'
import { Button } from '@/components/ui/button'
import { resolveAssetUrl } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { SUPREME_IDS } from '@/lib/supreme-ids'
import { supremeSoundApi, type SupremeSlot, type SupremeSoundState } from '@/lib/api-supreme-sound'
import { decodeAudio } from '@/lib/supreme-audio-browser'
import { deriveUseSame, recentSounds, soundByUrl, syncUseSame } from '@/lib/supreme-shop'
import { useSoundboard } from '@/lib/soundboard-context'
import { useSettings } from '@/lib/settings-context'
import { playDecodedBuffer } from '@/lib/ui-sounds'
import { cn } from '@/lib/utils'
import { ClipTrimmer } from './ClipTrimmer'

const SLOT_LABEL: Record<SupremeSlot, string> = { join: 'Entrada', leave: 'Saída', both: 'Os dois' }

/** Áudio Supremo: 2s da própria pessoa pra entrada e pra saída da call. */
export function SupremeSoundEditor({ token }: { token: string }) {
  const { settings } = useSettings()
  const { user } = useAuth()
  const { sounds: board } = useSoundboard()
  const [state, setState] = React.useState<SupremeSoundState | null>(null)
  const [editing, setEditing] = React.useState<{ slot: SupremeSlot; buffer: AudioBuffer; label: string } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [useSame, setUseSame] = React.useState(false)
  const [boardOpen, setBoardOpen] = React.useState<SupremeSlot | null>(null)
  const volume = settings.soundEnabled && settings.voiceCueVolume > 0 ? settings.voiceCueVolume : 0.4

  React.useEffect(() => {
    let alive = true
    void supremeSoundApi
      .list(token)
      .then((s) => {
        if (!alive) return
        setState(s)
        setUseSame(deriveUseSame(s))
      })
      .catch(() => alive && setError('Não deu pra carregar seus áudios.'))
    return () => {
      alive = false
    }
  }, [token])

  const fetchBuffer = async (url: string): Promise<AudioBuffer> => {
    const res = await fetch(resolveAssetUrl(url) ?? url)
    if (!res.ok) throw new Error('fetch')
    return decodeAudio(await res.arrayBuffer())
  }
  const listen = async (url: string | null): Promise<void> => {
    if (!url) return
    try {
      playDecodedBuffer(await fetchBuffer(url), volume)
    } catch {
      setError('Não deu pra tocar esse áudio.')
    }
  }
  const load = async (slot: SupremeSlot, getData: () => Promise<ArrayBuffer>, label: string): Promise<void> => {
    try {
      setEditing({ slot, buffer: await decodeAudio(await getData()), label })
      setBoardOpen(null)
      setError(null)
    } catch {
      setError('Formato não suportado')
    }
  }
  const fromFile = (slot: SupremeSlot, file: File) => load(slot, () => file.arrayBuffer(), file.name)
  const fromBoard = (slot: SupremeSlot, sound: { url: string; name: string }) =>
    load(
      slot,
      async () => {
        const res = await fetch(resolveAssetUrl(sound.url) ?? sound.url)
        if (!res.ok) throw new Error('fetch')
        return res.arrayBuffer()
      },
      sound.name
    )

  // Troca o estado local pelo devolvido; em erro o slot continua com o anterior.
  const run = async (op: () => Promise<SupremeSoundState>): Promise<boolean> => {
    try {
      const next = await op()
      setState(next)
      setUseSame((prev) => syncUseSame(next, prev))
      setError(null)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao enviar')
      return false
    }
  }
  const confirm = async (wav: Blob): Promise<void> => {
    if (!editing) return
    if (await run(() => supremeSoundApi.upload(token, editing.slot, wav, editing.label))) setEditing(null)
  }
  const toggleSame = async (checked: boolean): Promise<void> => {
    if (!checked) return setUseSame(false)
    const joinId = soundByUrl(state, state?.joinSoundUrl ?? null)?.id
    if (joinId && !(await run(() => supremeSoundApi.use(token, 'both', joinId)))) return
    setUseSame(true)
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <ClipTrimmer buffer={editing.buffer} onConfirm={confirm} onCancel={() => setEditing(null)} />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  const slots: { slot: SupremeSlot; url: string | null }[] = useSame
    ? [{ slot: 'both', url: state?.joinSoundUrl ?? null }]
    : [
        { slot: 'join', url: state?.joinSoundUrl ?? null },
        { slot: 'leave', url: state?.leaveSoundUrl ?? null }
      ]
  const recents = recentSounds(state)

  return (
    <div className="flex flex-col gap-3">
      {user?.joinSound !== SUPREME_IDS.sound && (
        <p className="rounded-brutal border border-line bg-void px-2 py-1.5 text-xs text-muted-foreground">
          Equipe o Áudio Supremo pra tocar na call
        </p>
      )}
      <label className="flex items-center gap-2 text-xs text-foreground">
        <input type="checkbox" checked={useSame} onChange={(e) => void toggleSame(e.target.checked)} />
        Usar mesmo áudio para entrada e saída
      </label>

      {slots.map(({ slot, url }) => {
        const current = soundByUrl(state, url)
        const broken = !!current?.brokenAt
        return (
          <div
            key={slot}
            className={cn('flex flex-col gap-1.5 rounded-brutal border p-2', broken ? 'border-destructive' : 'border-line')}
          >
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              {SLOT_LABEL[slot === 'both' ? 'both' : slot]}
              {slot === 'both' ? ' (entrada e saída)' : ''}
            </p>
            <p className="truncate text-sm text-foreground">{url ? (current?.label ?? 'Áudio enviado') : 'Som padrão'}</p>
            {broken && <p className="text-[11.5px] text-destructive">Não está carregando — envie de novo</p>}
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" disabled={!url || broken} onClick={() => void listen(url)}>
                Ouvir
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setBoardOpen(boardOpen === slot ? null : slot)}>
                Do soundboard
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <label className="cursor-pointer">
                  Enviar arquivo
                  <input
                    type="file"
                    accept="audio/*"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) void fromFile(slot, file)
                    }}
                  />
                </label>
              </Button>
              <Button size="sm" variant="ghost" disabled={!url} onClick={() => void run(() => supremeSoundApi.clear(token, slot))}>
                Remover
              </Button>
            </div>
            {boardOpen === slot && (
              <ul className="max-h-40 overflow-y-auto rounded-brutal border border-line bg-void">
                {board.length === 0 && <li className="px-2 py-1.5 text-xs text-muted-foreground">Soundboard vazio.</li>}
                {board.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => void fromBoard(slot, s)}
                      className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs text-foreground hover:bg-acid/10"
                    >
                      <span aria-hidden>{s.emoji}</span>
                      <span className="truncate">{s.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}

      {recents.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">Recentes</p>
          {recents.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-1 rounded-brutal border border-line px-2 py-1">
              <span className={cn('min-w-0 flex-1 truncate text-xs', s.brokenAt ? 'text-destructive' : 'text-foreground')}>
                {s.label}
                {s.brokenAt ? ' — não carrega' : ''}
              </span>
              <Button size="sm" variant="ghost" disabled={!!s.brokenAt} onClick={() => void listen(s.url)}>
                Ouvir
              </Button>
              {(['join', 'leave', 'both'] as const).map((slot) => (
                <Button
                  key={slot}
                  size="sm"
                  variant="secondary"
                  disabled={!!s.brokenAt}
                  onClick={() => void run(() => supremeSoundApi.use(token, slot, s.id))}
                >
                  {SLOT_LABEL[slot]}
                </Button>
              ))}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
