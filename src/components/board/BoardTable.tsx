import * as React from 'react'
import {
  ArrowLeft,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Crown,
  Eye,
  Flag,
  Handshake,
  ListOrdered,
  Loader2,
  RotateCcw,
  UserPlus,
  X
} from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/ui/tooltip'
import { GameIcon } from '@/components/social/GameIcon'
import { resolveAssetUrl } from '@/lib/api'
import {
  boardClockLabel,
  boardGameLabel,
  boardReasonLabel,
  parsePoolPosition,
  SHOT_CLOCK_MS,
  sideIsLight,
  sideLabel,
  type BoardAck,
  type BoardPerson,
  type BoardTableView,
  type Side
} from '@/lib/api-board'
import { useAuth } from '@/lib/auth-context'
import { useBoard } from '@/lib/board-context'
import { buildHistory, checkSquare, displayPosition } from '@/lib/board-local'
import { clockNow, material, START_POSITION, type Material } from '@/lib/board-position'
import { BRAND_MASK_STYLE } from '@/lib/brand-mask'
import { useLayout } from '@/lib/layout-context'
import { useMembers } from '@/lib/members-context'
import { useSettings } from '@/lib/settings-context'
import { playUiSound, type UiSound } from '@/lib/ui-sounds'
import { useTicker } from '@/lib/use-now'
import { cn } from '@/lib/utils'
import { Board } from './Board'
import { Clock } from './Clock'
import { MoveList } from './MoveList'
import { PieceGlyph } from './pieces'
import { PoolMatch } from '@/components/pool/PoolMatch'
import './board.css'

/**
 * A MESA ABERTA — lê tudo de `useBoard()` e muda de cara por fase: espera
 * (open/invited), combinado (pending), partida (playing) e fim (finished).
 *
 * A mesa está sempre posta: placa de cima, tabuleiro, placa de baixo. O que
 * muda por fase é o que FLUTUA sobre ela (`.board-veu`): esperando
 * adversário, a contagem pra começar, a faixa do resultado.
 *
 * O que o tabuleiro desenha ao vivo é a posição do servidor MAIS o meu lance
 * que ainda não voltou MAIS os pré-lances na fila (lib/board-local). A lista
 * de lances é navegável como no chess.com: clicar num lance, ←/→, ↑/↓ (ou
 * Home/End), e o lance novo que chega volta pro ao vivo. F vira o tabuleiro.
 *
 * O servidor é a autoridade: a tela só desenha a vista e manda a ação. O
 * relógio anda localmente (`clockNow` + relógio compartilhado do projeto) a
 * partir do retrato do servidor; a cada lance chega um retrato novo.
 *
 * Meu lado fica embaixo; quem assiste vê as brancas embaixo. `children` é a
 * coluna lateral extra (as apostas), abaixo da lista de lances.
 */

const LOW_MS = 10_000
/** Referência estável: um [] novo a cada tick refazia os memos do tabuleiro. */
const NO_MOVES: string[] = []

const fmtMurchos = (n: number): string => `${n.toLocaleString('pt-BR')} murchos`

const other = (side: Side): Side => (side === 'white' ? 'black' : 'white')
/** Quanto o servidor espera pelo primeiro lance antes de cancelar a mesa. */
const FIRST_MOVE_MS = 30_000
/** Quanto tempo "Analisando…" fica na tela depois do resultado. */
const ANALYSIS_WAIT_MS = 90_000
/** Análise só roda no xadrez e em partida com pelo menos isto de lances (plies). */
const ANALYSIS_MIN_PLIES = 10

/** "Fulano venceu por xeque-mate" / "Empate por acordo". */
const POOL_GROUP_LABEL = { open: 'mesa aberta', solids: 'lisas', stripes: 'listradas' } as const

/** O que a placa diz de um lado: a cor no xadrez/dama; no bilhar, o grupo (ou quem abre). */
function seatLabel(table: BoardTableView, side: Side): string {
  if (table.game !== 'pool') return sideLabel(table.game, table.variant, side)
  const pos = table.phase === 'pending' ? null : parsePoolPosition(table.position)
  const group = pos?.groups[side] ?? 'open'
  if (group !== 'open') return POOL_GROUP_LABEL[group]
  return side === 'white' ? 'dá a saída' : POOL_GROUP_LABEL.open
}

function resultHeadline(table: BoardTableView): string {
  const result = table.result
  if (!result) return ''
  if (result.reason === 'settle-error') return 'Erro no acerto da partida'
  if (result.winner) {
    const name = table[result.winner]?.displayName ?? 'Alguém'
    return `${name} venceu por ${boardReasonLabel(result.reason)}`
  }
  return result.reason === 'agreement' ? 'Empate por acordo' : `Empate por ${boardReasonLabel(result.reason)}`
}

