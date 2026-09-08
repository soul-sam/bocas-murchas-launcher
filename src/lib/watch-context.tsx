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

/**
 * Vídeo pra assistir junto, ou faixa pra tocar sem imagem.
 *
 * É UMA sessão por canal nos dois casos — o servidor não deixa a sala ter um
 * vídeo e uma música brigando pelo alto-falante. Ver realtime/watch.ts na API.
 */
export type WatchMode = 'video' | 'music'

/** O mínimo pra tocar alguma coisa. Sai da busca ou de um link colado. */
export interface WatchTrack {
  videoId: string
  title?: string
  /** Artista, quando veio da busca de música. */
  artist?: string
  /** Capa do álbum, quando veio da busca de música. */
  artUrl?: string
}

export interface WatchQueueItem extends WatchTrack {
  /** Quem botou na fila. */
  addedBy: string
  /** O quantésimo pedido desta pessoa. É o que dá o rodízio da fila. */
  turn?: number
}

export interface WatchSession extends WatchTrack {
  channelId: string
  videoId: string
  playing: boolean
  /** Posição (s) no instante `updatedAt` (relógio do servidor). */
  positionSec: number
  updatedAt: number
  /** Quem trouxe o vídeo. Não é dono: qualquer um na call controla. */
  hostUserId: string
  queue?: WatchQueueItem[]
  mode: WatchMode
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
  set: (urlOrId: string, mode?: WatchMode) => Promise<WatchAck>
  queueAdd: (urlOrId: string, mode?: WatchMode) => Promise<WatchAck>
  /**
   * Igual aos de cima, mas pra faixa que JÁ veio resolvida (da busca): não
   * passa pelo oEmbed, que custaria 4s de espera pra descobrir um título que
   * a busca já tinha entregue com artista e capa.
   */
  playTrack: (track: WatchTrack, mode?: WatchMode) => Promise<WatchAck>
  queueTrack: (track: WatchTrack, mode?: WatchMode) => Promise<WatchAck>
  /** Tira da fila. O videoId confere contra corrida — ver a API. */
  queueRemove: (index: number, videoId: string) => Promise<WatchAck>
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

/**
 * Sessão sem `mode` é de um servidor anterior à música (ou de um deploy no
 * meio do caminho). Vira vídeo, que é o que ela era. Sem isso o modo chegaria
 * `undefined` e cairia em todo `=== 'music'` como falso por acidente, em vez
 * de por decisão.
 */
function normalizeSession(session: WatchSession): WatchSession {
  return session.mode === 'music' || session.mode === 'video'
    ? session
    : { ...session, mode: 'video' }
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
          if (isSession(session)) next[channelId] = normalizeSession(session)
        }
      }
      setSessions(next)
    }

    const handleState = (data: { channelId?: unknown; session?: unknown; serverNow?: unknown }): void => {
      if (typeof data?.channelId !== 'string') return
      noteServerClock(data.serverNow)
      const channelId = data.channelId
      setSessions((current) => {
        if (isSession(data.session)) {
          return { ...current, [channelId]: normalizeSession(data.session) }
        }
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

  const fromUrl = React.useCallback(
    async (event: string, urlOrId: string, mode: WatchMode): Promise<WatchAck> => {
      const video = await resolveVideo(urlOrId)
      if (!video) {
        setFeedback('Isso não parece um link do YouTube.')
        return { ok: false, error: 'Isso não parece um link do YouTube.' }
      }
      return request(event, { ...video, mode })
    },
    [request, resolveVideo]
  )

  const set = React.useCallback(
    (urlOrId: string, mode: WatchMode = 'video') => fromUrl('watch:set', urlOrId, mode),
    [fromUrl]
  )

  const queueAdd = React.useCallback(
    (urlOrId: string, mode: WatchMode = 'video') => fromUrl('watch:queue:add', urlOrId, mode),
    [fromUrl]
  )

  const playTrack = React.useCallback(
    (track: WatchTrack, mode: WatchMode = 'music') => request('watch:set', { ...track, mode }),
    [request]
  )

  const queueTrack = React.useCallback(
    (track: WatchTrack, mode: WatchMode = 'music') =>
      request('watch:queue:add', { ...track, mode }),
    [request]
  )

  const queueRemove = React.useCallback(
    (index: number, videoId: string) => request('watch:queue:remove', { index, videoId }),
    [request]
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
      playTrack,
      queueTrack,
      queueRemove,
      next,
      play,
      pause,
      seek,
      stop,
      feedback,
      clearFeedback
    }),
    [
      sessions,
      sessionFor,
      current,
      expectedPosition,
      set,
      queueAdd,
      playTrack,
      queueTrack,
      queueRemove,
      next,
      play,
      pause,
      seek,
      stop,
      feedback,
      clearFeedback
    ]
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useWatch(): WatchContextValue {
  const ctx = React.useContext(Context)
  if (!ctx) throw new Error('useWatch must be used within WatchProvider')
  return ctx
}
