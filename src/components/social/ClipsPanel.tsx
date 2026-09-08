import * as React from 'react'
import { Clapperboard, Loader2, Trash2, X } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { clips as clipsApi, type Clip } from '@/lib/api-clips'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'
import { useClips } from '@/lib/clip-context'
import { useLayout } from '@/lib/layout-context'
import { useMembers } from '@/lib/members-context'
import { formatRelative } from '@/lib/natural-date'
import { useNow } from '@/lib/use-now'
import { ClipPlayer } from './ClipPlayer'
import { cn } from '@/lib/utils'

/**
 * ACERVO DE CLIPES — coluna da direita.
 *
 * Os clipes também viram card no chat, mas card no chat é passado: rola pra
 * cima e some. Este painel é o lugar onde o acervo EXISTE — dá pra abrir num
 * domingo à tarde e ouvir a semana inteira sem procurar mensagem.
 *
 * A ordem é sempre do mais novo pro mais velho, e não por escutas. O acervo é
 * uma linha do tempo, não um top 10.
 */
export function ClipsPanel() {
  const { token, user } = useAuth()
  const { byId } = useMembers()
  const { closeClips } = useLayout()
  const { clips, loading, remove } = useClips()
  const { setActiveChannel } = useChat()
  const now = useNow(60_000)

  const [onlyMine, setOnlyMine] = React.useState(false)
  const [confirming, setConfirming] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  const shown = onlyMine ? clips.filter((c) => c.author.id === user?.id) : clips

  const countPlay = React.useCallback(
    (id: string) => {
      if (!token) return
      void clipsApi.countPlay(token, id)
    },
    [token]
  )

  const handleRemove = async (clip: Clip): Promise<void> => {
    if (confirming !== clip.id) {
      setConfirming(clip.id)
      setTimeout(() => setConfirming((current) => (current === clip.id ? null : current)), 4_000)
      return
    }
    setConfirming(null)
    setBusy(clip.id)
    await remove(clip.id).catch(() => undefined)
    setBusy(null)
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-void xl:w-80">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <Clapperboard className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <h3 className="flex-1 truncate font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
          Clipes
        </h3>
        <button
          type="button"
          onClick={() => setOnlyMine((prev) => !prev)}
          className={cn(
            'shrink-0 rounded-brutal border px-1.5 py-0.5 text-[11px] transition-colors',
            onlyMine
              ? 'border-acid/60 bg-acid/10 text-acid'
              : 'border-line text-muted-foreground hover:text-foreground'
          )}
        >
          meus
        </button>
        <button
          type="button"
          onClick={closeClips}
          title="Fechar"
          aria-label="Fechar clipes"
          className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && shown.length === 0 && (
          <p className="px-2 py-8 text-center text-xs leading-relaxed text-muted-foreground">
            {onlyMine ? (
              'Você ainda não clipou nada.'
            ) : (
              <>
                Nenhum clipe ainda.
                <br />
                Numa call, aperte o atalho e os últimos 30 segundos ficam salvos.
              </>
            )}
          </p>
        )}

        {shown.map((clip) => {
          const url = resolveAssetUrl(clip.url)
          const author = byId[clip.author.id] ?? clip.author
          const mine = clip.author.id === user?.id
          const isAdmin = user?.role === 'admin'
          const asking = confirming === clip.id

          return (
            <article
              key={clip.id}
              className="rounded-brutal border border-line bg-void-light/40 px-2.5 py-2"
            >
              <div className="flex items-start gap-2">
                <UserAvatar
                  src={resolveAssetUrl(author.avatar)}
                  name={author.displayName}
                  ringColor={'profileColor' in author ? author.profileColor : undefined}
                  className="mt-0.5 h-5 w-5 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm leading-tight text-foreground">{clip.title}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {author.displayName} · {formatRelative(new Date(clip.createdAt), now)}
                    {clip.playCount > 0 && ` · ${clip.playCount} escutas`}
                  </p>
                </div>
                {(mine || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => void handleRemove(clip)}
                    disabled={busy === clip.id}
                    title={asking ? 'Clica de novo pra apagar' : 'Apagar clipe'}
                    aria-label="Apagar clipe"
                    className={cn(
                      'shrink-0 rounded-brutal p-1 transition-colors',
                      asking
                        ? 'bg-destructive text-destructive-foreground'
                        : 'text-muted-foreground hover:text-destructive'
                    )}
                  >
                    {busy === clip.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>

              {url && (
                <div className="mt-1.5">
                  <ClipPlayer
                    src={url}
                    durationMs={clip.durationMs}
                    onFirstPlay={() => countPlay(clip.id)}
                    compact
                  />
                </div>
              )}

              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="flex min-w-0 flex-1 items-center gap-1">
                  {clip.participants.slice(0, 6).map((id) => {
                    const who = byId[id]
                    return (
                      <UserAvatar
                        key={id}
                        src={resolveAssetUrl(who?.avatar)}
                        name={who?.displayName ?? '?'}
                        className="h-4 w-4"
                      />
                    )
                  })}
                </span>
                {clip.messageId && clip.channelId && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveChannel(clip.channelId!)
                      requestAnimationFrame(() => {
                        document
                          .getElementById(`msg-${clip.messageId}`)
                          ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                      })
                    }}
                    className="shrink-0 text-[11px] text-muted-foreground transition-colors hover:text-acid"
                  >
                    ver no chat
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </aside>
  )
}
