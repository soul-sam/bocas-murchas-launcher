import * as React from 'react'
import { Reply, SmilePlus, Pencil, Trash2, Pin, CornerUpRight } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { resolveAssetUrl, type ChatMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'

const QUICK_EMOJIS = ['😂', '💀', '🔥', '👍', '❤️', '😭', '🤡', '🍀']

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

interface MessageItemProps {
  message: ChatMessage
  /** Mensagem seguida do mesmo autor: esconde avatar e cabeçalho. */
  grouped: boolean
  onReply: (message: ChatMessage) => void
  onEdit: (messageId: string, content: string) => Promise<void>
  onDelete: (messageId: string) => Promise<void>
  onReact: (messageId: string, emoji: string) => Promise<void>
  onPin: (messageId: string) => Promise<void>
}

export function MessageItem({
  message,
  grouped,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onPin
}: MessageItemProps) {
  const { user } = useAuth()
  const { byId } = useMembers()
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(message.content)

  const isMine = message.author.id === user?.id
  const isAdmin = user?.role === 'admin'
  const author = byId[message.author.id]
  const color = author?.profileColor ?? undefined

  // Reações vêm como uma linha por pessoa; a UI mostra por emoji.
  const groupedReactions = React.useMemo(() => {
    const counts = new Map<string, { count: number; mine: boolean }>()
    for (const reaction of message.reactions ?? []) {
      const current = counts.get(reaction.emoji) ?? { count: 0, mine: false }
      counts.set(reaction.emoji, {
        count: current.count + 1,
        mine: current.mine || reaction.userId === user?.id
      })
    }
    return Array.from(counts.entries())
  }, [message.reactions, user?.id])

  const saveEdit = async (): Promise<void> => {
    const next = draft.trim()
    setEditing(false)
    if (!next || next === message.content) return
    await onEdit(message.id, next)
  }

  return (
    <article
      className={cn(
        'group relative flex gap-3 px-4 py-0.5 transition-colors hover:bg-void-light/40',
        grouped ? 'mt-0' : 'mt-3',
        message.isPinned && 'border-l-2 border-burn bg-burn/5'
      )}
    >
      {/* Coluna do avatar (ou hora, quando agrupado) */}
      <div className="w-10 shrink-0 pt-0.5">
        {grouped ? (
          <span className="hidden pt-1 text-right font-mono text-[10px] leading-5 text-muted-foreground group-hover:block">
            {formatTime(message.createdAt)}
          </span>
        ) : (
          <UserAvatar
            src={resolveAssetUrl(message.author.avatar)}
            name={message.author.displayName}
            ringColor={color}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {message.replyTo && (
          <p className="mb-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <CornerUpRight className="h-3 w-3 shrink-0" />
            <span className="font-medium">{message.replyTo.author.displayName}</span>
            <span className="truncate opacity-70">{message.replyTo.content}</span>
          </p>
        )}

        {!grouped && (
          <p className="flex items-baseline gap-2">
            <span
              className="font-display text-sm leading-tight"
              style={color ? { color } : undefined}
            >
              {message.author.displayName}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
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

        {editing ? (
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
              if (e.key === 'Escape') {
                setDraft(message.content)
                setEditing(false)
              }
            }}
            onBlur={() => void saveEdit()}
            className="input-terminal mt-1 w-full resize-none rounded-brutal p-2 text-sm"
          />
        ) : (
          message.content && (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {message.content}
              {message.isEdited && (
                <span className="ml-1.5 font-mono text-[9px] text-muted-foreground">
                  (editada)
                </span>
              )}
            </p>
          )
        )}

        {(message.imageUrl || message.gifUrl) && (
          <img
            src={resolveAssetUrl(message.imageUrl ?? message.gifUrl)}
            alt=""
            loading="lazy"
            className="mt-1.5 max-h-80 max-w-md rounded-brutal border border-[#1a1a1a] object-contain"
          />
        )}

        {groupedReactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {groupedReactions.map(([emoji, info]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => void onReact(message.id, emoji)}
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
          'absolute right-4 top-0 flex items-center gap-0.5 rounded-brutal',
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
            <div className="flex gap-0.5">
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
            onClick={() => {
              setDraft(message.content)
              setEditing(true)
            }}
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

const actionClass =
  'rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-acid'
