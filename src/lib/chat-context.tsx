import * as React from 'react'
import {
  channels as channelsApi,
  messages as messagesApi,
  dm as dmApi,
  type Channel,
  type ChatMessage,
  type Conversation,
  type SendMessagePayload
} from './api'
import { useAuth } from './auth-context'
import { useSocket } from './socket-context'
import { useSettings } from './settings-context'
import { playUiSound } from './ui-sounds'
import { collectMentions, mentionsEveryone } from './rich-text'
import { useCargos } from './cargos-context'

/**
 * Canais de texto, conversas diretas e mensagens.
 *
 * O cliente entra na sala de TODOS os canais de texto, nao so no aberto. E o
 * que permite contar nao-lidas nos outros canais — igual Discord. O canal ativo
 * so muda qual lista aparece na tela.
 *
 * CONVERSA DIRETA E UM CANAL SINTETICO. Cada conversa vira um `Channel` de
 * mentira com id `dm:<conversationId>` e tipo 'dm'. Assim ChatView,
 * MessageItem, MessageComposer, nao-lidas, mencoes, marcador de novas e
 * rolagem infinita funcionam em DM sem UMA linha de codigo nova — muda so a
 * rota que busca e envia. A alternativa (uma tela de conversa separada) seria
 * reimplementar tudo isso do zero e deixar as duas telas divergirem com o
 * tempo.
 */

const PAGE_SIZE = 50

/** Prefixo que distingue conversa de canal de verdade. */
const DM_PREFIX = 'dm:'

export function isDmId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(DM_PREFIX)
}

export function conversationIdOf(channelId: string): string {
  return channelId.slice(DM_PREFIX.length)
}

function dmChannelId(conversationId: string): string {
  return DM_PREFIX + conversationId
}

interface TypingUser {
  id: string
  displayName: string
  at: number
}

interface ChatContextValue {
  channels: Channel[]
  textChannels: Channel[]
  voiceChannels: Channel[]
  /** Canais sinteticos das conversas, ja ordenados por atividade. */
  dmChannels: Channel[]
  conversations: Conversation[]
  loading: boolean
  error: string | null

  activeChannelId: string | null
  activeChannel: Channel | null
  setActiveChannel: (channelId: string) => void
  /** Abre (criando se preciso) a conversa com alguem e vai pra ela. */
  openDm: (userId: string) => Promise<void>

  messages: ChatMessage[]
  loadingMessages: boolean
  hasMore: boolean
  loadOlder: () => Promise<void>

  unread: Record<string, number>
  /** Quantas das nao-lidas citam voce. Bolinha vermelha vs. numero comum. */
  mentions: Record<string, number>
  /**
   * Id da primeira mensagem nao lida do canal — a linha de "novas mensagens".
   * Some quando voce sai do canal, nao quando entra: senao a linha piscaria e
   * sumiria antes de dar tempo de ver onde parou.
   */
  unreadMarker: string | null

  /** Canais silenciados (sem contador, sem som, sem notificacao). */
  mutedChannels: string[]
  toggleMuteChannel: (channelId: string) => void
  isMuted: (channelId: string) => boolean

  typing: TypingUser[]

  pinned: ChatMessage[]
  loadingPinned: boolean

  send: (payload: {
    content: string
    imageUrl?: string
    /** Sticker do servidor: a mensagem vira type 'sticker'. */
    stickerUrl?: string
    file?: { url: string; name: string; size: number; mime: string }
    replyToId?: string
  }) => Promise<void>
  edit: (messageId: string, content: string) => Promise<void>
  remove: (messageId: string) => Promise<void>
  react: (messageId: string, emoji: string) => Promise<void>
  /** Reescreve as gorjetas de uma mensagem (o botão já falou com a rota). */
  applyTips: (messageId: string, tips: ChatMessage['tips']) => void
  togglePin: (messageId: string) => Promise<void>
  notifyTyping: () => void

  refreshChannels: () => Promise<void>
  refreshConversations: () => Promise<void>
}

const ChatContext = React.createContext<ChatContextValue | null>(null)

const TYPING_TTL_MS = 5_000

