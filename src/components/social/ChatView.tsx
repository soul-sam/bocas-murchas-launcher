import * as React from 'react'
import { Hash, Megaphone, Loader2 } from 'lucide-react'
import { useChat } from '@/lib/chat-context'
import type { ChatMessage } from '@/lib/api'
import { MessageItem } from './MessageItem'
import { MessageComposer } from './MessageComposer'

/** Mensagens seguidas do mesmo autor em até 5 min viram um bloco só. */
const GROUP_WINDOW_MS = 5 * 60_000

export function ChatView() {
  const {
    activeChannel,
    messages,
    loadingMessages,
    hasMore,
    loadOlder,
    typing,
    send,
    edit,
    remove,
    react,
    togglePin,
    notifyTyping
  } = useChat()

  const [replyTo, setReplyTo] = React.useState<ChatMessage | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  /** Só rolamos sozinho se a pessoa já estava no fim — senão atrapalha quem lê o histórico. */
  const stickToBottomRef = React.useRef(true)
  const lastCountRef = React.useRef(0)

  const handleScroll = (): void => {
    const el = scrollRef.current
    if (!el) return

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottomRef.current = distanceFromBottom < 120

    if (el.scrollTop < 200 && hasMore && !loadingMessages) {
      // Carregar antigas empurra o conteúdo pra baixo; guardamos a altura pra
      // devolver a posição e a rolagem não "pular".
      const previousHeight = el.scrollHeight
      void loadOlder().then(() => {
        requestAnimationFrame(() => {
          if (!scrollRef.current) return
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight - previousHeight
        })
      })
    }
  }

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const grew = messages.length > lastCountRef.current
    lastCountRef.current = messages.length

    if (grew && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // Trocar de canal sempre começa no fim.
  React.useEffect(() => {
    stickToBottomRef.current = true
    lastCountRef.current = 0
    setReplyTo(null)
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    })
  }, [activeChannel?.id])

  if (!activeChannel) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Escolha um canal
        </p>
      </div>
    )
  }

  const isAnnouncement = activeChannel.type === 'announcements'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#1a1a1a] px-4">
        {isAnnouncement ? (
          <Megaphone className="h-4 w-4 shrink-0 text-burn" />
        ) : (
          <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <h2 className="font-display text-sm uppercase tracking-wide text-dirty-white">
          {activeChannel.name}
        </h2>
        {activeChannel.description && (
          <>
            <span className="h-4 w-px shrink-0 bg-[#1a1a1a]" />
            <p className="truncate text-xs text-muted-foreground">
              {activeChannel.description}
            </p>
          </>
        )}
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto py-3"
      >
        {loadingMessages && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-acid" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
            <p className="title-brutal text-lg">#{activeChannel.name}</p>
            <p className="text-sm text-muted-foreground">
              Ninguém falou nada aqui ainda. Começa você.
            </p>
          </div>
        ) : (
          // mt-auto empurra as mensagens pro rodapé quando são poucas, como no
          // Discord. Quando o conteúdo passa da altura não sobra espaço livre,
          // a margem automática vira zero e a rolagem funciona normal.
          //
          // Não dá pra usar justify-end no container que rola: nesse caso o
          // conteúdo transborda pra cima e some — e min-h-full não resolve
          // porcentagem dentro de um item flex sem altura explícita.
          <div className="mt-auto">
            {hasMore && (
              <p className="pb-2 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                role pra cima pra carregar mais
              </p>
            )}

            {messages.map((message, index) => {
              const previous = messages[index - 1]
              const grouped =
                !!previous &&
                previous.author.id === message.author.id &&
                !message.replyTo &&
                new Date(message.createdAt).getTime() -
                  new Date(previous.createdAt).getTime() <
                  GROUP_WINDOW_MS

              return (
                <MessageItem
                  key={message.id}
                  message={message}
                  grouped={grouped}
                  onReply={setReplyTo}
                  onEdit={edit}
                  onDelete={remove}
                  onReact={react}
                  onPin={togglePin}
                />
              )
            })}
          </div>
        )}
      </div>

      <div className="h-5 shrink-0 px-4">
        {typing.length > 0 && (
          <p className="truncate font-mono text-[10px] uppercase tracking-widest text-acid">
            {typing.map((t) => t.displayName).join(', ')}{' '}
            {typing.length === 1 ? 'está digitando' : 'estão digitando'}
            <span className="terminal-cursor" />
          </p>
        )}
      </div>

      <MessageComposer
        channelName={activeChannel.name}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={send}
        onTyping={notifyTyping}
      />
    </div>
  )
}
