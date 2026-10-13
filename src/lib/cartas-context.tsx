import * as React from 'react'
import type { Socket } from 'socket.io-client'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './auth-context'
import { useSocket } from './socket-context'
import { useSettings } from './settings-context'
import { useSoundboard } from './soundboard-context'
import { playUiSound, type UiSound } from './ui-sounds'
import { isPopout } from './platform'
import { reactionLifeMs } from './poker-context'
import type { PokerReaction, ReactionInput } from './api-poker'
import type { CardGame, CartasAck, CartasLobbyTable, CartasSpeed, CartasTableView, TrucoVariant } from './api-cartas'

/**
 * TRUCO E CACHETA — o espelho da mesa no launcher. Mesmo desenho do
 * poker-context: o estado mora no servidor (lib/cartas/table.ts) e chega por
 * `cartas:lobby` (a lista, pra todo mundo) e `cartas:table` (a vista da mesa
 * aberta, POR PESSOA). Nenhuma ação muda o estado local: tudo espera a vista
 * nova do servidor; o ack só serve pra mensagem de erro.
 *
 * Os dois jogos dividem este contexto (a pessoa senta numa mesa por vez,
 * de qualquer um deles). Cada jogo tem a SUA tela (`/truco`, `/cacheta`);
 * `goTo(game, tableId?)` navega e abre.
 *
 * Fechar a tela NÃO levanta: a pessoa continua sentada e o relógio continua
 * correndo (normal — só quem cai de vez vai pro relógio curto). A barra
 * avisa quando é a vez.
 */

const MUTE_KEY = 'bocas:cartas:mute-reactions'

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export interface CreateCartasInput {
  game: CardGame
  variant?: TrucoVariant
  name?: string
  stakeId: string
  maxSeats: number
  speed: CartasSpeed
  startPoints?: number
  seat?: number
  channelId?: string
}

interface CartasContextValue {
  tables: CartasLobbyTable[]
  ready: boolean
  table: CartasTableView | null
  openTableId: string | null
  openTable: (tableId: string) => Promise<CartasAck>
  leaveTable: () => void
  /** Vai pra tela do jogo e, se vier `tableId`, abre a mesa. */
  goTo: (game: CardGame, tableId?: string) => void
  /** Onde estou SENTADO (pode não ser a mesa aberta). */
  seatedAt: CartasLobbyTable | null
  /** É a minha vez na mesa aberta. */
  myTurn: boolean
  createTable: (input: CreateCartasInput) => Promise<CartasAck>
  sit: (tableId: string, seat: number) => Promise<CartasAck>
  stand: (tableId: string) => Promise<CartasAck>
  start: (tableId: string) => Promise<CartasAck>
  act: (tableId: string, action: Record<string, unknown>) => Promise<CartasAck>
  closeTable: (tableId: string) => Promise<CartasAck>

  reactions: PokerReaction[]
  react: (tableId: string, input: ReactionInput) => Promise<CartasAck>
  reactionSoundsMuted: boolean
  setReactionSoundsMuted: (muted: boolean) => void

  /** A mesa em outra janela (só no app do PC; ver poker-context). */
  popoutOpen: CardGame | null
  popOut: (game: CardGame, tableId: string) => Promise<void>
  bringBack: () => Promise<void>
  focusPopout: () => Promise<void>
}

const CartasContext = React.createContext<CartasContextValue | null>(null)

const ACK_TIMEOUT_MS = 8_000

function emitWithAck(socket: Socket | null, event: string, payload: unknown): Promise<CartasAck> {
  if (!socket || !socket.connected) return Promise.resolve({ ok: false, error: 'Sem conexão com o servidor.' })
  return new Promise((resolve) => {
    socket.timeout(ACK_TIMEOUT_MS).emit(event, payload, (err: Error | null, response: CartasAck) => {
      if (err) return resolve({ ok: false, error: 'O servidor não respondeu.' })
      resolve(response ?? { ok: false, error: 'Resposta vazia.' })
    })
  })
}

function isMyTurn(view: CartasTableView | null): boolean {
  return !!view && view.mySeat !== null && view.playing && view.toAct.includes(view.mySeat)
}

const GAME_TITLE: Record<CardGame, string> = { truco: 'truco', cacheta: 'cacheta' }