/** Corta a mensagem pro balaozinho do sistema sem virar uma parede de texto. */
function preview(message: ChatMessage): string {
  const text = message.content?.trim()
  if (text) return text.length > 140 ? text.slice(0, 137) + '…' : text
  if (message.stickerUrl) return 'mandou um sticker'
  if (message.imageUrl || message.gifUrl) return '📷 mandou uma imagem'
  if (message.fileName) return '📎 ' + message.fileName
  return 'mandou uma mensagem'
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth()
  const { socket } = useSocket()
  const { settings, update: updateSettings } = useSettings()

  const [channels, setChannels] = React.useState<Channel[]>([])
  const [conversations, setConversations] = React.useState<Conversation[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [activeChannelId, setActiveChannelId] = React.useState<string | null>(null)
  const [byChannel, setByChannel] = React.useState<Record<string, ChatMessage[]>>({})
  const [loadingMessages, setLoadingMessages] = React.useState(false)
  const [exhausted, setExhausted] = React.useState<Record<string, boolean>>({})
  const [unread, setUnread] = React.useState<Record<string, number>>({})
  const [mentions, setMentions] = React.useState<Record<string, number>>({})
  const [markers, setMarkers] = React.useState<Record<string, string>>({})
  const [typing, setTyping] = React.useState<TypingUser[]>([])
  const [pinnedByChannel, setPinnedByChannel] = React.useState<Record<string, ChatMessage[]>>({})
  const [loadingPinned, setLoadingPinned] = React.useState(false)

  // Handlers de socket precisam do canal ativo sem virar dependencia do effect.
  const activeRef = React.useRef<string | null>(null)
  activeRef.current = activeChannelId

  const lastTypingSentRef = React.useRef(0)

  /** Espelho de byChannel pra checar cache sem virar dependencia de efeito. */
  const cacheRef = React.useRef<Record<string, ChatMessage[]>>({})
  cacheRef.current = byChannel

  /**
   * Preferencias e usuario lidos por ref pelo mesmo motivo do canal ativo: os
   * listeners de socket sao registrados uma vez, e se dependessem de
   * `settings` cada mexida no volume desconectaria e reconectaria todos os
   * eventos do chat.
   */
  const settingsRef = React.useRef(settings)
  settingsRef.current = settings
  const userRef = React.useRef(user)
  userRef.current = user
  const conversationsRef = React.useRef<Conversation[]>([])
  conversationsRef.current = conversations

  const textChannels = React.useMemo(
    () =>
      channels.filter(
        (c) => c.type === 'text' || c.type === 'announcements' || c.type === 'suggestions'
      ),
    [channels]
  )
  const voiceChannels = React.useMemo(
    () => channels.filter((c) => c.type === 'voice'),
    [channels]
  )

  /** Cada conversa vira um canal de mentira — ver o comentario do arquivo. */
  const dmChannels = React.useMemo<Channel[]>(
    () =>
      conversations.map((conversation, index) => ({
        id: dmChannelId(conversation.id),
        name: conversation.other.displayName,
        description: '@' + conversation.other.username,
        type: 'dm' as const,
        icon: null,
        position: index,
        isPrivate: true
      })),
    [conversations]
  )

  const mutedChannels = settings.chat.mutedChannels

  const isMuted = React.useCallback(
    (channelId: string) => mutedChannels.includes(channelId),
    [mutedChannels]
  )

  const toggleMuteChannel = React.useCallback(
    (channelId: string) => {
      const current = settingsRef.current.chat.mutedChannels
      const next = current.includes(channelId)
        ? current.filter((id) => id !== channelId)
        : [...current, channelId]
      void updateSettings({ chat: { ...settingsRef.current.chat, mutedChannels: next } })
    },
    [updateSettings]
  )

  const refreshChannels = React.useCallback(async () => {
    if (!token) return
    try {
      const list = await channelsApi.list(token)
      setChannels(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar canais')
    } finally {
      setLoading(false)
    }
  }, [token])

  const refreshConversations = React.useCallback(async () => {
    if (!token) return
    try {
      const list = await dmApi.list(token)
      setConversations(list)

      // As nao-lidas de conversa vem do SERVIDOR (marca d'agua de leitura), e
      // nao do socket: quem estava com o launcher fechado precisa ver o que
      // perdeu ao abrir. O canal aberto agora ja foi lido.
      setUnread((prev) => {
        const next = { ...prev }
        for (const conversation of list) {
          const key = dmChannelId(conversation.id)
          next[key] = key === activeRef.current ? 0 : conversation.unread
        }
        return next
      })
    } catch {
      // Conversa e secundaria na primeira carga; nao pode derrubar o chat.
    }
  }, [token])

  React.useEffect(() => {
    if (!token) {
      setChannels([])
      setConversations([])
      setLoading(false)
      return
    }
    setLoading(true)
    void refreshChannels()
    void refreshConversations()
  }, [token, refreshChannels, refreshConversations])

  // Primeiro canal de texto vira o ativo.
  React.useEffect(() => {
    if (activeChannelId || textChannels.length === 0) return
    setActiveChannelId(textChannels[0].id)
  }, [textChannels, activeChannelId])

  // --- entrar nas salas de todos os canais de texto -----------------------
  React.useEffect(() => {
    if (!socket || textChannels.length === 0) return

    const ids = textChannels.map((c) => c.id)
    for (const id of ids) socket.emit('joinChannel', id)

    return () => {
      for (const id of ids) socket.emit('leaveChannel', id)
    }
  }, [socket, textChannels])

  /**
   * "Essa mensagem fala comigo?"
   *
   * Roda no contexto e nao no componente porque a NOTIFICACAO precisa da
   * resposta no instante em que a mensagem chega — a mensagem pode nem estar
   * montada na tela (canal fechado, aba do Minecraft aberta, janela na
   * bandeja), que e justamente quando avisar importa.
   */
  /**
   * Cargos em ref, não em dependência: ver o comentário dentro do `isForMe`.
   */
  const { byMentionToken, myCargoIds } = useCargos()
  const cargoTokensRef = React.useRef(byMentionToken)
  const myCargosRef = React.useRef(myCargoIds)
  React.useEffect(() => {
    cargoTokensRef.current = byMentionToken
    myCargosRef.current = myCargoIds
  }, [byMentionToken, myCargoIds])

  const isForMe = React.useCallback((message: ChatMessage): boolean => {
    const me = userRef.current
    if (!me || !message.content) return false
    if (mentionsEveryone(message.content)) return true

    const names = collectMentions(message.content)
    if (names.length === 0) return false

    const mine = new Set<string>([
      me.username.toLowerCase(),
      me.displayName.toLowerCase().split(/\s+/)[0]
    ])
    if (names.some((name) => mine.has(name))) return true

    // MENÇÃO A CARGO (`@impressora-murcha`): fala com todo mundo que tem o
    // cargo. Lido do ref e não do contexto direto porque este callback é
    // criado UMA vez (sem dependências, de propósito: ele é usado dentro dos
    // handlers de socket, e recriá-lo remontaria a assinatura a cada mudança
    // de cargo).
    const meus = myCargosRef.current
    if (meus.size === 0) return false
    return names.some((name) => {
      const cargo = cargoTokensRef.current.get(name)
      return !!cargo && meus.has(cargo.id)
    })
  }, [])

  // --- eventos de mensagem ------------------------------------------------
  React.useEffect(() => {
    if (!socket) return

    /** A chave local: id do canal, ou o canal sintetico da conversa. */
    const bucketOf = (data: {
      channelId?: string | null
      conversationId?: string | null
    }): string | null => {
      if (data?.channelId) return data.channelId
      if (data?.conversationId) return dmChannelId(data.conversationId)
      return null
    }

    const handleCreated = (data: {
      channelId?: string
      conversationId?: string
      message: ChatMessage
    }): void => {
      const bucket = bucketOf(data)
      const message = data?.message
      if (!bucket || !message?.id) return

      setByChannel((prev) => {
        const list = prev[bucket] ?? []
        // O servidor devolve pro autor tambem; nao duplicar.
        if (list.some((m) => m.id === message.id)) return prev
        return { ...prev, [bucket]: [...list, message] }
      })

      // Conversa nova sobe pro topo da lista e ganha a previa.
      if (data.conversationId) {
        setConversations((prev) =>
          prev
            .map((conversation) =>
              conversation.id === data.conversationId
                ? {
                    ...conversation,
                    lastMessageAt: message.createdAt,
                    lastMessage: {
                      id: message.id,
                      content: message.content,
                      imageUrl: message.imageUrl,
                      fileName: message.fileName,
                      createdAt: message.createdAt,
                      authorId: message.author.id
                    }
                  }
                : conversation
            )
            .sort(
              (a, b) =>
                new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
            )
        )
      }

      // Quem mandou parou de digitar.
      setTyping((prev) => prev.filter((t) => t.id !== message.author?.id))

      const isMine = message.author?.id === userRef.current?.id
      if (isMine) return

      const chat = settingsRef.current.chat
      const muted = chat.mutedChannels.includes(bucket)
      // Conversa direta E uma mencao por definicao: alguem escreveu pra VOCE.
      const mentionsMe = !!data.conversationId || isForMe(message)

      // Canal silenciado nao conta e nao avisa — a nao ser que citem voce
      // pelo nome. Silenciar um canal e "nao me interrompa", nao "me esconda
      // que estao falando comigo".
      if (muted && !mentionsMe) return

      const looking = bucket === activeRef.current && document.hasFocus()

      if (!looking) {
        setUnread((prev) => ({ ...prev, [bucket]: (prev[bucket] ?? 0) + 1 }))
        // A linha de "novas mensagens" marca a PRIMEIRA nao lida e nao se
        // move mais enquanto a conversa continua.
        setMarkers((prev) => (prev[bucket] ? prev : { ...prev, [bucket]: message.id }))
      }

      if (mentionsMe) {
        setMentions((prev) => ({ ...prev, [bucket]: (prev[bucket] ?? 0) + 1 }))
      }

      const soundVolume = settingsRef.current.soundEnabled
        ? settingsRef.current.soundVolume
        : 0

      if (mentionsMe) {
        if (chat.messageSound) playUiSound('mention', soundVolume)
      } else if (!looking && chat.messageSound) {
        playUiSound('message', soundVolume)
      }

      const shouldNotify = mentionsMe ? chat.notifyOnMention : chat.notifyAllMessages
      // Balao do sistema com a janela em foco e no canal certo e ruido puro:
      // a mensagem ja esta na tela da pessoa.
      if (!shouldNotify || looking) return

      const where = data.conversationId
        ? 'mensagem direta'
        : '#' + (channels.find((c) => c.id === bucket)?.name ?? 'chat')

      void window.bocas.notify.show({
        title: `${message.author?.displayName ?? 'Alguém'} — ${where}`,
        body: preview(message),
        silent: chat.messageSound
      })
    }

    const handleUpdated = (data: {
      channelId?: string
      conversationId?: string
      message: ChatMessage
    }): void => {
      const bucket = bucketOf(data)
      if (!bucket || !data.message?.id) return

      setByChannel((prev) => ({
        ...prev,
        [bucket]: (prev[bucket] ?? []).map((m) =>
          m.id === data.message.id ? { ...m, ...data.message } : m
        )
      }))
    }

    const handleDeleted = (data: {
      channelId?: string
      conversationId?: string
      messageId: string
    }): void => {
      const bucket = bucketOf(data)
      if (!bucket) return

      setByChannel((prev) => ({
        ...prev,
        [bucket]: (prev[bucket] ?? []).filter((m) => m.id !== data.messageId)
      }))
      setPinnedByChannel((prev) => ({
        ...prev,
        [bucket]: (prev[bucket] ?? []).filter((m) => m.id !== data.messageId)
      }))
    }

    const handlePinned = (data: {
      channelId?: string
      conversationId?: string
      messageId: string
      isPinned: boolean
      message?: ChatMessage
    }): void => {
      const bucket = bucketOf(data)
      if (!bucket) return

      setByChannel((prev) => ({
        ...prev,
        [bucket]: (prev[bucket] ?? []).map((m) =>
          m.id === data.messageId ? { ...m, isPinned: data.isPinned } : m
        )
      }))

      setPinnedByChannel((prev) => {
        const current = prev[bucket] ?? []
        if (!data.isPinned) {
          return { ...prev, [bucket]: current.filter((m) => m.id !== data.messageId) }
        }
        if (current.some((m) => m.id === data.messageId)) return prev
        const source =
          data.message ?? (cacheRef.current[bucket] ?? []).find((m) => m.id === data.messageId)
        if (!source) return prev
        return { ...prev, [bucket]: [{ ...source, isPinned: true }, ...current] }
      })
    }

    /**
     * Gorjeta de outra pessoa.
     *
     * O servidor manda a LISTA INTEIRA de gorjetas da mensagem, e não o
     * delta. Duas gorjetas quase simultâneas somadas à mão dariam contas
     * diferentes em cada tela; substituir a lista inteira não tem esse
     * problema, e a lista é curta por construção (uma por pessoa).
     */
    const handleTipped = (data: {
      channelId?: string
      conversationId?: string
      messageId: string
      tips: ChatMessage['tips']
    }): void => {
      const bucket = bucketOf(data)
      if (!bucket || !data.messageId) return

      setByChannel((prev) => ({
        ...prev,
        [bucket]: (prev[bucket] ?? []).map((m) =>
          m.id === data.messageId ? { ...m, tips: data.tips ?? [] } : m
        )
      }))
    }

    /**
     * Reacao de outra pessoa.
     *
     * O servidor manda so o delta (quem reagiu com o que), nao a mensagem
     * inteira. Sem tratar isso, reacao dos outros so aparecia depois de trocar
     * de canal e voltar — parecia que o botao dos outros nao funcionava.
     */
    const handleReaction = (data: {
      channelId?: string
      conversationId?: string
      messageId: string
      emoji: string
      action: 'added' | 'removed'
      user?: { id: string; displayName: string }
    }): void => {
      const bucket = bucketOf(data)
      if (!bucket || !data.messageId || !data.user?.id) return
      const reactor = data.user

      setByChannel((prev) => ({
        ...prev,
        [bucket]: (prev[bucket] ?? []).map((m) => {
          if (m.id !== data.messageId) return m
          const reactions = m.reactions ?? []

          if (data.action === 'removed') {
            return {
              ...m,
              reactions: reactions.filter(
                (r) => !(r.emoji === data.emoji && r.userId === reactor.id)
              )
            }
          }

          if (reactions.some((r) => r.emoji === data.emoji && r.userId === reactor.id)) {
            return m
          }

          return {
            ...m,
            reactions: [
              ...reactions,
              {
                id: `${data.messageId}:${data.emoji}:${reactor.id}`,
                emoji: data.emoji,
                userId: reactor.id,
                user: reactor
              }
            ]
          }
        })
      }))
    }

    const handleTyping = (data: {
      channelId?: string
      conversationId?: string
      user: { id: string; displayName: string }
    }): void => {
      if (bucketOf(data) !== activeRef.current) return
      if (!data?.user?.id || data.user.id === userRef.current?.id) return

      setTyping((prev) => {
        const rest = prev.filter((t) => t.id !== data.user.id)
        return [...rest, { ...data.user, at: Date.now() }]
      })
    }

    const handleStopTyping = (data: { userId: string }): void => {
      setTyping((prev) => prev.filter((t) => t.id !== data?.userId))
    }

    /** Alguem abriu uma conversa comigo — ela precisa aparecer na hora. */
    const handleNewConversation = (data: { conversation: Conversation }): void => {
      const conversation = data?.conversation
      if (!conversation?.id) return

      setConversations((prev) =>
        prev.some((c) => c.id === conversation.id) ? prev : [conversation, ...prev]
      )
    }

    /** Canal criado, renomeado, apagado ou reordenado por um admin. */
    const handleChannelsChanged = (): void => {
      void refreshChannels()
    }

    /**
     * Reconectou: reler canais e conversas.
     *
     * Enquanto o socket esteve fora, nada chegou — mensagem de conversa,
     * canal novo, nada. Sem essa releitura a barra lateral fica congelada no
     * que era verdade antes da queda, e o contador de não-lidas da conversa
     * (que vem da marca d'água do servidor) nunca se corrige. É o mesmo tipo
     * de buraco que o `requestPresence` já cobre pra quem está online.
     */
    const handleReconnect = (): void => {
      void refreshChannels()
      void refreshConversations()
    }

    socket.on('messageCreated', handleCreated)
    socket.on('messageUpdated', handleUpdated)
    socket.on('messageDeleted', handleDeleted)
    socket.on('messagePinned', handlePinned)
    socket.on('messageReaction', handleReaction)
    socket.on('messageTipped', handleTipped)
    // Nome antigo do mesmo evento — servidor desatualizado ainda manda assim.
    socket.on('reactionUpdate', handleReaction)
    socket.on('userTyping', handleTyping)
    socket.on('userStopTyping', handleStopTyping)
    socket.on('dm:conversation', handleNewConversation)
    socket.on('channelsChanged', handleChannelsChanged)
    socket.on('connect', handleReconnect)

    return () => {
      socket.off('messageCreated', handleCreated)
      socket.off('messageUpdated', handleUpdated)
      socket.off('messageDeleted', handleDeleted)
      socket.off('messagePinned', handlePinned)
      socket.off('messageReaction', handleReaction)
      socket.off('messageTipped', handleTipped)
      socket.off('reactionUpdate', handleReaction)
      socket.off('userTyping', handleTyping)
      socket.off('userStopTyping', handleStopTyping)
      socket.off('dm:conversation', handleNewConversation)
      socket.off('channelsChanged', handleChannelsChanged)
      socket.off('connect', handleReconnect)
    }
  }, [socket, isForMe, channels, refreshChannels, refreshConversations])

  // "Fulano esta digitando" sem evento de parada nunca sumiria da tela.
  React.useEffect(() => {
    if (typing.length === 0) return
    const timer = setInterval(() => {
      const cutoff = Date.now() - TYPING_TTL_MS
      setTyping((prev) => prev.filter((t) => t.at > cutoff))
    }, 1_000)
    return () => clearInterval(timer)
  }, [typing.length])

  // --- trocou de canal: zera nao-lidas e quem estava digitando -------------
  const previousChannelRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    const previous = previousChannelRef.current
    previousChannelRef.current = activeChannelId

    // A linha de "novas mensagens" do canal que ficou pra tras some AGORA —
    // ela ja cumpriu o papel. Some ao SAIR, nao ao entrar: apagar na entrada
    // faria a linha piscar e desaparecer antes de dar tempo de ver onde parou.
    if (previous && previous !== activeChannelId) {
      setMarkers((prev) => {
        if (!prev[previous]) return prev
        const next = { ...prev }
        delete next[previous]
        return next
      })
    }

    if (!activeChannelId) return

    setUnread((prev) => (prev[activeChannelId] ? { ...prev, [activeChannelId]: 0 } : prev))
    setMentions((prev) => (prev[activeChannelId] ? { ...prev, [activeChannelId]: 0 } : prev))
    setTyping([])

    // Em conversa a leitura tambem vale pro SERVIDOR: e a marca d'agua que faz
    // o contador nao voltar do zero no proximo login.
    if (token && isDmId(activeChannelId)) {
      void dmApi.markRead(token, conversationIdOf(activeChannelId)).catch(() => {})
      setConversations((prev) =>
        prev.map((c) =>
          dmChannelId(c.id) === activeChannelId ? { ...c, unread: 0 } : c
        )
      )
    }
  }, [activeChannelId, token])

  /**
   * Voltar pra janela conta como "li o que estava aberto".
   *
   * Sem isso, quem deixa o launcher aberto num canto da tela acumulava
   * nao-lidas de um canal que estava vendo o tempo todo.
   */
  React.useEffect(() => {
    const handleFocus = (): void => {
      const id = activeRef.current
      if (!id) return
      setUnread((prev) => (prev[id] ? { ...prev, [id]: 0 } : prev))
      setMentions((prev) => (prev[id] ? { ...prev, [id]: 0 } : prev))

      if (token && isDmId(id)) {
        void dmApi.markRead(token, conversationIdOf(id)).catch(() => {})
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [token])

  // --- carregar mensagens do canal aberto ---------------------------------
  React.useEffect(() => {
    if (!token || !activeChannelId) return

    // Le o cache por ref: se byChannel fosse dependencia, o efeito rodaria a
    // cada mensagem nova que chega.
    if (cacheRef.current[activeChannelId]) return

    const target = activeChannelId
    let cancelled = false
    setLoadingMessages(true)
    ;(async () => {
      try {
        const list = isDmId(target)
          ? await dmApi.messages(token, conversationIdOf(target), { limit: PAGE_SIZE })
          : await messagesApi.list(token, target, { limit: PAGE_SIZE })

        if (cancelled) return
        setByChannel((prev) => ({ ...prev, [target]: list }))
        if (list.length < PAGE_SIZE) {
          setExhausted((prev) => ({ ...prev, [target]: true }))
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar mensagens')
        }
      } finally {
        if (!cancelled) setLoadingMessages(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token, activeChannelId])

  // --- mensagens fixadas do canal aberto ----------------------------------
  React.useEffect(() => {
    // Conversa direta nao tem painel de fixadas: a rota de listar fixadas e
    // por canal, e um painel a mais numa conversa de duas pessoas nao paga o
    // espaco que ocuparia.
    if (!token || !activeChannelId || isDmId(activeChannelId)) return

    const target = activeChannelId
    let cancelled = false
    setLoadingPinned(true)
    ;(async () => {
      try {
        const list = await messagesApi.listPinned(token, target)
        if (!cancelled) setPinnedByChannel((prev) => ({ ...prev, [target]: list }))
      } catch {
        // Fixadas sao secundarias: falhar aqui nao pode derrubar o chat.
      } finally {
        if (!cancelled) setLoadingPinned(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token, activeChannelId])

  const loadOlder = React.useCallback(async () => {
    if (!token || !activeChannelId) return
    const current = byChannel[activeChannelId] ?? []
    if (current.length === 0 || exhausted[activeChannelId]) return

    try {
      const older = isDmId(activeChannelId)
        ? await dmApi.messages(token, conversationIdOf(activeChannelId), {
            limit: PAGE_SIZE,
            before: current[0].createdAt
          })
        : await messagesApi.list(token, activeChannelId, {
            limit: PAGE_SIZE,
            before: current[0].createdAt
          })

      if (older.length < PAGE_SIZE) {
        setExhausted((prev) => ({ ...prev, [activeChannelId]: true }))
      }
      if (older.length === 0) return

      setByChannel((prev) => {
        const existing = prev[activeChannelId] ?? []
        const known = new Set(existing.map((m) => m.id))
        const fresh = older.filter((m) => !known.has(m.id))
        return { ...prev, [activeChannelId]: [...fresh, ...existing] }
      })
    } catch {
      // Paginacao falhando nao pode derrubar o chat; a proxima rolagem tenta de novo.
    }
  }, [token, activeChannelId, byChannel, exhausted])

  // --- acoes --------------------------------------------------------------
  const send = React.useCallback(
    async (payload: {
      content: string
      imageUrl?: string
      stickerUrl?: string
      file?: { url: string; name: string; size: number; mime: string }
      replyToId?: string
    }) => {
      if (!token || !activeChannelId) return

      const body: SendMessagePayload = {
        content: payload.content,
        type: payload.stickerUrl
          ? 'sticker'
          : payload.imageUrl
            ? 'image'
            : payload.file
              ? 'file'
              : 'text',
        imageUrl: payload.imageUrl,
        stickerUrl: payload.stickerUrl,
        fileUrl: payload.file?.url,
        fileName: payload.file?.name,
        fileSize: payload.file?.size,
        fileMime: payload.file?.mime,
        replyToId: payload.replyToId
      }

      const message = isDmId(activeChannelId)
        ? await dmApi.send(token, conversationIdOf(activeChannelId), body)
        : await messagesApi.send(token, activeChannelId, body)

      // Aparece na hora pra quem mandou. O broadcast do servidor chega logo
      // depois com a mesma mensagem e e ignorado pelo id — nao emitimos nada
      // daqui: quem grava e quem avisa (ver lib/realtime.ts no back-end).
      setByChannel((prev) => {
        const list = prev[activeChannelId] ?? []
        if (list.some((m) => m.id === message.id)) return prev
        return { ...prev, [activeChannelId]: [...list, message] }
      })

      if (isDmId(activeChannelId)) {
        const conversationId = conversationIdOf(activeChannelId)
        const peer = conversationsRef.current.find((c) => c.id === conversationId)
        socket?.emit('dm:stopTyping', { conversationId, toUserId: peer?.other.id })
      } else {
        socket?.emit('stopTyping', activeChannelId)
      }
    },
    [token, activeChannelId, socket]
  )

  const edit = React.useCallback(
    async (messageId: string, content: string) => {
      if (!token || !activeChannelId) return
      const updated = await messagesApi.edit(token, messageId, content)
      setByChannel((prev) => ({
        ...prev,
        [activeChannelId]: (prev[activeChannelId] ?? []).map((m) =>
          m.id === messageId ? { ...m, ...updated } : m
        )
      }))
    },
    [token, activeChannelId]
  )

  const remove = React.useCallback(
    async (messageId: string) => {
      if (!token || !activeChannelId) return
      await messagesApi.remove(token, messageId)
      setByChannel((prev) => ({
        ...prev,
        [activeChannelId]: (prev[activeChannelId] ?? []).filter((m) => m.id !== messageId)
      }))
      setPinnedByChannel((prev) => ({
        ...prev,
        [activeChannelId]: (prev[activeChannelId] ?? []).filter((m) => m.id !== messageId)
      }))
    },
    [token, activeChannelId]
  )

  const react = React.useCallback(
    async (messageId: string, emoji: string) => {
      if (!token || !activeChannelId || !user) return

      const { action } = await messagesApi.react(token, messageId, emoji)

      setByChannel((prev) => ({
        ...prev,
        [activeChannelId]: (prev[activeChannelId] ?? []).map((m) => {
          if (m.id !== messageId) return m
          const reactions = m.reactions ?? []

          if (action === 'removed') {
            return {
              ...m,
              reactions: reactions.filter(
                (r) => !(r.emoji === emoji && r.userId === user.id)
              )
            }
          }

          if (reactions.some((r) => r.emoji === emoji && r.userId === user.id)) return m

          return {
            ...m,
            reactions: [
              ...reactions,
              {
                id: `${messageId}:${emoji}:${user.id}`,
                emoji,
                userId: user.id,
                user: { id: user.id, displayName: user.displayName }
              }
            ]
          }
        })
      }))
    },
    [token, activeChannelId, user]
  )

  /**
   * Grava a lista de gorjetas que a rota devolveu.
   *
   * Quem CHAMA a rota é o botão (components/social/TipPopover); aqui é só o
   * lugar onde a lista de mensagens vive. Sem isso a gorjeta só apareceria
   * pra quem a deu depois do eco do socket — e não apareceria de jeito nenhum
   * se o canal estivesse fechado no momento do clique.
   */
  const applyTips = React.useCallback(
    (messageId: string, tips: ChatMessage['tips']) => {
      if (!activeChannelId) return
      setByChannel((prev) => ({
        ...prev,
        [activeChannelId]: (prev[activeChannelId] ?? []).map((m) =>
          m.id === messageId ? { ...m, tips: tips ?? [] } : m
        )
      }))
    },
    [activeChannelId]
  )

  const togglePin = React.useCallback(
    async (messageId: string) => {
      if (!token || !activeChannelId) return
      const { isPinned } = await messagesApi.togglePin(token, messageId)

      setByChannel((prev) => ({
        ...prev,
        [activeChannelId]: (prev[activeChannelId] ?? []).map((m) =>
          m.id === messageId ? { ...m, isPinned } : m
        )
      }))

      // O painel de fixadas se atualiza a partir do que ja esta em memoria:
      // uma ida ao servidor a cada clique so pra reler a mesma lista e
      // desperdicio, e deixa o painel piscando.
      setPinnedByChannel((prev) => {
        const current = prev[activeChannelId] ?? []
        if (!isPinned) {
          return { ...prev, [activeChannelId]: current.filter((m) => m.id !== messageId) }
        }
        const source = (cacheRef.current[activeChannelId] ?? []).find(
          (m) => m.id === messageId
        )
        if (!source || current.some((m) => m.id === messageId)) return prev
        return { ...prev, [activeChannelId]: [{ ...source, isPinned: true }, ...current] }
      })
    },
    [token, activeChannelId]
  )

  const notifyTyping = React.useCallback(() => {
    if (!socket || !activeChannelId) return
    // Um evento por tecla entupiria o socket; 1 a cada 3s basta.
    const now = Date.now()
    if (now - lastTypingSentRef.current < 3_000) return
    lastTypingSentRef.current = now

    if (isDmId(activeChannelId)) {
      const conversationId = conversationIdOf(activeChannelId)
      const peer = conversationsRef.current.find((c) => c.id === conversationId)
      if (!peer) return
      socket.emit('dm:typing', { conversationId, toUserId: peer.other.id })
      return
    }

    socket.emit('typing', activeChannelId)
  }, [socket, activeChannelId])

  const setActiveChannel = React.useCallback((channelId: string) => {
    setActiveChannelId(channelId)
  }, [])

  const openDm = React.useCallback(
    async (userId: string) => {
      if (!token) return

      const existing = conversationsRef.current.find((c) => c.other.id === userId)
      if (existing) {
        setActiveChannelId(dmChannelId(existing.id))
        return
      }

      const conversation = await dmApi.open(token, userId)
      setConversations((prev) =>
        prev.some((c) => c.id === conversation.id) ? prev : [conversation, ...prev]
      )
      setActiveChannelId(dmChannelId(conversation.id))
    },
    [token]
  )

  const activeChannel = React.useMemo(
    () =>
      channels.find((c) => c.id === activeChannelId) ??
      dmChannels.find((c) => c.id === activeChannelId) ??
      null,
    [channels, dmChannels, activeChannelId]
  )

  const value = React.useMemo<ChatContextValue>(
    () => ({
      channels,
      textChannels,
      voiceChannels,
      dmChannels,
      conversations,
      loading,
      error,
      activeChannelId,
      activeChannel,
      setActiveChannel,
      openDm,
      messages: activeChannelId ? (byChannel[activeChannelId] ?? []) : [],
      loadingMessages,
      hasMore: activeChannelId ? !exhausted[activeChannelId] : false,
      loadOlder,
      unread,
      mentions,
      unreadMarker: activeChannelId ? (markers[activeChannelId] ?? null) : null,
      mutedChannels,
      toggleMuteChannel,
      isMuted,
      typing,
      pinned: activeChannelId ? (pinnedByChannel[activeChannelId] ?? []) : [],
      loadingPinned,
      send,
      edit,
      remove,
      react,
      applyTips,
      togglePin,
      notifyTyping,
      refreshChannels,
      refreshConversations
    }),
    [
      channels,
      textChannels,
      voiceChannels,
      dmChannels,
      conversations,
      loading,
      error,
      activeChannelId,
      activeChannel,
      setActiveChannel,
      openDm,
      byChannel,
      loadingMessages,
      exhausted,
      loadOlder,
      unread,
      mentions,
      markers,
      mutedChannels,
      toggleMuteChannel,
      isMuted,
      typing,
      pinnedByChannel,
      loadingPinned,
      send,
      edit,
      remove,
      react,
      applyTips,
      togglePin,
      notifyTyping,
      refreshChannels,
      refreshConversations
    ]
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat(): ChatContextValue {
  const ctx = React.useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within a ChatProvider')
  return ctx
}
