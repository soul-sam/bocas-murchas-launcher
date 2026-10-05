import * as React from 'react'
import { ArrowLeft, Eye } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { resolveAssetUrl } from '@/lib/api'
import {
  boardGameLabel,
  boardReasonLabel,
  sideIsLight,
  sideLabel,
  type BoardAck,
  type BoardPerson,
  type BoardTableView,
  type Side
} from '@/lib/api-board'
import { useAuth } from '@/lib/auth-context'
import { useBoard } from '@/lib/board-context'
import { clockNow } from '@/lib/board-position'
import { useLayout } from '@/lib/layout-context'
import { useMembers } from '@/lib/members-context'
import { useTicker } from '@/lib/use-now'
import { cn } from '@/lib/utils'
import { Board } from './Board'
import { Clock } from './Clock'
import { MoveList } from './MoveList'
import './board.css'

/**
 * A MESA ABERTA — lê tudo de `useBoard()` e muda de cara por fase: espera
 * (open/invited), combinado (pending), partida (playing) e fim (finished).
 *
 * O servidor é a autoridade: a tela só desenha a vista e manda a ação. O
 * relógio anda localmente (`clockNow` + relógio compartilhado do projeto) a
 * partir do retrato do servidor; a cada lance chega um retrato novo.
 *
 * Meu lado fica embaixo; quem assiste vê as brancas embaixo. `children` é a
 * coluna lateral extra (as apostas, na Task 12), abaixo da lista de lances.
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

/** Bolinha de cor do lado: a clara é a das peças claras (na dama americana, quem abre é a escura). */
const dotClass = (table: BoardTableView, side: Side): string =>
  sideIsLight(table.game, table.variant, side) ? 'board-lado--branca' : 'board-lado--preta'

