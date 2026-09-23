import * as React from 'react'
import { Clock, Copy, Film, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resolveAssetUrl } from '@/lib/api'
import { formatSeconds, printApi, type PrintGalleryItem } from '@/lib/api-print'
import { useAuth } from '@/lib/auth-context'
import { useOverlays } from '@/lib/overlay-context'
import { cn } from '@/lib/utils'
import { FilamentChips, PrintThumb, gramsLabel } from './print-bits'

/**
 * MURAL — as peças que o grupo já imprimiu.
 *
 * A foto é a da câmera da impressora no fim da peça (com a luz acesa); peça
 * de antes da câmera, ou que a câmera perdeu, mostra a miniatura do
 * fatiador. Clicar abre o detalhe com o timelapse, quando existe, e o
 * "quero uma igual" — que usa o MESMO arquivo, na cota de quem clicou.
 */
export function GalleryTab({ canQueue }: { canQueue: boolean }) {
  const { token } = useAuth()
  const [items, setItems] = React.useState<PrintGalleryItem[] | null>(null)
  const [next, setNext] = React.useState<string | null>(null)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState<PrintGalleryItem | null>(null)

  React.useEffect(() => {
    let alive = true
    printApi
      .gallery(token)
      .then((res) => {
        if (!alive) return
        setItems(res.items)
        setNext(res.nextBefore)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Não deu pra abrir o mural')
      })
    return () => {
      alive = false
    }
  }, [token])

  async function more(): Promise<void> {
    if (!next) return
    setLoadingMore(true)
    try {
      const res = await printApi.gallery(token, { before: next })
      setItems((prev) => [...(prev ?? []), ...res.items])
      setNext(res.nextBefore)
    } finally {
      setLoadingMore(false)
    }
  }

  if (error) return <p className="text-xs text-destructive">{error}</p>
  if (!items) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="rounded-brutal border-2 border-dashed border-line-strong p-6 text-center">
        <p className="font-display text-sm uppercase tracking-wider text-foreground">Mural vazio</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Quando a primeira peça ficar pronta, a foto aparece aqui — e no chat.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setOpen(item)}
              className="group block w-full overflow-hidden rounded-brutal border border-line bg-void-light/40 text-left transition-colors hover:border-acid-dark"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-void">
                {item.photoUrl ? (
                  <img
                    src={resolveAssetUrl(item.photoUrl)}
                    alt={item.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <PrintThumb url={item.thumbUrl} alt={item.title} className="h-full w-full rounded-none border-0" />
                )}
                {item.timelapseUrl && (
                  <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-brutal bg-black/70 px-1.5 py-0.5 text-[11px] text-foreground">
                    <Film className="h-3 w-3" />
                    timelapse
                  </span>
                )}
              </div>
              <div className="px-2 py-1.5">
                <p className="truncate font-display text-sm text-foreground">{item.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {item.owner.displayName}
                  {item.billedSeconds ? ` · ${formatSeconds(item.billedSeconds)}` : ''}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {next && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => void more()} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Ver mais antigas
          </Button>
        </div>
      )}

      {open && <GalleryDetail item={open} canQueue={canQueue} onClose={() => setOpen(null)} />}
    </div>
  )
}

function GalleryDetail({
  item,
  canQueue,
  onClose
}: {
  item: PrintGalleryItem
  canQueue: boolean
  onClose: () => void
}) {
  const { token } = useAuth()
  const { openLightbox } = useOverlays()
  const [video, setVideo] = React.useState(!!item.timelapseUrl && !item.photoUrl)
  const [busy, setBusy] = React.useState(false)
  const [note, setNote] = React.useState<{ ok: boolean; text: string } | null>(null)

  React.useEffect(() => {
    const handle = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [onClose])

  async function reprint(): Promise<void> {
    setBusy(true)
    setNote(null)
    try {
      const res = await printApi.reprint(token, item.id)
      setNote({ ok: true, text: res.message })
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : 'Não deu' })
    } finally {
      setBusy(false)
    }
  }

  const photo = resolveAssetUrl(item.photoUrl ?? undefined)
  const timelapse = resolveAssetUrl(item.timelapseUrl ?? undefined)
  const grams = gramsLabel(item.grams)

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="fixed inset-0 z-dialogo flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="card-acid relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-brutal">
        <button
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          className="absolute right-3 top-3 z-conteudo rounded-brutal bg-black/50 p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="bg-void">
          {video && timelapse ? (
            <video src={timelapse} controls autoPlay loop muted playsInline className="max-h-[60dvh] w-full object-contain" />
          ) : photo ? (
            <button type="button" className="block w-full" onClick={() => openLightbox(photo)} title="Ver grande">
              <img src={photo} alt={item.title} className="max-h-[60dvh] w-full object-contain" />
            </button>
          ) : (
            <PrintThumb url={item.thumbUrl} alt={item.title} className="aspect-video w-full rounded-none border-0" />
          )}
        </div>

        <div className="space-y-2 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-xl leading-tight text-foreground">{item.title}</h3>
            <span className="text-[11.5px] text-muted-foreground">
              {item.owner.displayName}
              {item.finishedAt
                ? ` · ${new Date(item.finishedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}`
                : ''}
            </span>
          </div>
          {item.note && <p className="text-xs text-muted-foreground">{item.note}</p>}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
            {item.billedSeconds ? (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatSeconds(item.billedSeconds)}
              </span>
            ) : null}
            {grams && <span>{grams}</span>}
            {item.layers ? <span>{item.layers} camadas</span> : null}
            {item.isReprint && <span>cópia de outra peça</span>}
            {item.fromRequest && <span>encomenda</span>}
          </div>
          <FilamentChips filaments={item.filaments} />

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {timelapse && photo && (
              <Button variant="ghost" size="sm" onClick={() => setVideo((v) => !v)}>
                <Film className="mr-2 h-4 w-4" />
                {video ? 'Ver a foto' : 'Ver o timelapse'}
              </Button>
            )}
            {canQueue && item.reprintable && (
              <Button size="sm" className="btn-acid" onClick={() => void reprint()} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
                Quero uma igual
              </Button>
            )}
            {canQueue && !item.reprintable && (
              <span className="text-[11px] text-muted-foreground">
                o arquivo dessa já saiu do servidor — pra repetir, sobe o .gcode de novo
              </span>
            )}
          </div>
          {note && (
            <p className={cn('text-[11.5px]', note.ok ? 'text-acid-text' : 'text-destructive')}>{note.text}</p>
          )}
        </div>
      </div>
    </div>
  )
}
