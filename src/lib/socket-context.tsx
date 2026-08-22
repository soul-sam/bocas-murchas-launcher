import * as React from 'react'
import { io, type Socket } from 'socket.io-client'
import { API_ORIGIN, type AuthUser, type VoiceUser } from './api'
import { useAuth } from './auth-context'

/**
 * Conexao unica de Socket.io do launcher.
 *
 * Tudo em tempo real passa por aqui: presenca, chat, quem esta em cada canal de
 * voz, soundboard e nudge. Os outros contextos pegam o `socket` daqui em vez de
 * abrir conexao propria — varias conexoes fariam o servidor achar que a pessoa
 * esta online duas vezes.
 */

export interface OnlineUser {
  id: string
  username?: string
  displayName: string
  avatar?: string | null
  role?: string
}

/** Quem esta compartilhando tela agora, por canal. */
export type ScreenShareMap = Record<string, string[]>

interface SocketContextValue {
  socket: Socket | null
  connected: boolean
  onlineUsers: OnlineUser[]
  onlineIds: Set<string>
  /** channelId -> pessoas na voz */
  voiceByChannel: Record<string, VoiceUser[]>
  /** channelId -> userIds compartilhando tela */
  screenShares: ScreenShareMap
  /** Perfis atualizados em tempo real (id -> user). */
  profileUpdates: Record<string, AuthUser>
}

const SocketContext = React.createContext<SocketContextValue | null>(null)

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth()

  const [socket, setSocket] = React.useState<Socket | null>(null)
  const [connected, setConnected] = React.useState(false)
  const [onlineUsers, setOnlineUsers] = React.useState<OnlineUser[]>([])
  const [voiceByChannel, setVoiceByChannel] = React.useState<Record<string, VoiceUser[]>>({})
  const [screenShares, setScreenShares] = React.useState<ScreenShareMap>({})
  const [profileUpdates, setProfileUpdates] = React.useState<Record<string, AuthUser>>({})

  React.useEffect(() => {
    if (!token || !user) {
      setSocket(null)
      setConnected(false)
      setOnlineUsers([])
      return
    }

    const client = io(API_ORIGIN, {
      auth: { token },
      transports: ['websocket'],
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 8_000
    })

    const handleConnect = (): void => {
      setConnected(true)
      // Ao reconectar o estado local pode estar velho. A presenca precisa ser
      // pedida junto: ela so chegava em `userOnline`/`userOffline`, entao uma
      // queda de conexao deixava a lista da direita congelada no que era
      // verdade antes da queda — gente online aparecendo offline.
      client.emit('requestVoiceState')
      client.emit('requestPresence')
    }

    const handleDisconnect = (): void => setConnected(false)

    const handlePresence = (data: { onlineUsers?: OnlineUser[] }): void => {
      if (Array.isArray(data?.onlineUsers)) {
        setOnlineUsers(data.onlineUsers.filter(Boolean))
      }
    }

    const handleVoiceState = (data: { byChannelId: Record<string, VoiceUser[]> }): void => {
      setVoiceByChannel(data?.byChannelId ?? {})
    }

    const handleVoiceChanged = (data: {
      channelId: string
      voiceUsers: VoiceUser[]
    }): void => {
      if (!data?.channelId) return
      setVoiceByChannel((prev) => ({ ...prev, [data.channelId]: data.voiceUsers ?? [] }))
    }

    const handleScreenShare = (data: {
      channelId: string
      userId: string
      active: boolean
    }): void => {
      if (!data?.channelId || !data?.userId) return
      setScreenShares((prev) => {
        const current = prev[data.channelId] ?? []
        const next = data.active
          ? current.includes(data.userId)
            ? current
            : [...current, data.userId]
          : current.filter((id) => id !== data.userId)
        return { ...prev, [data.channelId]: next }
      })
    }

    const handleProfileUpdated = (data: { user: AuthUser }): void => {
      if (!data?.user?.id) return
      setProfileUpdates((prev) => ({ ...prev, [data.user.id]: data.user }))
    }

    client.on('connect', handleConnect)
    client.on('disconnect', handleDisconnect)
    client.on('userOnline', handlePresence)
    client.on('userOffline', handlePresence)
    client.on('voiceState', handleVoiceState)
    client.on('voiceUserJoined', handleVoiceChanged)
    client.on('voiceUserLeft', handleVoiceChanged)
    client.on('screenshare:state', handleScreenShare)
    client.on('user:profileUpdated', handleProfileUpdated)

    setSocket(client)

    return () => {
      client.off('connect', handleConnect)
      client.off('disconnect', handleDisconnect)
      client.off('userOnline', handlePresence)
      client.off('userOffline', handlePresence)
      client.off('voiceState', handleVoiceState)
      client.off('voiceUserJoined', handleVoiceChanged)
      client.off('voiceUserLeft', handleVoiceChanged)
      client.off('screenshare:state', handleScreenShare)
      client.off('user:profileUpdated', handleProfileUpdated)
      client.disconnect()
      setSocket(null)
      setConnected(false)
    }
  }, [token, user?.id])

  const onlineIds = React.useMemo(
    () => new Set(onlineUsers.map((u) => u.id)),
    [onlineUsers]
  )

  const value = React.useMemo<SocketContextValue>(
    () => ({
      socket,
      connected,
      onlineUsers,
      onlineIds,
      voiceByChannel,
      screenShares,
      profileUpdates
    }),
    [socket, connected, onlineUsers, onlineIds, voiceByChannel, screenShares, profileUpdates]
  )

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}

export function useSocket(): SocketContextValue {
  const ctx = React.useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within a SocketProvider')
  return ctx
}
