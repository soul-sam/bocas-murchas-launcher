import * as React from 'react'
import type { Socket } from 'socket.io-client'
import { useAuth } from './auth-context'
import { useSocket } from './socket-context'
import { useSettings } from './settings-context'
import { playUiSound } from './ui-sounds'
import type { VoiceAlertEvent } from './api-alerts'

/**
 * SINAL DE FUMAÇA + "ME AVISA QUANDO ENCHER".
 *
 * As duas coisas moram no mesmo contexto porque respondem à mesma pergunta —
 * "vale a pena eu abrir isso agora?" — e porque nenhuma das duas tem estado
 * próprio na tela: são um espelho do que o servidor sabe, mais uma reação a
 * dois avisos.
 *
 * Como o party, o estado das fumaças VIVE NO SERVIDOR e chega por três
 * caminhos: o retrato da presença (`userOnline` traz `smokes`), o retrato
 * pedido no connect (`smoke:request` -> `smoke:state`) e cada mudança
 * (`smoke:changed`). Nenhuma ação daqui mexe no estado local direto — todas
 * esperam o servidor confirmar, então a faixa nunca mostra uma promessa que
 * o servidor não conhece.
 *
 * Os dois avisos que este contexto transforma em barulho:
 *   - `smoke:due` — deu a hora que VOCÊ prometeu. Notificação + som, sempre:
 *     é o compromisso que a própria pessoa marcou, e silenciar isso seria
 *     desmontar a feature;
 *   - `voice:alert` — a call encheu. Notificação + som, e a faixa mostra o
 *     convite por um tempo. Só chega pra quem ligou o aviso e não está numa
 *     call (o servidor filtra).
 */

export interface SmokeMember {
  id: string
  displayName: string
  avatar?: string
}

export type SmokeStatus = 'waiting' | 'due' | 'closed'

export interface Smoke {
  id: string
  /** Quando a galera prometeu entrar (epoch ms). */
  at: number
  note?: string
  createdBy: SmokeMember
  members: SmokeMember[]
  /** Quem já apareceu na call. */
  arrived: string[]
  createdAt: number
  status: SmokeStatus
  channelId?: string
  messageId?: string
}

export interface SmokeAck {
  ok: boolean
  error?: string
  smoke?: Smoke
}

interface SmokeContextValue {
  smokes: Smoke[]
  /** A fumaça em que EU estou (acendi ou topei), se houver. */
  mySmoke: Smoke | null
  /** true depois do primeiro retrato: antes disso "não achei" não é "acabou". */
  ready: boolean
  smokeById: (id: string) => Smoke | undefined

  raiseSmoke: (input: { minutes: number; note?: string; channelId?: string }) => Promise<SmokeAck>
  joinSmoke: (smokeId: string) => Promise<SmokeAck>
  leaveSmoke: (smokeId: string) => Promise<SmokeAck>
  cancelSmoke: (smokeId: string) => Promise<SmokeAck>

  /** Último "encheu" recebido, pra faixa desenhar. Some sozinho. */
  callAlert: VoiceAlertEvent | null
  dismissCallAlert: () => void
}

const SmokeContext = React.createContext<SmokeContextValue | null>(null)

const ACK_TIMEOUT_MS = 8_000
/** O convite de call cheia fica na tela esse tanto e some. */
const ALERT_TTL_MS = 3 * 60_000

function emitWithAck(socket: Socket | null, event: string, payload: unknown): Promise<SmokeAck> {
  if (!socket || !socket.connected) {
    return Promise.resolve({ ok: false, error: 'Sem conexão com o servidor.' })
  }
  return new Promise((resolve) => {
    socket.timeout(ACK_TIMEOUT_MS).emit(event, payload, (err: Error | null, response: SmokeAck) => {
      if (err) return resolve({ ok: false, error: 'O servidor não respondeu.' })
      resolve(response ?? { ok: false, error: 'Resposta vazia.' })
    })
  })
}

