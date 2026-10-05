import * as React from 'react'
import type { Socket } from 'socket.io-client'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './auth-context'
import { useSocket } from './socket-context'
import { useSettings } from './settings-context'
import { playUiSound } from './ui-sounds'
import {
  BOARD_ROUTE,
  type BoardAck,
  type BoardGame,
  type BoardInvite,
  type BoardTableView,
  type ClockId,
  type DraughtsVariant,
  type LobbyBoardTable,
  type Side
} from './api-board'

/**
 * XADREZ E DAMA — o espelho da mesa no launcher.
 *
 * Mesmo desenho do pôquer: o estado mora no servidor, que é a autoridade
 * (posição e lances legais chegam prontos; o launcher não tem biblioteca de
 * regras). Chega por `board:lobby` (lista, pra todo mundo), `board:table` (a
 * vista da mesa aberta, personalizada) e `board:invite` (convite pra mim).
 * Nenhuma ação muda o estado local por conta própria: o ack só traz erro e,
 * quando traz a mesa, ela é gravada.
 *
 * Fechar a tela (`leaveTable`) sai da sala; jogador que sai antes do início
 * cancela a mesa, isso é com o servidor.
 */

interface BoardContextValue {
  tables: LobbyBoardTable[]
  /** Já recebi a primeira lista. */
  ready: boolean
  /** A mesa aberta na tela (null = saguão). */
  table: BoardTableView | null
  openTableId: string | null
  invite: BoardInvite | null
  /** Mesa em que sou jogador ou host (pending/playing/open/invited). */
  myTable: LobbyBoardTable | null
  /** É a minha vez em alguma partida. */
  myTurn: boolean
  openTable: (tableId: string) => Promise<BoardAck>
  leaveTable: () => void
  /** Vai pra tela do jogo e, se vier `tableId`, abre essa mesa nela. */
  goToBoard: (game: BoardGame, tableId?: string) => void
  create: (input: {
    game: BoardGame
    variant?: DraughtsVariant
    clock: ClockId
    stake: number
    inviteUserId?: string
  }) => Promise<BoardAck>
  answerInvite: (accept: boolean) => Promise<BoardAck>
  sit: (tableId: string) => Promise<BoardAck>
  setReady: () => Promise<BoardAck>
  move: (move: string) => Promise<BoardAck>
  resign: () => Promise<BoardAck>
  offerDraw: () => Promise<BoardAck>
  answerDraw: (accept: boolean) => Promise<BoardAck>
  bet: (side: Side, amount: number) => Promise<BoardAck>
}

const BoardContext = React.createContext<BoardContextValue | null>(null)

const ACK_TIMEOUT_MS = 8_000
const LIVE_PHASES = ['open', 'invited', 'pending', 'playing']

function emitWithAck(socket: Socket | null, event: string, payload: unknown): Promise<BoardAck> {
  if (!socket || !socket.connected) {
    return Promise.resolve({ ok: false, error: 'Sem conexão com o servidor.' })
  }
  return new Promise((resolve) => {
    socket.timeout(ACK_TIMEOUT_MS).emit(event, payload, (err: Error | null, response: BoardAck) => {
      if (err) return resolve({ ok: false, error: 'O servidor não respondeu.' })
      resolve(response ?? { ok: false, error: 'Resposta vazia.' })
    })
  })
}

function isMyTurn(t: BoardTableView | null): boolean {
  return !!t && t.phase === 'playing' && !t.result && t.mySide !== null && t.turn === t.mySide
}

