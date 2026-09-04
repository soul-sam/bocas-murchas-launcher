import * as React from 'react'
import { io, type Socket } from 'socket.io-client'
import {
  API_ORIGIN,
  type AuthUser,
  type GameActivity,
  type UserStatus,
  type VoiceUser
} from './api'
import { useAuth } from './auth-context'

/** Atividade de alguem, como o servidor guarda (com quem e quando). */
export interface ActivityEntry extends GameActivity {
  userId: string
  updatedAt: number
}

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
  /**
   * Status de AGORA.
   *
   * Vem junto com a presenca de proposito. O `status` que a lista de membros
   * traz do REST e uma foto do momento em que o app abriu: quem entrasse em
   * "nao perturbe" depois disso continuava verde pros outros.
   */
  status?: UserStatus
  customStatus?: string | null
  profileColor?: string | null
}

/** Quem esta compartilhando tela agora, por canal. */
export type ScreenShareMap = Record<string, string[]>

interface SocketContextValue {
  socket: Socket | null
  connected: boolean
  onlineUsers: OnlineUser[]
  onlineIds: Set<string>
  /** Presenca indexada por id — o mesmo dado de `onlineUsers`, pra lookup. */
  presenceById: Record<string, OnlineUser>
  /** channelId -> pessoas na voz */
  voiceByChannel: Record<string, VoiceUser[]>
  /** channelId -> userIds compartilhando tela */
  screenShares: ScreenShareMap
  /** Perfis atualizados em tempo real (id -> user). */
  profileUpdates: Record<string, AuthUser>
  /**
   * Quem esta jogando o que (userId -> atividade). Vem no mesmo retrato da
   * presenca e e atualizado por `activity:changed`. Quem nao esta jogando
   * simplesmente nao esta no mapa.
   */
  activities: Record<string, ActivityEntry>
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
  const [activities, setActivities] = React.useState<Record<string, ActivityEntry>>({})

