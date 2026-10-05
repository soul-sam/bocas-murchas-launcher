import * as React from 'react'
import type { Socket } from 'socket.io-client'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './auth-context'
import { useSocket } from './socket-context'
import { useSettings } from './settings-context'
import { playUiSound } from './ui-sounds'
import type { ActionType, LobbyTable, PokerAck, TableView, TimerSpeed } from './api-poker'

/**
 * PÔQUER — o espelho da mesa no launcher.
 *
 * O estado mora no servidor (lib/poker/table.ts) e chega por dois canais:
 * `poker:lobby` (a lista de mesas, pra todo mundo) e `poker:table` (a vista
 * da mesa que está aberta, PERSONALIZADA — só as suas cartas vêm viradas).
 * Nenhuma ação muda o estado local: todas esperam o servidor confirmar e
 * mandar a vista nova, então a tela nunca mostra uma jogada que a mesa não
 * aceitou. O ack só serve pra mensagem de erro.
 *
 * Abrir uma mesa (`openTable`) entra na sala dela no socket; fechar a tela
 * sai da sala mas NÃO levanta — a pessoa continua sentada, e a mesa segue
 * foldando por ela se dormir (ver o relógio no servidor). A barra lateral
 * avisa quando é a sua vez com a tela fechada.
 */

interface PokerContextValue {
  tables: LobbyTable[]
  /** Já recebi a primeira lista. */
  ready: boolean
  /** A mesa aberta na tela (null = saguão). */
  table: TableView | null
  openTableId: string | null
  openTable: (tableId: string) => Promise<PokerAck>
  leaveTable: () => void
  /**
   * Vai pra TELA do pôquer (rota /poker) e, se vier `tableId`, abre essa mesa
   * nela. É o que o card do chat, o Ctrl+K, o /poker e a barra chamam.
   */
  goToPoker: (tableId?: string) => void
  /** Em qual mesa estou SENTADO (pode ser diferente da aberta). */
  seatedAt: LobbyTable | null
  /** É a minha vez em alguma mesa — pra pílula na barra de ícones. */
  myTurn: boolean

  createTable: (input: {
    name?: string
    stakeId: string
    maxSeats: number
    speed: TimerSpeed
    buyIn?: number
    seat?: number
    channelId?: string
  }) => Promise<PokerAck>
  sit: (tableId: string, seat: number, buyIn: number) => Promise<PokerAck>
  stand: (tableId: string) => Promise<PokerAck>
  topUp: (tableId: string, amount: number) => Promise<PokerAck>
  sitOut: (tableId: string, out: boolean) => Promise<PokerAck>
  act: (tableId: string, type: ActionType, amount?: number) => Promise<PokerAck>
  show: (tableId: string) => Promise<PokerAck>
  closeTable: (tableId: string) => Promise<PokerAck>
}

const PokerContext = React.createContext<PokerContextValue | null>(null)

const ACK_TIMEOUT_MS = 8_000

function emitWithAck(socket: Socket | null, event: string, payload: unknown): Promise<PokerAck> {
  if (!socket || !socket.connected) {
    return Promise.resolve({ ok: false, error: 'Sem conexão com o servidor.' })
  }
  return new Promise((resolve) => {
    socket.timeout(ACK_TIMEOUT_MS).emit(event, payload, (err: Error | null, response: PokerAck) => {
      if (err) return resolve({ ok: false, error: 'O servidor não respondeu.' })
      resolve(response ?? { ok: false, error: 'Resposta vazia.' })
    })
  })
}

