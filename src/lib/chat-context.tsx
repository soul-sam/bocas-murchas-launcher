import * as React from 'react'
import {
  channels as channelsApi,
  messages as messagesApi,
  type Channel,
  type ChatMessage
} from './api'
import { useAuth } from './auth-context'
import { useSocket } from './socket-context'

/**
 * Canais de texto e mensagens.
 *
 * O cliente entra na sala de TODOS os canais de texto, nao so no aberto. E o
 * que permite contar nao-lidas nos outros canais — igual Discord. O canal ativo
 * so muda qual lista aparece na tela.
 */

const PAGE_SIZE = 50

interface TypingUser {
  id: string
  displayName: string
  at: number
}

interface ChatContextValue {
  channels: Channel[]
  textChannels: Channel[]
  voiceChannels: Channel[]
  loading: boolean
  error: string | null

  activeChannelId: string | null
  activeChannel: Channel | null
  setActiveChannel: (channelId: string) => void

  messages: ChatMessage[]
  loadingMessages: boolean
  hasMore: boolean
  loadOlder: () => Promise<void>

  unread: Record<string, number>
  typing: TypingUser[]

  send: (payload: {
    content: string
    imageUrl?: string
    replyToId?: string
  }) => Promise<void>
  edit: (messageId: string, content: string) => Promise<void>
  remove: (messageId: string) => Promise<void>
  react: (messageId: string, emoji: string) => Promise<void>
  togglePin: (messageId: string) => Promise<void>
  notifyTyping: () => void

  refreshChannels: () => Promise<void>
}

const ChatContext = React.createContext<ChatContextValue | null>(null)

