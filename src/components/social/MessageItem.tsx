import * as React from 'react'
import { THEME_LABEL } from '../../../electron/preload/types'
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
import { Hint } from '@/components/ui/tooltip'
import { resolveAssetUrl, type ChatMessage } from '@/lib/api'
import { formatBytes, isPlayableVideo } from '@/lib/attachments'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { useOverlays } from '@/lib/overlay-context'
import { useSettings } from '@/lib/settings-context'
import { collectLinks, isEmojiOnly, openExternal, parseBlocks } from '@/lib/rich-text'
import { RichText, useMentionsMe } from './RichText'
import { LinkEmbeds } from './LinkEmbed'
import { MessageCard, hasCard } from '@/components/cards'
import { AuthorName } from './AuthorName'
import { BotBadge } from './BotBadge'
import { useEmojis, toPickerEmojis } from '@/lib/emoji-context'
import { CustomEmojiImg } from './CustomEmojiImg'
import { TipButton, TipChip, canTip } from './TipPopover'
import { toqueLongo } from '@/lib/toque-longo'
import { usePonteiroGrosso } from '@/lib/use-ponteiro-grosso'

const QUICK_EMOJIS = ['😂', '💀', '🔥', '👍', '❤️', '😭']

/** Reação com emoji do servidor é guardada como `:nome:`, igual no texto. */
const CUSTOM_REACTION = /^:([a-z0-9_]+):$/

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
  /**
   * Gorjeta paga. O ChatView reescreve as gorjetas da mensagem na lista.
   *
   * Vem de fora e não é resolvido aqui porque a lista de mensagens é do
   * chat-context: um `setState` local ficaria por baixo do próximo retrato
   * vindo do socket e a gorjeta piscaria pra fora da tela.
   */
  onTipped?: (messageId: string, tips: ChatMessage['tips']) => void
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
  onTipped,
  onJumpTo
}: MessageItemProps) {
  const { user } = useAuth()
  const { byId } = useMembers()
  const { openUserMenu, openLightbox } = useOverlays()
  const { settings } = useSettings()
  // Seletor de emoji e de terceiros: recebe claro/escuro conforme o tema.
  const pickerTheme = THEME_LABEL[settings.theme].light ? Theme.LIGHT : Theme.DARK
  const { emojis, byName } = useEmojis()
  const [draft, setDraft] = React.useState(message.content)
  const [copied, setCopied] = React.useState(false)
  const ponteiroGrosso = usePonteiroGrosso()
  /** No dedo, a barra de ações desta mensagem está aberta. */
  const [acoesNoToque, setAcoesNoToque] = React.useState(false)

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
  // Emoji do servidor só conta pro tamanhão se EXISTIR: `:zzz:` desconhecido
  // vira texto no render, e texto em 2.4rem ficaria ridículo.
  const jumbo = React.useMemo(
    () =>
      !message.imageUrl &&
      !message.gifUrl &&
      isEmojiOnly(message.content, (name) => byName.has(name)),
    [message.content, message.imageUrl, message.gifUrl, byName]
  )

  const pickerCustomEmojis = React.useMemo(() => toPickerEmojis(emojis), [emojis])

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
      /**
       * NO DEDO, UM TOQUE NA MENSAGEM ABRE AS AÇÕES.
       *
       * Responder, reagir, fixar, editar e apagar moravam só no `hover`. Sem
       * mouse não havia hover — e, portanto, não havia nenhuma dessas coisas:
       * a conversa no celular era só de leitura.
       *
       * O toque não pode engolir o que já tinha dono: link, botão, imagem e
       * texto sendo selecionado continuam fazendo o que faziam. Só o "vazio"
       * da mensagem alterna a barra.
       */
      onClick={
        ponteiroGrosso
          ? (evento) => {
              const alvo = evento.target as HTMLElement
              if (alvo.closest('a, button, input, textarea, [role="button"]')) return
              if (window.getSelection()?.toString()) return
              setAcoesNoToque((aberto) => !aberto)
            }
          : undefined
      }
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
            <span className="hidden pt-1 text-right font-mono text-[11.5px] leading-5 text-muted-foreground group-hover:block">
              {formatTime(message.createdAt)}
            </span>
          ) : (
            <span
              onContextMenu={(event) => openUserMenu(event, message.author.id)}
              {...toqueLongo((event) => openUserMenu(event, message.author.id))}
              className="block cursor-default"
            >
              <UserAvatar
                userId={message.author.id}
                src={resolveAssetUrl(message.author.avatar)}
                name={message.author.displayName}
                ringColor={color}
              />
            </span>
          )}
        </div>
      )}

      {/* max-w-[72ch]: em monitor largo a linha ia ate a borda e a leitura
          cansava tanto quanto o neon. O bloco continua ocupando a largura
          (flex-1) pra que hover/reacoes nao mudem de lugar; so o texto para. */}
      <div className="min-w-0 max-w-[72ch] flex-1">
        {message.replyTo && (
          <button
            type="button"
            onClick={() => onJumpTo?.(message.replyTo!.id)}
            disabled={!onJumpTo}
            title={onJumpTo ? 'Ir pra mensagem' : 'Mensagem antiga demais pra pular'}
            className={cn(
              'mb-0.5 flex w-full items-center gap-1 truncate text-left text-[11px] text-muted-foreground',
              onJumpTo && 'transition-colors hover:text-foreground'
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
              className="shrink-0 font-mono text-[11.5px] text-muted-foreground"
            >
              {formatTime(message.createdAt)}
            </span>
            <AuthorName
              userId={message.author.id}
              displayName={message.author.displayName}
              color={color}
              onContextMenu={(event) => openUserMenu(event, message.author.id)}
              {...toqueLongo((event) => openUserMenu(event, message.author.id))}
              className="shrink-0 cursor-default font-display text-xs uppercase tracking-wide hover:underline"
            />
            {message.author.role === 'bot' && <BotBadge />}
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
                <AuthorName
                  userId={message.author.id}
                  displayName={message.author.displayName}
                  color={color}
                  onContextMenu={(event) => openUserMenu(event, message.author.id)}
                  {...toqueLongo((event) => openUserMenu(event, message.author.id))}
                  className="cursor-default font-display text-sm leading-tight hover:underline"
                />
                {message.author.role === 'bot' && <BotBadge className="self-center" />}
                <span
                  title={formatFullDate(message.createdAt)}
                  className="font-mono text-[11.5px] text-muted-foreground"
                >
                  {formatTime(message.createdAt)}
                </span>
                {message.isPinned && (
                  <span className="flex items-center gap-0.5 text-[11px] text-burn">
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

        {(groupedReactions.length > 0 || (message.tips?.length ?? 0) > 0) && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <TipChip tips={message.tips} />
            {groupedReactions.map(([emoji, info]) => (
              // Quinze pessoas numa reação viravam uma tira de 700px no title
              // nativo. Na dica a lista quebra em linhas e caber é problema
              // dela, não da tela.
              <Hint
                key={emoji}
                label={info.mine ? 'Você reagiu — clique pra tirar' : 'Reagir também'}
                description={info.who.join(', ')}
                side="top"
              >
              <button
                type="button"
                onClick={() => void onReact(message.id, emoji)}
                className={cn(
                  'flex items-center gap-1 rounded-brutal border px-1.5 py-0.5 text-xs transition-colors',
                  info.mine
                    ? 'border-acid bg-acid/15 text-acid'
                    : 'border-line bg-void-light/60 text-muted-foreground hover:border-acid/50'
                )}
              >
                {CUSTOM_REACTION.test(emoji) && byName.has(emoji.slice(1, -1)) ? (
                  <CustomEmojiImg name={emoji.slice(1, -1)} className="h-4 w-4" />
                ) : (
                  <span>{emoji}</span>
                )}
                <span className="font-mono text-[11.5px]">{info.count}</span>
              </button>
              </Hint>
            ))}
          </div>
        )}
      </div>

      {/* Ações — no mouse aparecem no hover; no dedo, com um toque na
          mensagem (ver o onClick do <article> acima). */}
      <div
        className={cn(
          'absolute right-3 top-0 flex items-center gap-0.5 rounded-brutal sm:right-4',
          'border border-line bg-void p-0.5 opacity-0 shadow-lg transition-opacity',
          'group-hover:opacity-100 focus-within:opacity-100',
          acoesNoToque && 'opacity-100',
          // No dedo o alvo cresce: 28px de ícone é onde o toque erra.
          ponteiroGrosso && '[&_button]:min-h-11 [&_button]:min-w-11 [&_button]:justify-center'
        )}
      >
        <Popover>
          <PopoverTrigger asChild>
            <Hint label="Reagir" side="top">
              <button type="button" aria-label="Reagir" className={actionClass}>
                <SmilePlus className="h-3.5 w-3.5" />
              </button>
            </Hint>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-1.5">
            <div className="mb-1 flex gap-0.5 border-b border-line pb-1.5">
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
                a oito emojis fixos, que é bem menos do que a galera usa.
                Emoji do servidor reage como `:nome:` — a mesma string do
                texto, então o chip desenha com o mesmo componente. */}
            <EmojiPicker
              theme={pickerTheme}
              emojiStyle={EmojiStyle.NATIVE}
              lazyLoadEmojis
              width={300}
              height={320}
              searchPlaceholder="Procurar emoji"
              previewConfig={{ showPreview: false }}
              customEmojis={pickerCustomEmojis}
              onEmojiClick={(emoji) =>
                void onReact(
                  message.id,
                  emoji.isCustom ? ':' + emoji.names[0] + ':' : emoji.emoji
                )
              }
            />
          </PopoverContent>
        </Popover>

        {canTip(message, user?.id) && onTipped && (
          <TipButton
            message={message}
            onTipped={(tips) => onTipped(message.id, tips)}
            className={actionClass}
          />
        )}

        <Hint label="Responder" side="top">
          <button
            type="button"
            aria-label="Responder"
            onClick={() => onReply(message)}
            className={actionClass}
          >
            <Reply className="h-3.5 w-3.5" />
          </button>
        </Hint>

        {!!message.content && (
          <Hint label={copied ? 'Copiado' : 'Copiar texto'} side="top">
            <button
              type="button"
              aria-label="Copiar texto"
              onClick={copyText}
              className={actionClass}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-acid" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </Hint>
        )}

        {isAdmin && (
          <Hint
            label={message.isPinned ? 'Desafixar' : 'Fixar'}
            description={
              message.isPinned
                ? undefined
                : 'Guarda no painel de fixadas deste canal, pra não sumir no histórico.'
            }
            side="top"
          >
            <button
              type="button"
              aria-label={message.isPinned ? 'Desafixar' : 'Fixar'}
              onClick={() => void onPin(message.id)}
              className={actionClass}
            >
              <Pin className={cn('h-3.5 w-3.5', message.isPinned && 'text-burn')} />
            </button>
          </Hint>
        )}

        {isMine && (
          <Hint label="Editar" shortcut="↑" side="top">
            <button
              type="button"
              aria-label="Editar"
              onClick={() => onStartEdit?.(message.id)}
              className={actionClass}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </Hint>
        )}

        {(isMine || isAdmin) && (
          <Hint label="Apagar" side="top">
            <button
              type="button"
              aria-label="Apagar"
              onClick={() => void onDelete(message.id)}
              className="rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </Hint>
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
  const sticker = message.type === 'sticker' ? resolveAssetUrl(message.stickerUrl) : undefined

  // Cartão (enquete, evento, pós-jogo…): o componente É a mensagem. O texto
  // fica só como fallback pra busca e notificação.
  if (hasCard(message)) {
    return <MessageCard message={message} />
  }

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
            <span className="ml-1.5 shrink-0 font-mono text-[11px] text-muted-foreground">
              (editada)
            </span>
          )}
        </div>
      )}

      {sticker && (
        <img
          src={sticker}
          alt=""
          loading="lazy"
          className="mt-1 block h-32 w-32 object-contain"
          draggable={false}
        />
      )}

      {attachment && (
        <button
          type="button"
          onClick={() => onOpenImage(attachment)}
          title="Abrir imagem"
          className="mt-1.5 block w-fit overflow-hidden rounded-brutal border border-line transition-colors hover:border-acid/50"
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
        <Attachment
          url={message.fileUrl}
          name={message.fileName ?? 'arquivo'}
          size={message.fileSize ?? 0}
          mime={message.fileMime}
        />
      )}

      {links.length > 0 && <LinkEmbeds urls={links} />}
    </>
  )
}