export function CartasProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { socket, connected } = useSocket()
  const { settings } = useSettings()
  const { playIncoming } = useSoundboard()
  const navigate = useNavigate()
  const location = useLocation()
  const onScreenRef = React.useRef(false)
  onScreenRef.current = location.pathname === '/truco' || location.pathname === '/cacheta'

  const [tables, setTables] = React.useState<CartasLobbyTable[]>([])
  const [ready, setReady] = React.useState(false)
  const [openTableId, setOpenTableId] = React.useState<string | null>(null)
  const [table, setTable] = React.useState<CartasTableView | null>(null)
  const [reactions, setReactions] = React.useState<PokerReaction[]>([])
  const [reactionSoundsMuted, setMutedState] = React.useState<boolean>(readMuted)
  const [popoutOpen, setPopoutOpen] = React.useState<CardGame | null>(null)
  const mutedRef = React.useRef(reactionSoundsMuted)
  mutedRef.current = reactionSoundsMuted
  const playIncomingRef = React.useRef(playIncoming)
  playIncomingRef.current = playIncoming
  const settingsRef = React.useRef(settings)
  settingsRef.current = settings
  const openIdRef = React.useRef<string | null>(null)
  openIdRef.current = openTableId
  const pendingOpenRef = React.useRef<string | null>(null)

  const sound = React.useCallback((name: UiSound) => {
    const s = settingsRef.current
    playUiSound(name, s.soundEnabled ? s.soundVolume : 0)
  }, [])

  const reactionTimers = React.useRef(new Set<ReturnType<typeof setTimeout>>())
  React.useEffect(() => {
    const timers = reactionTimers.current
    return () => {
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  // --- socket -----------------------------------------------------------------
  React.useEffect(() => {
    if (!socket) return

    const handleLobby = (data: { tables?: CartasLobbyTable[] }): void => {
      if (!Array.isArray(data?.tables)) return
      setTables(data.tables)
      setReady(true)
    }

    const handleTable = (data: { tableId: string; table: CartasTableView }): void => {
      if (!data?.tableId || data.tableId !== openIdRef.current) return
      setTable((prev) => {
        const next = data.table
        if (prev && isMyTurn(next) && !isMyTurn(prev)) {
          // Com a tela aberta o toque é da mesa (ela sabe se é truco gritado ou só a vez).
          if (!onScreenRef.current || document.hidden) sound('poker-turn')
          if (!document.hasFocus()) {
            void window.bocas.notify.show({
              title: `Sua vez no ${GAME_TITLE[next.game]}`,
              body: next.name,
              silent: !settingsRef.current.soundEnabled
            })
            if (isPopout()) void window.bocas.popout.flash().catch(() => {})
          }
        }
        return next
      })
    }

    const handleReaction = (data: { tableId: string; reaction: PokerReaction }): void => {
      const r = data?.reaction
      if (!r?.id || data.tableId !== openIdRef.current) return
      setReactions((prev) => [...prev.filter((x) => x.id !== r.id), r].slice(-24))
      if (r.kind === 'sound' && r.sound && !mutedRef.current) playIncomingRef.current(r.sound)
      const timer = setTimeout(() => {
        reactionTimers.current.delete(timer)
        setReactions((prev) => prev.filter((x) => x.id !== r.id))
      }, reactionLifeMs(r))
      reactionTimers.current.add(timer)
    }

    socket.on('cartas:lobby', handleLobby)
    socket.on('cartas:table', handleTable)
    socket.on('cartas:reaction', handleReaction)
    return () => {
      socket.off('cartas:lobby', handleLobby)
      socket.off('cartas:table', handleTable)
      socket.off('cartas:reaction', handleReaction)
    }
  }, [socket, sound])

  React.useEffect(() => {
    setReactions([])
  }, [openTableId])

  // Lista a cada (re)conexão, e a mesa aberta volta pra sala sozinha.
  React.useEffect(() => {
    if (!socket || !connected) return
    socket.emit('cartas:request')
    const id = openIdRef.current
    if (id) {
      void emitWithAck(socket, 'cartas:open', { tableId: id }).then((ack) => {
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
    async (tableId: string): Promise<CartasAck> => {
      if (!socket || !socket.connected) {
        pendingOpenRef.current = tableId
        return { ok: false, error: 'Conectando ao servidor…' }
      }
      pendingOpenRef.current = null
      const previous = openIdRef.current
      if (previous && previous !== tableId) socket.emit('cartas:leave', { tableId: previous })
      setOpenTableId(tableId)
      const ack = await emitWithAck(socket, 'cartas:open', { tableId })
      if (ack.ok && ack.table) setTable(ack.table)
      else {
        setOpenTableId(null)
        setTable(null)
      }
      return ack
    },
    [socket]
  )

  React.useEffect(() => {
    if (!socket || !connected) return
    const pending = pendingOpenRef.current
    if (!pending) return
    pendingOpenRef.current = null
    void openTable(pending)
  }, [socket, connected, openTable])

  const goTo = React.useCallback(
    (game: CardGame, tableId?: string): void => {
      navigate(`/${game}`)
      if (tableId) void openTable(tableId)
    },
    [navigate, openTable]
  )

  const leaveTable = React.useCallback((): void => {
    const id = openIdRef.current
    if (id && socket) socket.emit('cartas:leave', { tableId: id })
    setOpenTableId(null)
    setTable(null)
  }, [socket])

  // A janela própria (ver poker-context): a principal acompanha se ela
  // existe e atende o "trazer de volta" de lá.
  React.useEffect(() => {
    if (isPopout()) return
    let alive = true
    const kindOf = (k: string | null, open: boolean): CardGame | null =>
      open && (k === 'truco' || k === 'cacheta') ? k : null
    void window.bocas.popout
      .state()
      .then((s) => alive && setPopoutOpen(kindOf(s.kind, s.open)))
      .catch(() => {})
    const offState = window.bocas.popout.onState((s) => setPopoutOpen(kindOf(s.kind, s.open)))
    const offBack = window.bocas.popout.onBringBack((p) => {
      if (p.kind !== 'truco' && p.kind !== 'cacheta') return
      navigate(`/${p.kind}`)
      if (p.tableId) void openTable(p.tableId)
    })
    return () => {
      alive = false
      offState()
      offBack()
    }
  }, [navigate, openTable])

  const createTable = React.useCallback(
    async (input: CreateCartasInput): Promise<CartasAck> => {
      const ack = await emitWithAck(socket, 'cartas:create', input)
      if (ack.ok && ack.tableId) {
        setOpenTableId(ack.tableId)
        if (ack.table) setTable(ack.table)
      }
      return ack
    },
    [socket]
  )
  const sit = React.useCallback(
    async (tableId: string, seat: number) => {
      const ack = await emitWithAck(socket, 'cartas:sit', { tableId, seat })
      if (ack.ok && ack.table && openIdRef.current === tableId) setTable(ack.table)
      return ack
    },
    [socket]
  )
  const stand = React.useCallback((tableId: string) => emitWithAck(socket, 'cartas:stand', { tableId }), [socket])
  const start = React.useCallback((tableId: string) => emitWithAck(socket, 'cartas:start', { tableId }), [socket])
  const act = React.useCallback(
    (tableId: string, action: Record<string, unknown>) => emitWithAck(socket, 'cartas:act', { tableId, action }),
    [socket]
  )
  const closeTable = React.useCallback((tableId: string) => emitWithAck(socket, 'cartas:close', { tableId }), [socket])
  const react = React.useCallback(
    (tableId: string, input: ReactionInput) =>
      emitWithAck(socket, 'cartas:react', { tableId, kind: input.kind, value: input.value, to: input.to ?? null }),
    [socket]
  )
  const setReactionSoundsMuted = React.useCallback((muted: boolean) => {
    setMutedState(muted)
    try {
      window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      // Sem armazenamento: vale só nesta sessão.
    }
  }, [])

  const popOut = React.useCallback(
    async (game: CardGame, tableId: string): Promise<void> => {
      const state = await window.bocas.popout.open({ kind: game, tableId }).catch(() => null)
      if (!state?.open) return
      setPopoutOpen(game)
      leaveTable()
      navigate('/')
    },
    [leaveTable, navigate]
  )
  const bringBack = React.useCallback(async (): Promise<void> => {
    await window.bocas.popout.bringBack().catch(() => {})
  }, [])
  const focusPopout = React.useCallback(async (): Promise<void> => {
    await window.bocas.popout.focus().catch(() => {})
  }, [])

  const seatedAt = React.useMemo(() => {
    const me = user?.id
    if (!me) return null
    return tables.find((t) => t.players.some((p) => p.userId === me)) ?? null
  }, [tables, user?.id])

  const myTurn = isMyTurn(table)

  const value = React.useMemo<CartasContextValue>(
    () => ({
      tables,
      ready,
      table,
      openTableId,
      openTable,
      leaveTable,
      goTo,
      seatedAt,
      myTurn,
      createTable,
      sit,
      stand,
      start,
      act,
      closeTable,
      reactions,
      react,
      reactionSoundsMuted,
      setReactionSoundsMuted,
      popoutOpen,
      popOut,
      bringBack,
      focusPopout
    }),
    [
      tables,
      ready,
      table,
      openTableId,
      openTable,
      leaveTable,
      goTo,
      seatedAt,
      myTurn,
      createTable,
      sit,
      stand,
      start,
      act,
      closeTable,
      reactions,
      react,
      reactionSoundsMuted,
      setReactionSoundsMuted,
      popoutOpen,
      popOut,
      bringBack,
      focusPopout
    ]
  )

  return <CartasContext.Provider value={value}>{children}</CartasContext.Provider>
}

export function useCartas(): CartasContextValue {
  const ctx = React.useContext(CartasContext)
  if (!ctx) throw new Error('useCartas must be used within CartasProvider')
  return ctx
}
