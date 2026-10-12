import * as React from 'react'
import { ChevronLeft, ListPlus, Loader2, Pencil, Play, Plus, Search, Shuffle, Trash2 } from 'lucide-react'
import { MusicIcon } from '@/lib/bocas-icons'
import { cn, formatClock } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { useVoice } from '@/lib/voice-context'
import { useWatch, type WatchTrack } from '@/lib/watch-context'
import { PlaylistCover, defaultPlaylistName } from '@/components/music/PlaylistPicker'
import { shuffled } from '@/lib/playlist-utils'
import {
  playlists as playlistsApi,
  type MurchaPlaylist,
  type MurchaPlaylistFull,
  type MurchaPlaylistTrack
} from '@/lib/api-music'

/**
 * PLAYLIST MURCHA — as playlists do grupo, na aba do painel de música
 * (Buscar · Fila · Playlist Murcha · Spotify).
 *
 * Guardadas na nossa API, não no Spotify: todo mundo vê, toca e completa (ver
 * routes/music-playlists.routes.ts). Tocar manda a playlist pra fila da call
 * num evento só (`watch:queue:addMany`); se não tem música no ar, a primeira
 * começa a tocar.
 *
 * Música entra pela aba Buscar — cada resultado tem o botão "adicionar à
 * playlist". Trocar de aba desmonta isto, então voltar pra cá já relê tudo.
 */

/**
 * Teto do `watch:queue:addMany` (ADD_MANY_MAX em realtime/watch.ts na API):
 * o tamanho máximo da playlist, então ela vai inteira.
 */
const SEND_MAX = 500