const TYPING_TTL_MS = 5_000

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth()
  const { socket } = useSocket()

  const [channels, setChannels] = React.useState<Channel[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [activeChannelId, setActiveChannelId] = React.useState<string | null>(null)
  const [byChannel, setByChannel] = React.useState<Record<string, ChatMessage[]>>({})
  const [loadingMessages, setLoadingMessages] = React.useState(false)
  const [exhausted, setExhausted] = React.useState<Record<string, boolean>>({})
  const [unread, setUnread] = React.useState<Record<string, number>>({})
  const [typing, setTyping] = React.useState<TypingUser[]>([])

  // Handlers de socket precisam do canal ativo sem virar dependencia do effect.
  const activeRef = React.useRef<string | null>(null)
  activeRef.current = activeChannelId

  const lastTypingSentRef = React.useRef(0)

  /** Espelho de byChannel pra checar cache sem virar dependencia de efeito. */
  const cacheRef = React.useRef<Record<string, ChatMessage[]>>({})
  cacheRef.current = byChannel

  const textChannels = React.useMemo(
    () => channels.filter((c) => c.type === 'text' || c.type === 'announcements'),
    [channels]
  )
  const voiceChannels = React.useMemo(
    () => channels.filter((c) => c.type === 'voice'),
    [channels]
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

  React.useEffect(() => {
    if (!token) {
      setChannels([])
      setLoading(false)
      return
    }
    setLoading(true)
    void refreshChannels()
  }, [token, refreshChannels])

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

  // --- eventos de mensagem ------------------------------------------------
  React.useEffect(() => {
    if (!socket) return

    const handleCreated = (data: { channelId: string; message: ChatMessage }): void => {
      const { channelId, message } = data ?? {}
      if (!channelId || !message?.id) return

      setByChannel((prev) => {
        const list = prev[channelId] ?? []
        // O servidor devolve pro autor tambem; nao duplicar.
        if (list.some((m) => m.id === message.id)) return prev
        return { ...prev, [channelId]: [...list, message] }
      })

      const isMine = message.author?.id === user?.id
      if (!isMine && channelId !== activeRef.current) {
        setUnread((prev) => ({ ...prev, [channelId]: (prev[channelId] ?? 0) + 1 }))
      }

      // Quem mandou parou de digitar.
      setTyping((prev) => prev.filter((t) => t.id !== message.author?.id))
    }

    const handleDeleted = (data: { channelId: string; messageId: string }): void => {
      if (!data?.channelId) return
      setByChannel((prev) => ({
        ...prev,
        [data.channelId]: (prev[data.channelId] ?? []).filter((m) => m.id !== data.messageId)
      }))
    }

    const handleTyping = (data: {
      channelId: string
      user: { id: string; displayName: string }
    }): void => {
      if (data?.channelId !== activeRef.current) return
      if (!data?.user?.id || data.user.id === user?.id) return

      setTyping((prev) => {
        const rest = prev.filter((t) => t.id !== data.user.id)
        return [...rest, { ...data.user, at: Date.now() }]
      })
    }

    const handleStopTyping = (data: { channelId: string; userId: string }): void => {
      setTyping((prev) => prev.filter((t) => t.id !== data?.userId))
    }

    socket.on('messageCreated', handleCreated)
    socket.on('messageDeleted', handleDeleted)
    socket.on('userTyping', handleTyping)
    socket.on('userStopTyping', handleStopTyping)

    return () => {
      socket.off('messageCreated', handleCreated)
      socket.off('messageDeleted', handleDeleted)
      socket.off('userTyping', handleTyping)
      socket.off('userStopTyping', handleStopTyping)
    }
  }, [socket, user?.id])

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
  React.useEffect(() => {
    if (!activeChannelId) return
    setUnread((prev) => (prev[activeChannelId] ? { ...prev, [activeChannelId]: 0 } : prev))
    setTyping([])
  }, [activeChannelId])

  // --- carregar mensagens do canal aberto ---------------------------------
  React.useEffect(() => {
    if (!token || !activeChannelId) return

    // Le o cache por ref: se byChannel fosse dependencia, o efeito rodaria a
    // cada mensagem nova que chega.
    if (cacheRef.current[activeChannelId]) return

    let cancelled = false
    setLoadingMessages(true)
    ;(async () => {
      try {
        const list = await messagesApi.list(token, activeChannelId, { limit: PAGE_SIZE })
        if (cancelled) return
        setByChannel((prev) => ({ ...prev, [activeChannelId]: list }))
        if (list.length < PAGE_SIZE) {
          setExhausted((prev) => ({ ...prev, [activeChannelId]: true }))
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

  const loadOlder = React.useCallback(async () => {
    if (!token || !activeChannelId) return
    const current = byChannel[activeChannelId] ?? []
    if (current.length === 0 || exhausted[activeChannelId]) return

    try {
      const older = await messagesApi.list(token, activeChannelId, {
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
    async (payload: { content: string; imageUrl?: string; replyToId?: string }) => {
      if (!token || !activeChannelId) return

      const message = await messagesApi.send(token, activeChannelId, {
        content: payload.content,
        type: payload.imageUrl ? 'image' : 'text',
        imageUrl: payload.imageUrl,
        replyToId: payload.replyToId
      })

      // Aparece na hora pra quem mandou; o broadcast cuida do resto.
      setByChannel((prev) => {
        const list = prev[activeChannelId] ?? []
        if (list.some((m) => m.id === message.id)) return prev
        return { ...prev, [activeChannelId]: [...list, message] }
      })

      socket?.emit('newMessage', { channelId: activeChannelId, message })
      socket?.emit('stopTyping', activeChannelId)
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
      socket?.emit('deleteMessage', { channelId: activeChannelId, messageId })
    },
    [token, activeChannelId, socket]
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

      socket?.emit('messageReaction', {
        channelId: activeChannelId,
        messageId,
        emoji,
        action
      })
    },
    [token, activeChannelId, user, socket]
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
    },
    [token, activeChannelId]
  )

  const notifyTyping = React.useCallback(() => {
    if (!socket || !activeChannelId) return
    // Um evento por tecla entupiria o socket; 1 a cada 3s basta.
    const now = Date.now()
    if (now - lastTypingSentRef.current < 3_000) return
    lastTypingSentRef.current = now
    socket.emit('typing', activeChannelId)
  }, [socket, activeChannelId])

  const setActiveChannel = React.useCallback((channelId: string) => {
    setActiveChannelId(channelId)
  }, [])

  const activeChannel = React.useMemo(
    () => channels.find((c) => c.id === activeChannelId) ?? null,
    [channels, activeChannelId]
  )

  const value = React.useMemo<ChatContextValue>(
    () => ({
      channels,
      textChannels,
      voiceChannels,
      loading,
      error,
      activeChannelId,
      activeChannel,
      setActiveChannel,
      messages: activeChannelId ? (byChannel[activeChannelId] ?? []) : [],
      loadingMessages,
      hasMore: activeChannelId ? !exhausted[activeChannelId] : false,
      loadOlder,
      unread,
      typing,
      send,
      edit,
      remove,
      react,
      togglePin,
      notifyTyping,
      refreshChannels
    }),
    [
      channels,
      textChannels,
      voiceChannels,
      loading,
      error,
      activeChannelId,
      activeChannel,
      setActiveChannel,
      byChannel,
      loadingMessages,
      exhausted,
      loadOlder,
      unread,
      typing,
      send,
      edit,
      remove,
      react,
      togglePin,
      notifyTyping,
      refreshChannels
    ]
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat(): ChatContextValue {
  const ctx = React.useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within a ChatProvider')
  return ctx
}
