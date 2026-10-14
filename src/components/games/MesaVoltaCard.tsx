import * as React from 'react'
import { useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Arrastavel } from '@/components/ui/arrastavel'
import { GameIcon } from '@/components/social/GameIcon'
import { cn } from '@/lib/utils'
import { BOARD_ROUTE, boardGameLabel } from '@/lib/api-board'
import { useBoard } from '@/lib/board-context'
import { usePoker } from '@/lib/poker-context'
import { useCartas } from '@/lib/cartas-context'

/**
 * "VOCÊ ESTÁ NA MESA DE ..." — o caminho de volta pra partida.
 *
 * Sair da tela do minigame não tira ninguém da mesa (ver BoardPage e
 * PokerPage): o estado mora nos contextos, acima das rotas. Só que fora da
 * tela a mesa some da vista e a pessoa esquece que está sentada — e a vez
 * dela corre. Este cartão aparece em qualquer outra tela enquanto houver
 * mesa minha, no mesmo molde da barra da música (fila do canto, arrastável).
 *
 * Voltar é só navegar: cada página do jogo já abre sozinha a mesa em que a
 * pessoa está. Sair pede confirmação, porque com partida rolando é desistir.
 *
 * Mesa em janela própria (pôquer/cartas destacados) não conta: ela já está
 * na tela, em outra janela.
 */

type Confirm = string | null

interface Mesa {
  key: string
  game: string
  label: string
  route: string
  /** Texto do botão de sair quando ele pede confirmação. */
  confirmText: string
  voltar: () => void
  sair: () => Promise<{ ok: boolean; error?: string }>
}

export function MesaVoltaCard() {
  const { pathname } = useLocation()
  const board = useBoard()
  const poker = usePoker()
  const cartas = useCartas()

  const [confirm, setConfirm] = React.useState<Confirm>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const mesas: Mesa[] = []

  const bt = board.myTable
  if (bt) {
    const playing = bt.phase === 'playing'
    mesas.push({
      key: `board:${bt.id}`,
      game: bt.game,
      label: boardGameLabel(bt.game, bt.variant),
      route: BOARD_ROUTE[bt.game],
      confirmText: playing ? 'Desistir da partida?' : 'Cancelar a mesa?',
      voltar: () => board.goToBoard(bt.game),
      sair: async () => {
        // Antes de começar, sair cancela a mesa (e devolve tudo).
        if (!playing) return board.cancelTable(bt.id)
        // Com partida rolando, sair é desistir — e desistir age na mesa aberta.
        if (board.openTableId !== bt.id) {
          const ack = await board.openTable(bt.id)
          if (!ack.ok) return ack
        }
        return board.resign()
      }
    })
  }

  const pt = poker.seatedAt
  if (pt && !poker.popoutOpen) {
    mesas.push({
      key: `poker:${pt.id}`,
      game: 'poker',
      label: 'Pôquer',
      route: '/poker',
      confirmText: 'Levantar da mesa?',
      voltar: () => poker.goToPoker(),
      sair: () => poker.stand(pt.id)
    })
  }

  const ct = cartas.seatedAt
  if (ct && cartas.popoutOpen !== ct.game) {
    const label = ct.game === 'truco' ? 'Truco' : 'Cacheta'
    mesas.push({
      key: `cartas:${ct.id}`,
      game: ct.game,
      label,
      route: `/${ct.game}`,
      confirmText: ct.status === 'playing' ? 'Abandonar a partida?' : 'Levantar da mesa?',
      voltar: () => cartas.goTo(ct.game),
      sair: () => cartas.stand(ct.id)
    })
  }

  // Na tela do próprio jogo o cartão não tem o que fazer.
  const visiveis = mesas.filter((m) => m.route !== pathname)

  // Confirmação e erro valem pra mesa em que foram dados; mesa que sumiu leva junto.
  const chaves = visiveis.map((m) => m.key).join('|')
  React.useEffect(() => {
    setConfirm(null)
    setError(null)
  }, [chaves])

  // Confirmação esquecida desarma sozinha, igual ao "Levantar" das mesas.
  React.useEffect(() => {
    if (!confirm) return
    const timer = setTimeout(() => setConfirm(null), 4_000)
    return () => clearTimeout(timer)
  }, [confirm])

  if (visiveis.length === 0) return null

  const sair = async (m: Mesa): Promise<void> => {
    if (busy) return
    if (confirm !== m.key) {
      setConfirm(m.key)
      return
    }
    setConfirm(null)
    setBusy(true)
    setError(null)
    const ack = await m.sair()
    setBusy(false)
    if (!ack.ok) setError(ack.error ?? 'Não deu pra sair da mesa.')
  }

  return (
    <Arrastavel chave="bm.mesa.posicao" ordem={21}>
      {(alca) => (
        <div
          role="status"
          className="pointer-events-auto w-80 max-w-full overflow-hidden rounded-brutal border-2 border-acid-dark bg-void shadow-[0_0_30px_rgba(0,0,0,0.7)]"
        >
          {visiveis.map((m, i) => (
            <div key={m.key} className={cn(i > 0 && 'border-t border-line')}>
              <div
                onPointerDown={alca.onPointerDown}
                onDoubleClick={alca.onDoubleClick}
                title={alca.title}
                className={cn('flex touch-none items-center gap-2 px-3 pb-1.5 pt-2.5', alca.className)}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-brutal border border-line bg-surface-raised text-acid">
                  <GameIcon game={m.game} className="h-4 w-4" />
                </span>
                <p className="min-w-0 flex-1 text-xs text-foreground">
                  Você está na mesa de <span className="font-medium">{m.label}</span>
                </p>
              </div>
              <div className="flex gap-1.5 px-3 pb-2.5">
                <Button size="sm" className="flex-1" disabled={busy} onClick={m.voltar}>
                  Voltar para a mesa
                </Button>
                <Button
                  size="sm"
                  variant={confirm === m.key ? 'destructive' : 'secondary'}
                  className={cn(
                    confirm === m.key && 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  )}
                  disabled={busy}
                  onClick={() => void sair(m)}
                >
                  {confirm === m.key ? m.confirmText : 'Sair da mesa'}
                </Button>
              </div>
            </div>
          ))}
          {error && (
            <p role="alert" className="border-t border-line px-3 py-1.5 text-[11.5px] text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </Arrastavel>
  )
}
