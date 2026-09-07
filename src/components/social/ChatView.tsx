import * as React from 'react'
import {
  Hash,
  Megaphone,
  Pin,
  Bell,
  BellOff,
  Users,
  PanelLeftOpen,
  ArrowDown,
  Search,
  Link2,
  CalendarDays,
  Lightbulb,
  ListOrdered,
  Plus
} from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Hint } from '@/components/ui/tooltip'
import { useChat, isDmId, conversationIdOf } from '@/lib/chat-context'
import { useAuth } from '@/lib/auth-context'
import { useLayout } from '@/lib/layout-context'
import { useOverlays } from '@/lib/overlay-context'
import { Button } from '@/components/ui/button'
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
    toggleAgenda,
    suggestionsOpen,
    toggleSuggestions
  } = useLayout()
  const { openSuggestionComposer } = useOverlays()

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
  const isSuggestions = activeChannel.type === 'suggestions'
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
          <Hint label="Canais" side="bottom">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Abrir canais"
              className="-ml-1 shrink-0 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </Hint>
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
        ) : isSuggestions ? (
          <Lightbulb className="h-4 w-4 shrink-0 text-burn" />
        ) : (
          <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        <h2 className="shrink-0 font-display text-sm uppercase tracking-wide text-dirty-white">
          {activeChannel.name}
        </h2>

        {activeChannel.description && (
          <>
            <span className="hidden h-4 w-px shrink-0 bg-surface-raised md:block" />
            {/* `truncate` corta a descrição do canal sem avisar, e em janela
                estreita ela some inteira. A dica é onde ela cabe. */}
            <Hint label={'#' + activeChannel.name} description={activeChannel.description} side="bottom">
              <p className="hidden min-w-0 truncate text-xs text-muted-foreground md:block">
                {activeChannel.description}
              </p>
            </Hint>
          </>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {/* O canal de sugestões tem os DOIS botões que ele precisa e que
              nenhum outro canal precisa: o quadro (todas as sugestões, do mais
              votado pro menos) e o de mandar uma. É o que faz dele um canal
              personalizado e não um canal de texto com nome bonito. */}
          {isSuggestions && (
            <>
              <HeaderButton
                label="Quadro"
                description="Todas as sugestões, da mais votada pra menos, com filtro por status."
                active={suggestionsOpen}
                onClick={toggleSuggestions}
              >
                <ListOrdered className="h-4 w-4" />
              </HeaderButton>

              <Hint
                label="Nova sugestão"
                description="Uma ideia ou um problema. Leva sua versão do launcher junto."
                side="bottom"
              >
                <button
                  type="button"
                  onClick={openSuggestionComposer}
                  className="ml-1 flex items-center gap-1.5 rounded-brutal border border-acid/60 px-2 py-1 text-[11.5px] font-medium text-acid transition-colors hover:bg-acid/10"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Sugerir
                </button>
              </Hint>

              <span className="mx-1 h-4 w-px shrink-0 bg-surface-raised" />
            </>
          )}

          <HeaderButton
            label={muted ? 'Reativar avisos daqui' : 'Silenciar isto'}
            description={
              muted
                ? 'Volta a contar menção e a tocar aviso deste canal.'
                : 'Para de tocar aviso e de contar menção deste canal. Continua aparecendo na lista.'
            }
            active={muted}
            onClick={() => toggleMuteChannel(activeChannel.id)}
          >
            {muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          </HeaderButton>

          <HeaderButton
            label="Buscar"
            description="Procura no histórico deste canal."
            shortcut="Ctrl + F"
            active={searchOpen}
            onClick={toggleSearch}
          >
            <Search className="h-4 w-4" />
          </HeaderButton>

          {/* Fixadas é por canal: a rota do servidor recebe channelId, e uma
              conversa de duas pessoas não paga o espaço de um painel só pra
              ela. */}
          {!isDm && (
            <HeaderButton
              label="Fixadas"
              description="As mensagens que alguém marcou pra não se perder."
              active={pinnedOpen}
              onClick={togglePinned}
            >
              <Pin className="h-4 w-4" />
            </HeaderButton>
          )}

          {/* Achados e agenda são do grupo, não de uma conversa a dois. */}
          {!isDm && (
            <HeaderButton
              label="Achados"
              description="Todo link que passou por este canal, do mais novo pro mais velho."
              active={linksOpen}
              onClick={toggleLinks}
            >
              <Link2 className="h-4 w-4" />
            </HeaderButton>
          )}

          {!isDm && (
            <HeaderButton
              label="Agenda"
              description="Os eventos marcados pelo grupo e quem confirmou."
              active={agendaOpen}
              onClick={toggleAgenda}
            >
              <CalendarDays className="h-4 w-4" />
            </HeaderButton>
          )}

          <HeaderButton
            label={membersOpen ? 'Esconder membros' : 'Mostrar membros'}
            description="Quem está online, o cargo de cada um e o que estão jogando."
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
          <MessagesSkeleton />
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
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              {isDm
                ? 'Começo da conversa. Só vocês dois veem isso aqui.'
                : isSuggestions
                  ? 'Aqui é onde se pede o que falta e se avisa o que quebrou. Cada sugestão vira um card que a galera vota — e o que tem mais voto é o que vem primeiro.'
                  : 'Ninguém falou nada aqui ainda. Começa você.'}
            </p>

            {isSuggestions && (
              <Button size="sm" className="mt-3" onClick={openSuggestionComposer}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Mandar a primeira
              </Button>
            )}
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
        <Hint label="Ir pro fim da conversa" side="left">
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-24 right-4 z-10 flex items-center gap-1.5 rounded-brutal border border-line-strong bg-surface-raised px-2.5 py-1.5 text-[11.5px] font-medium text-foreground shadow-[0_10px_28px_rgba(0,0,0,0.45)] transition-colors hover:border-acid/60 hover:text-acid"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            Fim
          </button>
        </Hint>
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

/**
 * ESQUELETO DO HISTÓRICO.
 *
 * Era um spinner sozinho no meio de uma tela preta. Um spinner diz "espera";
 * um esqueleto diz "vem conversa aí, nesta forma" — e, o que importa mais, ele
 * ocupa o mesmo espaço que as mensagens vão ocupar, então a tela não dá um
 * salto no instante em que elas chegam.
 *
 * As larguras são propositalmente desiguais: cinco barras do mesmo tamanho não
 * parecem conversa, parecem tabela.
 */
const SKELETON_ROWS = [
  { name: 'w-24', lines: ['w-3/5'] },
  { name: 'w-16', lines: ['w-4/5', 'w-2/5'] },
  { name: 'w-28', lines: ['w-1/3'] },
  { name: 'w-20', lines: ['w-3/4', 'w-1/2'] },
  { name: 'w-24', lines: ['w-2/3'] }
]

function MessagesSkeleton() {
  return (
    <div className="mt-auto animate-pulse px-4 pb-2" aria-hidden>
      {SKELETON_ROWS.map((row, index) => (
        <div key={index} className="flex gap-3 py-2">
          <span className="h-9 w-9 shrink-0 rounded-full bg-surface-raised" />
          <div className="min-w-0 flex-1 space-y-1.5 pt-1">
            <span className={cn('block h-2.5 rounded-brutal bg-surface-raised', row.name)} />
            {row.lines.map((width, line) => (
              <span
                key={line}
                className={cn('block h-2.5 rounded-brutal bg-surface-raised/60', width)}
              />
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">Carregando as mensagens…</span>
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
  description,
  shortcut,
  active,
  onClick
}: {
  children: React.ReactNode
  label: string
  /** O que o painel mostra. Seis ícones em fila não explicam nada sozinhos. */
  description?: string
  shortcut?: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <Hint label={label} description={description} shortcut={shortcut}>
      <button
        type="button"
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
    </Hint>
  )
}
