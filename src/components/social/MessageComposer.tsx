import * as React from 'react'
import EmojiPicker, { Theme, EmojiStyle } from 'emoji-picker-react'
import {
  Send,
  Smile,
  ImagePlus,
  Paperclip,
  X,
  Loader2,
  Zap,
  Type,
  FileText
} from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { UserAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import {
  uploads as uploadsApi,
  resolveAssetUrl,
  type ChatMessage,
  type UploadedFile
} from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useNudge } from '@/lib/nudge-context'
import { useVoice } from '@/lib/voice-context'
import { useMembers, type Member } from '@/lib/members-context'

/** O servidor corta bem depois disso; o aviso aparece antes pra não perder texto. */
const SOFT_LIMIT = 1_800

export interface ComposerPayload {
  content: string
  imageUrl?: string
  file?: { url: string; name: string; size: number; mime: string }
  replyToId?: string
}

interface MessageComposerProps {
  /** Rótulo do campo: "#geral" num canal, o nome da pessoa numa conversa. */
  placeholderTarget: string
  replyTo: ChatMessage | null
  onCancelReply: () => void
  onSend: (payload: ComposerPayload) => Promise<void>
  onTyping: () => void
  /** Seta pra cima com o campo vazio edita a última mensagem sua. */
  onEditLast?: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export function MessageComposer({
  placeholderTarget,
  replyTo,
  onCancelReply,
  onSend,
  onTyping,
  onEditLast
}: MessageComposerProps) {
  const { token } = useAuth()
  const { nudgeChannel } = useNudge()
  const { connected: inVoice } = useVoice()
  const { members } = useMembers()

  const [content, setContent] = React.useState('')
  const [image, setImage] = React.useState<string | null>(null)
  const [file, setFile] = React.useState<UploadedFile | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [dragging, setDragging] = React.useState(false)

  /** Índice do candidato destacado no autocompletar de @. */
  const [mentionIndex, setMentionIndex] = React.useState(0)

  /**
   * Posição do cursor, em ESTADO — não lida do DOM na hora do render.
   *
   * Ler `selectionStart` durante o render deixava a lista de menções aberta
   * depois de escolher alguém: no quadro em que o texto já virou "@fulano ", o
   * cursor do DOM ainda estava onde estava antes, o "@fulano" voltava a casar
   * e a lista reaparecia. Como mover o cursor não re-renderiza nada, ela ficava
   * lá até a tecla seguinte.
   */
  const [caret, setCaret] = React.useState(0)

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

  /**
   * Autocompletar de @.
   *
   * Só vale o pedaço ANTES do cursor: escrever no meio de uma frase não pode
   * ressuscitar uma menção que já foi digitada lá atrás. E o `@` tem que estar
   * grudado num começo de palavra, senão um email vira sugestão de gente.
   */
  const mentionQuery = React.useMemo(() => {
    const upToCaret = content.slice(0, Math.min(caret, content.length))
    const match = /(?:^|[\s([{])@([\p{L}\p{N}_.-]*)$/u.exec(upToCaret)
    if (!match) return null

    return { term: match[1].toLowerCase(), start: upToCaret.length - match[1].length - 1 }
  }, [content, caret])

  const suggestions = React.useMemo<Member[]>(() => {
    if (!mentionQuery) return []

    const term = mentionQuery.term
    return members
      .filter((member) => {
        if (!term) return true
        return (
          member.username?.toLowerCase().startsWith(term) ||
          member.displayName.toLowerCase().includes(term)
        )
      })
      // Quem está online primeiro: é com quem você provavelmente está falando.
      .sort((a, b) => Number(b.isOnline) - Number(a.isOnline))
      .slice(0, 6)
  }, [mentionQuery, members])

  React.useEffect(() => {
    setMentionIndex(0)
  }, [mentionQuery?.term])

  const applyMention = React.useCallback(
    (member: Member) => {
      if (!mentionQuery) return

      const el = textareaRef.current
      const handle = member.username || member.displayName.split(/\s+/)[0]
      const next =
        content.slice(0, mentionQuery.start) + '@' + handle + ' ' + content.slice(caret)
      const position = mentionQuery.start + handle.length + 2

      setContent(next)
      // O cursor vai junto, no mesmo lote: é isso que fecha a lista na hora.
      setCaret(position)

      requestAnimationFrame(() => {
        autoGrow()
        el?.focus()
        el?.setSelectionRange(position, position)
      })
    },
    [mentionQuery, content, caret, autoGrow]
  )

  const uploadImage = React.useCallback(
    async (picked: File) => {
      if (!token) return
      setUploading(true)
      setError(null)
      try {
        const { url } = await uploadsApi.image(token, 'image', picked)
        setImage(url)
        // Uma coisa por mensagem: imagem e anexo juntos deixariam a mensagem
        // com dois blocos e o servidor só guarda um tipo por mensagem.
        setFile(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao subir imagem')
      } finally {
        setUploading(false)
      }
    },
    [token]
  )

  const uploadFile = React.useCallback(
    async (picked: File) => {
      if (!token) return
      setUploading(true)
      setError(null)
      try {
        const uploaded = await uploadsApi.file(token, picked)
        setFile(uploaded)
        setImage(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao subir arquivo')
      } finally {
        setUploading(false)
      }
    },
    [token]
  )

  /** Imagem vira preview; o resto vira anexo. */
  const acceptDropped = React.useCallback(
    (picked: File) => {
      if (picked.type.startsWith('image/')) void uploadImage(picked)
      else void uploadFile(picked)
    },
    [uploadImage, uploadFile]
  )

  // Colar print direto no chat é o caminho mais usado — vale suportar.
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    const picked = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'))
    if (!picked) return
    e.preventDefault()
    void uploadImage(picked)
  }

  const submit = async (): Promise<void> => {
    const text = content.trim()
    if ((!text && !image && !file) || sending) return

    setSending(true)
    setError(null)
    try {
      await onSend({
        content: text,
        imageUrl: image ?? undefined,
        file: file
          ? { url: file.url, name: file.fileName, size: file.sizeBytes, mime: file.mimeType }
          : undefined,
        replyToId: replyTo?.id
      })
      setContent('')
      setCaret(0)
      setImage(null)
      setFile(null)
      onCancelReply()
      requestAnimationFrame(autoGrow)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar')
    } finally {
      setSending(false)
    }
  }

  /** Envolve a seleção com um marcador (**negrito**, ||spoiler||…). */
  const wrapSelection = (marker: string): void => {
    const el = textareaRef.current
    if (!el) return

    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const selected = content.slice(start, end) || 'texto'
    const next = content.slice(0, start) + marker + selected + marker + content.slice(end)

    setContent(next)
    setCaret(start + marker.length + selected.length)
    requestAnimationFrame(() => {
      autoGrow()
      el.focus()
      el.setSelectionRange(start + marker.length, start + marker.length + selected.length)
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // A lista de menções come as setas e o Enter enquanto está aberta.
    if (suggestions.length > 0 && mentionQuery) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((prev) => (prev + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        applyMention(suggestions[mentionIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        // Fecha a lista sem mexer no texto: levar o cursor pro fim tira o
        // "@algo" de baixo dele, que é o que mantinha a lista aberta.
        setCaret(content.length)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
      return
    }

    if (e.key === 'Escape' && replyTo) {
      e.preventDefault()
      onCancelReply()
      return
    }

    // Campo vazio + seta pra cima = editar a última mensagem sua. Atalho do
    // Discord que todo mundo tenta sem pensar.
    if (e.key === 'ArrowUp' && !content && onEditLast) {
      e.preventDefault()
      onEditLast()
    }
  }

  const remaining = SOFT_LIMIT - content.length
  const hasAttachment = !!image || !!file

  return (
    <div
      className="shrink-0 px-3 pb-4 pt-1 sm:px-4"
      onDragOver={(event) => {
        // Sem cancelar o padrão o Electron ABRE o arquivo largado, trocando a
        // página do app pelo arquivo — e sem barra de endereço não há volta.
        event.preventDefault()
        if (event.dataTransfer.types.includes('Files')) setDragging(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return
        setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const picked = event.dataTransfer.files[0]
        if (picked) acceptDropped(picked)
      }}
    >
      {suggestions.length > 0 && mentionQuery && (
        <div className="mb-1 overflow-hidden rounded-brutal border-2 border-acid-dark bg-void shadow-[0_0_30px_rgba(0,0,0,0.6)]">
          <p className="border-b border-[#1a1a1a] px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            Membros — Enter ou Tab pra escolher
          </p>
          {suggestions.map((member, index) => (
            <button
              key={member.id}
              type="button"
              // onMouseDown e não onClick: o clique tira o foco do textarea
              // antes de o React processar, e a seleção era perdida no caminho.
              onMouseDown={(event) => {
                event.preventDefault()
                applyMention(member)
              }}
              onMouseEnter={() => setMentionIndex(index)}
              className={cn(
                'flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors',
                index === mentionIndex ? 'bg-acid/15 text-acid' : 'text-foreground'
              )}
            >
              <UserAvatar
                src={resolveAssetUrl(member.avatar)}
                name={member.displayName}
                status={member.isOnline ? (member.status ?? 'online') : 'offline'}
                className="h-5 w-5"
              />
              <span className="truncate text-sm">{member.displayName}</span>
              {member.username && (
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  @{member.username}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

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
            title="Cancelar resposta (Esc)"
            className="ml-auto shrink-0 rounded-brutal p-0.5 text-muted-foreground transition-colors hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {image && (
        <div
          className={cn(
            'relative w-fit border-2 border-b-0 border-[#1a1a1a] bg-void-light/60 p-2',
            !replyTo && 'rounded-t-brutal'
          )}
        >
          <img
            src={resolveAssetUrl(image)}
            alt=""
            className="max-h-28 rounded-brutal object-contain"
          />
          <button
            type="button"
            onClick={() => setImage(null)}
            title="Tirar a imagem"
            className="absolute right-1 top-1 rounded-brutal bg-void/90 p-1 text-muted-foreground transition-colors hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {file && (
        <div
          className={cn(
            'flex w-fit max-w-full items-center gap-2 border-2 border-b-0 border-[#1a1a1a] bg-void-light/60 px-3 py-2',
            !replyTo && 'rounded-t-brutal'
          )}
        >
          <FileText className="h-4 w-4 shrink-0 text-acid" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs text-foreground">{file.fileName}</span>
            <span className="block font-mono text-[10px] text-muted-foreground">
              {formatSize(file.sizeBytes)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setFile(null)}
            title="Tirar o anexo"
            className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div
        className={cn(
          'flex items-end gap-1 border-2 bg-void px-2 py-1.5 transition-colors',
          dragging
            ? 'border-acid bg-acid/5'
            : 'border-[#1a1a1a] focus-within:border-acid/60',
          replyTo || hasAttachment ? 'rounded-b-brutal' : 'rounded-brutal'
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
              const picked = e.target.files?.[0]
              if (picked) void uploadImage(picked)
              e.target.value = ''
            }}
          />
        </label>

        <label
          title="Anexar arquivo (até 50 MB)"
          className="hidden shrink-0 cursor-pointer rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-acid sm:block"
        >
          <Paperclip className="h-4 w-4" />
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0]
              if (picked) void uploadFile(picked)
              e.target.value = ''
            }}
          />
        </label>

        <textarea
          ref={textareaRef}
          value={content}
          rows={1}
          placeholder={
            dragging ? 'Solta aqui que eu mando' : `Mandar mensagem em ${placeholderTarget}`
          }
          onChange={(e) => {
            setContent(e.target.value)
            setCaret(e.target.selectionStart ?? e.target.value.length)
            autoGrow()
            onTyping()
          }}
          // Clique e setas também movem o cursor. Sem sincronizar aqui,
          // escrever "@" no meio de uma frase antiga não abriria a lista.
          onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          className="max-h-44 min-h-[1.75rem] flex-1 resize-none bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />

        {remaining < 200 && (
          <span
            className={cn(
              'shrink-0 self-center font-mono text-[10px]',
              remaining < 0 ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {remaining}
          </span>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Formatação"
              className="hidden shrink-0 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-acid sm:block"
            >
              <Type className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-2">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Formatação
            </p>
            <div className="grid grid-cols-2 gap-1">
              <FormatButton label="Negrito" hint="**texto**" onClick={() => wrapSelection('**')} />
              <FormatButton label="Itálico" hint="*texto*" onClick={() => wrapSelection('*')} />
              <FormatButton label="Sublinhado" hint="__texto__" onClick={() => wrapSelection('__')} />
              <FormatButton label="Riscado" hint="~~texto~~" onClick={() => wrapSelection('~~')} />
              <FormatButton label="Spoiler" hint="||texto||" onClick={() => wrapSelection('||')} />
              <FormatButton label="Código" hint="`texto`" onClick={() => wrapSelection('`')} />
            </div>
            <p className="mt-2 border-t border-[#1a1a1a] pt-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
              &gt; citação · ```bloco``` · @pessoa · #canal
            </p>
          </PopoverContent>
        </Popover>

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
                const next = content + emoji.emoji
                setContent(next)
                setCaret(next.length)
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
          disabled={(!content.trim() && !hasAttachment) || sending}
          className={cn(
            'shrink-0 rounded-brutal p-1.5 transition-colors',
            content.trim() || hasAttachment
              ? 'text-acid hover:bg-acid/15'
              : 'text-muted-foreground'
          )}
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>

      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  )
}

function FormatButton({
  label,
  hint,
  onClick
}: {
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="rounded-brutal border border-[#1a1a1a] px-2 py-1 text-left transition-colors hover:border-acid/50 hover:text-acid"
    >
      <span className="block text-[11px]">{label}</span>
      <span className="block font-mono text-[9px] text-muted-foreground">{hint}</span>
    </button>
  )
}
