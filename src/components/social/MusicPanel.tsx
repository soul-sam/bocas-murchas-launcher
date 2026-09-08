import * as React from 'react'
import {
  ChevronLeft,
  Disc3,
  Heart,
  Library,
  Link2,
  ListPlus,
  Loader2,
  Music,
  Play,
  Search,
  X
} from 'lucide-react'
import { cn, formatClock } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { useOverlays } from '@/lib/overlay-context'
import { useVoice } from '@/lib/voice-context'
import { useWatch, type WatchTrack } from '@/lib/watch-context'
import { useFocusTrap } from '@/lib/use-focus-trap'
import { openExternal } from '@/lib/rich-text'
import { parseYouTubeUrl } from '@/lib/youtube'
import {
  CURTIDAS,
  music as musicApi,
  spotify as spotifyApi,
  isNotLinked,
  isProviderOff,
  type MusicResult,
  type SpotifyPlaylist,
  type SpotifyStatus
} from '@/lib/api-music'

/**
 * PEDIR MÚSICA.
 *
 * Camada global (não Radix — ver lib/interaction-guard e o cabeçalho do
 * overlay-context): é aberta do compositor de mensagens, da call e da tela de
 * jogar, e a música toca fora da tela social.
 *
 * TRÊS JEITOS DE PEDIR, e eles se alternam sozinhos:
 *
 *  - digitando o nome, cai na busca do Spotify (capa, artista, duração);
 *  - colando um link do YouTube, o campo reconhece e nem busca;
 *  - com a conta vinculada, a aba do lado tem as SUAS playlists e curtidas.
 *
 * Quem toca é sempre o YouTube. A ponte entre a faixa do Spotify e o vídeo é
 * o /music/resolve, e ela é gravada: música que o grupo já tocou volta com o
 * `videoId` junto e toca no clique, sem espera e sem gastar cota. É por isso
 * que a lista marca quais já estão prontas — e por isso "mandar a playlist pra
 * fila" só manda essas.
 *
 * SEM AS CHAVES NO SERVIDOR a busca responde 503 e o painel vira só o campo de
 * colar link, que não depende de chave nenhuma. Mesma degradação do seletor de
 * GIF.
 */

/** Espera o campo parar antes de buscar. Uma busca por tecla seria uma por letra. */
const DEBOUNCE_MS = 300

/** De quanto em quanto o launcher pergunta se a autorização já voltou. */
const LINK_POLL_MS = 2_500
/** Depois disso para de perguntar: a pessoa fechou a aba ou desistiu. */
const LINK_POLL_TIMEOUT_MS = 3 * 60 * 1000

type Status = 'idle' | 'loading' | 'off' | 'error'
type Tab = 'search' | 'library'

