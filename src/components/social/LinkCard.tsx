import * as React from 'react'
import {
  ExternalLink,
  FileText,
  ImageIcon,
  Link2,
  Loader2,
  MessageSquare,
  Play,
  ShoppingCart,
  Trash2,
  type LucideIcon
} from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { messages as messagesApi, resolveAssetUrl } from '@/lib/api'
import { links as linksApi, type LinkKind, type SharedLink } from '@/lib/api-links'
import { openExternal } from '@/lib/rich-text'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'

/**
 * Um achado no painel: prévia, título (ou o domínio, quando o site não deu
 * título), quem colou e quando, e as ações.
 *
 * O "quero" é a reação 🛒 na MENSAGEM original, não um contador próprio. Assim
 * quem está no chat vê a mesma coisa que quem está no painel, e não existe um
 * segundo número pra sair de sincronia. A troca é otimista: o botão muda na
 * hora e volta se o servidor reclamar.
 *
 * O card não guarda estado da lista — pede pro painel aplicar o remendo
 * (`onPatch`) porque a mesma lista recebe itens por socket e paginação, e dois
 * donos do mesmo item é briga na certa.
 */

export const WANT_EMOJI = '\u{1F6D2}' // 🛒

export const KIND_META: Record<LinkKind, { label: string; Icon: LucideIcon; tone: string }> = {
  video: { label: 'vídeo', Icon: Play, tone: 'text-destructive' },
  shop: { label: 'compra', Icon: ShoppingCart, tone: 'text-burn' },
  image: { label: 'imagem', Icon: ImageIcon, tone: 'text-acid' },
  article: { label: 'artigo', Icon: FileText, tone: 'text-muted-foreground' },
  other: { label: 'link', Icon: Link2, tone: 'text-muted-foreground' }
}

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 d", depois a data. */
export function formatRelative(iso: string, nowMs = Date.now()): string {
  const diff = Math.max(0, nowMs - new Date(iso).getTime())
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ontem'
  if (days < 7) return `há ${days} d`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

interface LinkCardProps {
  link: SharedLink
  /** Autor ou admin. */
  canDelete: boolean
  onPatch: (id: string, patch: Partial<SharedLink>) => void
  onRemoved: (id: string) => void
  onJump: (link: SharedLink) => void
}

export function LinkCard({ link, canDelete, onPatch, onRemoved, onJump }: LinkCardProps) {
  const { token } = useAuth()
  const { byId } = useMembers()

  const [imageBroken, setImageBroken] = React.useState(false)
  const [removing, setRemoving] = React.useState(false)
  const wantBusy = React.useRef(false)

  // Avatar e nome mais frescos que os gravados junto com o link: a pessoa
  // pode ter trocado de foto depois de colar.
  const member = byId[link.author.id]
  const authorName = member?.displayName ?? link.author.displayName
  const authorAvatar = member?.avatar ?? link.author.avatar
  const authorColor = member?.profileColor ?? link.author.profileColor

  const meta = KIND_META[link.kind] ?? KIND_META.other
  const showImage = !!link.image && !imageBroken

  const open = (): void => openExternal(link.url)

  const toggleWant = async (): Promise<void> => {
    if (!token || wantBusy.current) return
    wantBusy.current = true

    const wanted = !link.wanted
    const previous = { wanted: link.wanted, wantCount: link.wantCount }
    onPatch(link.id, { wanted, wantCount: Math.max(0, link.wantCount + (wanted ? 1 : -1)) })

    try {
      const { action } = await messagesApi.react(token, link.message.id, WANT_EMOJI)
      // O servidor é quem sabe se adicionou ou tirou (outra janela pode ter
      // reagido no meio). Se discordou do palpite, ajusta.
      const confirmed = action === 'added'
      if (confirmed !== wanted) {
        onPatch(link.id, {
          wanted: confirmed,
          wantCount: Math.max(0, previous.wantCount + (confirmed ? 1 : -1))
        })
      }
    } catch {
      onPatch(link.id, previous)
    } finally {
      wantBusy.current = false
    }
  }

  const remove = async (): Promise<void> => {
    if (!token || removing) return
    setRemoving(true)
    try {
      await linksApi.remove(token, link.id)
      onRemoved(link.id)
    } catch {
      setRemoving(false)
    }
  }

  return (
    <article
      className={cn(
        'group overflow-hidden rounded-brutal border border-[#1a1a1a] bg-void-light/30 transition-colors hover:border-acid/40',
        removing && 'opacity-50'
      )}
    >
      {showImage && (
        <button type="button" onClick={open} title={link.url} className="block w-full bg-void">
          <img
            src={link.image!}
            alt=""
            loading="lazy"
            onError={() => setImageBroken(true)}
            className="h-24 w-full object-cover"
          />
        </button>
      )}

      <div className="p-2">
        <button
          type="button"
          onClick={open}
          title={link.description ?? link.url}
          className="flex w-full items-start gap-1.5 text-left"
        >
          {!showImage && <meta.Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', meta.tone)} />}
          <span className="line-clamp-2 text-[12px] font-medium leading-snug text-foreground">
            {link.title || link.domain}
          </span>
        </button>

        <div className="mt-1 flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground">
          <span
            className={cn(
              'shrink-0 rounded-[2px] border border-[#1f1f1f] px-1 uppercase tracking-widest',
              meta.tone
            )}
          >
            {meta.label}
          </span>
          <span className="min-w-0 truncate">{link.domain}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1" title={authorName}>
            <UserAvatar
              src={resolveAssetUrl(authorAvatar)}
              name={authorName}
              ringColor={authorColor}
              className="h-3.5 w-3.5"
            />
            <span>{formatRelative(link.createdAt)}</span>
          </span>
        </div>

        <div className="mt-1.5 flex items-center gap-1">
          <button
            type="button"
            onClick={() => void toggleWant()}
            title={link.wanted ? 'Não quero mais' : 'Quero!'}
            className={cn(
              'flex items-center gap-1 rounded-brutal border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest transition-colors',
              link.wanted
                ? 'border-acid/50 bg-acid/10 text-acid'
                : 'border-[#1a1a1a] text-muted-foreground hover:border-acid/40 hover:text-acid'
            )}
          >
            <ShoppingCart className="h-3 w-3" />
            quero
            {link.wantCount > 0 && <span className="tabular-nums">{link.wantCount}</span>}
          </button>

          <button
            type="button"
            onClick={() => onJump(link)}
            title="Ir pra mensagem"
            aria-label="Ir pra mensagem"
            className="rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-acid"
          >
            <MessageSquare className="h-3 w-3" />
          </button>

          <button
            type="button"
            onClick={open}
            title="Abrir no navegador"
            aria-label="Abrir no navegador"
            className="rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-acid"
          >
            <ExternalLink className="h-3 w-3" />
          </button>

          {canDelete && (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={removing}
              title="Tirar do quadro (a mensagem fica)"
              aria-label="Tirar do quadro"
              className="ml-auto rounded-brutal p-1 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
            >
              {removing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