  React.useEffect(() => {
    if (!token || !user) {
      setSocket(null)
      setConnected(false)
      setOnlineUsers([])
      return
    }

    const client = io(API_ORIGIN, {
      auth: { token },
      /**
       * Websocket primeiro, long-polling de reserva.
       *
       * Antes era `['websocket']` e mais nada. Onde o upgrade nao passa — proxy
       * mal configurado, rede corporativa, antivirus que abre o TLS — o
       * launcher nao conectava DE JEITO NENHUM: ficava em "Reconectando..." pra
       * sempre, sem chat, sem presenca e sem nenhum erro na tela. `polling`
       * atras (e `tryAllTransports`, que e o que de fato faz o cliente tentar o
       * segundo da lista) troca "nao funciona" por "funciona mais devagar".
       */
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 8_000,
      // Sem teto de tentativas: o launcher fica aberto o dia inteiro e precisa
      // voltar sozinho quando a internet voltar, sem ninguem reabrir o app.
      reconnectionAttempts: Infinity,
      timeout: 10_000
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

    /**
     * Cair NAO limpa a lista.
     *
     * A ultima presenca conhecida e o melhor palpite que temos enquanto
     * estamos fora — a galera provavelmente continua online, quem sumiu foi a
     * nossa conexao. Quem avisa que estamos desconectados e a bolinha vermelha
     * do topo da barra; a lista e corrigida inteira no `connect` seguinte.
     */
    const handleDisconnect = (): void => setConnected(false)

    const handleConnectError = (err: Error): void => {
      setConnected(false)
      // Unica pista quando o app fica preso em "Reconectando...": token
      // vencido, proxy sem upgrade, CORS, servidor fora do ar.
      console.warn('[socket] falha ao conectar:', err.message)
    }

    const handlePresence = (data: {
      onlineUsers?: OnlineUser[]
      activities?: Record<string, ActivityEntry>
    }): void => {
      if (Array.isArray(data?.onlineUsers)) {
        setOnlineUsers(data.onlineUsers.filter(Boolean))
      }
      // Retrato completo: SUBSTITUI, pelo mesmo motivo do estado de voz.
      if (data?.activities && typeof data.activities === 'object') {
        setActivities(data.activities)
      }
    }

    const handleActivityChanged = (data: {
      userId: string
      activity: ActivityEntry | null
    }): void => {
      if (!data?.userId) return
      setActivities((prev) => {
        if (!data.activity) {
          if (!(data.userId in prev)) return prev
          const next = { ...prev }
          delete next[data.userId]
          return next
        }
        return { ...prev, [data.userId]: data.activity }
      })
    }

    const handleActivityState = (data: { activities?: Record<string, ActivityEntry> }): void => {
      if (data?.activities && typeof data.activities === 'object') {
        setActivities(data.activities)
      }
    }

    const handleVoiceState = (data: {
      byChannelId?: Record<string, VoiceUser[]>
      sharingByChannelId?: Record<string, string[]>
    }): void => {
      // Isto e um RETRATO do servidor, entao SUBSTITUI os dois mapas em vez de
      // misturar: misturar deixaria pra tras gente que saiu da call (ou parou
      // de transmitir) enquanto o socket estava fora.
      setVoiceByChannel(data?.byChannelId ?? {})
      setScreenShares(data?.sharingByChannelId ?? {})
    }

    const handleVoiceChanged = (data: {
      channelId: string
      voiceUsers?: VoiceUser[]
    }): void => {
      if (!data?.channelId) return

      const roster = data.voiceUsers ?? []
      setVoiceByChannel((prev) => ({ ...prev, [data.channelId]: roster }))

      /**
       * Quem nao esta mais na sala nao esta transmitindo.
       *
       * O servidor tambem manda `screenshare:state` quando alguem cai
       * transmitindo, mas a ordem de chegada dos dois eventos nao e garantida —
       * e bolinha vermelha grudada e o tipo de coisa que ninguem consegue
       * limpar sem fechar o launcher.
       */
      const present = new Set(roster.map((u) => u.id))
      setScreenShares((prev) => {
        const current = prev[data.channelId]
        if (!current || current.length === 0) return prev

        const next = current.filter((id) => present.has(id))
        if (next.length === current.length) return prev
        return { ...prev, [data.channelId]: next }
      })
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
    client.on('connect_error', handleConnectError)
    client.on('userOnline', handlePresence)
    client.on('userOffline', handlePresence)
    client.on('voiceState', handleVoiceState)
    client.on('voiceUserJoined', handleVoiceChanged)
    client.on('voiceUserLeft', handleVoiceChanged)
    client.on('screenshare:state', handleScreenShare)
    client.on('user:profileUpdated', handleProfileUpdated)
    client.on('activity:changed', handleActivityChanged)
    client.on('activity:state', handleActivityState)

    setSocket(client)

    return () => {
      client.off('connect', handleConnect)
      client.off('disconnect', handleDisconnect)
      client.off('connect_error', handleConnectError)
      client.off('userOnline', handlePresence)
      client.off('userOffline', handlePresence)
      client.off('voiceState', handleVoiceState)
      client.off('voiceUserJoined', handleVoiceChanged)
      client.off('voiceUserLeft', handleVoiceChanged)
      client.off('screenshare:state', handleScreenShare)
      client.off('user:profileUpdated', handleProfileUpdated)
      client.off('activity:changed', handleActivityChanged)
      client.off('activity:state', handleActivityState)
      client.disconnect()
      setSocket(null)
      setConnected(false)
    }
  }, [token, user?.id])

  const onlineIds = React.useMemo(
    () => new Set(onlineUsers.map((u) => u.id)),
    [onlineUsers]
  )

  const presenceById = React.useMemo(() => {
    const map: Record<string, OnlineUser> = {}
    for (const person of onlineUsers) map[person.id] = person
    return map
  }, [onlineUsers])

  const value = React.useMemo<SocketContextValue>(
    () => ({
      socket,
      connected,
      onlineUsers,
      onlineIds,
      presenceById,
      voiceByChannel,
      screenShares,
      profileUpdates,
      activities
    }),
    [
      socket,
      connected,
      onlineUsers,
      onlineIds,
      presenceById,
      voiceByChannel,
      screenShares,
      profileUpdates,
      activities
    ]
  )

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}

export function useSocket(): SocketContextValue {
  const ctx = React.useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within a SocketProvider')
  return ctx
}
