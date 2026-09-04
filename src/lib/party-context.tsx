import * as React from 'react'
import type { Socket } from 'socket.io-client'
import { useAuth } from './auth-context'
import { useSocket } from './socket-context'
import { useSettings } from './settings-context'
import { playUiSound } from './ui-sounds'
import { gameLabel, type PartyStatus } from './api-events'
import type { AgendaEvent } from './api-events'

/**
 * "BORA?" + LEMBRETES DE EVENTO.
 *
 * O estado dos parties abertos mora no servidor (memória) e chega por três
 * caminhos: o retrato da presença (`userOnline` traz `parties`), o retrato
 * pedido no connect (`party:request` -> `party:state`) e cada mudança
 * (`party:changed`). Aqui só espelhamos — nenhuma ação muda o estado local
 * direto; todas esperam o servidor confirmar e avisar todo mundo (inclusive
 * quem clicou), então o card e a faixa nunca mostram um estado que o
 * servidor não conhece.
 *
 * Também é aqui que mora a reação aos AVISOS que não têm componente próprio:
 *   - `party:invite` (alguém cutucou pra jogar): notificação + baque + tremor,
 *     respeitando o opt-out de cutucada DAQUI — o servidor entrega pra todo
 *     mundo e deixa cada launcher decidir;
 *   - `event:reminder` ("começa em 15 min"): notificação + som de menção.
 */

export interface PartyMember {
  id: string
  displayName: string
  avatar?: string
}

export interface Party {
  id: string
  game: string
  slots: number
  note?: string
  createdBy: PartyMember
  members: PartyMember[]
  createdAt: number
  expiresAt: number
  status: PartyStatus
  channelId?: string
  messageId?: string
}

export interface PartyAck {
  ok: boolean
  error?: string
  party?: Party
  /** Só no cutucão: quantas pessoas foram chamadas. */
  delivered?: number
}

export interface PartyInvite {
  party: Party
  from: PartyMember
  at: number
}

interface PartyContextValue {
  /** Todos os parties vivos (abertos ou cheios). */
  parties: Party[]
  /** Só os que ainda têm vaga. */
  openParties: Party[]
  /** O party em que EU estou (chamei ou entrei), se houver. */
  myParty: Party | null
  /** true depois do primeiro retrato: antes disso "não achei" não quer dizer "acabou". */
  ready: boolean
  partyById: (id: string) => Party | undefined

  createParty: (input: {
    game: string
    slots: number
    note?: string
    channelId?: string
  }) => Promise<PartyAck>
  joinParty: (partyId: string) => Promise<PartyAck>
  leaveParty: (partyId: string) => Promise<PartyAck>
  cancelParty: (partyId: string) => Promise<PartyAck>
  nudgeParty: (partyId: string) => Promise<PartyAck>

  /** Último convite recebido — pra quem quiser desenhar um aviso na tela. */
  lastInvite: PartyInvite | null
}

const PartyContext = React.createContext<PartyContextValue | null>(null)

const ACK_TIMEOUT_MS = 8_000

/**
 * emit com ack e prazo. Sem o prazo, um servidor que caiu no meio deixava o
 * botão em "carregando" pra sempre — o socket reconecta, mas o callback
 * daquele emit nunca chega.
 */
function emitWithAck(socket: Socket | null, event: string, payload: unknown): Promise<PartyAck> {
  if (!socket || !socket.connected) {
    return Promise.resolve({ ok: false, error: 'Sem conexão com o servidor.' })
  }
  return new Promise((resolve) => {
    socket.timeout(ACK_TIMEOUT_MS).emit(event, payload, (err: Error | null, response: PartyAck) => {
      if (err) return resolve({ ok: false, error: 'O servidor não respondeu.' })
      resolve(response ?? { ok: false, error: 'Resposta vazia.' })
    })
  })
}