export function PokerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { socket, connected } = useSocket()
  const { settings } = useSettings()
  const navigate = useNavigate()

  const [tables, setTables] = React.useState<LobbyTable[]>([])
  const [ready, setReady] = React.useState(false)
  const [openTableId, setOpenTableId] = React.useState<string | null>(null)
  const [table, setTable] = React.useState<TableView | null>(null)

  const settingsRef = React.useRef(settings)
  settingsRef.current = settings
  const userIdRef = React.useRef(user?.id)
  userIdRef.current = user?.id
  const openIdRef = React.useRef<string | null>(null)
  openIdRef.current = openTableId

  const sound = React.useCallback((name: 'poker-turn' | 'poker-deal' | 'poker-chip' | 'poker-win') => {
    const s = settingsRef.current
    playUiSound(name, s.soundEnabled ? s.soundVolume : 0)
  }, [])

  // --- socket -----------------------------------------------------------------
  React.useEffect(() => {
    if (!socket) return

    const handleLobby = (data: { tables?: LobbyTable[] }): void => {
      if (!Array.isArray(data?.tables)) return
      setTables(data.tables)
      setReady(true)
    }

    const handleTable = (data: { tableId: string; table: TableView }): void => {
      if (!data?.tableId || data.tableId !== openIdRef.current) return
      setTable((prev) => {
        const next = data.table
        const me = userIdRef.current
        if (prev && me) {
          const mySeat = next.mySeat
          // Virou minha vez: um toque. Só na transição, não a cada vista.
          if (mySeat !== null && next.toAct === mySeat && prev.toAct !== mySeat && !next.result) {
            sound('poker-turn')
            if (!document.hasFocus()) {
              void window.bocas.notify.show({
                title: 'Sua vez no pôquer',
                body: `${next.name} · pote ${next.pot}`,
                silent: !settingsRef.current.soundEnabled
              })
            }
          }
          if (next.handId && next.handId !== prev.handId) sound('poker-deal')
          // Alguém (que não eu) pôs fichas na mesa: aposta, aumento ou pagamento.
          else if (next.handId === prev.handId && !next.result) {
            const chips = next.seats.some((s, i) => {
              const before = prev.seats[i]
              return !!s && !!before && i !== mySeat && s.userId === before.userId && s.bet > before.bet
            })
            if (chips) sound('poker-chip')
          }
          if (next.result && !prev.result && mySeat !== null && (next.seats[mySeat]?.won ?? 0) > 0) {
            sound('poker-win')
          }
        }
        return next
      })
    }

    socket.on('poker:lobby', handleLobby)
    socket.on('poker:table', handleTable)
    return () => {
      socket.off('poker:lobby', handleLobby)
      socket.off('poker:table', handleTable)
    }
  }, [socket, sound])

  // Lista a cada (re)conexão, e a mesa aberta volta pra sala sozinha.
  React.useEffect(() => {
    if (!socket || !connected) return
    socket.emit('poker:request')
    const id = openIdRef.current
    if (id) {
      void emitWithAck(socket, 'poker:open', { tableId: id }).then((ack) => {
        if (ack.ok && ack.table) setTable(ack.table)
        else if (!ack.ok) {
          setOpenTableId(null)
          setTable(null)
        }
      })
    }
  }, [socket, connected])

  // Mesa aberta sumiu da lista (fechou): volta pro saguão.
  React.useEffect(() => {
    if (!ready || !openTableId) return
    if (!tables.some((t) => t.id === openTableId)) {
      setOpenTableId(null)
      setTable(null)
    }
  }, [tables, ready, openTableId])

  // --- ações ---------------------------------------------------------------------
  const openTable = React.useCallback(
    async (tableId: string): Promise<PokerAck> => {
      const previous = openIdRef.current
      if (previous && previous !== tableId && socket) socket.emit('poker:leave', { tableId: previous })
      setOpenTableId(tableId)
      const ack = await emitWithAck(socket, 'poker:open', { tableId })
      if (ack.ok && ack.table) setTable(ack.table)
      else {
        setOpenTableId(null)
        setTable(null)
      }
      return ack
    },
    [socket]
  )

  const goToPoker = React.useCallback(
    (tableId?: string): void => {
      navigate('/poker')
      if (tableId) void openTable(tableId)
    },
    [navigate, openTable]
  )

  const leaveTable = React.useCallback((): void => {
    const id = openIdRef.current
    if (id && socket) socket.emit('poker:leave', { tableId: id })
    setOpenTableId(null)
    setTable(null)
  }, [socket])

  const createTable = React.useCallback<PokerContextValue['createTable']>(
    async (input) => {
      const ack = await emitWithAck(socket, 'poker:create', input)
      if (ack.ok && ack.tableId) {
        setOpenTableId(ack.tableId)
        if (ack.table) setTable(ack.table)
      }
      return ack
    },
    [socket]
  )

  const sit = React.useCallback(
    async (tableId: string, seat: number, buyIn: number) => {
      const ack = await emitWithAck(socket, 'poker:sit', { tableId, seat, buyIn })
      if (ack.ok && ack.table && openIdRef.current === tableId) setTable(ack.table)
      return ack
    },
    [socket]
  )
  const stand = React.useCallback((tableId: string) => emitWithAck(socket, 'poker:stand', { tableId }), [socket])
  const topUp = React.useCallback(
    async (tableId: string, amount: number) => {
      const ack = await emitWithAck(socket, 'poker:topup', { tableId, amount })
      if (ack.ok && ack.table && openIdRef.current === tableId) setTable(ack.table)
      return ack
    },
    [socket]
  )
  const sitOut = React.useCallback(
    (tableId: string, out: boolean) => emitWithAck(socket, 'poker:sitout', { tableId, out }),
    [socket]
  )
  const act = React.useCallback(
    (tableId: string, type: ActionType, amount?: number) =>
      emitWithAck(socket, 'poker:action', amount === undefined ? { tableId, type } : { tableId, type, amount }),
    [socket]
  )
  const show = React.useCallback((tableId: string) => emitWithAck(socket, 'poker:show', { tableId }), [socket])
  const closeTable = React.useCallback((tableId: string) => emitWithAck(socket, 'poker:close', { tableId }), [socket])

  const seatedAt = React.useMemo(() => {
    const me = user?.id
    if (!me) return null
    return tables.find((t) => t.players.some((p) => p.userId === me)) ?? null
  }, [tables, user?.id])

  const myTurn = !!table && table.mySeat !== null && table.toAct === table.mySeat && !table.result

  const value = React.useMemo<PokerContextValue>(
    () => ({
      tables,
      ready,
      table,
      openTableId,
      openTable,
      leaveTable,
      goToPoker,
      seatedAt,
      myTurn,
      createTable,
      sit,
      stand,
      topUp,
      sitOut,
      act,
      show,
      closeTable
    }),
    [tables, ready, table, openTableId, openTable, leaveTable, goToPoker, seatedAt, myTurn, createTable, sit, stand, topUp, sitOut, act, show, closeTable]
  )

  return <PokerContext.Provider value={value}>{children}</PokerContext.Provider>
}

export function usePoker(): PokerContextValue {
  const ctx = React.useContext(PokerContext)
  if (!ctx) throw new Error('usePoker must be used within PokerProvider')
  return ctx
}
