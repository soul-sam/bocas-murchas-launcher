import * as React from 'react'
import { io, type Socket } from 'socket.io-client'
import {
  API_ORIGIN,
  type AuthUser,
  type GameActivity,
  type RiotStatus,
  type UserStatus,
  type VoiceUser
} from './api'
import { useAuth } from './auth-context'

/**
 * O servidor recusou o handshake POR CAUSA DO TOKEN — as mensagens saem do
 * `io.use` de server.ts. Sem tratar, o cliente reconectaria pra sempre com uma
 * sessao morta: sem chat, sem presenca e sem nada na tela explicando.
 *
 * "Authentication failed" fica de fora de proposito: e o catch generico do
 * middleware (banco fora do ar, por exemplo). Derrubar a sessao por causa dele
 * mandaria pra tela de login quem so pegou um engasgo da VPS.
 */
const AUTH_REJECTED = ['Authentication required', 'Invalid token', 'User not found']

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
  /** userId -> microfone mudo / ensurdecido. So contem quem esta em call. */
  voiceFlags: Record<string, VoiceFlags>
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
  /**
   * Status da Riot de quem esta com o cliente do LoL aberto (userId ->
   * online/ausente/ocupado), jogando ou nao. Atualizado por
   * `lol:presence:changed`.
   */
  lolPresence: Record<string, RiotStatus>
}

/** O que a barra lateral desenha ao lado de quem esta na call. */
export interface VoiceFlags {
  muted: boolean
  deafened: boolean
}