/**
 * Anexo da mensagem: video toca aqui dentro, o resto vira cartao de download.
 *
 * Video e arquivo viajam nos MESMOS campos (`fileUrl`/`fileMime`) — ver
 * lib/attachments.ts. A escolha e aqui, e nao no servidor, porque quem sabe
 * se o player aguenta e o cliente: o mesmo `.mov` que toca no launcher pode
 * nao tocar num navegador velho, e ai o `onError` devolve o cartao.
 */
function Attachment({
  url,
  name,
  size,
  mime
}: {
  url: string
  name: string
  size: number
  mime?: string | null
}) {
  // Codec que o navegador nao decodifica so aparece na hora de tocar: o
  // <video> dispara `error` e a gente cai no cartao de download, que pelo
  // menos deixa a pessoa abrir o arquivo no player do computador.
  const [broken, setBroken] = React.useState(false)
  const href = resolveAssetUrl(url)

  if (!broken && href && isPlayableVideo({ mime, name, url })) {
    return (
      <video
        src={href}
        controls
        playsInline
        // `metadata` e nao `auto`: numa conversa com cinco videos, `auto`
        // baixaria os cinco inteiros so por rolar a tela.
        preload="metadata"
        onError={() => setBroken(true)}
        // `max-w-[min(28rem,100%)]` e nao `w-full max-w-md`: com largura
        // cheia, video em pe (que e como o celular grava) vira uma caixa
        // deitada com tarja preta dos dois lados. Com os dois tetos e sem
        // largura fixa o proprio <video> se encaixa mantendo a proporcao — e
        // o `100%` impede que os 28rem estourem a coluna no celular.
        className="mt-1.5 block max-h-80 max-w-[min(28rem,100%)] rounded-brutal border border-line bg-void"
      />
    )
  }

  return <FileAttachment url={url} name={name} size={size} />
}

/**
 * Anexo que nao e imagem nem video.
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
      className="group/file mt-1.5 flex w-fit max-w-sm items-center gap-2.5 rounded-brutal border border-line bg-void-light/40 px-3 py-2 text-left transition-colors hover:border-acid/50 hover:bg-void-light/70"
    >
      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-foreground">{name}</span>
        <span className="block font-mono text-[11.5px] text-muted-foreground">
          {formatBytes(size)}
        </span>
      </span>

      <Download className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover/file:text-acid" />
    </button>
  )
}

const actionClass =
  'rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
