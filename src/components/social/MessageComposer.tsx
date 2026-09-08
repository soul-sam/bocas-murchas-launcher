import * as React from 'react'
import { THEME_LABEL } from '../../../electron/preload/types'
import { useSettings } from '@/lib/settings-context'
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
  FileText,
  Settings2
} from 'lucide-react'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverClose
} from '@/components/ui/popover'
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
import { useCargos, type Cargo } from '@/lib/cargos-context'
import { CargoIcon } from '@/lib/cargo-icons'
import { useOverlays } from '@/lib/overlay-context'
import { parseSlashCommand, SLASH_HELP } from '@/lib/slash-commands'
import { useEmojis, toPickerEmojis, type CustomEmoji, type Sticker } from '@/lib/emoji-context'
import { useClips } from '@/lib/clip-context'
import { ComposerActions } from './ComposerActions'
import { EmojiImage } from './CustomEmojiImg'
import { StickerPicker } from './StickerPicker'
import { EmojiManager, type ManagerTab } from './EmojiManager'

/**
 * Um candidato do autocompletar de `@`: pessoa ou cargo.
 *
 * União marcada em vez de um objeto com campos opcionais porque as duas metades
 * não têm nada em comum além de virarem texto — e o que entra no texto é
 * diferente (o `username` da pessoa, o `id` do cargo).
 */
type Suggestion =
  | { kind: 'member'; member: Member }
  | { kind: 'cargo'; cargo: Cargo }

/** O servidor corta bem depois disso; o aviso aparece antes pra não perder texto. */
const SOFT_LIMIT = 1_800