export function PartyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { socket, connected } = useSocket()
  const { settings } = useSettings()

  const [byId, setById] = React.useState<Record<string, Party>>({})
  const [ready, setReady] = React.useState(false)
  const [lastInvite, setLastInvite] = React.useState<PartyInvite | null>(null)

  const settingsRef = React.useRef(settings)
  settingsRef.current = settings
  const userIdRef = React.useRef(user?.id)
  userIdRef.current = user?.id

  /** Retrato do servidor: SUBSTITUI, pra não deixar pra trás party que acabou. */
  const applySnapshot = React.useCallback((list: unknown) => {
    if (!Array.isArray(list)) return
    const next: Record<string, Party> = {}
    for (const party of list as Party[]) {
      if (party?.id) next[party.id] = party
    }
    setById(next)
    setReady(true)
  }, [])

  React.useEffect(() => {
    if (!socket) return

    const handleState = (data: { parties?: Party[] }): void => applySnapshot(data?.parties)

    // A presença traz os parties junto, pra quem acabou de conectar ver tudo
    // no primeiro pacote sem depender do party:request.
    const handlePresence = (data: { parties?: Party[] }): void => {
      if (Array.isArray(data?.parties)) applySnapshot(data.parties)
    }

    const handleChanged = (data: { partyId: string; party: Party | null }): void => {
      if (!data?.partyId) return
      setById((prev) => {
        if (!data.party) {
          if (!(data.partyId in prev)) return prev
          const next = { ...prev }
          delete next[data.partyId]
          return next
        }
        return { ...prev, [data.partyId]: data.party }
      })
    }

    const handleInvite = (data: PartyInvite): void => {
      if (!data?.party || !data?.from) return
      if (data.from.id === userIdRef.current) return

      const s = settingsRef.current
      setLastInvite(data)

      const label = gameLabel(data.party.game)
      const vagas = `${data.party.members.length}/${data.party.slots}`
      void window.bocas.notify.show({
        title: `${data.from.displayName} chamou pra jogar ${label}`,
        body: data.party.note ? `${data.party.note} · ${vagas}` : `Bora? ${vagas}`,
        silent: !s.soundEnabled
      })

      // Cutucada é cutucada: quem desligou nas configurações não treme nem
      // leva baque — só fica com a notificação, que é inofensiva.
      if (!s.nudgeOptOut) {
        playUiSound('nudge', s.soundEnabled ? s.soundVolume : 0)
        if (s.nudgeShakeWindow) {
          void window.bocas.nudge.shake({ intensity: 12, durationMs: 600 })
        }
      }

      setTimeout(() => {
        setLastInvite((current) => (current?.at === data.at ? null : current))
      }, 8_000)
    }

    const handleReminder = (data: { event?: AgendaEvent }): void => {
      const event = data?.event
      if (!event?.title) return
      const s = settingsRef.current
      void window.bocas.notify.show({
        title: 'Começa em 15 min',
        body: event.game ? `${event.title} · ${gameLabel(event.game)}` : event.title,
        silent: !s.soundEnabled
      })
      playUiSound('mention', s.soundEnabled ? s.soundVolume : 0)
    }

    socket.on('party:state', handleState)
    socket.on('party:changed', handleChanged)
    socket.on('party:invite', handleInvite)
    socket.on('userOnline', handlePresence)
    socket.on('event:reminder', handleReminder)

    return () => {
      socket.off('party:state', handleState)
      socket.off('party:changed', handleChanged)
      socket.off('party:invite', handleInvite)
      socket.off('userOnline', handlePresence)
      socket.off('event:reminder', handleReminder)
    }
  }, [socket, applySnapshot])

  // Pede o retrato a cada (re)conexão: o que tínhamos pode ter acabado
  // enquanto estávamos fora.
  React.useEffect(() => {
    if (!socket || !connected) return
    socket.emit('party:request')
  }, [socket, connected])

  const parties = React.useMemo(
    () => Object.values(byId).sort((a, b) => a.createdAt - b.createdAt),
    [byId]
  )

  const openParties = React.useMemo(
    () => parties.filter((p) => p.status === 'open'),
    [parties]
  )

  const myParty = React.useMemo(() => {
    const me = user?.id
    if (!me) return null
    return parties.find((p) => p.members.some((m) => m.id === me)) ?? null
  }, [parties, user?.id])

  const partyById = React.useCallback((id: string) => byId[id], [byId])

  const createParty = React.useCallback(
    (input: { game: string; slots: number; note?: string; channelId?: string }) =>
      emitWithAck(socket, 'party:create', input),
    [socket]
  )
  const joinParty = React.useCallback(
    (partyId: string) => emitWithAck(socket, 'party:join', { partyId }),
    [socket]
  )
  const leaveParty = React.useCallback(
    (partyId: string) => emitWithAck(socket, 'party:leave', { partyId }),
    [socket]
  )
  const cancelParty = React.useCallback(
    (partyId: string) => emitWithAck(socket, 'party:cancel', { partyId }),
    [socket]
  )
  const nudgeParty = React.useCallback(
    (partyId: string) => emitWithAck(socket, 'party:nudge', { partyId }),
    [socket]
  )

  const value = React.useMemo<PartyContextValue>(
    () => ({
      parties,
      openParties,
      myParty,
      ready,
      partyById,
      createParty,
      joinParty,
      leaveParty,
      cancelParty,
      nudgeParty,
      lastInvite
    }),
    [
      parties,
      openParties,
      myParty,
      ready,
      partyById,
      createParty,
      joinParty,
      leaveParty,
      cancelParty,
      nudgeParty,
      lastInvite
    ]
  )

  return <PartyContext.Provider value={value}>{children}</PartyContext.Provider>
}

export function useParty(): PartyContextValue {
  const ctx = React.useContext(PartyContext)
  if (!ctx) throw new Error('useParty must be used within PartyProvider')
  return ctx
}