const SocketContext = React.createContext<SocketContextValue | null>(null)

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token, user, expireSession, applyUser } = useAuth()

  /**
   * O usuário de AGORA, pra dentro dos handlers do socket.
   *
   * Os handlers são registrados uma vez por conexão e não podem depender do
   * objeto `user` (cada mudança de status refaria a conexão inteira). A ref
   * é como eles enxergam o status atual sem virar dependência.
   */
  const userRef = React.useRef(user)
  userRef.current = user

  const [socket, setSocket] = React.useState<Socket | null>(null)
  const [connected, setConnected] = React.useState(false)
  const [onlineUsers, setOnlineUsers] = React.useState<OnlineUser[]>([])
  const [voiceByChannel, setVoiceByChannel] = React.useState<Record<string, VoiceUser[]>>({})

  /**
   * Qual versão da lista de cada canal eu já tenho.
   *
   * O servidor numera cada mudança da sala (ver `voiceRev` no server.ts) porque
   * entre mudar a lista e mandá-la existe uma ida ao banco — e duas mudanças
   * quase juntas, que é o normal numa call, chegam aqui fora de ordem. Como o
   * cliente SUBSTITUI a lista do canal pelo que chega, o retrato velho apagava
   * quem tinha acabado de entrar. Era este o "sumiu da barra lateral mas está
   * na sala".
   *
   * Num ref e não em estado: isto decide se um evento vale, e essa decisão não
   * pode esperar o próximo render.
   */
  const voiceRevRef = React.useRef<Record<string, number>>({})
  const [screenShares, setScreenShares] = React.useState<ScreenShareMap>({})
  const [voiceFlags, setVoiceFlags] = React.useState<Record<string, VoiceFlags>>({})
  const [profileUpdates, setProfileUpdates] = React.useState<Record<string, AuthUser>>({})
  const [activities, setActivities] = React.useState<Record<string, ActivityEntry>>({})
  const [lolPresence, setLolPresence] = React.useState<Record<string, RiotStatus>>({})

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
      // Token vencido: e o sinal mais rapido de que a sessao caiu (chega antes
      // do proximo poll de API). Quem trata e o AuthProvider — daqui a pessoa
      // sai pra tela de login em vez de ficar em "Reconectando..." pra sempre.
      if (AUTH_REJECTED.includes(err.message)) {
        expireSession()
        return
      }
      // Unica pista pro resto: proxy sem upgrade, CORS, servidor fora do ar.
      console.warn('[socket] falha ao conectar:', err.message)
    }

    /**
     * EU TAMBÉM ESTOU NA LISTA — e é dela que o meu status sai.
     *
     * O `user` do AuthProvider nasce do `/auth/me` da abertura do app, e o
     * banco guarda 'offline' pra quem fechou o launcher da última vez. O
     * servidor promove pra 'online' ao conectar, mas ninguém contava isso pro
     * objeto local. Três estragos saíam daí:
     *
     *   - o rodapé desenhava a própria bolinha cinza o dia inteiro;
     *   - o AFK automático lia esse 'offline' como "escolheu ficar invisível"
     *     e nunca marcava ninguém — era por isso que "ausente" só existia na
     *     mão;
     *   - "Voltei!" devolvia esse 'offline' pro servidor, e a pessoa ficava
     *     cinza pra TODO MUNDO, estando online e na call.
     *
     * Agora o retrato da presença (que o servidor tira fresco do banco) e o
     * `user:profileUpdated` corrigem o status local sempre que divergirem.
     */
    const syncSelf = (fresh: { status?: UserStatus; customStatus?: string | null }): void => {
      const me = userRef.current
      if (!me) return
      const status = fresh.status ?? me.status
      const customStatus = fresh.customStatus ?? null
      if (status === me.status && customStatus === (me.customStatus ?? null)) return
      applyUser({ ...me, status, customStatus })
    }

    const handlePresence = (data: {
      onlineUsers?: OnlineUser[]
      activities?: Record<string, ActivityEntry>
      lolPresence?: Record<string, RiotStatus>
    }): void => {
      if (data?.lolPresence && typeof data.lolPresence === 'object') {
        setLolPresence(data.lolPresence)
      }
      if (Array.isArray(data?.onlineUsers)) {
        const list = data.onlineUsers.filter(Boolean)
        setOnlineUsers(list)
        const me = list.find((person) => person.id === userRef.current?.id)
        if (me) syncSelf(me)
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

    const handleLolPresenceChanged = (data: { userId: string; status: RiotStatus | null }): void => {
      if (!data?.userId) return
      setLolPresence((prev) => {
        if (prev[data.userId] === (data.status ?? undefined)) return prev
        const next = { ...prev }
        if (data.status) next[data.userId] = data.status
        else delete next[data.userId]
        return next
      })
    }

    const handleActivityState =(data: { activities?: Record<string, ActivityEntry> }): void => {
      if (data?.activities && typeof data.activities === 'object') {
        setActivities(data.activities)
      }
    }

    const handleVoiceState = (data: {
      byChannelId?: Record<string, VoiceUser[]>
      revByChannelId?: Record<string, number>
      sharingByChannelId?: Record<string, string[]>
      mutedUserIds?: string[]
      deafenedUserIds?: string[]
    }): void => {
      // Isto e um RETRATO do servidor, entao SUBSTITUI os dois mapas em vez de
      // misturar: misturar deixaria pra tras gente que saiu da call (ou parou
      // de transmitir) enquanto o socket estava fora.
      //
      // E o retrato reinicia a contagem de versoes: ele e, por definicao, a
      // verdade mais nova que existe.
      voiceRevRef.current = data?.revByChannelId ?? {}
      setVoiceByChannel(data?.byChannelId ?? {})
      setScreenShares(data?.sharingByChannelId ?? {})

      const flags: Record<string, VoiceFlags> = {}
      for (const id of data?.mutedUserIds ?? []) {
        flags[id] = { muted: true, deafened: false }
      }
      for (const id of data?.deafenedUserIds ?? []) {
        flags[id] = { muted: flags[id]?.muted ?? false, deafened: true }
      }
      setVoiceFlags(flags)
    }

    const handleVoiceFlags = (data: {
      userId: string
      muted?: boolean
      deafened?: boolean
    }): void => {
      if (!data?.userId) return
      setVoiceFlags((prev) => ({
        ...prev,
        [data.userId]: {
          muted: Boolean(data.muted),
          deafened: Boolean(data.deafened)
        }
      }))
    }

    const handleVoiceChanged = (data: {
      channelId: string
      /** Versão da sala que ESTA lista descreve. Ver `voiceRevRef`. */
      rev?: number
      voiceUsers?: VoiceUser[]
    }): void => {
      if (!data?.channelId) return

      /**
       * Retrato velho não manda em retrato novo.
       *
       * `>=` e não `>`: dois eventos da mesma versão descrevem a mesma sala, e
       * reaplicar não muda nada — mas o primeiro que chegou já valeu. Servidor
       * antigo (sem `rev`) continua funcionando como antes: sem número, não há
       * o que comparar e o evento passa.
       */
      if (typeof data.rev === 'number') {
        const known = voiceRevRef.current[data.channelId] ?? 0
        if (data.rev < known) return
        voiceRevRef.current[data.channelId] = data.rev
      }

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
      const fresh = data.user
      setProfileUpdates((prev) => ({ ...prev, [fresh.id]: fresh }))

      /**
       * A presença também carrega nome, avatar e status: se a pessoa está
       * online, o retrato dela acompanha a edição na hora. É o que permite à
       * lista de membros desenhar a presença POR CIMA da edição de perfil
       * (ver members-context) sem perder a edição — e sem o estrago antigo,
       * em que a edição ficava por cima de todo retrato futuro, pra sempre.
       */
      const keep = <T,>(next: T | undefined, current: T): T =>
        next === undefined ? current : next
      setOnlineUsers((prev) =>
        prev.map((person) =>
          person.id === fresh.id
            ? {
                ...person,
                displayName: fresh.displayName || person.displayName,
                avatar: keep(fresh.avatar, person.avatar),
                status: keep(fresh.status, person.status),
                customStatus: keep(fresh.customStatus, person.customStatus),
                profileColor: keep(fresh.profileColor, person.profileColor)
              }
            : person
        )
      )

      if (fresh.id === userRef.current?.id) syncSelf(fresh)
    }

    client.on('connect', handleConnect)
    client.on('disconnect', handleDisconnect)
    client.on('connect_error', handleConnectError)
    client.on('userOnline', handlePresence)
    client.on('userOffline', handlePresence)
    client.on('voiceState', handleVoiceState)
    client.on('voiceUserJoined', handleVoiceChanged)
    client.on('voiceUserLeft', handleVoiceChanged)
    client.on('voice:flags', handleVoiceFlags)
    client.on('screenshare:state', handleScreenShare)
    client.on('user:profileUpdated', handleProfileUpdated)
    client.on('activity:changed', handleActivityChanged)
    client.on('activity:state', handleActivityState)
    client.on('lol:presence:changed', handleLolPresenceChanged)

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
      client.off('voice:flags', handleVoiceFlags)
      client.off('screenshare:state', handleScreenShare)
      client.off('user:profileUpdated', handleProfileUpdated)
      client.off('activity:changed', handleActivityChanged)
      client.off('activity:state', handleActivityState)
      client.off('lol:presence:changed', handleLolPresenceChanged)
      client.disconnect()
      setSocket(null)
      setConnected(false)
    }
  }, [token, user?.id, expireSession, applyUser])

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
      voiceFlags,
      screenShares,
      profileUpdates,
      activities,
      lolPresence
    }),
    [
      socket,
      connected,
      onlineUsers,
      onlineIds,
      presenceById,
      voiceByChannel,
      voiceFlags,
      screenShares,
      profileUpdates,
      activities,
      lolPresence
    ]
  )

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}

export function useSocket(): SocketContextValue {
  const ctx = React.useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within a SocketProvider')
  return ctx
}
