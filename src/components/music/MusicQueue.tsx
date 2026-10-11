import * as React from 'react'
import { BookmarkPlus, Loader2, Shuffle, Trash2 } from 'lucide-react'
import { MusicIcon } from '@/lib/bocas-icons'
import { cn } from '@/lib/utils'
import { useMembers } from '@/lib/members-context'
import { useWatch, type WatchSession, type WatchTrack } from '@/lib/watch-context'
import { youtubeThumbnail } from '@/lib/youtube'

/**
 * A FILA INTEIRA — o que toca agora e tudo que vem depois.
 *
 * Mora no painel de música (aba "Fila"), que é o que abre ao clicar em
 * "Tocando" na call. A barra do canto (MusicHost) também tem uma fila, mas
 * de 160px de altura: serve pra espiar a próxima, não pra ver quarenta.
 */
export function MusicQueue({
  session,
  onSave
}: {
  session: WatchSession
  /** "Guardar numa playlist" — quem abriu desenha o seletor. */
  onSave?: (track: WatchTrack) => void
}) {
  const watch = useWatch()
  const { byId } = useMembers()
  const queue = session.queue ?? []

  return (
    <div>
      {/* Tocando agora */}
      <div className="flex items-center gap-2.5 border-b border-line bg-acid/5 px-3 py-2">
        <TrackArt artUrl={session.artUrl ?? youtubeThumbnail(session.videoId)} className="h-12 w-12" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11.5px] text-acid">
            {session.playing ? 'Tocando agora' : 'Pausada'}
          </span>
          <span className="block truncate text-sm text-foreground">
            {session.title ?? 'Som do YouTube'}
          </span>
          <span className="block truncate text-[11.5px] text-muted-foreground">
            {session.artist ? `${session.artist} · ` : ''}
            {byId[session.hostUserId]?.displayName ?? 'alguém'} pediu
          </span>
        </span>
        {onSave && (
          <button
            type="button"
            onClick={() =>
              onSave({
                videoId: session.videoId,
                title: session.title,
                artist: session.artist,
                artUrl: session.artUrl
              })
            }
            title="Guardar numa playlist"
            className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:text-acid"
          >
            <BookmarkPlus className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Cabeçalho da fila + aleatório */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
          {queue.length === 0
            ? 'Fila vazia'
            : `${queue.length} na fila — ${
                session.shuffle ? 'em ordem aleatória' : 'um pedido de cada um por vez'
              }`}
        </span>
        <ShuffleButton session={session} />
      </div>

      {queue.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">
          Procura uma música e manda pra fila — ou toca uma Playlist Murcha inteira.
        </p>
      ) : (
        <ol>
          {queue.map((item, index) => (
            <li
              key={`${item.videoId}-${index}`}
              className="group flex items-center gap-2.5 px-3 py-1.5 hover:bg-void-light"
            >
              <span className="w-5 shrink-0 text-right font-mono text-[11.5px] tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <TrackArt artUrl={item.artUrl ?? youtubeThumbnail(item.videoId)} className="h-9 w-9" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">
                  {item.title ?? item.videoId}
                </span>
                <span className="block truncate text-[11.5px] text-muted-foreground">
                  {item.artist ? `${item.artist} · ` : ''}
                  {byId[item.addedBy]?.displayName ?? '?'}
                </span>
              </span>
              {onSave && (
                <button
                  type="button"
                  onClick={() => onSave(item)}
                  title="Guardar numa playlist"
                  className="shrink-0 rounded-brutal p-1 text-muted-foreground opacity-0 transition-opacity hover:text-acid focus:opacity-100 group-hover:opacity-100"
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => void watch.queueRemove(index, item.videoId)}
                title="Tirar da fila"
                className="shrink-0 rounded-brutal p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/**
 * Liga/desliga o aleatório da sala. Vale pra todo mundo na call: a fila é uma
 * só. Ligar embaralha o que está esperando; desligar deixa como está.
 */
export function ShuffleButton({ session, compact }: { session: WatchSession; compact?: boolean }) {
  const watch = useWatch()
  const [busy, setBusy] = React.useState(false)
  const on = session.shuffle === true

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        await watch.setShuffle(!on)
        setBusy(false)
      }}
      title={
        on
          ? 'Aleatório ligado — clique pra voltar ao rodízio'
          : 'Tocar a fila em ordem aleatória (pra todo mundo)'
      }
      aria-pressed={on}
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-brutal border px-1.5 py-0.5 text-[11.5px] transition-colors disabled:opacity-50',
        on
          ? 'border-acid/60 bg-acid/10 text-acid'
          : 'border-line text-muted-foreground hover:border-acid/50 hover:text-foreground'
      )}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shuffle className="h-3 w-3" />}
      {!compact && 'Aleatório'}
    </button>
  )
}

function TrackArt({ artUrl, className }: { artUrl?: string; className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 overflow-hidden rounded-brutal border border-line bg-surface-raised',
        className
      )}
    >
      {artUrl ? (
        <img src={artUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <MusicIcon className="h-4 w-4 text-muted-foreground" />
        </span>
      )}
    </span>
  )
}
