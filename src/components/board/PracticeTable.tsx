import * as React from 'react'
import { ArrowLeft, FlipVertical2, RotateCcw, Undo2 } from 'lucide-react'
import type { Socket } from 'socket.io-client'
import { Button } from '@/components/ui/button'
import {
  boardGameLabel,
  boardReasonLabel,
  type BoardGame,
  type DraughtsVariant,
  type PracticeAck,
  type PracticeView
} from '@/lib/api-board'
import { practiceHeadline, practiceTurnLabel } from '@/lib/board-practice'
import { useLayout } from '@/lib/layout-context'
import { useSocket } from '@/lib/socket-context'
import { cn } from '@/lib/utils'
import { Board } from './Board'
import { MoveList } from './MoveList'
import './board.css'

/**
 * MODO TREINO — uma partida sozinha, sem relógio: a pessoa joga os dois lados.
 *
 * Como na mesa de verdade, o servidor é a autoridade (posição e lances legais
 * chegam prontos), mas aqui não há mesa, sala nem contexto: o estado é só
 * desta tela e o treino acaba quando ela fecha. Se a conexão cair, o servidor
 * esquece o treino; na volta a tela abre outro e refaz os lances que conhecia.
 */

const ACK_TIMEOUT_MS = 8_000
const NO_MOVES: string[] = []

const VARIANTS: { id: DraughtsVariant; label: string }[] = [
  { id: 'br', label: 'Brasileira' },
  { id: 'us', label: 'Americana' }
]

function ask(socket: Socket | null, event: string, payload: Record<string, unknown> = {}): Promise<PracticeAck> {
  if (!socket || !socket.connected) {
    return Promise.resolve({ ok: false, error: 'Sem conexão com o servidor.' })
  }
  return new Promise((resolve) => {
    socket.timeout(ACK_TIMEOUT_MS).emit(event, payload, (err: Error | null, response: PracticeAck) => {
      if (err) return resolve({ ok: false, error: 'O servidor não respondeu.' })
      resolve(response ?? { ok: false, error: 'Resposta vazia.' })
    })
  })
}

export function PracticeTable({ game, onExit }: { game: BoardGame; onExit: () => void }) {
  const { socket, connected } = useSocket()
  const { isPhone } = useLayout()
  /** Dama: a regra é escolhida antes de começar (`undefined` = ainda não escolheu). */
  const [variant, setVariant] = React.useState<DraughtsVariant | null | undefined>(game === 'chess' ? null : undefined)
  const [view, setView] = React.useState<PracticeView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [flipped, setFlipped] = React.useState(false)

  const viewRef = React.useRef<PracticeView | null>(null)
  viewRef.current = view

  React.useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 4_500)
    return () => clearTimeout(t)
  }, [error])

  // Abre o treino a cada (re)conexão e refaz os lances que a tela já tinha.
  React.useEffect(() => {
    if (variant === undefined || !socket || !connected) return
    let cancelled = false
    void (async () => {
      const known = viewRef.current?.moves ?? NO_MOVES
      let ack = await ask(socket, 'board:practice:start', { game, variant: variant ?? undefined })
      for (const move of known) {
        if (!ack.ok) break
        ack = await ask(socket, 'board:practice:move', { move })
      }
      if (cancelled) return
      if (ack.ok && ack.practice) setView(ack.practice)
      else setError(ack.error ?? 'Não deu pra abrir o treino.')
    })()
    return () => {
      cancelled = true
    }
  }, [socket, connected, game, variant])

  // Fechou a tela: o servidor pode esquecer o treino.
  React.useEffect(
    () => () => {
      if (socket?.connected) socket.emit('board:practice:stop')
    },
    [socket]
  )

  const run = async (event: string, payload?: Record<string, unknown>): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const ack = await ask(socket, event, payload)
      if (ack.ok && ack.practice) setView(ack.practice)
      else if (!ack.ok) setError(ack.error ?? 'Deu ruim.')
    } finally {
      setBusy(false)
    }
  }

  const header = (subtitle: string) => (
    <header className="relative z-conteudo flex shrink-0 items-center gap-2 border-b border-line/50 bg-void/40 px-2 py-1.5 backdrop-blur-sm sm:px-3">
      <Button variant="ghost" size="sm" onClick={onExit}>
        <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden />
        Saguão
      </Button>
      <div className="min-w-0 flex-1 px-1">
        <p className="truncate text-sm font-semibold leading-tight text-foreground">Modo treino</p>
        <p className="truncate text-[11.5px] leading-tight text-muted-foreground">{subtitle}</p>
      </div>
    </header>
  )

  if (variant === undefined) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {header('Dama · sozinho, sem relógio')}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-base font-semibold text-foreground">Qual regra você quer treinar?</p>
          <div className="flex gap-2">
            {VARIANTS.map((v) => (
              <Button key={v.id} size="sm" onClick={() => setVariant(v.id)}>
                {v.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const subtitle = `${boardGameLabel(game, variant)} · sozinho, sem relógio`

  if (!view) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {header(subtitle)}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          {error ? <ErrorLine message={error} /> : <p className="text-xs text-muted-foreground">Abrindo o treino…</p>}
        </div>
      </div>
    )
  }

  const over = view.result !== null

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {header(subtitle)}

      <div className={cn('flex min-h-0 flex-1', isPhone ? 'flex-col overflow-y-auto' : 'flex-row')}>
        <div className={cn('flex min-w-0 flex-col gap-1 p-2 sm:p-3', isPhone ? 'shrink-0' : 'min-h-0 flex-1')}>
          <div className={cn('board-area', isPhone && 'board-area--fone')}>
            <Board
              game={view.game}
              variant={view.variant}
              position={view.position}
              orientation={flipped ? 'black' : 'white'}
              legalMoves={over ? NO_MOVES : view.legalMoves}
              lastMove={view.lastMove}
              onMove={over ? undefined : (move) => void run('board:practice:move', { move })}
            />
          </div>
        </div>

        <aside
          className={cn(
            'flex shrink-0 flex-col gap-3 border-line bg-void/80 p-3',
            isPhone ? 'border-t' : 'min-h-0 w-72 overflow-y-auto border-l'
          )}
        >
          {error && <ErrorLine message={error} />}

          {view.result ? (
            <div className="board-resultado px-3 py-2">
              <p className="text-sm font-semibold text-burn">
                {practiceHeadline(view.game, view.variant, view.result, boardReasonLabel(view.result.reason))}
              </p>
            </div>
          ) : (
            <p className="text-sm font-semibold text-acid-text">{practiceTurnLabel(view.game, view.variant, view.turn)}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || view.moves.length === 0}
              onClick={() => void run('board:practice:undo')}
            >
              <Undo2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Desfazer
            </Button>
            <Button
              size="sm"
              variant={over ? 'default' : 'secondary'}
              disabled={busy || view.moves.length === 0}
              onClick={() => void run('board:practice:reset')}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Reiniciar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setFlipped((f) => !f)}>
              <FlipVertical2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Virar
            </Button>
          </div>

          <div className="flex min-h-[8rem] flex-col rounded-brutal border border-line">
            <h4 className="border-b border-line px-3 py-1.5 text-xs font-semibold text-foreground">Lances</h4>
            <div className="flex max-h-64 min-h-0 flex-1 flex-col overflow-y-auto">
              <MoveList moves={view.moves} />
            </div>
          </div>

          <p className="text-[11.5px] text-muted-foreground">Treino não vale murchos nem XP e não fica no histórico.</p>
        </aside>
      </div>
    </div>
  )
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
      {message}
    </p>
  )
}