export function MurchaPlaylists({ onSearch }: { onSearch: () => void }) {
  const { token, user } = useAuth()
  const { byId } = useMembers()

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

  const create = async (): Promise<void> => {
    // Sem nome também cria: o botão apagado esperando texto parecia limite de
    // playlists. Renomeia depois, dentro dela.
    const clean = name.trim() || defaultPlaylistName(list, user?.id)
    if (!token || creating) return
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

  if (openId) {
    return (
      <PlaylistDetail
        id={openId}
        onSearch={onSearch}
        onBack={() => {
          setOpenId(null)
          void load()
        }}
      />
    )
  }

  return (
    <div>
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
          className="min-w-0 flex-1 rounded-brutal border-2 border-line bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-acid/60"
        />
        <button
          type="submit"
          disabled={creating}
          className="flex shrink-0 items-center gap-1.5 rounded-brutal border-2 border-acid bg-acid/10 px-3 py-1.5 font-mono text-[11.5px] uppercase tracking-widest text-acid transition-colors hover:bg-acid/20 disabled:opacity-40"
        >
          {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Criar
        </button>
      </form>

      {error && <p className="px-3 py-2 text-sm text-destructive">{error}</p>}

      {list === null && !error ? (
        <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          carregando as playlists…
        </p>
      ) : (list ?? []).length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">
          Nenhuma playlist ainda. Cria a primeira aí em cima — ou, em{' '}
          <span className="text-foreground">Buscar</span>, clica no botão de playlist ao lado de
          uma faixa.
        </p>
      ) : (
        <ol>
          {(list ?? []).map((playlist) => (
            <li key={playlist.id}>
              <button
                type="button"
                onClick={() => setOpenId(playlist.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-void-light"
              >
                <PlaylistCover covers={playlist.covers} className="h-11 w-11" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{playlist.name}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {playlist.trackCount} {playlist.trackCount === 1 ? 'música' : 'músicas'} ·{' '}
                    {playlist.ownerId === user?.id
                      ? 'sua'
                      : `de ${byId[playlist.ownerId]?.displayName ?? 'alguém'}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ============================================
// UMA PLAYLIST
// ============================================

function PlaylistDetail({
  id,
  onSearch,
  onBack
}: {
  id: string
  onSearch: () => void
  onBack: () => void
}) {
  const { token, user } = useAuth()
  const { byId } = useMembers()
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
    void load()
  }, [load])

  React.useEffect(() => {
    if (!note) return
    const timer = setTimeout(() => setNote(null), 3_500)
    return () => clearTimeout(timer)
  }, [note])

  if (!playlist) {
    return (
      <div>
        <BackButton onClick={onBack} />
        {error ? (
          <p className="px-3 py-4 text-sm text-destructive">{error}</p>
        ) : (
          <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
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

  const toTrack = (track: MurchaPlaylistTrack & { videoId: string }): WatchTrack => ({
    videoId: track.videoId,
    title: track.title,
    artist: track.artist,
    artUrl: track.artUrl
  })

  /**
   * Garante o vídeo das faixas que vão tocar. Guardar não passa pelo YouTube
   * (não tem limite de tempo), então a busca do vídeo que falta acontece aqui
   * — sob a cota diária do grupo. Devolve as que dá pra tocar, na mesma ordem.
   */
  const withVideos = async (
    wanted: MurchaPlaylistTrack[]
  ): Promise<(MurchaPlaylistTrack & { videoId: string })[]> => {
    const missing = wanted.filter((t) => !t.videoId && t.spotifyId).map((t) => t.id)
    let current = wanted
    if (token && missing.length > 0) {
      let quota = false
      let failed = 0
      let removed = 0
      for (let i = 0; i < missing.length && !quota; i += 50) {
        const page = await playlistsApi.resolve(token, playlist.id, missing.slice(i, i + 50))
        setPlaylist(page.playlist)
        quota = page.quota
        failed += page.failed
        removed += page.removed ?? 0
        const fresh = new Map(page.playlist.tracks.map((t) => [t.id, t]))
        current = current.map((t) => fresh.get(t.id) ?? t)
      }
      if (quota) setError('A busca do YouTube gastou a cota do dia — só as que já tinham vídeo vão tocar.')
      else if (removed > 0)
        setError(
          `${removed} ${removed === 1 ? 'música não foi achada no YouTube e saiu' : 'músicas não foram achadas no YouTube e saíram'} da playlist.`
        )
      else if (failed > 0)
        setError(`${failed} ${failed === 1 ? 'música não foi achada' : 'músicas não foram achadas'} no YouTube.`)
    }
    return current.filter((t): t is MurchaPlaylistTrack & { videoId: string } => !!t.videoId)
  }

  /** Manda a playlist pra call. Aleatório embaralha AQUI, a lista inteira, antes do corte. */
  const playAll = async (shuffle: boolean): Promise<void> => {
    if (sending || tracks.length === 0) return
    setSending(shuffle ? 'shuffle' : 'play')
    setError(null)
    try {
      const ordered = shuffle ? shuffled(tracks) : tracks
      const ready = await withVideos(ordered.slice(0, SEND_MAX))
      if (ready.length === 0) return
      const ack = await watch.queueMany(ready.map(toTrack))
      if (!ack.ok) {
        setError(ack.error ?? 'Não deu.')
        return
      }
      const added = ack.added ?? 0
      setNote(
        added === 0
          ? 'A fila está cheia.'
          : `${added} ${added === 1 ? 'música foi' : 'músicas foram'} pra call${
              added < ready.length ? ' — o resto não coube na fila' : ''
            }.`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu.')
    } finally {
      setSending(null)
    }
  }

  /** Tocar agora / botar na fila uma faixa só. */
  const sendOne = async (track: MurchaPlaylistTrack, queue: boolean): Promise<void> => {
    try {
      const [ready] = await withVideos([track])
      if (!ready) return
      await (queue ? watch.queueTrack(toTrack(ready)) : watch.playTrack(toTrack(ready)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu.')
    }
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
      onBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra apagar.')
    }
  }

  return (
    <div>
      <BackButton onClick={onBack} />

      <div className="flex items-center gap-3 px-3 pb-2">
        <PlaylistCover covers={playlist.covers} className="h-16 w-16" />
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              className="flex items-center gap-1.5"
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
                onKeyDown={(event) => {
                  // Escape cancela a edição, não fecha o painel.
                  if (event.key === 'Escape') {
                    event.stopPropagation()
                    event.preventDefault()
                    setRenaming(false)
                  }
                }}
                className="min-w-0 flex-1 rounded-brutal border-2 border-acid/60 bg-transparent px-2 py-1 text-sm outline-none"
              />
              <button
                type="submit"
                className="rounded-brutal border-2 border-acid bg-acid/10 px-2 py-1 font-mono text-[11.5px] uppercase tracking-widest text-acid"
              >
                Salvar
              </button>
            </form>
          ) : (
            <p className="flex items-center gap-1 text-base text-foreground">
              <span className="min-w-0 truncate">{playlist.name}</span>
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
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </p>
          )}
          <p className="text-[11.5px] text-muted-foreground">
            {mine ? 'Sua' : `De ${byId[playlist.ownerId]?.displayName ?? 'alguém'}`} ·{' '}
            {tracks.length} {tracks.length === 1 ? 'música' : 'músicas'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 pb-2">
        <button
          type="button"
          disabled={!inCall || tracks.length === 0 || sending !== null}
          onClick={() => void playAll(false)}
          title={inCall ? 'Manda a playlist pra fila da call' : 'Entra numa call primeiro'}
          className="flex items-center gap-1.5 rounded-brutal border-2 border-acid bg-acid/10 px-3 py-1.5 font-mono text-[11.5px] uppercase tracking-widest text-acid transition-colors hover:bg-acid/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending === 'play' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          Tocar
        </button>
        <button
          type="button"
          disabled={!inCall || tracks.length === 0 || sending !== null}
          onClick={() => void playAll(true)}
          title={inCall ? 'Manda a playlist embaralhada pra fila da call' : 'Entra numa call primeiro'}
          className="flex items-center gap-1.5 rounded-brutal border-2 border-line px-3 py-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-acid/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending === 'shuffle' ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Shuffle className="h-3 w-3" />
          )}
          Aleatório
        </button>
        <button
          type="button"
          onClick={onSearch}
          title="Busca e clica no botão de playlist ao lado da faixa"
          className="flex items-center gap-1.5 rounded-brutal border-2 border-line px-3 py-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-acid/50 hover:text-foreground"
        >
          <Search className="h-3 w-3" />
          Adicionar
        </button>
        {mine && (
          <button
            type="button"
            onClick={() => void destroy()}
            title="Apagar a playlist"
            className="ml-auto rounded-brutal border-2 border-destructive/60 p-1.5 text-destructive transition-colors hover:bg-destructive/15"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {note && <p className="border-b border-line px-3 py-2 text-sm text-acid">{note}</p>}
      {error && <p className="border-b border-line px-3 py-2 text-sm text-destructive">{error}</p>}

      {tracks.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">
          Playlist vazia. Em <span className="text-foreground">Buscar</span>, clica no botão de
          playlist ao lado da faixa.
        </p>
      ) : (
        <ol>
          {tracks.map((track, index) => {
            const canRemove = mine || track.addedById === user?.id
            return (
              <li
                key={track.id}
                className="group flex items-center gap-2.5 px-3 py-1.5 hover:bg-void-light"
              >
                <span className="w-5 shrink-0 text-right font-mono text-[11.5px] tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <button
                  type="button"
                  disabled={!inCall}
                  onClick={() => void sendOne(track, false)}
                  title={inCall ? 'Tocar agora' : 'Entra numa call primeiro'}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default"
                >
                  <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-brutal border border-line bg-surface-raised">
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
                      {track.artist ?? 'YouTube'} · {byId[track.addedById]?.displayName ?? 'alguém'}
                    </span>
                  </span>
                </button>
                <span className="w-9 shrink-0 text-right font-mono text-[11.5px] tabular-nums text-muted-foreground">
                  {track.durationMs ? formatClock(track.durationMs / 1000) : ''}
                </span>
                <button
                  type="button"
                  disabled={!inCall}
                  onClick={() => void sendOne(track, true)}
                  title={inCall ? 'Botar na fila' : 'Entra numa call primeiro'}
                  className="shrink-0 rounded-brutal p-1 text-muted-foreground opacity-0 transition-opacity hover:text-acid focus:opacity-100 disabled:hidden group-hover:opacity-100"
                >
                  <ListPlus className="h-3.5 w-3.5" />
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
      className="flex items-center gap-1 px-2 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" />
      Playlists
    </button>
  )
}
