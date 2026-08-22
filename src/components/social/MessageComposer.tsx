import * as React from 'react'
import EmojiPicker, { Theme, EmojiStyle } from 'emoji-picker-react'
import { Send, Smile, ImagePlus, X, Loader2, Zap } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { uploads as uploadsApi, resolveAssetUrl, type ChatMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useNudge } from '@/lib/nudge-context'
import { useVoice } from '@/lib/voice-context'

interface MessageComposerProps {
  channelName: string
  replyTo: ChatMessage | null
  onCancelReply: () => void
  onSend: (payload: { content: string; imageUrl?: string; replyToId?: string }) => Promise<void>
  onTyping: () => void
}

export function MessageComposer({
  channelName,
  replyTo,
  onCancelReply,
  onSend,
  onTyping
}: MessageComposerProps) {
  const { token } = useAuth()
  const { nudgeChannel } = useNudge()
  const { connected: inVoice } = useVoice()

  const [content, setContent] = React.useState('')
  const [attachment, setAttachment] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  // Responder deve levar o cursor pro campo direto.
  React.useEffect(() => {
    if (replyTo) textareaRef.current?.focus()
  }, [replyTo])

  const autoGrow = React.useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 180) + 'px'
  }, [])

  const uploadImage = React.useCallback(
    async (file: File) => {
      if (!token) return
      setUploading(true)
      setError(null)
      try {
        const { url } = await uploadsApi.image(token, 'image', file)
        setAttachment(url)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao subir imagem')
      } finally {
        setUploading(false)
      }
    },
    [token]
  )

  // Colar print direto no chat é o caminho mais usado — vale suportar.
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'))
    if (!file) return
    e.preventDefault()
    void uploadImage(file)
  }

  const submit = async (): Promise<void> => {
    const text = content.trim()
    if ((!text && !attachment) || sending) return

    setSending(true)
    setError(null)
    try {
      await onSend({
        content: text,
        imageUrl: attachment ?? undefined,
        replyToId: replyTo?.id
      })
      setContent('')
      setAttachment(null)
      onCancelReply()
      requestAnimationFrame(autoGrow)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="shrink-0 px-4 pb-4 pt-1">
      {replyTo && (
        <div className="flex items-center gap-2 rounded-t-brutal border-2 border-b-0 border-[#1a1a1a] bg-void-light/60 px-3 py-1.5">
          <span className="truncate text-[11px] text-muted-foreground">
            Respondendo a{' '}
            <span className="font-medium text-foreground">
              {replyTo.author.displayName}
            </span>
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            className="ml-auto shrink-0 rounded-brutal p-0.5 text-muted-foreground transition-colors hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {attachment && (
        <div
          className={cn(
            'relative w-fit border-2 border-b-0 border-[#1a1a1a] bg-void-light/60 p-2',
            !replyTo && 'rounded-t-brutal'
          )}
        >
          <img
            src={resolveAssetUrl(attachment)}
            alt=""
            className="max-h-28 rounded-brutal object-contain"
          />
          <button
            type="button"
            onClick={() => setAttachment(null)}
            className="absolute right-1 top-1 rounded-brutal bg-void/90 p-1 text-muted-foreground transition-colors hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div
        className={cn(
          'flex items-end gap-1 border-2 border-[#1a1a1a] bg-void px-2 py-1.5',
          'transition-colors focus-within:border-acid/60',
          replyTo || attachment ? 'rounded-b-brutal' : 'rounded-brutal'
        )}
      >
        <label
          title="Enviar imagem"
          className="shrink-0 cursor-pointer rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-acid"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="h-4 w-4" />
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void uploadImage(file)
              e.target.value = ''
            }}
          />
        </label>

        <textarea
          ref={textareaRef}
          value={content}
          rows={1}
          placeholder={`Mandar mensagem em #${channelName}`}
          onChange={(e) => {
            setContent(e.target.value)
            autoGrow()
            onTyping()
          }}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
          }}
          className="max-h-44 min-h-[1.75rem] flex-1 resize-none bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Emoji"
              className="shrink-0 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-acid"
            >
              <Smile className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto border-0 p-0">
            <EmojiPicker
              theme={Theme.DARK}
              emojiStyle={EmojiStyle.NATIVE}
              lazyLoadEmojis
              width={320}
              height={380}
              searchPlaceholder="Procurar emoji"
              onEmojiClick={(emoji) => {
                setContent((prev) => prev + emoji.emoji)
                textareaRef.current?.focus()
              }}
            />
          </PopoverContent>
        </Popover>

        {inVoice && (
          <button
            type="button"
            title="Tremer a tela de todo mundo da call (1x por minuto)"
            onClick={nudgeChannel}
            className="shrink-0 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-burn"
          >
            <Zap className="h-4 w-4" />
          </button>
        )}

        <button
          type="button"
          title="Enviar"
          onClick={() => void submit()}
          disabled={(!content.trim() && !attachment) || sending}
          className={cn(
            'shrink-0 rounded-brutal p-1.5 transition-colors',
            content.trim() || attachment
              ? 'text-acid hover:bg-acid/15'
              : 'text-muted-foreground'
          )}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  )
}