export interface ComposerPayload {
  content: string
  imageUrl?: string
  /** Sticker do servidor (URL relativa /static/stickers/...). */
  stickerUrl?: string
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
  /** Admin: abrir o compositor de drop (anúncio animado). */
  onDrop?: (seed: string) => void
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
  onEditLast,
  onDrop
}: MessageComposerProps) {
  // O seletor de emoji e de terceiros e nao le os tokens: recebe claro/escuro
  // conforme o tema ativo.
  const pickerTheme = THEME_LABEL[useSettings().settings.theme].light ? Theme.LIGHT : Theme.DARK
  const { token, user } = useAuth()
  const { nudgeChannel } = useNudge()
  const { connected: inVoice } = useVoice()
  const { members } = useMembers()
  const { cargos } = useCargos()
  const {
    openPollComposer,
    openEventComposer,
    openPartyComposer,
    openShop,
    openSuggestionComposer,
    openSmokeComposer,
    openWrapped
  } = useOverlays()
  const { emojis } = useEmojis()
  const { capture: captureClip } = useClips()

  const [content, setContent] = React.useState('')
  const [image, setImage] = React.useState<string | null>(null)
  const [file, setFile] = React.useState<UploadedFile | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [dragging, setDragging] = React.useState(false)

  /** Índice do candidato destacado no autocompletar de @. */
  const [mentionIndex, setMentionIndex] = React.useState(0)
  /** Idem, pro autocompletar de :emoji:. */
  const [emojiIndex, setEmojiIndex] = React.useState(0)

  /** Gerenciador de emojis/stickers — abre a partir dos dois pickers. */
  const [managerOpen, setManagerOpen] = React.useState(false)
  const [managerTab, setManagerTab] = React.useState<ManagerTab>('emojis')

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

  /**
   * Sugestões do `@`: CARGOS primeiro, depois pessoas.
   *
   * Cargo em cima e não no fim porque são poucos e é o que ninguém adivinha
   * sozinho — `@impressora-murcha` chama as cinco pessoas que racharam a
   * máquina, e sem aparecer aqui essa sintaxe existiria só pra quem leu o
   * código. Pessoa a galera já sabe que dá pra chamar.
   */
  const suggestions = React.useMemo<Suggestion[]>(() => {
    if (!mentionQuery) return []

    const term = mentionQuery.term

    const cargoHits: Suggestion[] = cargos
      .filter((cargo) => {
        if (!term) return true
        return cargo.id.startsWith(term) || cargo.name.toLowerCase().includes(term)
      })
      .slice(0, 3)
      .map((cargo) => ({ kind: 'cargo', cargo }))

    const memberHits: Suggestion[] = members
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
      .map((member) => ({ kind: 'member', member }))

    return [...cargoHits, ...memberHits].slice(0, 7)
  }, [mentionQuery, members, cargos])

  React.useEffect(() => {
    setMentionIndex(0)
  }, [mentionQuery?.term])

  const applyMention = React.useCallback(
    (choice: Suggestion) => {
      if (!mentionQuery) return

      const el = textareaRef.current
      // Cargo entra pelo ID (que é slug, sem espaço): `@impressora-murcha`. É
      // o que o tokenizador de menção reconhece — nome com espaço quebraria na
      // primeira palavra.
      const handle =
        choice.kind === 'cargo'
          ? choice.cargo.id
          : choice.member.username || choice.member.displayName.split(/\s+/)[0]
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

  /**
   * Autocompletar de :emoji:, nos mesmos moldes do @.
   *
   * Só abre com 2+ letras depois do `:` — com uma, "10:3" já abriria a lista
   * pra qualquer horário digitado. E o `:` tem que estar num começo de
   * palavra, que é também a regra do parser (lib/rich-text.ts): sugerir algo
   * que depois não vira emoji seria mentira.
   */
  const emojiQuery = React.useMemo(() => {
    const upToCaret = content.slice(0, Math.min(caret, content.length))
    const match = /(?:^|[\s([{]):([a-z0-9_]{2,32})$/i.exec(upToCaret)
    if (!match) return null

    return { term: match[1].toLowerCase(), start: upToCaret.length - match[1].length - 1 }
  }, [content, caret])

  const emojiSuggestions = React.useMemo<CustomEmoji[]>(() => {
    if (!emojiQuery) return []

    const term = emojiQuery.term
    return emojis
      .filter((emoji) => emoji.name.includes(term))
      // Quem COMEÇA com o termo primeiro: digitou "ke", quer "kekw" antes de "pokemon".
      .sort(
        (a, b) =>
          Number(b.name.startsWith(term)) - Number(a.name.startsWith(term)) ||
          a.name.localeCompare(b.name)
      )
      .slice(0, 8)
  }, [emojiQuery, emojis])

  React.useEffect(() => {
    setEmojiIndex(0)
  }, [emojiQuery?.term])

  const applyCustomEmoji = React.useCallback(
    (emoji: CustomEmoji) => {
      if (!emojiQuery) return

      const el = textareaRef.current
      const token = ':' + emoji.name + ': '
      const next = content.slice(0, emojiQuery.start) + token + content.slice(caret)
      const position = emojiQuery.start + token.length

      setContent(next)
      setCaret(position)

      requestAnimationFrame(() => {
        autoGrow()
        el?.focus()
        el?.setSelectionRange(position, position)
      })
    },
    [emojiQuery, content, caret, autoGrow]
  )

  /**
   * Insere no CURSOR, não no fim: quem abre o picker no meio de uma frase quer
   * o emoji ali. Com `needsBoundary`, ganha um espaço antes quando está grudado
   * em letra ou número — o parser recusa `kkk:kekw:` de propósito (ver
   * lib/rich-text.ts), então sem o espaço o emoji do servidor viraria texto.
   */
  const insertAtCaret = React.useCallback(
    (text: string, opts?: { needsBoundary?: boolean }) => {
      const el = textareaRef.current
      const position = Math.min(caret, content.length)
      const before = content.slice(0, position)
      const pad = opts?.needsBoundary && /[\p{L}\p{N}]$/u.test(before) ? ' ' : ''
      const inserted = pad + text
      const next = before + inserted + content.slice(position)
      const after = position + inserted.length

      setContent(next)
      setCaret(after)

      requestAnimationFrame(() => {
        autoGrow()
        el?.focus()
        el?.setSelectionRange(after, after)
      })
    },
    [caret, content, autoGrow]
  )

  const pickerCustomEmojis = React.useMemo(() => toPickerEmojis(emojis), [emojis])

  const openManager = (tab: ManagerTab): void => {
    setManagerTab(tab)
    setManagerOpen(true)
  }

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

  /** "/marcar sexta 21h" abre o compositor certo em vez de mandar texto. */
  const runSlashCommand = (text: string): boolean => {
    const command = parseSlashCommand(text)
    if (!command) return false

    switch (command.kind) {
      case 'poll':
        openPollComposer()
        break
      case 'event':
        openEventComposer(command.seed)
        break
      case 'party':
        openPartyComposer(command.seed)
        break
      case 'shop':
        openShop()
        break
      case 'suggestion':
        openSuggestionComposer()
        break
      case 'smoke':
        openSmokeComposer()
        break
      // "/clipe" pega na hora e abre a confirmação, igual ao atalho global.
      case 'clip':
        void captureClip()
        break
      case 'wrapped':
        openWrapped()
        break
      case 'drop':
        if (user?.role !== 'admin' || !onDrop) return false
        onDrop(command.seed)
        break
    }

    setContent('')
    setCaret(0)
    requestAnimationFrame(autoGrow)
    return true
  }

  // Sugestões de comando enquanto a mensagem é só "/algo" (sem espaço ainda).
  const slashQuery = React.useMemo(() => {
    const match = /^\/([\p{L}]*)$/u.exec(content)
    return match ? match[1].toLowerCase() : null
  }, [content])

  const slashSuggestions = React.useMemo(() => {
    if (slashQuery === null || image || file) return []
    return SLASH_HELP.filter((item) => item.command.slice(1).startsWith(slashQuery)).filter(
      (item) => item.command !== '/drop' || user?.role === 'admin'
    )
  }, [slashQuery, image, file, user?.role])

  const submit = async (): Promise<void> => {
    const text = content.trim()
    if ((!text && !image && !file) || sending) return

    if (text && !image && !file && runSlashCommand(text)) return

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

  /**
   * Sticker vai na hora, sem passar pelo campo: é uma mensagem inteira (type
   * 'sticker'), não um pedaço de texto. Responde a quem estava sendo
   * respondido, como qualquer outra mensagem.
   */
  const sendSticker = async (sticker: Sticker): Promise<void> => {
    if (sending) return

    setSending(true)
    setError(null)
    try {
      await onSend({ content: '', stickerUrl: sticker.url, replyToId: replyTo?.id })
      onCancelReply()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar sticker')
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

    // Mesma coisa pra lista de :emoji:. As duas nunca abrem juntas — o fim do
    // texto ou termina em "@algo" ou em ":algo", não nos dois.
    if (emojiSuggestions.length > 0 && emojiQuery) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setEmojiIndex((prev) => (prev + 1) % emojiSuggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setEmojiIndex((prev) => (prev - 1 + emojiSuggestions.length) % emojiSuggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        applyCustomEmoji(emojiSuggestions[emojiIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
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
          <p className="border-b border-line px-2 py-1 text-[11px] text-muted-foreground">
            Cargos e membros — Enter ou Tab pra escolher
          </p>
          {suggestions.map((item, index) => (
            <button
              key={item.kind === 'cargo' ? 'c:' + item.cargo.id : 'm:' + item.member.id}
              type="button"
              // onMouseDown e não onClick: o clique tira o foco do textarea
              // antes de o React processar, e a seleção era perdida no caminho.
              onMouseDown={(event) => {
                event.preventDefault()
                applyMention(item)
              }}
              onMouseEnter={() => setMentionIndex(index)}
              className={cn(
                'flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors',
                index === mentionIndex ? 'bg-acid/15 text-acid' : 'text-foreground'
              )}
            >
              {item.kind === 'cargo' ? (
                <>
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-brutal border"
                    style={{
                      color: item.cargo.color,
                      borderColor: `${item.cargo.color}66`,
                      backgroundColor: `${item.cargo.color}24`
                    }}
                  >
                    <CargoIcon icon={item.cargo.icon} className="h-3 w-3" />
                  </span>
                  <span className="truncate text-sm" style={{ color: item.cargo.color }}>
                    {item.cargo.name}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    cargo
                  </span>
                </>
              ) : (
                <>
                  <UserAvatar
                    src={resolveAssetUrl(item.member.avatar)}
                    name={item.member.displayName}
                    status={item.member.isOnline ? (item.member.status ?? 'online') : 'offline'}
                    className="h-5 w-5"
                  />
                  <span className="truncate text-sm">{item.member.displayName}</span>
                  {item.member.username && (
                    <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                      @{item.member.username}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {emojiSuggestions.length > 0 && emojiQuery && (
        <div className="mb-1 overflow-hidden rounded-brutal border-2 border-acid-dark bg-void shadow-[0_0_30px_rgba(0,0,0,0.6)]">
          <p className="border-b border-line px-2 py-1 text-[11px] text-muted-foreground">
            Emojis do servidor — Enter ou Tab pra escolher
          </p>
          {emojiSuggestions.map((emoji, index) => (
            <button
              key={emoji.id}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault()
                applyCustomEmoji(emoji)
              }}
              onMouseEnter={() => setEmojiIndex(index)}
              className={cn(
                'flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors',
                index === emojiIndex ? 'bg-acid/15 text-acid' : 'text-foreground'
              )}
            >
              <EmojiImage emoji={emoji} className="h-5 w-5 shrink-0" />
              <span className="truncate font-mono text-xs">:{emoji.name}:</span>
            </button>
          ))}
        </div>
      )}

      {slashSuggestions.length > 0 && (
        <div className="mb-1 overflow-hidden rounded-brutal border-2 border-acid-dark bg-void shadow-[0_0_30px_rgba(0,0,0,0.6)]">
          <p className="border-b border-line px-2 py-1 text-[11px] text-muted-foreground">
            Comandos — Enter pra abrir
          </p>
          {slashSuggestions.map((item) => (
            <button
              key={item.command}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault()
                runSlashCommand(item.command)
              }}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-foreground transition-colors hover:bg-acid/15 hover:text-foreground"
            >
              <span className="font-mono text-xs text-foreground">{item.command}</span>
              <span className="truncate text-[11px] text-muted-foreground">{item.hint}</span>
            </button>
          ))}
        </div>
      )}

      {replyTo && (
        <div className="flex items-center gap-2 rounded-t-brutal border-2 border-b-0 border-line bg-void-light/60 px-3 py-1.5">
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
            'relative w-fit border-2 border-b-0 border-line bg-void-light/60 p-2',
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
            'flex w-fit max-w-full items-center gap-2 border-2 border-b-0 border-line bg-void-light/60 px-3 py-2',
            !replyTo && 'rounded-t-brutal'
          )}
        >
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs text-foreground">{file.fileName}</span>
            <span className="block font-mono text-[11.5px] text-muted-foreground">
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
          'flex items-end gap-1 border-2 bg-depth-2 px-2 py-1.5 transition-colors',
          dragging
            ? 'border-acid bg-acid/5'
            : 'border-line focus-within:border-acid/60',
          replyTo || hasAttachment ? 'rounded-b-brutal' : 'rounded-brutal'
        )}
      >
        <ComposerActions onDrop={onDrop ? () => onDrop('') : undefined} />

        <label
          title="Enviar imagem"
          className="shrink-0 cursor-pointer rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
          className="hidden shrink-0 cursor-pointer rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:block"
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
              'shrink-0 self-center font-mono text-[11.5px]',
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
              className="hidden shrink-0 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:block"
            >
              <Type className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-2">
            <p className="mb-1.5 text-[11.5px] text-muted-foreground">
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
            <p className="mt-2 border-t border-line pt-1.5 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
              &gt; citação · ```bloco``` · @pessoa · #canal
            </p>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Emoji"
              className="shrink-0 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Smile className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto overflow-hidden border-0 p-0">
            <EmojiPicker
              theme={pickerTheme}
              emojiStyle={EmojiStyle.NATIVE}
              lazyLoadEmojis
              width={320}
              height={380}
              searchPlaceholder="Procurar emoji"
              customEmojis={pickerCustomEmojis}
              onEmojiClick={(emoji) => {
                // Emoji do servidor entra como `:nome:` — é o que o parser lê.
                if (emoji.isCustom) {
                  insertAtCaret(':' + emoji.names[0] + ':', { needsBoundary: true })
                } else {
                  insertAtCaret(emoji.emoji)
                }
              }}
            />
            <div className="flex items-center justify-between gap-2 border-t border-line bg-void px-3 py-1.5">
              <span className="truncate text-[11px] text-muted-foreground">
                digitar :nome: também vale
              </span>
              <PopoverClose asChild>
                <button
                  type="button"
                  onClick={() => openManager('emojis')}
                  className="flex shrink-0 items-center gap-1 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Settings2 className="h-3 w-3" />
                  gerenciar
                </button>
              </PopoverClose>
            </div>
          </PopoverContent>
        </Popover>

        <StickerPicker
          onPick={sendSticker}
          onManage={() => openManager('stickers')}
          disabled={sending}
        />

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

      <EmojiManager
        open={managerOpen}
        initialTab={managerTab}
        onClose={() => setManagerOpen(false)}
      />
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
      className="rounded-brutal border border-line px-2 py-1 text-left transition-colors hover:border-acid/50 hover:text-foreground"
    >
      <span className="block text-[11px]">{label}</span>
      <span className="block font-mono text-[11px] text-muted-foreground">{hint}</span>
    </button>
  )
}