/** "Fulano venceu por xeque-mate" / "Empate por acordo". */
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
  const { table, closeTable, cancelTable, setReady, move, resign, offerDraw, answerDraw } = useBoard()
  const { user } = useAuth()
  const { isPhone } = useLayout()
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  /** Confirmação em dois cliques no próprio botão (desistir, sair). */
  const [confirm, setConfirm] = React.useState<'resign' | 'leave' | null>(null)

  const phase = table?.phase ?? null
  // Relógio compartilhado: 100 ms na partida (décimos abaixo de 10 s), 250 ms
  // na contagem do pending, parado nas outras fases.
  const now = useTicker(phase === 'playing' ? 100 : 250, phase === 'playing' || phase === 'pending')

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

  // Fase nova: confirmações antigas não valem.
  React.useEffect(() => {
    setConfirm(null)
  }, [phase])

  if (!table) return null

  const run = async (fn: () => Promise<BoardAck>): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const ack = await fn()
      if (!ack.ok) setError(ack.error ?? 'Deu ruim.')
    } catch {
      setError('Deu ruim. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  const label = boardGameLabel(table.game, table.variant)
  const mySide = table.mySide
  const bottom: Side = mySide ?? 'white'
  const top = other(bottom)

  // ---- esperando adversário ------------------------------------------------
  if (table.phase === 'open' || table.phase === 'invited') {
    const isHost = table.host.userId === user?.id
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-base font-semibold text-foreground">
          {table.phase === 'invited' && table.invited
            ? `Convite enviado para ${table.invited.displayName}`
            : 'Aguardando adversário'}
        </p>
        <p className="text-xs text-muted-foreground">
          {label} · {table.clock}
          {table.stake > 0 ? ` · valendo ${fmtMurchos(table.stake)}` : ' · sem valor'}
        </p>
        {error && <ErrorLine message={error} />}
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => (isHost ? void run(() => cancelTable(table.id)) : closeTable())}
        >
          {isHost ? 'Cancelar' : 'Voltar ao saguão'}
        </Button>
      </div>
    )
  }

  const clocks = clockNow(table.clocks, table.clockAt, table.clockRunning, table.turn, now)
  const playing = table.phase === 'playing'
  const finished = table.phase === 'finished'
  const iAmPlayer = mySide !== null
  const myTurn = playing && !table.result && mySide === table.turn
  const drawFromOpponent = !!mySide && table.drawOfferBy !== null && table.drawOfferBy !== mySide
  const drawFromMe = !!mySide && table.drawOfferBy === mySide

  const secsToFirstMove =
    playing && !table.result && table.moves.length === 0
      ? Math.max(0, Math.ceil((table.clockAt + FIRST_MOVE_MS - now) / 1000))
      : null
  const secsToStart = table.startsAt ? Math.max(0, Math.ceil((table.startsAt - now) / 1000)) : null

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="relative z-conteudo flex shrink-0 items-center gap-2 border-b border-line/50 bg-void/40 px-2 py-1.5 backdrop-blur-sm sm:px-3">
        {(playing || finished || !iAmPlayer) && (
          <Button variant="ghost" size="sm" onClick={closeTable}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden />
            Saguão
          </Button>
        )}
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-sm font-semibold leading-tight text-foreground">{label}</p>
          <p className="truncate text-[11.5px] leading-tight text-muted-foreground">
            {table.clock} · {table.stake > 0 ? `valendo ${fmtMurchos(table.stake)}` : 'sem valor'}
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
        {/* O tabuleiro, com os dois jogadores */}
        <div className={cn('flex min-w-0 flex-col gap-1 p-2 sm:p-3', isPhone ? 'shrink-0' : 'min-h-0 flex-1')}>
          <PlayerBar
            person={table[top]}
            side={top}
            table={table}
            clocks={clocks}
            showClock={playing || finished}
          />
          <div className={cn('board-area', isPhone && 'board-area--fone')}>
            <Board
              game={table.game}
              variant={table.variant}
              position={table.position}
              orientation={bottom}
              legalMoves={myTurn ? table.legalMoves : NO_MOVES}
              lastMove={table.lastMove}
              onMove={myTurn ? (m) => void run(() => move(m)) : undefined}
            />
          </div>
          <PlayerBar
            person={table[bottom]}
            side={bottom}
            table={table}
            clocks={clocks}
            showClock={playing || finished}
          />
          {secsToFirstMove !== null && (
            <p className="text-center text-[11.5px] text-muted-foreground">
              Primeiro lance em <span className="font-mono text-foreground">{secsToFirstMove}s</span> ou a partida é
              cancelada
            </p>
          )}
        </div>

        {/* Coluna lateral: situação, lances e o que a tela de cima quiser pôr */}
        <aside
          className={cn(
            'flex shrink-0 flex-col gap-3 border-line bg-void/80 p-3',
            isPhone ? 'border-t' : 'min-h-0 w-72 overflow-y-auto border-l'
          )}
        >
          {error && <ErrorLine message={error} />}

          {table.phase === 'pending' && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {secsToStart !== null ? (
                  <>
                    A partida começa em <span className="font-mono">{secsToStart}s</span>
                  </>
                ) : (
                  'Partida combinada'
                )}
              </p>
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {(['white', 'black'] as const).map((side) => (
                  <li key={side} className="flex items-center gap-2">
                    <span className={cn('board-lado', dotClass(table, side))} aria-hidden />
                    <span className="truncate text-foreground">{table[side]?.displayName ?? '—'}</span>
                    <span>({sideLabel(table.game, table.variant, side)})</span>
                    <span className={cn('ml-auto', table.ready[side] && 'text-acid-text')}>
                      {table.ready[side] ? 'pronto' : 'não está pronto'}
                    </span>
                  </li>
                ))}
              </ul>
              {table.stake > 0 && (
                <p className="text-xs text-muted-foreground">
                  Valendo <span className="font-mono text-foreground">{fmtMurchos(table.stake)}</span> pra cada um.
                </p>
              )}
              {iAmPlayer && (
                <div className="flex flex-wrap gap-2">
                  {!table.ready[mySide] && (
                    <Button size="sm" disabled={busy} onClick={() => void run(setReady)}>
                      Pronto
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={confirm === 'leave' ? 'destructive' : 'secondary'}
                    className={cn(confirm === 'leave' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90')}
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
          )}

          {playing && iAmPlayer && !table.result && (
            <div className="flex flex-col gap-2">
              <p className={cn('text-sm font-semibold', myTurn ? 'text-acid-text' : 'text-muted-foreground')}>
                {myTurn ? 'Sua vez' : `Vez de ${table[table.turn]?.displayName ?? sideLabel(table.game, table.variant, table.turn)}`}
              </p>
              {drawFromOpponent && (
                <div className="flex flex-col gap-1.5 rounded-brutal border border-line-strong p-2">
                  <p className="text-xs text-foreground">Seu adversário propôs empate.</p>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => void run(() => answerDraw(true))}>
                      Aceitar
                    </Button>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => answerDraw(false))}>
                      Recusar
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={confirm === 'resign' ? 'destructive' : 'secondary'}
                  className={cn(confirm === 'resign' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90')}
                  disabled={busy}
                  onClick={() => {
                    if (confirm !== 'resign') return setConfirm('resign')
                    setConfirm(null)
                    void run(resign)
                  }}
                >
                  {confirm === 'resign' ? 'Desistir mesmo?' : 'Desistir'}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy || drawFromMe} onClick={() => void run(offerDraw)}>
                  {drawFromMe ? 'Empate proposto' : 'Propor empate'}
                </Button>
              </div>
            </div>
          )}

          {playing && !iAmPlayer && !table.result && (
            <p className="text-xs text-muted-foreground">Você está assistindo.</p>
          )}

          {finished && <FinishedPanel table={table} onLeave={closeTable} />}

          <div className="flex min-h-[8rem] flex-col rounded-brutal border border-line">
            <h4 className="border-b border-line px-3 py-1.5 text-xs font-semibold text-foreground">Lances</h4>
            <div className="flex max-h-64 min-h-0 flex-1 flex-col overflow-y-auto">
              <MoveList moves={table.moves} />
            </div>
          </div>

          {children}
        </aside>
      </div>
    </div>
  )
}

/** Avatar, nome, cor e relógio de um lado. */
function PlayerBar({
  person,
  side,
  table,
  clocks,
  showClock
}: {
  person: BoardPerson | null
  side: Side
  table: BoardTableView
  clocks: { white: number; black: number }
  showClock: boolean
}) {
  const { byId } = useMembers()
  const member = person ? byId[person.userId] : undefined
  const active = table.phase === 'playing' && !table.result && table.turn === side
  return (
    <div className={cn('board-jogador', active && 'board-jogador--vez')}>
      {person ? (
        <UserAvatar
          userId={person.userId}
          src={resolveAssetUrl(member?.avatar ?? person.avatar)}
          name={person.displayName}
          className="h-8 w-8"
        />
      ) : (
        <span className="h-8 w-8 shrink-0 rounded-brutal border border-line" aria-hidden />
      )}
      <span className={cn('board-lado', dotClass(table, side))} aria-hidden />
      <span className="board-nome min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
        {person?.displayName ?? 'Vaga'}
        <span className="sr-only"> ({sideLabel(table.game, table.variant, side)})</span>
      </span>
      {showClock && <Clock ms={clocks[side]} active={active && table.clockRunning} low={clocks[side] < LOW_MS} />}
    </div>
  )
}

/** Fim de partida: resultado, valor, XP e a análise (quando já saiu). */
function FinishedPanel({ table, onLeave }: { table: BoardTableView; onLeave: () => void }) {
  const result = table.result
  const analysis = table.analysis
  const winnerName = result?.winner ? table[result.winner]?.displayName : null
  const settleError = result?.reason === 'settle-error'
  // A análise só roda no xadrez com lances suficientes; sem resposta em 90 s, desiste da espera.
  const mayAnalyse = table.game === 'chess' && table.moves.length >= ANALYSIS_MIN_PLIES && !settleError
  const [waiting, setWaiting] = React.useState(true)
  React.useEffect(() => {
    if (!mayAnalyse || analysis) return
    const t = setTimeout(() => setWaiting(false), ANALYSIS_WAIT_MS)
    return () => clearTimeout(t)
  }, [mayAnalyse, analysis])

  if (settleError) {
    return (
      <div className="flex flex-col gap-2">
        <div className="board-resultado px-3 py-2">
          <p className="text-sm font-semibold text-burn">{resultHeadline(table)}</p>
          <p className="mt-0.5 text-xs text-foreground/80">Os valores foram devolvidos.</p>
        </div>
        <Button size="sm" onClick={onLeave}>
          Voltar ao saguão
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="board-resultado px-3 py-2">
        <p className="text-sm font-semibold text-burn">{resultHeadline(table)}</p>
        {table.stake > 0 && (
          <p className="mt-0.5 text-xs text-foreground/80">
            {winnerName ? (
              <>
                {winnerName} leva <span className="font-mono">{fmtMurchos(table.stake)}</span> do adversário.
              </>
            ) : (
              'Empate: o valor volta pra cada um.'
            )}
          </p>
        )}
      </div>

      <ul className="flex flex-col gap-1 text-xs">
        {(['white', 'black'] as const).map((side) => (
          <li key={side} className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
            <span className={cn('board-lado', dotClass(table, side))} aria-hidden />
            <span className="truncate text-foreground">{table[side]?.displayName ?? '—'}</span>
            <span className="font-mono text-acid-text">+{result?.xp[side] ?? 0} XP</span>
            {analysis && (
              <>
                <span>
                  precisão <span className="font-mono text-foreground">{Math.round(analysis.accuracy[side])}%</span>
                </span>
                <span>
                  rating estimado{' '}
                  <span className="font-mono text-foreground">{analysis.ratingEst[side] ?? '—'}</span>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      {!analysis && mayAnalyse && waiting && <p className="text-xs text-muted-foreground">Analisando a partida…</p>}

      <Button size="sm" onClick={onLeave}>
        Voltar ao saguão
      </Button>
    </div>
  )
}

/** Mesma linha de erro do saguão do pôquer. */
function ErrorLine({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
      {message}
    </p>
  )
}
