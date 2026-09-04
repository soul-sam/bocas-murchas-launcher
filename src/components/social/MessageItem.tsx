import * as React from 'react'
import EmojiPicker, { Theme, EmojiStyle } from 'emoji-picker-react'
import {
  Reply,
  SmilePlus,
  Pencil,
  Trash2,
  Pin,
  CornerUpRight,
  Copy,
  Check,
  FileText,
  Download
} from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { resolveAssetUrl, type ChatMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { useOverlays } from '@/lib/overlay-context'
import { useSettings } from '@/lib/settings-context'
import { collectLinks, isEmojiOnly, openExternal, parseBlocks } from '@/lib/rich-text'
import { RichText, useMentionsMe } from './RichText'
import { LinkEmbeds } from './LinkEmbed'

const QUICK_EMOJIS = ['😂', '💀', '🔥', '👍', '❤️', '😭']

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

interface MessageItemProps {
  message: ChatMessage
  /** Mensagem seguida do mesmo autor: esconde avatar e cabeçalho. */
  grouped: boolean
  /** Piscando porque alguém pulou pra ela (resposta ou fixada). */
  highlighted?: boolean
  /**
   * Edição é CONTROLADA pelo ChatView.
   *
   * Precisa ser: a seta pra cima no compositor vazio edita a última mensagem
   * sua, e o compositor não tem como alcançar o estado interno de um item da
   * lista. Com o estado em cima, os dois caminhos (lápis e atalho) abrem a
   * mesma edição.
   */
  editing?: boolean
  onStartEdit?: (messageId: string) => void
  onStopEdit?: () => void
  onReply: (message: ChatMessage) => void
  onEdit: (messageId: string, content: string) => Promise<void>
  onDelete: (messageId: string) => Promise<void>
  onReact: (messageId: string, emoji: string) => Promise<void>
  onPin: (messageId: string) => Promise<void>
  /** Pular pra mensagem respondida. Ausente quando ela não está carregada. */
  onJumpTo?: (messageId: string) => void
}

export function MessageItem({
  message,
  grouped,
  highlighted,
  editing = false,
  onStartEdit,
  onStopEdit,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onPin,
  onJumpTo
}: MessageItemProps) {
  const { user } = useAuth()
  const { byId } = useMembers()
  const { openUserMenu, openLightbox } = useOverlays()
  const { settings } = useSettings()
  const [draft, setDraft] = React.useState(message.content)
  const [copied, setCopied] = React.useState(false)

  // Abrir a edição sempre parte do texto atual — inclusive quando a mensagem
  // foi editada em outro lugar enquanto esta janela estava aberta.
  React.useEffect(() => {
    if (editing) setDraft(message.content)
  }, [editing, message.content])

  const chat = settings.chat
  const isMine = message.author.id === user?.id
  const isAdmin = user?.role === 'admin'
  const author = byId[message.author.id]
  const color = author?.profileColor ?? undefined

  const mentionsMe = useMentionsMe(message.content, user?.id)
  const jumbo = React.useMemo(
    () => !message.imageUrl && !message.gifUrl && isEmojiOnly(message.content),
    [message.content, message.imageUrl, message.gifUrl]
  )

  // Links do texto: só precisam ser extraídos quando os cartões estão ligados.
  const links = React.useMemo(() => {
    if (!chat.showEmbeds || !message.content) return []
    return collectLinks(parseBlocks(message.content))
  }, [chat.showEmbeds, message.content])

  // Reações vêm como uma linha por pessoa; a UI mostra por emoji.
  const groupedReactions = React.useMemo(() => {
    const counts = new Map<string, { count: number; mine: boolean; who: string[] }>()
    for (const reaction of message.reactions ?? []) {
      const current = counts.get(reaction.emoji) ?? { count: 0, mine: false, who: [] }
      counts.set(reaction.emoji, {
        count: current.count + 1,
        mine: current.mine || reaction.userId === user?.id,
        who: [...current.who, reaction.user?.displayName ?? 'alguém']
      })
    }
    return Array.from(counts.entries())
  }, [message.reactions, user?.id])

  const saveEdit = async (): Promise<void> => {
    const next = draft.trim()
    onStopEdit?.()
    if (!next || next === message.content) return
    await onEdit(message.id, next)
  }

  const cancelEdit = (): void => {
    setDraft(message.content)
    onStopEdit?.()
  }

  const copyText = (): void => {
    void navigator.clipboard?.writeText(message.content).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1_200)
      },
      () => {}
    )
  }

  const compact = chat.compact

  return (
    <article
      id={`msg-${message.id}`}
      className={cn(
        'group relative flex px-3 transition-colors sm:px-4',
        compact ? 'gap-2 py-px' : 'gap-3 py-0.5',
        grouped ? 'mt-0' : compact ? 'mt-1' : 'mt-3',
        'hover:bg-void-light/40',
        // Menção ganha barra e fundo próprios. É a única coisa no chat que
        // precisa ser achada de relance ao voltar pro computador.
        mentionsMe && 'border-l-2 border-burn bg-burn/[0.07] hover:bg-burn/[0.11]',
        message.isPinned && !mentionsMe && 'border-l-2 border-burn/60 bg-burn/[0.04]',
        highlighted && 'animate-[flash_1.2s_ease-out] bg-acid/10'
      )}
    >
      {/* Coluna do avatar (ou hora, quando agrupado) */}
      {!compact && (
        <div className="w-10 shrink-0 pt-0.5">
          {grouped ? (
            <span className="hidden pt-1 text-right font-mono text-[10px] leading-5 text-muted-foreground group-hover:block">
              {formatTime(message.createdAt)}
            </span>
          ) : (
            <span
              onContextMenu={(event) => openUserMenu(event, message.author.id)}
              className="block cursor-default"
            >
              <UserAvatar
                src={resolveAssetUrl(message.author.avatar)}
                name={message.author.displayName}
                ringColor={color}
              />
            </span>
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        {message.replyTo && (
          <button
            type="button"
            onClick={() => onJumpTo?.(message.replyTo!.id)}
            disabled={!onJumpTo}
            title={onJumpTo ? 'Ir pra mensagem' : 'Mensagem antiga demais pra pular'}
            className={cn(
              'mb-0.5 flex w-full items-center gap-1 truncate text-left text-[11px] text-muted-foreground',
              onJumpTo && 'transition-colors hover:text-acid'
            )}
          >
            <CornerUpRight className="h-3 w-3 shrink-0" />
            <span className="font-medium">{message.replyTo.author.displayName}</span>
            <span className="truncate opacity-70">{message.replyTo.content}</span>
          </button>
        )}

        {compact ? (
          // Modo compacto: autor e hora na MESMA linha do texto, igual IRC.
          // Cabe muito mais conversa na tela, que é o ponto.
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span
              title={formatFullDate(message.createdAt)}
              className="shrink-0 font-mono text-[10px] text-muted-foreground"
            >
              {formatTime(message.createdAt)}
            </span>
            <span
              onContextMenu={(event) => openUserMenu(event, message.author.id)}
              className="shrink-0 cursor-default font-display text-xs uppercase tracking-wide hover:underline"
              style={color ? { color } : undefined}
            >
              {message.author.displayName}
            </span>
            <div className="min-w-0 flex-1">
              <MessageBody
                message={message}
                editing={editing}
                draft={draft}
                jumbo={jumbo}
                setDraft={setDraft}
                onCancelEdit={cancelEdit}
                saveEdit={saveEdit}
                onOpenImage={openLightbox}
                links={links}
              />
            </div>
          </div>
        ) : (
          <>
            {!grouped && (
              <p className="flex items-baseline gap-2">
                <span
                  onContextMenu={(event) => openUserMenu(event, message.author.id)}
                  className="cursor-default font-display text-sm leading-tight hover:underline"
                  style={color ? { color } : undefined}
                >
                  {message.author.displayName}
                </span>
                <span
                  title={formatFullDate(message.createdAt)}
                  className="font-mono text-[10px] text-muted-foreground"
                >
                  {formatTime(message.createdAt)}
                </span>
                {message.isPinned && (
                  <span className="flex items-center gap-0.5 font-mono text-[9px] uppercase tracking-widest text-burn">
                    <Pin className="h-2.5 w-2.5" />
                    fixada
                  </span>
                )}
              </p>
            )}

            <MessageBody
              message={message}
              editing={editing}
              draft={draft}
              jumbo={jumbo}
              setDraft={setDraft}
              onCancelEdit={cancelEdit}
              saveEdit={saveEdit}
              onOpenImage={openLightbox}
              links={links}
            />
          </>
        )}

        {groupedReactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {groupedReactions.map(([emoji, info]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => void onReact(message.id, emoji)}
                title={`${info.who.join(', ')} reagiu com ${emoji}`}
                className={cn(
                  'flex items-center gap-1 rounded-brutal border px-1.5 py-0.5 text-xs transition-colors',
                  info.mine
                    ? 'border-acid bg-acid/15 text-acid'
                    : 'border-[#1a1a1a] bg-void-light/60 text-muted-foreground hover:border-acid/50'
                )}
              >
                <span>{emoji}</span>
                <span className="font-mono text-[10px]">{info.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Ações — só aparecem no hover */}
      <div
        className={cn(
          'absolute right-3 top-0 flex items-center gap-0.5 rounded-brutal sm:right-4',
          'border border-[#1a1a1a] bg-void p-0.5 opacity-0 shadow-lg transition-opacity',
          'group-hover:opacity-100 focus-within:opacity-100'
        )}
      >
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" title="Reagir" className={actionClass}>
              <SmilePlus className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-1.5">
            <div className="mb-1 flex gap-0.5 border-b border-[#1a1a1a] pb-1.5">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => void onReact(message.id, emoji)}
                  className="rounded-brutal p-1 text-lg transition-transform hover:scale-125"
                >
                  {emoji}
                </button>
              ))}
            </div>
            {/* O picker completo estava só no compositor: reagir ficava preso
                a oito emojis fixos, que é bem menos do que a galera usa. */}
            <EmojiPicker
              theme={Theme.DARK}
              emojiStyle={EmojiStyle.NATIVE}
              lazyLoadEmojis
              width={300}
              height={320}
              searchPlaceholder="Procurar emoji"
              previewConfig={{ showPreview: false }}
              onEmojiClick={(emoji) => void onReact(message.id, emoji.emoji)}
            />
          </PopoverContent>
        </Popover>

        <button
          type="button"
          title="Responder"
          onClick={() => onReply(message)}
          className={actionClass}
        >
          <Reply className="h-3.5 w-3.5" />
        </button>

        {!!message.content && (
          <button
            type="button"
            title="Copiar texto"
            onClick={copyText}
            className={actionClass}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-acid" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        )}

        {isAdmin && (
          <button
            type="button"
            title={message.isPinned ? 'Desafixar' : 'Fixar'}
            onClick={() => void onPin(message.id)}
            className={actionClass}
          >
            <Pin className={cn('h-3.5 w-3.5', message.isPinned && 'text-burn')} />
          </button>
        )}

        {isMine && (
          <button
            type="button"
            title="Editar"
            onClick={() => onStartEdit?.(message.id)}
            className={actionClass}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}

        {(isMine || isAdmin) && (
          <button
            type="button"
            title="Apagar"
            onClick={() => void onDelete(message.id)}
            className="rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </article>
  )
}

/** Texto + anexo + cartões de link. Igual nos dois modos de exibição. */
function MessageBody({
  message,
  editing,
  draft,
  jumbo,
  setDraft,
  onCancelEdit,
  saveEdit,
  onOpenImage,
  links
}: {
  message: ChatMessage
  editing: boolean
  draft: string
  jumbo: boolean
  setDraft: (value: string) => void
  onCancelEdit: () => void
  saveEdit: () => Promise<void>
  onOpenImage: (url: string) => void
  links: string[]
}) {
  const attachment = resolveAssetUrl(message.imageUrl ?? message.gifUrl)

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        rows={2}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void saveEdit()
          }
          if (e.key === 'Escape') onCancelEdit()
        }}
        onBlur={() => void saveEdit()}
        className="input-terminal mt-1 w-full resize-none rounded-brutal p-2 text-sm"
      />
    )
  }

  return (
    <>
      {message.content && (
        <div className="flex flex-wrap items-baseline">
          <RichText content={message.content} jumbo={jumbo} />
          {message.isEdited && (
            <span className="ml-1.5 shrink-0 font-mono text-[9px] text-muted-foreground">
              (editada)
            </span>
          )}
        </div>
      )}

      {attachment && (
        <button
          type="button"
          onClick={() => onOpenImage(attachment)}
          title="Abrir imagem"
          className="mt-1.5 block w-fit overflow-hidden rounded-brutal border border-[#1a1a1a] transition-colors hover:border-acid/50"
        >
          <img
            src={attachment}
            alt=""
            loading="lazy"
            className="max-h-80 max-w-md object-contain"
          />
        </button>
      )}

      {message.fileUrl && (
        <FileAttachment
          url={message.fileUrl}
          name={message.fileName ?? 'arquivo'}
          size={message.fileSize ?? 0}
        />
      )}

      {links.length > 0 && <LinkEmbeds urls={links} />}
    </>
  )
}

/**
 * Anexo que nao e imagem.
 *
 * O clique abre no NAVEGADOR, nao dentro do app. Duas razoes: o Electron
 * navegaria a propria janela pro arquivo (numa janela sem moldura e sem barra
 * de endereco, sem volta), e baixar arquivo e trabalho do navegador, que ja
 * tem pasta de downloads, barra de progresso e verificacao do sistema.
 */
function FileAttachment({
  url,
  name,
  size
}: {
  url: string
  name: string
  size: number
}) {
  const href = resolveAssetUrl(url)

  return (
    <button
      type="button"
      onClick={() => href && openExternal(href)}
      title={`Baixar ${name}`}
      className="group/file mt-1.5 flex w-fit max-w-sm items-center gap-2.5 rounded-brutal border border-[#1f1f1f] bg-void-light/40 px-3 py-2 text-left transition-colors hover:border-acid/50 hover:bg-void-light/70"
    >
      <FileText className="h-5 w-5 shrink-0 text-acid" />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-foreground">{name}</span>
        <span className="block font-mono text-[10px] text-muted-foreground">
          {formatFileSize(size)}
        </span>
      </span>

      <Download className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover/file:text-acid" />
    </button>
  )
}

function formatFileSize(bytes: number): string {
  if (!bytes) return 'arquivo'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const actionClass =
  'rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-acid'
