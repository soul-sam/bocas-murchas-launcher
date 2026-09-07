import * as React from 'react'
import {
  Hash,
  Megaphone,
  Loader2,
  Pin,
  Bell,
  BellOff,
  Users,
  PanelLeftOpen,
  ArrowDown,
  Search,
  Link2,
  CalendarDays
} from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useChat, isDmId, conversationIdOf } from '@/lib/chat-context'
import { useAuth } from '@/lib/auth-context'
import { useLayout } from '@/lib/layout-context'
import type { ChatMessage } from '@/lib/api'
import { MessageItem } from './MessageItem'
import { MessageComposer } from './MessageComposer'
import { DropComposer } from './DropComposer'

/** Mensagens seguidas do mesmo autor em até 5 min viram um bloco só. */
const GROUP_WINDOW_MS = 5 * 60_000

/** Distância do rodapé que ainda conta como "estou lendo o que chega". */
const STICK_THRESHOLD_PX = 120

function dayKey(iso: string): string {
  return new Date(iso).toDateString()
}

function formatDay(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Hoje'
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem'

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {})
  })
}

export function ChatView() {
  const {
    activeChannel,
    activeChannelId,
    conversations,
    messages,
    loadingMessages,
    hasMore,
    loadOlder,
    typing,
    unreadMarker,
    isMuted,
    toggleMuteChannel,
    send,
    edit,
    remove,
    react,
    togglePin,
    notifyTyping
  } = useChat()

  const { user } = useAuth()
  const {
    sidebarIsDrawer,
    toggleSidebar,
    membersOpen,
    toggleMembers,
    pinnedOpen,
    togglePinned,
    searchOpen,
    toggleSearch,
    linksOpen,
    toggleLinks,
    agendaOpen,
    toggleAgenda
  } = useLayout()

  const [replyTo, setReplyTo] = React.useState<ChatMessage | null>(null)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [highlightedId, setHighlightedId] = React.useState<string | null>(null)
  const [atBottom, setAtBottom] = React.useState(true)
  /**
   * Compositor de drop (admin): null = fechado; string = aberto com o texto
   * que veio do "/drop ..." (vazio quando abriu pelo "+").
   */
  const [dropSeed, setDropSeed] = React.useState<string | null>(null)

  const scrollRef = React.useRef<HTMLDivElement>(null)

  /** Só rolamos sozinho se a pessoa já estava no fim — senão atrapalha quem lê o histórico. */
  const stickToBottomRef = React.useRef(true)
  const lastCountRef = React.useRef(0)

  /**
   * Trava de uma página por vez.
   *
   * `loadingMessages` só cobre a carga inicial do canal, não a paginação. Sem
   * esta ref, cada evento de rolagem perto do topo disparava um loadOlder novo
   * — dezenas de requisições paralelas pedindo a MESMA página, cada uma
   * mexendo no scrollTop. Rolar rápido no histórico travava o chat.
   */
  const loadingOlderRef = React.useRef(false)

  const handleScroll = (): void => {
    const el = scrollRef.current
    if (!el) return

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const stuck = distanceFromBottom < STICK_THRESHOLD_PX
    stickToBottomRef.current = stuck
    setAtBottom(stuck)

    if (el.scrollTop < 200 && hasMore && !loadingMessages && !loadingOlderRef.current) {
      // Carregar antigas empurra o conteúdo pra baixo; guardamos a altura pra
      // devolver a posição e a rolagem não "pular".
      const previousHeight = el.scrollHeight
      loadingOlderRef.current = true
      void loadOlder().finally(() => {
        requestAnimationFrame(() => {
          loadingOlderRef.current = false
          if (!scrollRef.current) return
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight - previousHeight
        })
      })
    }
  }

  const scrollToBottom = React.useCallback((smooth = false) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    stickToBottomRef.current = true
    setAtBottom(true)
  }, [])

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
    loadingOlderRef.current = false
    setReplyTo(null)
    setEditingId(null)
    setHighlightedId(null)
    setAtBottom(true)
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    })
  }, [activeChannelId])

  /**
   * Pular pra uma mensagem (clique numa resposta ou numa fixada).
   *
   * O destaque some sozinho: sem isso a mensagem ficaria marcada pra sempre e
   * o segundo pulo pra ela não daria nenhum sinal visual de que funcionou.
   */
  const jumpTo = React.useCallback((messageId: string) => {
    const target = document.getElementById(`msg-${messageId}`)
    if (!target) return

    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setHighlightedId(messageId)
    setTimeout(() => setHighlightedId((prev) => (prev === messageId ? null : prev)), 1_400)
  }, [])

  const loadedIds = React.useMemo(() => new Set(messages.map((m) => m.id)), [messages])

  const editLast = React.useCallback(() => {
    const mine = [...messages].reverse().find((m) => m.author.id === user?.id)
    if (!mine) return
    setEditingId(mine.id)
    requestAnimationFrame(() => jumpTo(mine.id))
  }, [messages, user?.id, jumpTo])

  if (!activeChannel) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-xs text-muted-foreground">
          Escolha um canal
        </p>
      </div>
    )
  }

  const isAnnouncement = activeChannel.type === 'announcements'
  const isDm = isDmId(activeChannel.id)
  const muted = isMuted(activeChannel.id)

  // Numa conversa o "canal" é uma pessoa: o cabeçalho mostra o avatar e o
  // @usuário dela, não uma cerquilha.
  const peer = isDm
    ? conversations.find((c) => c.id === conversationIdOf(activeChannel.id))?.other
    : undefined

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
        {sidebarIsDrawer && (
          <button
            type="button"
            onClick={toggleSidebar}
            title="Canais"
            aria-label="Abrir canais"
            className="-ml-1 shrink-0 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}

        {isDm ? (
          <UserAvatar
            src={resolveAssetUrl(peer?.avatar)}
            name={peer?.displayName ?? activeChannel.name}
            status={peer?.status ?? 'offline'}
            ringColor={peer?.profileColor}
            className="h-6 w-6"
          />
        ) : isAnnouncement ? (
          <Megaphone className="h-4 w-4 shrink-0 text-burn" />
        ) : (
          <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        <h2 className="shrink-0 font-display text-sm uppercase tracking-wide text-dirty-white">
          {activeChannel.name}
        </h2>

        {activeChannel.description && (
          <>
            <span className="hidden h-4 w-px shrink-0 bg-surface-raised md:block" />
            <p className="hidden truncate text-xs text-muted-foreground md:block">
              {activeChannel.description}
            </p>
          </>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <HeaderButton
            label={muted ? 'Reativar avisos daqui' : 'Silenciar isto'}
            active={muted}
            onClick={() => toggleMuteChannel(activeChannel.id)}
          >
            {muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          </HeaderButton>

          <HeaderButton label="Buscar (Ctrl + F)" active={searchOpen} onClick={toggleSearch}>
            <Search className="h-4 w-4" />
          </HeaderButton>

          {/* Fixadas é por canal: a rota do servidor recebe channelId, e uma
              conversa de duas pessoas não paga o espaço de um painel só pra
              ela. */}
          {!isDm && (
            <HeaderButton
              label="Mensagens fixadas"
              active={pinnedOpen}
              onClick={togglePinned}
            >
              <Pin className="h-4 w-4" />
            </HeaderButton>
          )}

          {/* Achados e agenda são do grupo, não de uma conversa a dois. */}
          {!isDm && (
            <HeaderButton label="Achados (links do canal)" active={linksOpen} onClick={toggleLinks}>
              <Link2 className="h-4 w-4" />
            </HeaderButton>
          )}

          {!isDm && (
            <HeaderButton label="Agenda do grupo" active={agendaOpen} onClick={toggleAgenda}>
              <CalendarDays className="h-4 w-4" />
            </HeaderButton>
          )}

          <HeaderButton
            label={membersOpen ? 'Esconder membros' : 'Mostrar membros'}
            active={membersOpen}
            onClick={toggleMembers}
          >
            <Users className="h-4 w-4" />
          </HeaderButton>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto py-3"
      >
        {loadingMessages && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
            {isDm && (
              <UserAvatar
                src={resolveAssetUrl(peer?.avatar)}
                name={peer?.displayName ?? activeChannel.name}
                ringColor={peer?.profileColor}
                className="mb-2 h-16 w-16"
              />
            )}
            <p className="title-brutal text-lg">
              {isDm ? activeChannel.name : '#' + activeChannel.name}
            </p>
            <p className="text-sm text-muted-foreground">
              {isDm
                ? 'Começo da conversa. Só vocês dois veem isso aqui.'
                : 'Ninguém falou nada aqui ainda. Começa você.'}
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
              <p className="pb-2 text-center text-[11.5px] text-muted-foreground">
                role pra cima pra carregar mais
              </p>
            )}

            {messages.map((message, index) => {
              const previous = messages[index - 1]
              const newDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt)

              const grouped =
                !!previous &&
                !newDay &&
                previous.author.id === message.author.id &&
                !message.replyTo &&
                new Date(message.createdAt).getTime() -
                  new Date(previous.createdAt).getTime() <
                  GROUP_WINDOW_MS

              return (
                <React.Fragment key={message.id}>
                  {newDay && <DayDivider label={formatDay(message.createdAt)} />}
                  {unreadMarker === message.id && <UnreadDivider />}

                  <MessageItem
                    message={message}
                    grouped={grouped}
                    highlighted={highlightedId === message.id}
                    editing={editingId === message.id}
                    onStartEdit={setEditingId}
                    onStopEdit={() => setEditingId(null)}
                    onReply={setReplyTo}
                    onEdit={edit}
                    onDelete={remove}
                    onReact={react}
                    onPin={togglePin}
                    // Só oferece o pulo quando a mensagem citada está na tela:
                    // um botão que não faz nada é pior que botão nenhum.
                    onJumpTo={
                      message.replyTo && loadedIds.has(message.replyTo.id) ? jumpTo : undefined
                    }
                  />
                </React.Fragment>
              )
            })}
          </div>
        )}
      </div>

      {/* Voltar pro fim: só aparece quando você saiu de lá. */}
      {!atBottom && messages.length > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          title="Ir pro fim da conversa"
          className="absolute bottom-24 right-4 z-10 flex items-center gap-1.5 rounded-brutal border-2 border-acid-dark bg-void px-2.5 py-1.5 font-mono text-[11.5px] uppercase tracking-widest text-acid shadow-[0_0_20px_rgba(0,0,0,0.6)] transition-colors hover:border-acid"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          fim
        </button>
      )}

      <div className="h-5 shrink-0 px-4">
        {typing.length > 0 && (
          <p className="truncate text-[11.5px] text-acid-text">
            {typing.map((t) => t.displayName).join(', ')}{' '}
            {typing.length === 1 ? 'está digitando' : 'estão digitando'}
            <span className="terminal-cursor" />
          </p>
        )}
      </div>

      <MessageComposer
        placeholderTarget={isDm ? activeChannel.name : '#' + activeChannel.name}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={send}
        onTyping={notifyTyping}
        onEditLast={editLast}
        onDrop={user?.role === 'admin' ? setDropSeed : undefined}
      />

      <DropComposer
        open={dropSeed !== null}
        seed={dropSeed ?? ''}
        // Numa conversa direta não existe "só neste canal": drop é do grupo.
        channelId={isDm ? null : activeChannel.id}
        channelName={activeChannel.name}
        onClose={() => setDropSeed(null)}
      />
    </div>
  )
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-3 flex items-center gap-2 px-4">
      <span className="h-px flex-1 bg-surface-raised" />
      <span className="text-[11px] text-muted-foreground">
        {label}
      </span>
      <span className="h-px flex-1 bg-surface-raised" />
    </div>
  )
}

function UnreadDivider() {
  return (
    <div className="mt-3 flex items-center gap-2 px-4">
      <span className="h-px flex-1 bg-destructive/70" />
      <span className="rounded-brutal bg-destructive px-1.5 text-[11px] text-dirty-white">
        novas
      </span>
    </div>
  )
}

function HeaderButton({
  children,
  label,
  active,
  onClick
}: {
  children: React.ReactNode
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'rounded-brutal p-1.5 transition-colors',
        active
          ? 'bg-acid/10 text-acid'
          : 'text-muted-foreground hover:bg-void-light hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}
