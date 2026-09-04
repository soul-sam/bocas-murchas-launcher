import * as React from 'react'
import { useSocket } from './socket-context'
import { useVoice } from './voice-context'
import { fetchYouTubeTitle, parseYouTubeUrl } from './youtube'

/**
 * ASSISTIR JUNTO — o controle remoto compartilhado da call.
 *
 * O servidor guarda, por canal de voz, qual vídeo está no ar, se está tocando
 * e em que segundo estava no instante `updatedAt`. Este contexto espelha isso
 * (`watch:state:all` ao conectar, `watch:state` a cada mudança) e expõe as
 * ações. O PLAYER não mora aqui: ele é do WatchStage, que precisa do iframe na
 * tela. Aqui fica só o que a sidebar, o cartão do chat e o palco leem em comum.
 *
 * Regra de ouro: o estado do servidor ganha. Apertar play não muda nada local
 * — manda `watch:play`, o servidor responde pra sala inteira (inclusive pra
 * quem apertou) e todo mundo aplica a mesma coisa. Assim não existe "meu
 * player diz uma coisa e o do Fulano diz outra".
 *
 * RELÓGIO: a posição esperada é `positionSec + (agora - updatedAt)`, mas o
 * `agora` de cada máquina anda segundos fora do do servidor. Todo payload vem
 * com `serverNow`; medimos a diferença na chegada e usamos o relógio do
 * servidor na conta. Um relógio 8s adiantado sem essa correção virava um seek
 * de 8s pra frente em cada pessoa, a cada mensagem.
 */

export interface WatchQueueItem {
  videoId: string
  title?: string
  /** Quem botou na fila. */
  addedBy: string
}

export interface WatchSession {
  channelId: string
  videoId: string
  title?: string
  playing: boolean
  /** Posição (s) no instante `updatedAt` (relógio do servidor). */
  positionSec: number
  updatedAt: number
  /** Quem trouxe o vídeo. Não é dono: qualquer um na call controla. */
  hostUserId: string
  queue?: WatchQueueItem[]
}

export interface WatchAck {
  ok: boolean
  error?: string
  session?: WatchSession
}

interface WatchContextValue {
  /** channelId -> sessão. Fresco só pro MEU canal; os outros são o retrato do connect. */
  sessions: Record<string, WatchSession>
  sessionFor: (channelId: string) => WatchSession | null
  /** Sessão do canal de voz em que estou. Null fora da call ou sem vídeo. */
  current: WatchSession | null
  /** Onde o vídeo deveria estar AGORA (s), pelo relógio do servidor. */
  expectedPosition: (session?: WatchSession | null) => number

  /** Cola um link (ou id) e bota pra tocar pra sala. Busca o título antes. */
  set: (urlOrId: string) => Promise<WatchAck>
  queueAdd: (urlOrId: string) => Promise<WatchAck>
  next: () => Promise<WatchAck>
  play: (positionSec: number) => Promise<WatchAck>
  pause: (positionSec: number) => Promise<WatchAck>
  seek: (positionSec: number) => Promise<WatchAck>
  stop: () => Promise<WatchAck>

  /** Recusa do servidor na última ação (cooldown, link inválido). Some sozinha. */
  feedback: string | null
  clearFeedback: () => void
}

const Context = React.createContext<WatchContextValue | null>(null)

/** Quanto esperar o ack antes de assumir que a conexão engoliu o evento. */
const ACK_TIMEOUT_MS = 6_000

function isSession(value: unknown): value is WatchSession {
  if (!value || typeof value !== 'object') return false
  const s = value as Partial<WatchSession>
  return typeof s.channelId === 'string' && typeof s.videoId === 'string'
}