export function BoardTable({ children }: { children?: React.ReactNode }) {
  const {
    table,
    invite,
    closeTable,
    cancelTable,
    create,
    answerInvite,
    setReady,
    play,
    pendingMove,
    premoves,
    lastLocalMove,
    queuePremove,
    cancelPremoves,
    resign,
    offerDraw,
    answerDraw,
    rematch: askRematch
  } = useBoard()
  const { user } = useAuth()
  const { isPhone } = useLayout()
  const { byId } = useMembers()
  const { settings } = useSettings()
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  // Espelho do `busy` fora do ciclo de render: o `run` é estável (useCallback)
  // pra que o tabuleiro memoizado não refaça a árvore a cada tique do relógio.
  const busyRef = React.useRef(false)
  /** Confirmação em dois cliques no próprio botão (desistir, sair). */
  const [confirm, setConfirm] = React.useState<'resign' | 'leave' | null>(null)
  /** "Ver o tabuleiro": esconde a faixa do resultado pra olhar a posição final. */
  const [peek, setPeek] = React.useState(false)
  /** Lance que a tela está mostrando (0 = posição inicial); null = ao vivo. */
  const [viewPly, setViewPly] = React.useState<number | null>(null)
  /** Chave do lance alcançado com um passo pra frente na lista: só ele anima. */
  const steppedRef = React.useRef<string | null>(null)
  const [flipped, setFlipped] = React.useState(false)
  /** Bilhar: a revanche que eu mandei (id da mesa nova), pro aviso na espera. */
  const [rematchSentId, setRematchSentId] = React.useState<string | null>(null)

  const phase = table?.phase ?? null
  const tableId = table?.id ?? null
  // Relógio compartilhado: 100 ms na partida (décimos abaixo de 10 s), 250 ms
  // na contagem do pending, parado nas outras fases.
  const now = useTicker(phase === 'playing' ? 100 : 250, phase === 'playing' || phase === 'pending')

  const settingsRef = React.useRef(settings)
  settingsRef.current = settings
  const sound = React.useCallback((name: UiSound): void => {
    const s = settingsRef.current
    playUiSound(name, s.soundEnabled ? s.soundVolume : 0)
  }, [])

  // --- a posição da tela ----------------------------------------------------
  // A posição vem sempre do servidor; o fallback só garante a mesa posta.
  // Bilhar tem mesa própria; aqui só entram xadrez e dama.
  const game = table && table.game !== 'pool' ? table.game : null
  const serverPosition = table?.position || (game ? START_POSITION[game] : '')
  const serverMoves = table?.moves ?? NO_MOVES
  // O meu lance no ar (só vale se for o próximo lance da partida).
  const pending = pendingMove && pendingMove.ply === serverMoves.length ? pendingMove.move : null
  const shownMoves = React.useMemo(
    () => (pending ? [...serverMoves, pending] : serverMoves),
    [serverMoves, pending]
  )
  const movesKey = shownMoves.join(' ')
  const display = React.useMemo(
    () => (game ? displayPosition(game, serverPosition, pending, premoves) : null),
    [game, serverPosition, pending, premoves]
  )
  const afterPending = display?.afterPending ?? serverPosition
  const history = React.useMemo(
    () => (game ? buildHistory(game, shownMoves, afterPending) : null),
    // Os lances mudam de array a cada vista nova; refazer só quando mudam de verdade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, movesKey, afterPending]
  )
  const total = shownMoves.length
  const browsing = viewPly !== null && !!history?.complete && viewPly < total
  const shownPly = browsing ? viewPly : total

  // Lance novo (ou mesa nova): de volta ao vivo.
  React.useEffect(() => setViewPly(null), [total, tableId])
  React.useEffect(() => setFlipped(false), [tableId])

  const boardPosition = browsing
    ? shownPly === 0
      ? history!.start
      : history!.plies[shownPly - 1].position
    : (display?.shown ?? serverPosition)
  const boardLast = shownPly > 0 ? shownMoves[shownPly - 1] : null
  const boardLastKey = boardLast ? `${shownPly - 1}:${boardLast}` : null
  // Anima: lance do outro, meu lance de clique, e o passo pra frente na lista.
  // Não anima: meu arrasto e o pré-lance (a peça já está lá).
  const localLast =
    !!lastLocalMove && lastLocalMove.ply === total - 1 && lastLocalMove.move === boardLast && !browsing
  const boardAnimate =
    (!!boardLastKey && steppedRef.current === boardLastKey) || !localLast || lastLocalMove?.how === 'click'
  const checkPosition = browsing ? boardPosition : afterPending
  const boardCheck = React.useMemo(
    () => (game === 'chess' && checkPosition ? checkSquare(checkPosition) : null),
    [game, checkPosition]
  )
  const mat = React.useMemo(
    (): Material | null => (game && boardPosition ? material(game, boardPosition) : null),
    [game, boardPosition]
  )

  const goTo = React.useCallback(
    (ply: number | null, step = false): void => {
      const target = ply === null || ply >= total ? total : Math.max(0, ply)
      steppedRef.current = step && target > 0 ? `${target - 1}:${shownMoves[target - 1]}` : null
      setViewPly(target >= total ? null : target)
    },
    [total, shownMoves]
  )

  React.useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 4_500)
    return () => clearTimeout(t)
  }, [error])

  // A confirmação some sozinha se a pessoa desistir de clicar.
  React.useEffect(() => {
    if (!confirm) return
    const t = setTimeout(() => setConfirm(null), 4_000)
    return () => clearTimeout(t)
  }, [confirm])

  // Fase nova (ou mesa nova): confirmações antigas não valem e a faixa volta.
  React.useEffect(() => {
    setConfirm(null)
    setPeek(false)
  }, [phase, tableId])

  // Teclado, como no chess.com: ←/→ andam um lance, ↑/Home vai pro começo,
  // ↓/End volta ao vivo, F vira o tabuleiro. Nada disso com o foco num campo.
  const canBrowse = !!history?.complete && total > 0
  React.useEffect(() => {
    if (!tableId) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      if (e.key === 'f' || e.key === 'F') {
        setFlipped((v) => !v)
      } else if (!canBrowse) {
        return
      } else if (e.key === 'ArrowLeft') {
        goTo(shownPly - 1)
      } else if (e.key === 'ArrowRight') {
        goTo(shownPly + 1, true)
      } else if (e.key === 'ArrowUp' || e.key === 'Home') {
        goTo(0)
      } else if (e.key === 'ArrowDown' || e.key === 'End') {
        goTo(null)
      } else {
        return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tableId, canBrowse, shownPly, goTo])

  const run = React.useCallback(async (fn: () => Promise<BoardAck>): Promise<void> => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      const ack = await fn()
      if (!ack.ok) setError(ack.error ?? 'Deu ruim.')
    } catch {
      setError('Deu ruim. Tente de novo.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])
  // O lance não passa pelo `busy`: com o meu lance no ar a tela já está em
  // modo de pré-lance, e o erro (recusa) aparece igual.
  const onMove = React.useCallback(
    (m: string, how: 'drag' | 'click'): void => {
      void play(m, how).then((ack) => {
        if (!ack.ok) setError(ack.error ?? 'O lance não foi aceito.')
      })
    },
    [play]
  )
  const onIllegal = React.useCallback((): void => sound('board-illegal'), [sound])

  const mySide = table?.mySide ?? null
  const rawClocks = table ? clockNow(table.clocks, table.clockAt, table.clockRunning, table.turn, now) : null
  // Bilhar: depois da tacada o `clockAt` vem no futuro (fim do replay); o
  // relógio fica em 30 s até lá, nunca acima.
  const clocks =
    rawClocks && table?.game === 'pool'
      ? { white: Math.min(SHOT_CLOCK_MS, rawClocks.white), black: Math.min(SHOT_CLOCK_MS, rawClocks.black) }
      : rawClocks

  // Dez segundos no meu relógio, na minha vez: três tiques, uma vez por partida.
  const lowRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!table || !clocks || !mySide || table.phase !== 'playing' || table.result || !table.clockRunning) return
    if (table.turn !== mySide || pending) return
    const left = clocks[mySide]
    if (left > 0 && left < LOW_MS && lowRef.current !== table.id) {
      lowRef.current = table.id
      sound('board-low-time')
    }
  })

  // Xadrez e dama precisam do `game`; o bilhar tem mesa própria (PoolMatch).
  if (!table || !clocks || (!game && table.game !== 'pool')) return null
  const pool = table.game === 'pool'

  const label = boardGameLabel(table.game, table.variant)
  const bottom: Side = mySide ?? 'white'
  const orientation: Side = flipped ? other(bottom) : bottom
  const top = other(orientation)
  const waiting = table.phase === 'open' || table.phase === 'invited'
  const pendingPhase = table.phase === 'pending'
  const playing = table.phase === 'playing'
  const finished = table.phase === 'finished'
  const isHost = table.host.userId === user?.id
  // A mesa nova da revanche do bilhar abre direto aqui, em `invited`.
  const rematchSent = waiting && rematchSentId === table.id
  const iAmPlayer = mySide !== null

  const myTurn = playing && !table.result && mySide === table.turn
  const canMove = !browsing && myTurn && !pending
  const canPremove = !browsing && game === 'chess' && playing && !table.result && iAmPlayer && (!myTurn || !!pending)
  const drawFromOpponent = !!mySide && table.drawOfferBy !== null && table.drawOfferBy !== mySide
  const drawFromMe = !!mySide && table.drawOfferBy === mySide

  const secsToFirstMove =
    playing && !table.result && table.moves.length === 0 && !pending
      ? Math.max(0, Math.ceil((table.clockAt + FIRST_MOVE_MS - now) / 1000))
      : null
  const secsToStart = pendingPhase && table.startsAt ? Math.max(0, Math.ceil((table.startsAt - now) / 1000)) : null
  const showClock = playing || finished
  const worth = table.stake > 0 ? `valendo ${fmtMurchos(table.stake)}` : 'sem valor'

  // Esperando: a mesa já está posta — o anfitrião embaixo, o convidado (se
  // houver) em cima; os lados só existem quando a partida combina.
  const waitingBottom = flipped ? table.invited : table.host
  const waitingTop = flipped ? table.host : table.invited
  const bottomPerson = waiting ? waitingBottom : table[orientation]
  const topPerson = waiting ? waitingTop : table[top]

  // Revanche: o convite volta pro adversário, mesma mesa (as cores o servidor
  // sorteia de novo). Se ele já me chamou, o botão aceita o convite dele.
  const opponent = mySide ? table[other(mySide)] : null
  const rematchInvite =
    invite && opponent && invite.from.userId === opponent.userId && invite.game === table.game ? invite : null
  const opponentOnline = opponent ? (byId[opponent.userId]?.isOnline ?? false) : false
  const rematch =
    finished && opponent && table.result?.reason !== 'settle-error'
      ? {
          label: rematchInvite ? 'Aceitar a revanche' : 'Revanche',
          disabled: busy || (!rematchInvite && !opponentOnline),
          hint: !rematchInvite && !opponentOnline ? `${opponent.displayName} não está online.` : undefined,
          onClick: () =>
            void run(async () => {
              if (pool) {
                // Bilhar: um `board:rematch` só. O servidor aceita o convite do
                // outro se ele já pediu; erro vira aviso e nada mais (o convite
                // que chegar ainda pode ser aceito pelo toast).
                const ack = await askRematch()
                if (ack.ok && ack.table?.phase === 'invited') setRematchSentId(ack.table.id)
                return ack
              }
              return rematchInvite
                ? answerInvite(true)
                : create({
                    game: table.game,
                    variant: table.game === 'draughts' ? (table.variant ?? undefined) : undefined,
                    clock: table.clock,
                    stake: table.stake,
                    inviteUserId: opponent.userId
                  })
            })
        }
      : null

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="relative z-conteudo flex shrink-0 items-center gap-2 border-b border-line/50 bg-void/40 px-2 py-1.5 backdrop-blur-sm sm:px-3">
        {(playing || finished || !iAmPlayer) && (
          <Button variant="ghost" size="sm" onClick={closeTable}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden />
            Saguão
          </Button>
        )}
        <GameIcon game={table.game} className="h-5 w-5 shrink-0 text-acid" />
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-sm font-semibold leading-tight text-foreground">{label}</p>
          <p className="truncate text-[11.5px] leading-tight text-muted-foreground">
            <span className="font-mono">{boardClockLabel(table.clock)}</span> · {worth}
            {table.spectators > 0 && (
              <>
                {' '}
                · <Eye className="inline h-3 w-3" aria-hidden /> <span className="font-mono">{table.spectators}</span>
              </>
            )}
          </p>
        </div>
      </header>

      <div className={cn('flex min-h-0 flex-1', isPhone ? 'flex-col overflow-y-auto' : 'flex-row')}>
        {/* O palco: a mesa posta e o que flutua sobre ela */}
        <div className={cn('board-palco p-2 sm:p-3', isPhone ? 'shrink-0' : 'min-h-0 flex-1')}>
          <span aria-hidden className="board-palco-marca" style={BRAND_MASK_STYLE} />
          <div className={cn('board-area', isPhone && 'board-area--fone')}>
            <div className={cn('board-mesa', waiting && 'board-mesa--espera', pool && 'board-mesa--bilhar')}>
              <PlayerBar
                person={topPerson}
                side={waiting ? null : top}
                table={table}
                clocks={clocks}
                showClock={showClock}
                material={mat}
                firstMoveIn={secsToFirstMove}
              />
              {pool || !game ? (
                <PoolMatch key={table.id} table={table} mySide={mySide} canAct={canMove} />
              ) : (
                <Board
                  key={table.id}
                  game={game}
                  variant={table.variant}
                  position={boardPosition}
                  orientation={orientation}
                  legalMoves={canMove ? table.legalMoves : NO_MOVES}
                  lastMove={boardLast}
                  lastMoveKey={boardLastKey}
                  animateLast={boardAnimate}
                  checkSquare={boardCheck}
                  premoves={browsing ? NO_MOVES : premoves}
                  mySide={mySide}
                  onMove={canMove ? onMove : undefined}
                  onPremove={canPremove ? queuePremove : undefined}
                  onCancelPremoves={cancelPremoves}
                  onIllegal={onIllegal}
                />
              )}
              <PlayerBar
                person={bottomPerson}
                side={waiting ? null : orientation}
                table={table}
                clocks={clocks}
                showClock={showClock}
                material={mat}
                firstMoveIn={secsToFirstMove}
              />
            </div>
          </div>

          {waiting && (
            <div className="board-veu">
              <div className="board-faixa board-faixa--acid" role="status">
                <div className="board-medalhao board-medalhao--espera" aria-hidden>
                  <span className="board-medalhao-marca" style={BRAND_MASK_STYLE} />
                </div>
                <p className="board-faixa-titulo">
                  {table.phase === 'invited' && table.invited
                    ? `${rematchSent ? 'Convite de revanche enviado' : 'Convite enviado'} para ${table.invited.displayName}`
                    : 'Aguardando adversário'}
                </p>
                <p className="board-faixa-sub">
                  {label} · <span className="font-mono">{boardClockLabel(table.clock)}</span> · {worth}
                </p>
                {error && <ErrorLine message={error} className="mt-3 text-left" />}
                <div className="board-faixa-acoes">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => (isHost ? void run(() => cancelTable(table.id)) : closeTable())}
                  >
                    {isHost ? 'Cancelar mesa' : 'Voltar ao saguão'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {pendingPhase && (
            <div className="board-veu">
              <div className="board-faixa board-faixa--acid" role="status">
                {secsToStart !== null ? (
                  <>
                    <p className="board-faixa-sub">A partida começa em</p>
                    <p className="board-contagem" aria-label={`${secsToStart} segundos`}>
                      {secsToStart}
                    </p>
                  </>
                ) : (
                  <p className="board-faixa-titulo">Partida combinada</p>
                )}
                <div className="board-faixa-lados">
                  {(['white', 'black'] as const).map((side) => (
                    <div key={side} className="board-faixa-lado">
                      {!pool && (
                        <PieceGlyph
                          piece={{ side, kind: table.game === 'chess' ? 'k' : 'man' }}
                          light={sideIsLight(table.game, table.variant, side)}
                          className="board-peca--mini"
                        />
                      )}
                      <span className="board-faixa-lado-nome">{table[side]?.displayName ?? '—'}</span>
                      <span className="text-[11.5px]">{seatLabel(table, side)}</span>
                      <span className={cn('board-pronto', !table.ready[side] && 'board-pronto--nao')}>
                        {table.ready[side] ? 'pronto' : 'esperando'}
                      </span>
                    </div>
                  ))}
                </div>
                {table.stake > 0 && (
                  <p className="board-faixa-sub mt-3">
                    Valendo <span className="font-mono text-foreground">{fmtMurchos(table.stake)}</span> pra cada um.
                  </p>
                )}
                {error && <ErrorLine message={error} className="mt-3 text-left" />}
                {iAmPlayer && (
                  <div className="board-faixa-acoes">
                    {!table.ready[mySide] && (
                      <Button size="sm" disabled={busy} onClick={() => void run(setReady)}>
                        Pronto
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={confirm === 'leave' ? 'destructive' : 'secondary'}
                      className={cn(
                        confirm === 'leave' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                      )}
                      onClick={() => {
                        if (confirm !== 'leave') return setConfirm('leave')
                        setConfirm(null)
                        void run(() => cancelTable(table.id))
                      }}
                    >
                      {confirm === 'leave' ? 'Sair cancela a partida. Confirmar?' : 'Sair'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {finished && !peek && (
            <div className="board-veu">
              <ResultBanner table={table} onLeave={closeTable} onPeek={() => setPeek(true)} rematch={rematch} error={error} />
            </div>
          )}
        </div>

        {/* Coluna lateral: situação, lances e o que a tela de cima quiser pôr */}
        <aside
          className={cn(
            'board-painel flex shrink-0 flex-col gap-3 border-line p-3',
            isPhone ? 'border-t' : 'min-h-0 w-72 overflow-y-auto border-l'
          )}
        >
          {error && !waiting && !pendingPhase && !(finished && !peek) && <ErrorLine message={error} />}

          {playing && iAmPlayer && !table.result && (
            <div className="flex flex-col gap-2">
              {!pool && (
                <p className={cn('board-vez', canMove && 'board-vez--minha')}>
                  <span className="board-vez-ponto" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {myTurn && !pending
                      ? 'Sua vez'
                      : `Vez de ${table[other(mySide)]?.displayName ?? sideLabel(table.game, table.variant, other(mySide))}`}
                  </span>
                </p>
              )}
              {premoves.length > 0 && (
                <p className="board-pre-aviso">
                  <span className="min-w-0 flex-1">
                    {premoves.length === 1 ? 'Pré-lance marcado' : `${premoves.length} pré-lances na fila`}
                    {!isPhone && <span className="text-muted-foreground"> · botão direito cancela</span>}
                  </span>
                  <button
                    type="button"
                    onClick={cancelPremoves}
                    aria-label="Cancelar os pré-lances"
                    className="board-pre-cancela"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </p>
              )}
              {drawFromOpponent && (
                <div className="board-secao gap-2 p-3">
                  <p className="flex items-center gap-2 text-xs text-foreground">
                    <Handshake className="h-3.5 w-3.5 text-burn" aria-hidden />
                    Seu adversário propôs empate.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => void run(() => answerDraw(true))}>
                      Aceitar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void run(() => answerDraw(false))}
                    >
                      Recusar
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={confirm === 'resign' ? 'destructive' : 'secondary'}
                  className={cn(
                    confirm === 'resign' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  )}
                  disabled={busy}
                  onClick={() => {
                    if (confirm !== 'resign') return setConfirm('resign')
                    setConfirm(null)
                    void run(resign)
                  }}
                >
                  <Flag className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  {confirm === 'resign' ? 'Desistir mesmo?' : 'Desistir'}
                </Button>
                {!pool && (
                  <Button size="sm" variant="secondary" disabled={busy || drawFromMe} onClick={() => void run(offerDraw)}>
                    <Handshake className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    {drawFromMe ? 'Empate proposto' : 'Propor empate'}
                  </Button>
                )}
              </div>
            </div>
          )}

          {playing && !iAmPlayer && !table.result && (
            <p className="board-vez">
              <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>Você está assistindo.</span>
            </p>
          )}

          {finished && (
            <div className="flex flex-col gap-2">
              <div className="board-resultado px-3 py-2">
                <p className="text-sm font-semibold text-burn">{resultHeadline(table)}</p>
                {peek && (
                  <button
                    type="button"
                    onClick={() => setPeek(false)}
                    className="mt-1 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                  >
                    Ver o resultado de novo
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {rematch && (
                  <Button size="sm" disabled={rematch.disabled} onClick={rematch.onClick} title={rematch.hint}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    {rematch.label}
                  </Button>
                )}
                <Button size="sm" variant={rematch ? 'secondary' : 'default'} onClick={closeTable}>
                  Voltar ao saguão
                </Button>
              </div>
            </div>
          )}

          {/* Lances só fazem sentido com partida (em andamento ou acabada). */}
          {browsing && (
            <button type="button" className="board-historico" onClick={() => goTo(null)}>
              <span className="min-w-0 flex-1 text-left">
                Vendo o lance <span className="font-mono text-foreground">{shownPly}</span> de{' '}
                <span className="font-mono text-foreground">{total}</span>
              </span>
              <span className="board-historico-volta">
                Ao vivo <ChevronsRight className="h-3.5 w-3.5" aria-hidden />
              </span>
            </button>
          )}
          {(playing || finished) && !pool && (
            <div className="board-secao min-h-[8rem]">
              <h4 className="board-secao-cabeca">
                <ListOrdered className="h-3.5 w-3.5" aria-hidden />
                Lances
                <span className="board-secao-n">{total}</span>
              </h4>
              <div className="flex max-h-64 min-h-0 flex-1 flex-col overflow-y-auto">
                <MoveList
                  game={table.game}
                  variant={table.variant}
                  plies={history?.plies ?? []}
                  current={shownPly}
                  onSelect={canBrowse ? (ply) => goTo(ply) : undefined}
                />
              </div>
              <div className="board-nav" role="toolbar" aria-label="Navegar pelos lances">
                <NavButton label="Começo" shortcut="↑" disabled={!canBrowse || shownPly === 0} onClick={() => goTo(0)}>
                  <ChevronsLeft className="h-4 w-4" aria-hidden />
                </NavButton>
                <NavButton
                  label="Lance anterior"
                  shortcut="←"
                  disabled={!canBrowse || shownPly === 0}
                  onClick={() => goTo(shownPly - 1)}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </NavButton>
                <NavButton
                  label="Próximo lance"
                  shortcut="→"
                  disabled={!canBrowse || !browsing}
                  onClick={() => goTo(shownPly + 1, true)}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </NavButton>
                <NavButton label="Ao vivo" shortcut="↓" disabled={!browsing} onClick={() => goTo(null)}>
                  <ChevronsRight className="h-4 w-4" aria-hidden />
                </NavButton>
                <span className="flex-1" />
                <NavButton label="Virar o tabuleiro" shortcut="F" onClick={() => setFlipped((v) => !v)}>
                  <ArrowUpDown className="h-4 w-4" aria-hidden />
                </NavButton>
              </div>
            </div>
          )}

          {children}
        </aside>
      </div>
    </div>
  )
}

/** Botão de ícone da barra de navegação, com a dica e o atalho. */
function NavButton({
  label,
  shortcut,
  disabled,
  onClick,
  children
}: {
  label: string
  shortcut?: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Hint label={label} shortcut={shortcut} disabled={disabled}>
      <button type="button" className="board-nav-botao" aria-label={label} disabled={disabled} onClick={onClick}>
        {children}
      </button>
    </Hint>
  )
}

/** A placa de um lado: avatar, nome, cor, capturadas (ou "pronto") e relógio. */
function PlayerBar({
  person,
  side,
  table,
  clocks,
  showClock,
  material: mat,
  firstMoveIn = null
}: {
  person: BoardPerson | null
  /** Nulo enquanto a mesa espera: os lados só existem com a partida combinada. */
  side: Side | null
  table: BoardTableView
  clocks: { white: number; black: number }
  showClock: boolean
  material: Material | null
  /** Segundos pro primeiro lance da partida (o servidor cancela no zero). */
  firstMoveIn?: number | null
}) {
  const { byId } = useMembers()
  const member = person ? byId[person.userId] : undefined
  const active = !!side && table.phase === 'playing' && !table.result && table.turn === side
  const won = !!side && table.phase === 'finished' && table.result?.winner === side
  const light = side ? sideIsLight(table.game, table.variant, side) : true
  const pool = table.game === 'pool'
  const captured = side && mat ? mat.captured[side] : []
  const advantage = side && mat ? (side === 'white' ? mat.advantage : -mat.advantage) : 0

  let line: React.ReactNode = null
  if (active && firstMoveIn !== null) {
    line = (
      <span className="board-primeiro">
        primeiro lance em <span className="font-mono">{firstMoveIn}s</span> ou a partida cai
      </span>
    )
  } else if (!person) {
    line = <span>esperando alguém sentar</span>
  } else if (!side) {
    line = <span>{person.userId === table.host.userId ? 'anfitrião' : 'convidado'}</span>
  } else if (table.phase === 'pending') {
    line = (
      <span className={cn('board-pronto', !table.ready[side] && 'board-pronto--nao')}>
        {table.ready[side] ? 'pronto' : 'esperando'}
      </span>
    )
  } else if (captured.length > 0 || advantage > 0) {
    const victim = other(side)
    const victimLight = sideIsLight(table.game, table.variant, victim)
    line = (
      <>
        <span
          className="board-material"
          aria-label={`capturou ${captured.length} peça${captured.length === 1 ? '' : 's'}`}
        >
          {captured.map((kind, i) => (
            <PieceGlyph key={i} piece={{ side: victim, kind }} light={victimLight} className="board-peca--mini" />
          ))}
        </span>
        {advantage > 0 && <span className="board-vantagem">+{advantage}</span>}
      </>
    )
  } else {
    line = <span>{seatLabel(table, side)}</span>
  }

  return (
    <div
      className={cn(
        'board-jogador',
        active && 'board-jogador--vez',
        won && 'board-jogador--vencedor',
        !person && 'board-jogador--vaga'
      )}
    >
      {person ? (
        <UserAvatar
          userId={person.userId}
          src={resolveAssetUrl(member?.avatar ?? person.avatar)}
          name={person.displayName}
          ringColor={member?.profileColor ?? undefined}
          className={cn('board-avatar h-10 w-10', active && 'board-avatar--vez', won && 'board-avatar--vencedor')}
        />
      ) : (
        <span className="board-avatar-vaga" aria-hidden>
          <UserPlus className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="board-nome">
          {side && !pool && (
            <PieceGlyph
              piece={{ side, kind: table.game === 'chess' ? 'k' : 'man' }}
              light={light}
              className="board-peca--mini"
            />
          )}
          <span>{person?.displayName ?? (table.phase === 'invited' ? 'Convidado' : 'Vaga')}</span>
          {won && <Crown className="h-3.5 w-3.5 shrink-0 text-burn" aria-label="venceu" />}
          {side && !pool && <span className="sr-only"> ({sideLabel(table.game, table.variant, side)})</span>}
        </p>
        <div className="board-placa-linha">{line}</div>
      </div>
      {/* Bilhar: 30 s por tacada, só o relógio de quem está na vez importa. */}
      {showClock && side && (!pool || active) && (
        <Clock ms={clocks[side]} active={active && table.clockRunning} low={clocks[side] < LOW_MS} />
      )}
    </div>
  )
}

interface Rematch {
  label: string
  disabled: boolean
  hint?: string
  onClick: () => void
}

/** A faixa do fim: quem venceu e por quê, o valor, XP, a análise e a revanche. */
function ResultBanner({
  table,
  onLeave,
  onPeek,
  rematch,
  error
}: {
  table: BoardTableView
  onLeave: () => void
  onPeek: () => void
  rematch: Rematch | null
  error: string | null
}) {
  const { byId } = useMembers()
  const result = table.result
  const analysis = table.analysis
  const winner = result?.winner ?? null
  const winnerPerson = winner ? table[winner] : null
  const winnerMember = winnerPerson ? byId[winnerPerson.userId] : undefined
  const settleError = result?.reason === 'settle-error'
  // A análise só roda no xadrez com lances suficientes; sem resposta em 90 s, desiste da espera.
  const mayAnalyse = table.game === 'chess' && table.moves.length >= ANALYSIS_MIN_PLIES && !settleError
  const [waiting, setWaiting] = React.useState(true)
  React.useEffect(() => {
    if (!mayAnalyse || analysis) return
    const t = setTimeout(() => setWaiting(false), ANALYSIS_WAIT_MS)
    return () => clearTimeout(t)
  }, [mayAnalyse, analysis])

  if (!result) return null

  let title: string
  let sub: string
  if (settleError) {
    title = 'Erro no acerto da partida'
    sub = 'Os valores foram devolvidos.'
  } else if (winnerPerson) {
    title = `${winnerPerson.displayName} venceu`
    sub = `por ${boardReasonLabel(result.reason)}`
    if (table.stake > 0) sub += ` · leva ${fmtMurchos(table.stake)} do adversário`
  } else {
    title = 'Empate'
    sub = `por ${boardReasonLabel(result.reason)}`
    if (table.stake > 0) sub += ' · o valor volta pra cada um'
  }

  return (
    <div
      role="status"
      className={cn('board-faixa', settleError ? 'board-faixa--erro' : winner ? 'board-faixa--ouro' : 'board-faixa--acid')}
    >
      {winnerPerson && !settleError ? (
        <UserAvatar
          userId={winnerPerson.userId}
          src={resolveAssetUrl(winnerMember?.avatar ?? winnerPerson.avatar)}
          name={winnerPerson.displayName}
          ringColor={winnerMember?.profileColor ?? undefined}
          className="board-avatar board-avatar--vencedor mx-auto mb-3 h-14 w-14"
        />
      ) : (
        <div className="board-medalhao" aria-hidden>
          <span className="board-medalhao-marca" style={BRAND_MASK_STYLE} />
        </div>
      )}
      <p className="board-faixa-titulo">{title}</p>
      <p className="board-faixa-sub">{sub}</p>

      {!settleError && (
        <div className="board-faixa-lados">
          {(['white', 'black'] as const).map((side) => (
            <div key={side} className={cn('board-faixa-lado', winner === side && 'board-faixa-lado--vencedor')}>
              {table.game !== 'pool' && (
                <PieceGlyph
                  piece={{ side, kind: table.game === 'chess' ? 'k' : 'man' }}
                  light={sideIsLight(table.game, table.variant, side)}
                  className="board-peca--mini"
                />
              )}
              <span className="board-faixa-lado-nome">{table[side]?.displayName ?? '—'}</span>
              <span className="board-faixa-stat text-acid-text">+{result.xp[side] ?? 0} XP</span>
              {analysis && (
                <span className="board-faixa-stat" title="precisão · rating estimado">
                  <span className="text-foreground">{Math.round(analysis.accuracy[side])}%</span>
                  {analysis.ratingEst[side] != null && (
                    <>
                      {' · '}
                      <span className="text-foreground">{analysis.ratingEst[side]}</span>
                    </>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {!analysis && mayAnalyse && waiting && (
        <p className="board-faixa-sub mt-3 flex items-center justify-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Analisando a partida…
        </p>
      )}

      {error && <ErrorLine message={error} className="mt-3 text-left" />}

      <div className="board-faixa-acoes">
        {rematch && (
          <Button size="sm" disabled={rematch.disabled} onClick={rematch.onClick} title={rematch.hint}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {rematch.label}
          </Button>
        )}
        <Button size="sm" variant={rematch ? 'secondary' : 'default'} onClick={onLeave}>
          Voltar ao saguão
        </Button>
        <Button size="sm" variant="ghost" onClick={onPeek}>
          Ver o tabuleiro
        </Button>
      </div>
      {rematch?.hint && <p className="board-faixa-sub mt-2">{rematch.hint}</p>}
    </div>
  )
}

/** Mesma linha de erro do saguão do pôquer. */
function ErrorLine({ message, className }: { message: string; className?: string }) {
  return (
    <p
      role="alert"
      className={cn(
        'rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs text-destructive',
        className
      )}
    >
      {message}
    </p>
  )
}
