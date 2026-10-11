import * as React from 'react'
import { Check, ListMusic, Loader2, Plus, X } from 'lucide-react'
import { MusicIcon } from '@/lib/bocas-icons'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import {
  playlists as playlistsApi,
  type MurchaPlaylist,
  type MusicResult
} from '@/lib/api-music'

/**
 * "ADICIONAR À PLAYLIST" — a camada que cobre o painel de música.
 *
 * Não é popover do Radix: mora DENTRO do painel de pedir música, que é uma
 * camada própria com armadilha de foco (ver MusicPanel e lib/use-focus-trap).
 * Um popover em portal ficaria fora da armadilha e o Tab fugia dele.
 *
 * A faixa pode chegar sem `videoId` (resultado de busca que o grupo nunca
 * tocou) e entra assim mesmo: guardar não passa pelo YouTube e não tem limite
 * de tempo. O vídeo é procurado na hora de tocar (ver MurchaPlaylists).
 */

/** A faixa a guardar: resultado da busca (pode faltar o vídeo) ou faixa já tocando. */
export type PickerTrack = Partial<Omit<MusicResult, 'videoId'>> & { videoId?: string }

export function PlaylistPicker({
  track,
  onClose,
  onAdded
}: {
  track: PickerTrack
  onClose: () => void
  /** Entrou. Quem abriu decide se fecha ou mostra o sinal. */
  onAdded?: (playlist: MurchaPlaylist) => void
}) {
  const { token, user } = useAuth()
  const { byId } = useMembers()

  const [list, setList] = React.useState<MurchaPlaylist[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [name, setName] = React.useState('')

  React.useEffect(() => {
    if (!token) return
    let cancelled = false
    void playlistsApi
      .list(token)
      .then((page) => {
        if (cancelled) return
        // As minhas primeiro: é pra elas que a pessoa quase sempre guarda.
        const mine = page.playlists.filter((p) => p.ownerId === user?.id)
        const others = page.playlists.filter((p) => p.ownerId !== user?.id)
        setList([...mine, ...others])
        if (page.playlists.length === 0) setCreating(true)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Não deu pra ler as playlists.')
      })
    return () => {
      cancelled = true
    }
  }, [token, user?.id])

  const addTo = async (playlist: MurchaPlaylist): Promise<void> => {
    if (!token || busy) return
    setBusy(playlist.id)
    setError(null)
    try {
      // Vai como está, com ou sem vídeo: guardar não passa pelo YouTube.
      await playlistsApi.addTrack(token, playlist.id, {
        videoId: track.videoId,
        title: track.title,
        artist: track.artist,
        artUrl: track.artUrl,
        durationMs: track.durationMs,
        spotifyId: track.spotifyId
      })
      setDone(playlist.id)
      onAdded?.(playlist)
      // Meio segundo de "entrou" e fecha: dá pra ver que pegou sem precisar
      // de mais um clique pra sair.
      setTimeout(onClose, 700)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra adicionar.')
    } finally {
      setBusy(null)
    }
  }

  const create = async (): Promise<void> => {
    const clean = name.trim()
    if (!token || !clean || busy) return
    setBusy('new')
    setError(null)
    try {
      const { playlist } = await playlistsApi.create(token, clean)
      setList((prev) => [playlist, ...(prev ?? [])])
      setName('')
      setCreating(false)
      setBusy(null)
      await addTo(playlist)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra criar a playlist.')
      setBusy(null)
    }
  }

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col bg-void"
      onKeyDown={(event) => {
        // Escape fecha SÓ esta camada; o painel de baixo continua aberto.
        if (event.key === 'Escape') {
          event.stopPropagation()
          event.preventDefault()
          onClose()
        }
      }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b-2 border-line px-3 py-2">
        <ListMusic className="h-4 w-4 shrink-0 text-acid" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11.5px] text-muted-foreground">Adicionar à playlist</span>
          <span className="block truncate text-sm text-foreground">
            {track.title ?? 'Som do YouTube'}
            {track.artist ? ` · ${track.artist}` : ''}
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Voltar"
          className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:text-dirty-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {creating ? (
          <form
            className="flex items-center gap-1.5 border-b border-line p-2"
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
          >
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome da nova playlist…"
              maxLength={60}
              autoFocus
              className="min-w-0 flex-1 rounded-brutal border-2 border-line bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-acid/60"
            />
            <button
              type="submit"
              disabled={!name.trim() || busy !== null}
              className="flex shrink-0 items-center gap-1.5 rounded-brutal border-2 border-acid bg-acid/10 px-3 py-1.5 font-mono text-[11.5px] uppercase tracking-widest text-acid transition-colors hover:bg-acid/20 disabled:opacity-40"
            >
              {busy === 'new' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Criar
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-2.5 border-b border-line px-3 py-2 text-left text-sm text-acid transition-colors hover:bg-void-light"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-brutal border-2 border-dashed border-acid/50">
              <Plus className="h-4 w-4" />
            </span>
            Nova playlist
          </button>
        )}

        {list === null && !error ? (
          <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            carregando as playlists…
          </p>
        ) : (
          (list ?? []).map((playlist) => {
            const mine = playlist.ownerId === user?.id
            return (
              <button
                key={playlist.id}
                type="button"
                disabled={busy !== null || done !== null}
                onClick={() => void addTo(playlist)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors disabled:cursor-default',
                  done === playlist.id ? 'bg-acid/15' : 'hover:bg-void-light'
                )}
              >
                <PlaylistCover covers={playlist.covers} className="h-9 w-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{playlist.name}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {playlist.trackCount} {playlist.trackCount === 1 ? 'música' : 'músicas'} ·{' '}
                    {mine ? 'sua' : `de ${byId[playlist.ownerId]?.displayName ?? 'alguém'}`}
                  </span>
                </span>
                {busy === playlist.id ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-acid" />
                ) : done === playlist.id ? (
                  <Check className="h-4 w-4 shrink-0 text-acid" />
                ) : null}
              </button>
            )
          })
        )}
      </div>

      {error && (
        <p className="shrink-0 border-t border-line px-3 py-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}

/**
 * A capa da playlist: mosaico 2x2 com as capas das primeiras músicas, como no
 * Spotify. Com menos de quatro, a primeira ocupa tudo.
 */
export function PlaylistCover({ covers, className }: { covers: string[]; className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 overflow-hidden rounded-brutal border border-line bg-surface-raised',
        className
      )}
    >
      {covers.length >= 4 ? (
        <span className="grid h-full w-full grid-cols-2 grid-rows-2">
          {covers.slice(0, 4).map((url, index) => (
            <img key={index} src={url} alt="" className="h-full w-full object-cover" />
          ))}
        </span>
      ) : covers[0] ? (
        <img src={covers[0]} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <MusicIcon className="h-4 w-4 text-muted-foreground" />
        </span>
      )}
    </span>
  )
}