export function WatchProvider({ children }: { children: React.ReactNode }) {
  const { socket } = useSocket()
  const voice = useVoice()

  const [sessions, setSessions] = React.useState<Record<string, WatchSession>>({})
  const [feedback, setFeedback] = React.useState<string | null>(null)

  /** servidor - local, em ms. Zero até a primeira mensagem chegar. */
  const clockOffsetRef = React.useRef(0)

  const noteServerClock = React.useCallback((serverNow: unknown) => {
    if (typeof serverNow === 'number' && Number.isFinite(serverNow)) {
      clockOffsetRef.current = serverNow - Date.now()
    }
  }, [])

  // --- receber ------------------------------------------------------------
  React.useEffect(() => {
    if (!socket) return

    // Retrato completo: SUBSTITUI. Vem no connect e no reconnect, e é a única
    // chance de esquecer sessões de canais em que não estamos (a sala `voice:`
    // só nos conta o que muda no canal onde estamos).
    const handleAll = (data: { sessions?: Record<string, unknown>; serverNow?: unknown }): void => {
      noteServerClock(data?.serverNow)
      const next: Record<string, WatchSession> = {}
      if (data?.sessions && typeof data.sessions === 'object') {
        for (const [channelId, session] of Object.entries(data.sessions)) {
          if (isSession(session)) next[channelId] = session
        }
      }
      setSessions(next)
    }

    const handleState = (data: { channelId?: unknown; session?: unknown; serverNow?: unknown }): void => {
      if (typeof data?.channelId !== 'string') return
      noteServerClock(data.serverNow)
      const channelId = data.channelId
      setSessions((current) => {
        if (isSession(data.session)) return { ...current, [channelId]: data.session }
        if (!(channelId in current)) return current
        const rest = { ...current }
        delete rest[channelId]
        return rest
      })
    }

    socket.on('watch:state:all', handleAll)
    socket.on('watch:state', handleState)
    return () => {
      socket.off('watch:state:all', handleAll)
      socket.off('watch:state', handleState)
    }
  }, [socket, noteServerClock])

  /**
   * Entrei numa call: pede o retrato DESSE canal. O `watch:state:all` do
   * connect pode ter minutos, e a sala só avisa o que muda depois de entrar —
   * sem isso quem chegava atrasado via o vídeo no segundo em que o app abriu.
   */
  const myChannelId = voice.connected ? voice.channel?.id ?? null : null
  React.useEffect(() => {
    if (!socket || !myChannelId) return
    socket.emit('watch:request', { channelId: myChannelId })
  }, [socket, myChannelId])

  // --- enviar -------------------------------------------------------------
  const request = React.useCallback(
    (event: string, payload?: unknown): Promise<WatchAck> =>
      new Promise((resolve) => {
        if (!socket?.connected) {
          resolve({ ok: false, error: 'Sem conexão com o servidor.' })
          return
        }

        let settled = false
        const finish = (ack: WatchAck): void => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (!ack.ok && ack.error) setFeedback(ack.error)
          resolve(ack)
        }

        const timer = setTimeout(
          () => finish({ ok: false, error: 'O servidor não respondeu.' }),
          ACK_TIMEOUT_MS
        )

        socket.emit(event, payload ?? {}, (response: unknown) => {
          const ack = (response && typeof response === 'object' ? response : { ok: false }) as WatchAck
          finish(ack)
        })
      }),
    [socket]
  )

  /**
   * Título antes do set, não depois: o cartão no chat e o cabeçalho de todo
   * mundo nascem do primeiro `watch:state`. Buscar depois exigiria um
   * segundo evento só pra corrigir o texto.
   */
  const resolveVideo = React.useCallback(async (urlOrId: string) => {
    const parsed = parseYouTubeUrl(urlOrId)
    if (!parsed) return null
    const title = await fetchYouTubeTitle(parsed.videoId)
    return { videoId: parsed.videoId, title: title ?? undefined }
  }, [])

  const set = React.useCallback(
    async (urlOrId: string): Promise<WatchAck> => {
      const video = await resolveVideo(urlOrId)
      if (!video) {
        setFeedback('Isso não parece um link do YouTube.')
        return { ok: false, error: 'Isso não parece um link do YouTube.' }
      }
      return request('watch:set', video)
    },
    [request, resolveVideo]
  )

  const queueAdd = React.useCallback(
    async (urlOrId: string): Promise<WatchAck> => {
      const video = await resolveVideo(urlOrId)
      if (!video) {
        setFeedback('Isso não parece um link do YouTube.')
        return { ok: false, error: 'Isso não parece um link do YouTube.' }
      }
      return request('watch:queue:add', video)
    },
    [request, resolveVideo]
  )

  const next = React.useCallback(() => request('watch:next'), [request])
  const play = React.useCallback((positionSec: number) => request('watch:play', { positionSec }), [request])
  const pause = React.useCallback((positionSec: number) => request('watch:pause', { positionSec }), [request])
  const seek = React.useCallback((positionSec: number) => request('watch:seek', { positionSec }), [request])
  const stop = React.useCallback(() => request('watch:stop'), [request])

  const clearFeedback = React.useCallback(() => setFeedback(null), [])

  React.useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => setFeedback(null), 3_500)
    return () => clearTimeout(timer)
  }, [feedback])

  // --- leitura ------------------------------------------------------------
  const sessionFor = React.useCallback(
    (channelId: string) => sessions[channelId] ?? null,
    [sessions]
  )

  const current = myChannelId ? sessions[myChannelId] ?? null : null

  const expectedPosition = React.useCallback(
    (session: WatchSession | null | undefined = current): number => {
      if (!session) return 0
      if (!session.playing) return session.positionSec
      const serverNow = Date.now() + clockOffsetRef.current
      return session.positionSec + Math.max(0, (serverNow - session.updatedAt) / 1000)
    },
    [current]
  )

  const value = React.useMemo<WatchContextValue>(
    () => ({
      sessions,
      sessionFor,
      current,
      expectedPosition,
      set,
      queueAdd,
      next,
      play,
      pause,
      seek,
      stop,
      feedback,
      clearFeedback
    }),
    [sessions, sessionFor, current, expectedPosition, set, queueAdd, next, play, pause, seek, stop, feedback, clearFeedback]
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useWatch(): WatchContextValue {
  const ctx = React.useContext(Context)
  if (!ctx) throw new Error('useWatch must be used within WatchProvider')
  return ctx
}
