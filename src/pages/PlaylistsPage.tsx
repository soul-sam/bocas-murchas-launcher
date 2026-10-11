import * as React from 'react'
import {
  ChevronLeft,
  ListPlus,
  Loader2,
  Pencil,
  Play,
  Plus,
  Search,
  Shuffle,
  Trash2
} from 'lucide-react'
import { MusicIcon } from '@/lib/bocas-icons'
import { cn, formatClock } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { useOverlays } from '@/lib/overlay-context'
import { useVoice } from '@/lib/voice-context'
import { useWatch, type WatchTrack } from '@/lib/watch-context'
import { PlaylistCover } from '@/components/music/PlaylistPicker'
import { shuffled } from '@/lib/playlist-utils'
import {
  playlists as playlistsApi,
  type MurchaPlaylist,
  type MurchaPlaylistFull,
  type MurchaPlaylistTrack
} from '@/lib/api-music'

/**
 * PLAYLIST MURCHA — as playlists do grupo.
 *
 * Guardadas na nossa API, não no Spotify: todo mundo vê, toca e completa (ver
 * routes/music-playlists.routes.ts). Tocar manda a playlist pra fila da call
 * num evento só (`watch:queue:addMany`); se não tem música no ar, a primeira
 * começa a tocar.
 *
 * Música se adiciona pelo painel de pedir música — cada resultado tem o botão
 * "adicionar à playlist". O "Adicionar músicas" daqui só abre esse painel, e
 * a página relê a playlist quando ele fecha.
 */

/** Teto do `watch:queue:addMany` (ADD_MANY_MAX em realtime/watch.ts na API). */
const SEND_MAX = 100