export function BoardProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { socket, connected } = useSocket()
  const { settings } = useSettings()
  const navigate = useNavigate()

  const [tables, setTables] = React.useState<LobbyBoardTable[]>([])
  const [ready, setReady] = React.useState(false)
  const [openTableId, setOpenTableId] = React.useState<string | null>(null)
  const [table, setTable] = React.useState<BoardTableView | null>(null)
  const [invite, setInvite] = React.useState<BoardInvite | null>(null)

  const settingsRef = React.useRef(settings)
  settingsRef.current = settings
  const openIdRef = React.useRef<string | null>(null)
  openIdRef.current = openTableId
  const inviteRef = React.useRef<BoardInvite | null>(null)
  inviteRef.current = invite

  // Última mesa gravada, pra comparar a transição fora do updater do setState.
  const tableRef = React.useRef<BoardTableView | null>(null)

  // Grava a mesa; se virou a minha vez, um toque (só na transição).
  const applyTable = React.useCallback((next: BoardTableView): void => {
    const prev = tableRef.current
    tableRef.current = next
    if (prev && prev.id === next.id && !isMyTurn(prev) && isMyTurn(next)) {
      const s = settingsRef.current
      playUiSound('poker-turn', s.soundEnabled ? s.soundVolume : 0)
    }
    setTable(next)
  }, [])

  const clearOpen = React.useCallback((): void => {
    tableRef.current = null
    setOpenTableId(null)
    setTable(null)
  }, [])

  // --- socket -----------------------------------------------------------------
  React.useEffect(() => {
    if (!socket) return

    const handleLobby = (data: { tables?: LobbyBoardTable[] }): void => {
      if (!Array.isArray(data?.tables)) return
      setTables(data.tables)
      setReady(true)
    }
    const handleTable = (data: { tableId: string; table: BoardTableView }): void => {
      if (!data?.tableId || !data.table || data.tableId !== openIdRef.current) return
      applyTable(data.table)
    }
    const handleInvite = (data: BoardInvite): void => {
      if (!data?.tableId) return
      setInvite(data)
    }
    const handleInviteGone = (data: { tableId: string }): void => {
      if (inviteRef.current && inviteRef.current.tableId === data?.tableId) setInvite(null)
    }

    socket.on('board:lobby', handleLobby)
    socket.on('board:table', handleTable)
    socket.on('board:invite', handleInvite)
    socket.on('board:invite:gone', handleInviteGone)
    return () => {
      socket.off('board:lobby', handleLobby)
      socket.off('board:table', handleTable)
      socket.off('board:invite', handleInvite)
      socket.off('board:invite:gone', handleInviteGone)
    }
  }, [socket, applyTable])

  // Lista a cada (re)conexão, e a mesa aberta volta pra sala sozinha.
  React.useEffect(() => {
    if (!socket || !connected) return
    socket.emit('board:request')
    const id = openIdRef.current
    if (id) {
      void emitWithAck(socket, 'board:open', { tableId: id }).then((ack) => {
        if (ack.ok && ack.table) applyTable(ack.table)
        else if (!ack.ok) clearOpen()
      })
    }
  }, [socket, connected, applyTable, clearOpen])

  // Convite que expira some sozinho.
  React.useEffect(() => {
    if (!invite) return
    const left = invite.expiresAt - Date.now()
    if (left <= 0) {
      setInvite(null)
      return
    }
    const timer = setTimeout(() => setInvite(null), left)
    return () => clearTimeout(timer)
  }, [invite])

  // Mesa aberta sumiu da lista (cancelada): volta pro saguão. Só vale depois
  // que ela já apareceu numa lista desde que foi aberta (o `board:lobby` chega
  // depois do ack), e nunca com o resultado na tela: mesa encerrada fica até
  // a pessoa sair.
  const seenRef = React.useRef<{ id: string | null; seen: boolean }>({ id: null, seen: false })
  React.useEffect(() => {
    if (seenRef.current.id !== openTableId) seenRef.current = { id: openTableId, seen: false }
    if (!ready || !openTableId) return
    if (tables.some((t) => t.id === openTableId)) {
      seenRef.current.seen = true
      return
    }
    if (seenRef.current.seen && !table?.result) clearOpen()
  }, [tables, ready, openTableId, table, clearOpen])

  // --- ações ---------------------------------------------------------------------
  /** Emite uma ação da mesa aberta e grava a mesa que voltar no ack. */
  const act = React.useCallback(
    async (event: string, payload: Record<string, unknown> = {}): Promise<BoardAck> => {
      const tableId = openIdRef.current
      if (!tableId) return { ok: false, error: 'Nenhuma mesa aberta.' }
      const ack = await emitWithAck(socket, event, { tableId, ...payload })
      if (ack.ok && ack.table && openIdRef.current === tableId) applyTable(ack.table)
      return ack
    },
    [socket, applyTable]
  )

  const openTable = React.useCallback(
    async (tableId: string): Promise<BoardAck> => {
      const previous = openIdRef.current
      if (previous && previous !== tableId && socket) socket.emit('board:leave', { tableId: previous })
      setOpenTableId(tableId)
      openIdRef.current = tableId
      const ack = await emitWithAck(socket, 'board:open', { tableId })
      if (ack.ok && ack.table) applyTable(ack.table)
      else clearOpen()
      return ack
    },
    [socket, applyTable, clearOpen]
  )

  const goToBoard = React.useCallback(
    (game: BoardGame, tableId?: string): void => {
      navigate(BOARD_ROUTE[game])
      if (tableId) void openTable(tableId)
    },
    [navigate, openTable]
  )

  const leaveTable = React.useCallback((): void => {
    const id = openIdRef.current
    if (id && socket) socket.emit('board:leave', { tableId: id })
    clearOpen()
  }, [socket, clearOpen])

  const create = React.useCallback<BoardContextValue['create']>(
    async (input) => {
      const ack = await emitWithAck(socket, 'board:create', input)
      if (ack.ok && ack.table) {
        setOpenTableId(ack.table.id)
        openIdRef.current = ack.table.id
        applyTable(ack.table)
      }
      return ack
    },
    [socket, applyTable]
  )

  const answerInvite = React.useCallback(
    async (accept: boolean): Promise<BoardAck> => {
      const current = inviteRef.current
      if (!current) return { ok: false, error: 'Convite não encontrado.' }
      setInvite(null)
      const ack = await emitWithAck(socket, 'board:invite:answer', { tableId: current.tableId, accept })
      if (ack.ok && accept && ack.table) {
        setOpenTableId(ack.table.id)
        openIdRef.current = ack.table.id
        applyTable(ack.table)
        navigate(BOARD_ROUTE[current.game])
      }
      return ack
    },
    [socket, applyTable, navigate]
  )

  const sit = React.useCallback(
    async (tableId: string): Promise<BoardAck> => {
      const ack = await emitWithAck(socket, 'board:sit', { tableId })
      if (ack.ok && ack.table && openIdRef.current === tableId) applyTable(ack.table)
      return ack
    },
    [socket, applyTable]
  )
  const setReadyAction = React.useCallback(() => act('board:ready'), [act])
  const move = React.useCallback((m: string) => act('board:move', { move: m }), [act])
  const resign = React.useCallback(() => act('board:resign'), [act])
  const offerDraw = React.useCallback(() => act('board:draw:offer'), [act])
  const answerDraw = React.useCallback((accept: boolean) => act('board:draw:answer', { accept }), [act])
  const bet = React.useCallback((side: Side, amount: number) => act('board:bet', { side, amount }), [act])

  const myTable = React.useMemo(() => {
    const me = user?.id
    if (!me) return null
    return (
      tables.find(
        (t) =>
          LIVE_PHASES.includes(t.phase) &&
          (t.host.userId === me || t.white?.userId === me || t.black?.userId === me)
      ) ?? null
    )
  }, [tables, user?.id])

  const myTurn = isMyTurn(table)

  const value = React.useMemo<BoardContextValue>(
    () => ({
      tables,
      ready,
      table,
      openTableId,
      invite,
      myTable,
      myTurn,
      openTable,
      leaveTable,
      goToBoard,
      create,
      answerInvite,
      sit,
      setReady: setReadyAction,
      move,
      resign,
      offerDraw,
      answerDraw,
      bet
    }),
    [
      tables, ready, table, openTableId, invite, myTable, myTurn, openTable, leaveTable, goToBoard,
      create, answerInvite, sit, setReadyAction, move, resign, offerDraw, answerDraw, bet
    ]
  )

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
}

export function useBoard(): BoardContextValue {
  const ctx = React.useContext(BoardContext)
  if (!ctx) throw new Error('useBoard must be used within BoardProvider')
  return ctx
}