export function SmokeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { socket, connected } = useSocket()
  const { settings } = useSettings()

  const [byId, setById] = React.useState<Record<string, Smoke>>({})
  const [ready, setReady] = React.useState(false)
  const [callAlert, setCallAlert] = React.useState<VoiceAlertEvent | null>(null)

  const settingsRef = React.useRef(settings)
  settingsRef.current = settings

  /** Retrato do servidor: SUBSTITUI, pra não deixar pra trás fumaça apagada. */
  const applySnapshot = React.useCallback((list: unknown) => {
    if (!Array.isArray(list)) return
    const next: Record<string, Smoke> = {}
    for (const smoke of list as Smoke[]) {
      if (smoke?.id) next[smoke.id] = smoke
    }
    setById(next)
    setReady(true)
  }, [])

  React.useEffect(() => {
    if (!socket) return

    const handleState = (data: { smokes?: Smoke[] }): void => applySnapshot(data?.smokes)

    const handlePresence = (data: { smokes?: Smoke[] }): void => {
      if (Array.isArray(data?.smokes)) applySnapshot(data.smokes)
    }

    const handleChanged = (data: { smokeId: string; smoke: Smoke | null }): void => {
      if (!data?.smokeId) return
      setById((prev) => {
        if (!data.smoke) {
          if (!(data.smokeId in prev)) return prev
          const next = { ...prev }
          delete next[data.smokeId]
          return next
        }
        return { ...prev, [data.smokeId]: data.smoke }
      })
    }

    /**
     * Deu a hora que VOCÊ marcou.
     *
     * Não passa pelo opt-out de cutucada: cutucada é outra pessoa te
     * incomodando, isto é um compromisso que você mesmo marcou. Um despertador
     * que a própria pessoa programou e que não toca é um despertador quebrado.
     */
    const handleDue = (data: { smoke?: Smoke }): void => {
      const smoke = data?.smoke
      if (!smoke) return
      const s = settingsRef.current
      const outros = smoke.members.length - 1

      void window.bocas.notify.show({
        title: 'Deu a hora 🔥',
        body:
          outros > 0
            ? `Você e mais ${outros} prometeram entrar agora.`
            : 'Você prometeu entrar agora.',
        silent: !s.soundEnabled
      })
      playUiSound('mention', s.soundEnabled ? s.soundVolume : 0)
    }

    const handleAlert = (data: VoiceAlertEvent): void => {
      if (!data?.channelId) return
      const s = settingsRef.current
      const nomes = data.members
        .slice(0, 3)
        .map((m) => m.displayName.split(/\s+/)[0])
        .join(', ')

      setCallAlert(data)
      void window.bocas.notify.show({
        title: `Encheu: ${data.size} na call 🎙️`,
        body: data.channelName ? `${nomes} no #${data.channelName}` : nomes,
        silent: !s.soundEnabled
      })
      playUiSound('mention', s.soundEnabled ? s.soundVolume : 0)

      setTimeout(() => {
        setCallAlert((current) => (current?.at === data.at ? null : current))
      }, ALERT_TTL_MS)
    }

    socket.on('smoke:state', handleState)
    socket.on('smoke:changed', handleChanged)
    socket.on('smoke:due', handleDue)
    socket.on('userOnline', handlePresence)
    socket.on('voice:alert', handleAlert)

    return () => {
      socket.off('smoke:state', handleState)
      socket.off('smoke:changed', handleChanged)
      socket.off('smoke:due', handleDue)
      socket.off('userOnline', handlePresence)
      socket.off('voice:alert', handleAlert)
    }
  }, [socket, applySnapshot])

  // Pede o retrato a cada (re)conexão: o que tínhamos pode ter apagado
  // enquanto estávamos fora.
  React.useEffect(() => {
    if (!socket || !connected) return
    socket.emit('smoke:request')
  }, [socket, connected])

  const smokes = React.useMemo(
    // Ordem por HORA PROMETIDA, não por criação: a faixa é uma fila de "o que
    // vem primeiro", e quem acendeu antes pode ter marcado pra mais tarde.
    () => Object.values(byId).sort((a, b) => a.at - b.at),
    [byId]
  )

  const mySmoke = React.useMemo(() => {
    const me = user?.id
    if (!me) return null
    return smokes.find((s) => s.members.some((m) => m.id === me)) ?? null
  }, [smokes, user?.id])

  const smokeById = React.useCallback((id: string) => byId[id], [byId])

  const raiseSmoke = React.useCallback(
    (input: { minutes: number; note?: string; channelId?: string }) =>
      emitWithAck(socket, 'smoke:raise', input),
    [socket]
  )
  const joinSmoke = React.useCallback(
    (smokeId: string) => emitWithAck(socket, 'smoke:join', { smokeId }),
    [socket]
  )
  const leaveSmoke = React.useCallback(
    (smokeId: string) => emitWithAck(socket, 'smoke:leave', { smokeId }),
    [socket]
  )
  const cancelSmoke = React.useCallback(
    (smokeId: string) => emitWithAck(socket, 'smoke:cancel', { smokeId }),
    [socket]
  )

  const dismissCallAlert = React.useCallback(() => setCallAlert(null), [])

  const value = React.useMemo<SmokeContextValue>(
    () => ({
      smokes,
      mySmoke,
      ready,
      smokeById,
      raiseSmoke,
      joinSmoke,
      leaveSmoke,
      cancelSmoke,
      callAlert,
      dismissCallAlert
    }),
    [
      smokes,
      mySmoke,
      ready,
      smokeById,
      raiseSmoke,
      joinSmoke,
      leaveSmoke,
      cancelSmoke,
      callAlert,
      dismissCallAlert
    ]
  )

  return <SmokeContext.Provider value={value}>{children}</SmokeContext.Provider>
}

export function useSmoke(): SmokeContextValue {
  const ctx = React.useContext(SmokeContext)
  if (!ctx) throw new Error('useSmoke must be used within a SmokeProvider')
  return ctx
}

/** "em 20 min" / "agora" / "há 5 min" — a fumaça sempre fala em tempo relativo. */
export function smokeCountdown(at: number, now = Date.now()): string {
  const diff = at - now
  const minutes = Math.round(Math.abs(diff) / 60_000)

  if (minutes < 1) return 'agora'
  if (diff < 0) return `há ${minutes} min`
  if (minutes < 60) return `em ${minutes} min`

  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `em ${h}h${String(m).padStart(2, '0')}` : `em ${h}h`
}