export function PlaylistsPage() {
  const { token, user } = useAuth()
  const { byId } = useMembers()
  const { openMusicPanel, musicPanelOpen } = useOverlays()

  const [list, setList] = React.useState<MurchaPlaylist[] | null>(null)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [name, setName] = React.useState('')
  const [creating, setCreating] = React.useState(false)

  const load = React.useCallback(async () => {
    if (!token) return
    try {
      const page = await playlistsApi.list(token)
      setList(page.playlists)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra carregar as playlists.')
    }
  }, [token])

  React.useEffect(() => {
    void load()
  }, [load])

  // O painel de música fechou: pode ter entrado faixa (ou playlist nova) por lá.
  const wasPanelOpen = React.useRef(musicPanelOpen)
  React.useEffect(() => {
    if (wasPanelOpen.current && !musicPanelOpen) void load()
    wasPanelOpen.current = musicPanelOpen
  }, [musicPanelOpen, load])

  const create = async (): Promise<void> => {
    const clean = name.trim()
    if (!token || !clean || creating) return
    setCreating(true)
    setError(null)
    try {
      const { playlist } = await playlistsApi.create(token, clean)
      setName('')
      setList((prev) => [playlist, ...(prev ?? [])])
      setOpenId(playlist.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra criar a playlist.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-8">
        {openId ? (
          <PlaylistDetail
            id={openId}
            reloadKey={musicPanelOpen}
            onBack={() => {
              setOpenId(null)
              void load()
            }}
            onDeleted={() => {
              setOpenId(null)
              void load()
            }}
          />
        ) : (
          <>
            <header className="flex items-center gap-3">
              <MusicIcon className="h-8 w-8 shrink-0 text-acid" />
              <div className="min-w-0">
                <h1 className="title-brutal text-2xl leading-none sm:text-3xl">Playlist Murcha</h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  As playlists do grupo. Todo mundo toca, todo mundo completa.
                </p>
              </div>
            </header>

            <form
              className="flex flex-wrap items-center gap-2"
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
                className="min-w-0 flex-1 rounded-brutal border-2 border-line bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-acid/60"
              />
              <button
                type="submit"
                disabled={!name.trim() || creating}
                className="flex shrink-0 items-center gap-1.5 rounded-brutal border-2 border-acid bg-acid/10 px-4 py-2 font-mono text-[11.5px] uppercase tracking-widest text-acid transition-colors hover:bg-acid/20 disabled:opacity-40"
              >
                {creating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Criar playlist
              </button>
            </form>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {list === null && !error ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                carregando…
              </p>
            ) : (list ?? []).length === 0 ? (
              <div className="rounded-brutal border-2 border-dashed border-line p-6 text-center">
                <p className="text-sm text-foreground">Nenhuma playlist ainda.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cria a primeira aí em cima — ou, no painel de música, clica em{' '}
                  <span className="text-foreground">adicionar à playlist</span> numa faixa.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {(list ?? []).map((playlist) => (
                  <button
                    key={playlist.id}
                    type="button"
                    onClick={() => setOpenId(playlist.id)}
                    className="card-gradient group flex flex-col gap-2 rounded-brutal border-2 border-line p-3 text-left transition-colors hover:border-acid/60"
                  >
                    <PlaylistCover covers={playlist.covers} className="aspect-square w-full" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-foreground">{playlist.name}</span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">
                        {playlist.trackCount} {playlist.trackCount === 1 ? 'música' : 'músicas'} ·{' '}
                        {playlist.ownerId === user?.id
                          ? 'sua'
                          : `de ${byId[playlist.ownerId]?.displayName ?? 'alguém'}`}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => openMusicPanel()}
              className="flex items-center gap-1.5 self-start text-sm text-muted-foreground transition-colors hover:text-acid"
            >
              <Search className="h-3.5 w-3.5" />
              Procurar músicas pra guardar
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ============================================
// UMA PLAYLIST
// ============================================

function PlaylistDetail({
  id,
  reloadKey,
  onBack,
  onDeleted
}: {
  id: string
  /** Muda quando o painel de música abre/fecha: hora de reler. */
  reloadKey: boolean
  onBack: () => void
  onDeleted: () => void
}) {
  const { token, user } = useAuth()
  const { byId } = useMembers()
  const { openMusicPanel } = useOverlays()
  const voice = useVoice()
  const watch = useWatch()

  const [playlist, setPlaylist] = React.useState<MurchaPlaylistFull | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<string | null>(null)
  const [sending, setSending] = React.useState<'play' | 'shuffle' | null>(null)
  const [renaming, setRenaming] = React.useState(false)
  const [newName, setNewName] = React.useState('')

  const load = React.useCallback(async () => {
    if (!token) return
    try {
      const page = await playlistsApi.get(token, id)
      setPlaylist(page.playlist)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra abrir a playlist.')
    }
  }, [token, id])

  React.useEffect(() => {
    if (!reloadKey) void load()
  }, [load, reloadKey])

  React.useEffect(() => {
    if (!note) return
    const timer = setTimeout(() => setNote(null), 3_500)
    return () => clearTimeout(timer)
  }, [note])

  if (!playlist) {
    return (
      <div className="flex flex-col gap-3">
        <BackButton onClick={onBack} />
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            carregando…
          </p>
        )}
      </div>
    )
  }

  const mine = playlist.ownerId === user?.id
  const inCall = voice.connected
  const tracks = playlist.tracks

  const toTrack = (track: MurchaPlaylistTrack): WatchTrack => ({
    videoId: track.videoId,
    title: track.title,
    artist: track.artist,
    artUrl: track.artUrl
  })

  /** Manda a playlist pra call. Aleatório embaralha AQUI, a lista inteira, antes do corte. */
  const playAll = async (shuffle: boolean): Promise<void> => {
    if (sending || tracks.length === 0) return
    setSending(shuffle ? 'shuffle' : 'play')
    setError(null)
    const ordered = shuffle ? shuffled(tracks) : tracks
    const ack = await watch.queueMany(ordered.slice(0, SEND_MAX).map(toTrack))
    setSending(null)
    if (!ack.ok) {
      setError(ack.error ?? 'Não deu.')
      return
    }
    const added = ack.added ?? 0
    setNote(
      added === 0
        ? 'A fila está cheia.'
        : `${added} ${added === 1 ? 'música foi' : 'músicas foram'} pra call${
            added < tracks.length ? ' — o resto não coube na fila' : ''
          }.`
    )
  }

  const removeTrack = async (track: MurchaPlaylistTrack): Promise<void> => {
    if (!token) return
    setPlaylist((prev) =>
      prev ? { ...prev, tracks: prev.tracks.filter((t) => t.id !== track.id) } : prev
    )
    try {
      await playlistsApi.removeTrack(token, playlist.id, track.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra tirar.')
      void load()
    }
  }

  const rename = async (): Promise<void> => {
    const clean = newName.trim()
    if (!token || !clean) return
    try {
      const page = await playlistsApi.rename(token, playlist.id, clean)
      setPlaylist(page.playlist)
      setRenaming(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra renomear.')
    }
  }

  const destroy = async (): Promise<void> => {
    if (!token) return
    if (!window.confirm(`Apagar a playlist "${playlist.name}"? Não tem volta.`)) return
    try {
      await playlistsApi.remove(token, playlist.id)
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra apagar.')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <BackButton onClick={onBack} />

      <header className="flex flex-wrap items-end gap-4">
        <PlaylistCover covers={playlist.covers} className="h-28 w-28 sm:h-36 sm:w-36" />
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] text-muted-foreground">
            Playlist Murcha
          </p>
          {renaming ? (
            <form
              className="mt-1 flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                void rename()
              }}
            >
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                maxLength={60}
                autoFocus
                onKeyDown={(event) => event.key === 'Escape' && setRenaming(false)}
                className="min-w-0 flex-1 rounded-brutal border-2 border-acid/60 bg-transparent px-2 py-1 text-lg outline-none"
              />
              <button
                type="submit"
                className="rounded-brutal border-2 border-acid bg-acid/10 px-3 py-1 font-mono text-[11.5px] uppercase tracking-widest text-acid"
              >
                Salvar
              </button>
            </form>
          ) : (
            <h1 className="title-brutal mt-1 flex items-center gap-2 text-2xl leading-tight sm:text-3xl">
              <span className="min-w-0 break-words">{playlist.name}</span>
              {mine && (
                <button
                  type="button"
                  title="Renomear"
                  onClick={() => {
                    setNewName(playlist.name)
                    setRenaming(true)
                  }}
                  className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:text-acid"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </h1>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {mine ? 'Sua' : `De ${byId[playlist.ownerId]?.displayName ?? 'alguém'}`} ·{' '}
            {tracks.length} {tracks.length === 1 ? 'música' : 'músicas'}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!inCall || tracks.length === 0 || sending !== null}
          onClick={() => void playAll(false)}
          title={inCall ? 'Manda a playlist pra fila da call' : 'Entra numa call primeiro'}
          className="flex items-center gap-1.5 rounded-brutal border-2 border-acid bg-acid/10 px-4 py-2 font-mono text-[11.5px] uppercase tracking-widest text-acid transition-colors hover:bg-acid/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending === 'play' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Tocar
        </button>
        <button
          type="button"
          disabled={!inCall || tracks.length === 0 || sending !== null}
          onClick={() => void playAll(true)}
          title={inCall ? 'Manda a playlist embaralhada pra fila da call' : 'Entra numa call primeiro'}
          className="flex items-center gap-1.5 rounded-brutal border-2 border-line px-4 py-2 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-acid/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending === 'shuffle' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Shuffle className="h-3.5 w-3.5" />
          )}
          Aleatório
        </button>
        <button
          type="button"
          onClick={() => openMusicPanel()}
          className="flex items-center gap-1.5 rounded-brutal border-2 border-line px-4 py-2 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-acid/50 hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5" />
          Adicionar músicas
        </button>
        {mine && (
          <button
            type="button"
            onClick={() => void destroy()}
            title="Apagar a playlist"
            className="ml-auto rounded-brutal border-2 border-destructive/60 p-2 text-destructive transition-colors hover:bg-destructive/15"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!inCall && (
        <p className="text-sm text-burn">
          A música toca pra quem está no canal de voz — entra numa call pra tocar a playlist.
        </p>
      )}
      {note && <p className="text-sm text-acid">{note}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {tracks.length === 0 ? (
        <div className="rounded-brutal border-2 border-dashed border-line p-6 text-center">
          <p className="text-sm text-foreground">Playlist vazia.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Em <span className="text-foreground">Adicionar músicas</span>, busca e clica no botão de
            playlist ao lado da faixa.
          </p>
        </div>
      ) : (
        <ol className="flex flex-col">
          {tracks.map((track, index) => {
            const canRemove = mine || track.addedById === user?.id
            return (
              <li
                key={track.id}
                className="group flex items-center gap-3 rounded-brutal px-2 py-1.5 hover:bg-void-light"
              >
                <span className="w-6 shrink-0 text-right font-mono text-[11.5px] tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <button
                  type="button"
                  disabled={!inCall}
                  onClick={() => void watch.playTrack(toTrack(track))}
                  title={inCall ? 'Tocar agora' : 'Entra numa call primeiro'}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                >
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-brutal border border-line bg-surface-raised">
                    {track.artUrl ? (
                      <img src={track.artUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center">
                        <MusicIcon className="h-4 w-4 text-muted-foreground" />
                      </span>
                    )}
                    {inCall && (
                      <span className="absolute inset-0 hidden items-center justify-center bg-void/70 group-hover:flex">
                        <Play className="h-4 w-4 text-acid" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{track.title}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                      {track.artist ?? 'YouTube'}
                    </span>
                  </span>
                </button>
                <span className="hidden shrink-0 truncate text-[11.5px] text-muted-foreground sm:block sm:w-28">
                  {byId[track.addedById]?.displayName ?? 'alguém'}
                </span>
                <span className="w-10 shrink-0 text-right font-mono text-[11.5px] tabular-nums text-muted-foreground">
                  {track.durationMs ? formatClock(track.durationMs / 1000) : ''}
                </span>
                <button
                  type="button"
                  disabled={!inCall}
                  onClick={() => void watch.queueTrack(toTrack(track))}
                  title={inCall ? 'Botar na fila' : 'Entra numa call primeiro'}
                  className="shrink-0 rounded-brutal p-1 text-muted-foreground opacity-0 transition-opacity hover:text-acid focus:opacity-100 disabled:hidden group-hover:opacity-100"
                >
                  <ListPlus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={!canRemove}
                  onClick={() => void removeTrack(track)}
                  title={canRemove ? 'Tirar da playlist' : 'Só quem criou a playlist ou quem botou tira'}
                  className={cn(
                    'shrink-0 rounded-brutal p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100',
                    !canRemove && 'invisible'
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" />
      Playlists
    </button>
  )
}
