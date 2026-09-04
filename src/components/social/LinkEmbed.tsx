import * as React from 'react'
import { ExternalLink, Film, ImageIcon, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { describeLink, openExternal, type LinkEmbed as Embed } from '@/lib/rich-text'
import { useOverlays } from '@/lib/overlay-context'

/**
 * Cartao de preview dos links, no espirito do embed do Discord.
 *
 * Sem servidor de metadados no meio: tudo o que aparece aqui foi DEDUZIDO da
 * propria URL. Buscar og:title do renderer entregaria o IP da galera pra
 * qualquer site colado no chat, esbarraria no CSP e ainda seguraria a lista
 * enquanto carrega. Video do YouTube, imagem e print — que e o que a gente
 * cola de verdade — dao pra resolver sem pedir nada a ninguem.
 */

/** Mais que isso vira parede de cartao e engole a conversa. */
const MAX_EMBEDS = 3

export function LinkEmbeds({ urls }: { urls: string[] }) {
  const embeds = React.useMemo(
    () => urls.slice(0, MAX_EMBEDS).map(describeLink),
    [urls]
  )

  if (embeds.length === 0) return null

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {embeds.map((embed) => (
        <LinkEmbedCard key={embed.url} embed={embed} />
      ))}
    </div>
  )
}

function LinkEmbedCard({ embed }: { embed: Embed }) {
  if (embed.kind === 'image') return <ImageEmbed url={embed.url} />
  if (embed.kind === 'youtube') return <YoutubeEmbed embed={embed} />
  if (embed.kind === 'video') return <GenericEmbed embed={embed} icon={<Film className="h-3.5 w-3.5" />} />
  return <GenericEmbed embed={embed} icon={<ExternalLink className="h-3.5 w-3.5" />} />
}

/**
 * Imagem que veio como link.
 *
 * `onError` importa: link de imagem quebrado (ou que exige login) deixaria um
 * retangulo com icone de foto quebrada no meio da conversa pra sempre. Se nao
 * carregar, cai pro cartao de link normal.
 */
function ImageEmbed({ url }: { url: string }) {
  const [failed, setFailed] = React.useState(false)
  const { openLightbox } = useOverlays()

  if (failed) {
    return <GenericEmbed embed={describeLink(url)} icon={<ImageIcon className="h-3.5 w-3.5" />} forceLink />
  }

  return (
    <button
      type="button"
      onClick={() => openLightbox(url)}
      className="group w-fit overflow-hidden rounded-brutal border border-[#1f1f1f] transition-colors hover:border-acid/50"
    >
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="max-h-80 max-w-full object-contain"
      />
    </button>
  )
}

function YoutubeEmbed({ embed }: { embed: Embed }) {
  const [failed, setFailed] = React.useState(false)

  return (
    <button
      type="button"
      onClick={() => openExternal(embed.url)}
      title={embed.url}
      className={cn(
        'group flex w-full max-w-md flex-col overflow-hidden rounded-brutal text-left',
        'border-l-2 border-[#FF0033] bg-void-light/40 transition-colors hover:bg-void-light/70'
      )}
    >
      {embed.thumbnail && !failed && (
        <span className="relative block">
          <img
            src={embed.thumbnail}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            className="aspect-video w-full bg-black object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/40">
            <span className="rounded-full bg-[#FF0033] p-3 shadow-lg transition-transform group-hover:scale-110">
              <Play className="h-5 w-5 fill-dirty-white text-dirty-white" />
            </span>
          </span>
        </span>
      )}

      <span className="flex items-center gap-1.5 px-2.5 py-1.5">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {embed.host}
        </span>
        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground transition-colors group-hover:text-acid" />
      </span>
    </button>
  )
}

function GenericEmbed({
  embed,
  icon,
  forceLink
}: {
  embed: Embed
  icon: React.ReactNode
  /** Cartao de imagem que falhou: deixa explicito que e link de imagem. */
  forceLink?: boolean
}) {
  let path = ''
  try {
    const parsed = new URL(embed.url)
    path = parsed.pathname === '/' ? '' : decodeURIComponent(parsed.pathname)
  } catch {
    path = ''
  }

  return (
    <button
      type="button"
      onClick={() => openExternal(embed.url)}
      title={embed.url}
      className={cn(
        'group flex w-full max-w-md items-center gap-2 rounded-brutal border-l-2 border-acid-dark',
        'bg-void-light/40 px-2.5 py-1.5 text-left transition-colors hover:bg-void-light/70'
      )}
    >
      <span className="shrink-0 text-muted-foreground transition-colors group-hover:text-acid">
        {icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[10px] uppercase tracking-widest text-acid">
          {embed.host}
        </span>
        {(path || forceLink) && (
          <span className="block truncate text-[11px] text-muted-foreground">
            {forceLink && !path ? 'imagem não carregou' : path}
          </span>
        )}
      </span>

      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground transition-colors group-hover:text-acid" />
    </button>
  )
}