export function MusicPanel() {
  const { musicPanelOpen, musicPanelSeed, closeMusicPanel } = useOverlays()
  const { token } = useAuth()
  const watch = useWatch()
  const voice = useVoice()

  const [tab, setTab] = React.useState<Tab>('search')
  const [term, setTerm] = React.useState('')
  const [debounced, setDebounced] = React.useState('')
  const [results, setResults] = React.useState<MusicResult[]>([])
  const [status, setStatus] = React.useState<Status>('idle')
  const [index, setIndex] = React.useState(0)
  /** spotifyId (ou 'link') da que está sendo preparada pra tocar. */
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [providerNote, setProviderNote] = React.useState<string | null>(null)

  const panelRef = useFocusTrap<HTMLDivElement>(musicPanelOpen, closeMusicPanel)

  // Painel novo, campo limpo — a não ser que tenha vindo de "/tocar alguma
  // coisa", que já traz o texto. Reabrir com o pedido antigo lá dentro faria a
  // pessoa tocar sem querer o que ela acabou de tocar.
  React.useEffect(() => {
    if (!musicPanelOpen) return
    setTerm(musicPanelSeed ?? '')
    setDebounced(musicPanelSeed?.trim() ?? '')
    setError(null)
    setBusy(null)
    setIndex(0)
    setTab('search')
  }, [musicPanelOpen, musicPanelSeed])

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [term])

  const asLink = React.useMemo(() => parseYouTubeUrl(term), [term])

  /**
   * Busca o termo atual.
   *
   * O `cancelled` não é decoração: digitar "bohem" e depois "bohemian" dispara
   * duas buscas, e sem isso a resposta mais LENTA (a antiga) pode chegar
   * depois e sobrescrever a mais nova na tela.
   */
  React.useEffect(() => {
    if (!musicPanelOpen || !token || tab !== 'search') return
    // Link colado não é busca: o campo já sabe o que fazer com ele.
    if (asLink || !debounced) {
      setResults([])
      setStatus('idle')
      return
    }

    let cancelled = false
    setStatus('loading')

    void musicApi
      .search(token, debounced)
      .then((page) => {
        if (cancelled) return
        setResults(page.tracks)
        setStatus('idle')
        setIndex(0)
      })
      .catch((err) => {
        if (cancelled) return
        setResults([])
        if (isProviderOff(err)) {
          setStatus('off')
          setProviderNote(err instanceof Error ? err.message : null)
        } else {
          setStatus('error')
          setError(err instanceof Error ? err.message : 'Não deu pra buscar agora.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [musicPanelOpen, token, debounced, asLink, tab])

  if (!musicPanelOpen) return null

  const inCall = voice.connected

  /** Manda pra sala: toca agora, ou entra no rodízio da fila. */
  const send = async (track: WatchTrack, queue: boolean): Promise<boolean> => {
    const ack = queue ? await watch.queueTrack(track) : await watch.playTrack(track)
    if (ack.ok) return true
    setError(ack.error ?? 'Não deu.')
    return false
  }

  /**
   * Escolheu uma faixa (da busca ou de uma playlist).
   *
   * Com `videoId` já no resultado (o grupo tocou essa antes) vai direto. Sem
   * ele, o /resolve procura no YouTube e grava — é a única parte que gasta
   * cota, e ela só acontece uma vez por música na vida.
   */
  const pick = async (track: MusicResult, queue: boolean): Promise<void> => {
    if (busy) return
    setBusy(track.spotifyId)
    setError(null)
    try {
      let videoId = track.videoId
      let resolved: MusicResult = track

      if (!videoId) {
        if (!token) return
        resolved = (await musicApi.resolve(token, track.spotifyId)).track
        videoId = resolved.videoId
      }
      if (!videoId) {
        setError('Não achei essa no YouTube. Cola o link direto que eu toco.')
        return
      }

      const ok = await send(
        { videoId, title: resolved.title, artist: resolved.artist, artUrl: resolved.artUrl },
        queue
      )
      if (ok) closeMusicPanel()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra preparar essa música.')
    } finally {
      setBusy(null)
    }
  }

  /** Colou um link: não passa por busca nem por cota. */
  const pickLink = async (queue: boolean): Promise<void> => {
    const value = term.trim()
    if (!value || busy) return
    setBusy('link')
    setError(null)
    try {
      const ack = queue ? await watch.queueAdd(value, 'music') : await watch.set(value, 'music')
      if (ack.ok) closeMusicPanel()
      else setError(ack.error ?? 'Não deu.')
    } finally {
      setBusy(null)
    }
  }

  const submit = (queue: boolean): void => {
    if (asLink) {
      void pickLink(queue)
      return
    }
    if (tab !== 'search') return
    const chosen = results[index]
    if (chosen) void pick(chosen, queue)
  }

  const searchOff = status === 'off'

  return (
    <div
      onClick={closeMusicPanel}
      className="fixed inset-0 z-[55] flex items-start justify-center bg-black/70 pt-[10vh] backdrop-blur-sm"
    >
      <div
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
        className="card-gradient flex max-h-[74vh] w-full max-w-lg flex-col overflow-hidden rounded-brutal border-2 border-acid-dark shadow-[0_0_50px_rgba(0,0,0,0.8)]"
      >
        <div className="flex shrink-0 items-center gap-2 border-b-2 border-line px-3">
          {asLink ? (
            <Link2 className="h-4 w-4 shrink-0 text-acid" />
          ) : status === 'loading' ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <input
            value={term}
            onChange={(event) => {
              setTerm(event.target.value)
              setError(null)
              // Digitar é buscar: quem estava na biblioteca e começou a digitar
              // quer o catálogo inteiro, não filtrar a playlist aberta.
              if (event.target.value.trim()) setTab('search')
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setIndex((prev) => (prev + 1) % Math.max(results.length, 1))
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setIndex((prev) => (prev - 1 + results.length) % Math.max(results.length, 1))
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                submit(event.ctrlKey || event.shiftKey)
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                closeMusicPanel()
              }
            }}
            placeholder={
              searchOff ? 'Cola um link do YouTube…' : 'Nome da música, artista, ou um link…'
            }
            spellCheck={false}
            autoFocus
            className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={closeMusicPanel}
            title="Fechar"
            className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:text-dirty-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Abas: só aparecem quando há de fato duas fontes. */}
        {!asLink && !searchOff && (
          <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1">
            <TabButton active={tab === 'search'} onClick={() => setTab('search')}>
              <Search className="h-3 w-3" />
              Buscar
            </TabButton>
            <TabButton active={tab === 'library'} onClick={() => setTab('library')}>
              <Library className="h-3 w-3" />
              Minhas playlists
            </TabButton>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!inCall && (
            <p className="border-b border-line px-3 py-2 text-sm text-burn">
              Você não está numa call. A música toca pra quem está no canal de voz — entra num
              primeiro.
            </p>
          )}

          {asLink ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              Link reconhecido. <span className="text-foreground">Enter</span> toca agora;{' '}
              <span className="text-foreground">Shift+Enter</span> manda pra fila.
            </p>
          ) : searchOff ? (
            <div className="px-3 py-4">
              <p className="text-sm text-foreground">A busca de música está desligada.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {providerNote ?? 'Falta configurar as chaves no servidor.'} Colar link do YouTube
                continua funcionando normal.
              </p>
            </div>
          ) : tab === 'library' ? (
            <SpotifyLibrary
              busyId={busy}
              onPick={(track, queue) => void pick(track, queue)}
              onQueueMany={async (tracks) => {
                for (const track of tracks) {
                  const ok = await send(
                    {
                      videoId: track.videoId!,
                      title: track.title,
                      artist: track.artist,
                      artUrl: track.artUrl
                    },
                    true
                  )
                  if (!ok) return false
                }
                return true
              }}
            />
          ) : status === 'error' ? (
            <p className="px-3 py-4 text-sm text-destructive">{error}</p>
          ) : results.length > 0 ? (
            <ol>
              {results.map((track, position) => (
                <ResultRow
                  key={track.spotifyId}
                  track={track}
                  active={position === index}
                  busy={busy === track.spotifyId}
                  onHover={() => setIndex(position)}
                  onPlay={() => void pick(track, false)}
                  onQueue={() => void pick(track, true)}
                />
              ))}
            </ol>
          ) : debounced && status === 'idle' ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              Nada com esse nome. Se souber o vídeo, cola o link do YouTube.
            </p>
          ) : (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              Toca pra todo mundo na call, no mesmo segundo. Cada um controla o próprio volume, e a
              música abaixa sozinha quando alguém fala.
            </p>
          )}
        </div>

        {error && status !== 'error' && (
          <p className="shrink-0 border-t border-line px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {(tab === 'search' || asLink) && (
          <div className="flex shrink-0 items-center gap-1.5 border-t-2 border-line p-2">
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={busy !== null || (!asLink && results.length === 0)}
              className="flex items-center gap-1.5 rounded-brutal border-2 border-acid bg-acid/10 px-3 py-1.5 font-mono text-[11.5px] uppercase tracking-widest text-acid transition-colors hover:bg-acid/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Tocar agora
            </button>

            <button
              type="button"
              onClick={() => submit(true)}
              disabled={busy !== null || (!asLink && results.length === 0)}
              title="Entra no rodízio da fila"
              className="flex items-center gap-1.5 rounded-brutal border-2 border-line px-3 py-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-acid/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ListPlus className="h-3 w-3" />
              Pra fila
            </button>

            <span className="ml-auto pr-1 text-[11.5px] text-muted-foreground">
              ↑↓ escolhe · Enter toca · Shift+Enter enfileira
            </span>
          </div>
        )}
      </div>
    </div>
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
        'flex items-center gap-1.5 rounded-brutal border px-2 py-1 text-[11.5px] transition-colors',
        active
          ? 'border-acid/60 bg-acid/10 text-acid'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

// ============================================
// BIBLIOTECA DO SPOTIFY
// ============================================

/**
 * As playlists e curtidas de quem vinculou a conta.
 *
 * Vincular não muda quem toca — o áudio continua saindo do YouTube. O que ela
 * traz é o catálogo pessoal, que a busca pública não alcança.
 */
function SpotifyLibrary({
  busyId,
  onPick,
  onQueueMany
}: {
  busyId: string | null
  onPick: (track: MusicResult, queue: boolean) => void
  /** Devolve false se a sala recusou (fila cheia, sem call). */
  onQueueMany: (tracks: MusicResult[]) => Promise<boolean>
}) {
  const { token } = useAuth()

  const [status, setStatus] = React.useState<SpotifyStatus | null>(null)
  const [playlists, setPlaylists] = React.useState<SpotifyPlaylist[] | null>(null)
  const [open, setOpen] = React.useState<{ id: string; name: string } | null>(null)
  const [tracks, setTracks] = React.useState<MusicResult[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [waitingLink, setWaitingLink] = React.useState(false)
  const [sending, setSending] = React.useState(false)

  React.useEffect(() => {
    if (!token) return
    void spotifyApi
      .status(token)
      .then(setStatus)
      .catch(() => setStatus({ available: false, linked: false, displayName: null, linkedAt: null }))
  }, [token])

  // Lista as playlists assim que sabemos que está vinculada.
  React.useEffect(() => {
    if (!token || !status?.linked || playlists) return
    setLoading(true)
    void spotifyApi
      .playlists(token)
      .then((page) => setPlaylists(page.playlists))
      .catch((err) => {
        /**
         * 409 é "o vínculo morreu" — a pessoa revogou o acesso no painel do
         * Spotify, ou o segredo do servidor mudou. Voltar o estado pra "não
         * vinculada" faz o botão de vincular reaparecer; sem isso a tela
         * ficaria repetindo um erro com o único caminho de volta escondido.
         */
        if (isNotLinked(err)) {
          setStatus((prev) => (prev ? { ...prev, linked: false, displayName: null } : prev))
          return
        }
        setError(err instanceof Error ? err.message : 'Não deu pra ler as playlists.')
      })
      .finally(() => setLoading(false))
  }, [token, status?.linked, playlists])

  /**
   * Abre o Spotify no navegador PADRÃO e fica perguntando se voltou.
   *
   * Perguntar é a única opção: quem aprova está noutro programa, e o servidor
   * não tem como acordar este painel. Para sozinho depois de três minutos —
   * ficar batendo pra sempre numa aba que a pessoa fechou é desperdício.
   */
  const link = async (): Promise<void> => {
    if (!token) return
    setError(null)
    try {
      const { url } = await spotifyApi.loginUrl(token)
      openExternal(url)
      setWaitingLink(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra abrir o Spotify.')
    }
  }

  React.useEffect(() => {
    if (!waitingLink || !token) return
    const started = Date.now()

    const timer = setInterval(() => {
      if (Date.now() - started > LINK_POLL_TIMEOUT_MS) {
        setWaitingLink(false)
        return
      }
      void spotifyApi
        .status(token)
        .then((next) => {
          if (!next.linked) return
          setStatus(next)
          setWaitingLink(false)
        })
        .catch(() => {
          /* tenta de novo no próximo tique */
        })
    }, LINK_POLL_MS)

    return () => clearInterval(timer)
  }, [waitingLink, token])

  const openPlaylist = async (playlist: { id: string; name: string }): Promise<void> => {
    if (!token) return
    setOpen(playlist)
    setTracks(null)
    setLoading(true)
    setError(null)
    try {
      const page = await spotifyApi.tracks(token, playlist.id)
      setTracks(page.tracks)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra ler essa playlist.')
    } finally {
      setLoading(false)
    }
  }

  const unlink = async (): Promise<void> => {
    if (!token) return
    await spotifyApi.unlink(token).catch(() => {})
    setStatus({ available: true, linked: false, displayName: null, linkedAt: null })
    setPlaylists(null)
    setOpen(null)
    setTracks(null)
  }

  if (!status) {
    return (
      <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        vendo se sua conta está vinculada…
      </p>
    )
  }

  if (!status.available) {
    return (
      <div className="px-3 py-4">
        <p className="text-sm text-foreground">Vincular o Spotify está desligado.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Falta configurar as chaves no servidor. A busca e o link do YouTube continuam
          funcionando.
        </p>
      </div>
    )
  }

  if (!status.linked) {
    return (
      <div className="px-3 py-4">
        <p className="text-sm text-foreground">Vincula o Spotify pra usar as suas playlists.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Abre no seu navegador, você aprova e volta. A música continua tocando pelo YouTube — o
          Spotify não deixa a call inteira ouvir a mesma faixa, então ele entra só como catálogo.
          Não pedimos permissão pra mexer em nada na sua conta.
        </p>

        <button
          type="button"
          onClick={() => void link()}
          disabled={waitingLink}
          className="mt-3 flex items-center gap-1.5 rounded-brutal border-2 border-acid bg-acid/10 px-3 py-1.5 font-mono text-[11.5px] uppercase tracking-widest text-acid transition-colors hover:bg-acid/20 disabled:opacity-60"
        >
          {waitingLink ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Link2 className="h-3 w-3" />
          )}
          {waitingLink ? 'esperando você aprovar…' : 'Vincular Spotify'}
        </button>

        {waitingLink && (
          <p className="mt-2 text-[11.5px] text-muted-foreground">
            Aprovou e nada aconteceu? Fecha e abre este painel.
          </p>
        )}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    )
  }

  // --- vinculada ------------------------------------------------------------
  if (open) {
    const prontas = (tracks ?? []).filter((track) => track.videoId)

    return (
      <div>
        <div className="flex items-center gap-2 border-b border-line px-2 py-1.5">
          <button
            type="button"
            onClick={() => {
              setOpen(null)
              setTracks(null)
              setError(null)
            }}
            className="flex shrink-0 items-center gap-1 rounded-brutal p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{open.name}</span>

          {prontas.length > 0 && (
            <button
              type="button"
              disabled={sending}
              onClick={async () => {
                setSending(true)
                await onQueueMany(prontas)
                setSending(false)
              }}
              title={`Manda as ${prontas.length} que já estão prontas pro rodízio da fila`}
              className="flex shrink-0 items-center gap-1 rounded-brutal border border-acid/60 px-2 py-0.5 text-[11.5px] text-acid transition-colors hover:bg-acid/10 disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ListPlus className="h-3 w-3" />
              )}
              {prontas.length} pra fila
            </button>
          )}
        </div>

        {loading ? (
          <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            carregando…
          </p>
        ) : error ? (
          <p className="px-3 py-4 text-sm text-destructive">{error}</p>
        ) : (tracks ?? []).length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Essa playlist está vazia.</p>
        ) : (
          <>
            {/*
              A conta honesta do que "mandar pra fila" faz. Só as já conhecidas
              entram de uma vez: cada música nova custa uma busca no YouTube, e
              o grupo tem menos de cem por dia (ver MusicTrack no schema da
              API). As outras entram no clique, uma a uma.
            */}
            <p className="border-b border-line px-3 py-1.5 text-[11.5px] text-muted-foreground">
              {prontas.length} de {(tracks ?? []).length} já foram tocadas pelo grupo e entram na
              hora. As outras o launcher procura no YouTube quando você clicar.
            </p>
            <ol>
              {(tracks ?? []).map((track) => (
                <ResultRow
                  key={track.spotifyId}
                  track={track}
                  active={false}
                  busy={busyId === track.spotifyId}
                  onHover={() => {}}
                  onPlay={() => onPick(track, false)}
                  onQueue={() => onPick(track, true)}
                />
              ))}
            </ol>
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
          {status.displayName ? `Conta: ${status.displayName}` : 'Conta vinculada'}
        </span>
        <button
          type="button"
          onClick={() => void unlink()}
          className="shrink-0 text-[11.5px] text-muted-foreground underline-offset-2 transition-colors hover:text-destructive hover:underline"
        >
          desvincular
        </button>
      </div>

      <button
        type="button"
        onClick={() => void openPlaylist({ id: CURTIDAS, name: 'Músicas curtidas' })}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-void-light"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-brutal border border-line bg-surface-raised">
          <Heart className="h-4 w-4 text-acid" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-foreground">Músicas curtidas</span>
          <span className="block truncate text-[11.5px] text-muted-foreground">
            tudo que você curtiu no Spotify
          </span>
        </span>
      </button>

      {loading && !playlists ? (
        <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          carregando suas playlists…
        </p>
      ) : error ? (
        <p className="px-3 py-4 text-sm text-destructive">{error}</p>
      ) : (playlists ?? []).length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">
          Você não tem playlist nenhuma nessa conta.
        </p>
      ) : (
        (playlists ?? []).map((playlist) => (
          <button
            key={playlist.id}
            type="button"
            onClick={() => void openPlaylist(playlist)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-void-light"
          >
            <span className="h-10 w-10 shrink-0 overflow-hidden rounded-brutal border border-line bg-surface-raised">
              {playlist.artUrl ? (
                <img src={playlist.artUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <Music className="h-4 w-4 text-muted-foreground" />
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">{playlist.name}</span>
              <span className="block truncate text-[11.5px] text-muted-foreground">
                {playlist.total} {playlist.total === 1 ? 'música' : 'músicas'}
              </span>
            </span>
          </button>
        ))
      )}
    </div>
  )
}

// ============================================
// UMA FAIXA
// ============================================

function ResultRow({
  track,
  active,
  busy,
  onHover,
  onPlay,
  onQueue
}: {
  track: MusicResult
  active: boolean
  busy: boolean
  onHover: () => void
  onPlay: () => void
  onQueue: () => void
}) {
  return (
    <li
      onMouseEnter={onHover}
      className={cn(
        'group flex items-center gap-2.5 px-3 py-2 transition-colors',
        active ? 'bg-acid/10' : 'hover:bg-void-light'
      )}
    >
      <button
        type="button"
        onClick={onPlay}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-brutal border border-line bg-surface-raised">
          {track.artUrl ? (
            <img src={track.artUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <Music className="h-4 w-4 text-muted-foreground" />
            </span>
          )}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-void/80">
              <Loader2 className="h-4 w-4 animate-spin text-acid" />
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-foreground">{track.title}</span>
          <span className="block truncate text-[11.5px] text-muted-foreground">
            {track.artist}
          </span>
        </span>
      </button>

      {/* "Já tocou" não é enfeite: essas tocam na hora, sem a espera de
          procurar o vídeo no YouTube. */}
      {track.videoId && (
        <span title="O grupo já tocou essa — toca na hora" className="shrink-0 text-acid-text">
          <Disc3 className="h-3.5 w-3.5" />
        </span>
      )}

      {track.durationMs && (
        <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-muted-foreground">
          {formatClock(track.durationMs / 1000)}
        </span>
      )}

      <button
        type="button"
        onClick={onQueue}
        title="Botar na fila"
        className="shrink-0 rounded-brutal p-1 text-muted-foreground opacity-0 transition-opacity hover:text-acid focus:opacity-100 group-hover:opacity-100"
      >
        <ListPlus className="h-4 w-4" />
      </button>
    </li>
  )
}
