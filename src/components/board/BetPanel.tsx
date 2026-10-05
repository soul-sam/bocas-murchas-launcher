import * as React from 'react'
import { MurchosIcon } from '@/lib/bocas-icons'
import { sideLabel, type BoardBetView, type Side } from '@/lib/api-board'
import { parseBetAmount } from '@/lib/board-bet'
import { useBoard } from '@/lib/board-context'
import { useGamification } from '@/lib/gamification-context'
import { cn } from '@/lib/utils'

/**
 * APOSTAS DE ESPECTADOR — o bolo da mesa, ao lado do tabuleiro.
 *
 * Só se aposta com a partida ainda `pending` (dois sentados, nada começou) e
 * quem joga não entra no bolo. Quem manda é o servidor: o teto (`betLimit`) e
 * o saldo aqui só evitam o clique que ele recusaria.
 */

const MIN_BET = 10

function sumBySide(bets: BoardBetView[], side: Side): number {
  return bets.filter((b) => b.side === side).reduce((sum, b) => sum + b.amount, 0)
}

export function BetPanel() {
  const { table, bet } = useBoard()
  const { profile } = useGamification()
  const [side, setSide] = React.useState<Side | null>(null)
  const [amount, setAmount] = React.useState(String(MIN_BET))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const tableId = table?.id
  React.useEffect(() => {
    setSide(null)
    setAmount(String(MIN_BET))
    setError(null)
  }, [tableId])

  if (!table) return null
  const { phase, bets, white, black } = table
  if (bets.length === 0 && phase !== 'pending') return null

  const finished = phase === 'finished'
  const nameOf = (s: Side): string => (s === 'white' ? white : black)?.displayName ?? sideLabel(table.game, table.variant, s)
  const coins = profile?.coins ?? 0
  const max = Math.min(table.betLimit, coins)
  const value = parseBetAmount(amount, MIN_BET, max)
  const valid = side !== null && value !== null

  const place = async (): Promise<void> => {
    if (!side || value === null || busy) return
    setBusy(true)
    setError(null)
    try {
      const ack = await bet(side, value)
      if (!ack.ok) setError(ack.error ?? 'Não deu certo.')
    } catch {
      setError('Deu ruim. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  const canBet = phase === 'pending' && table.mySide === null && !table.myBet

  return (
    <div className="flex flex-col gap-2 rounded-brutal border border-line">
      <h4 className="border-b border-line px-3 py-1.5 text-xs font-semibold text-foreground">Apostas</h4>
      <div className="flex flex-col gap-2 px-3 pb-3">
        {phase === 'pending' && table.mySide !== null && (
          <p className="text-xs text-muted-foreground">Quem joga não aposta no bolo.</p>
        )}

        {phase === 'pending' && table.myBet && (
          <p className="text-xs text-foreground">
            Você apostou {table.myBet.amount} em {nameOf(table.myBet.side)}
          </p>
        )}

        {canBet && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {(['white', 'black'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={side === s}
                  onClick={() => setSide(s)}
                  className={cn(
                    'flex min-w-0 flex-col items-start rounded-brutal border px-2 py-1.5 text-left text-xs transition-colors',
                    side === s ? 'border-acid bg-acid/10 text-foreground' : 'border-line text-muted-foreground hover:text-foreground'
                  )}
                >
                  <span className="w-full truncate font-semibold">{nameOf(s)}</span>
                  <span className="text-[11.5px] text-muted-foreground">{sideLabel(table.game, table.variant, s)}</span>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <MurchosIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <input
                type="number"
                aria-label="Valor da aposta em murchos"
                inputMode="numeric"
                min={MIN_BET}
                max={max}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-brutal border border-line bg-transparent px-2 py-1 font-mono text-sm text-foreground"
              />
            </label>
            <p className="text-[11.5px] text-muted-foreground">
              {max < MIN_BET
                ? `Saldo insuficiente (mínimo ${MIN_BET})`
                : `De ${MIN_BET} até ${max} (teto da mesa ${table.betLimit}, seu saldo ${coins.toLocaleString('pt-BR')}).`}
            </p>
            <button
              type="button"
              disabled={!valid || busy}
              onClick={() => void place()}
              className="rounded-brutal border border-acid px-3 py-1.5 text-xs font-semibold text-acid transition-colors hover:bg-acid/10 disabled:opacity-40"
            >
              {busy ? 'Apostando…' : 'Apostar'}
            </button>
            <p className="text-[11.5px] text-muted-foreground">
              Se ninguém apostar no outro lado, acertar paga o dobro. Com apostas nos dois lados, quem acerta divide o bolo.
            </p>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </>
        )}

        {bets.length > 0 && (
          <>
            <ul className="flex flex-col gap-0.5 font-mono text-[11.5px]">
              {bets.map((b) => (
                <li key={b.userId} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-foreground">
                    {b.displayName} <span className="text-muted-foreground">em {nameOf(b.side)}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {b.amount}
                    {finished && b.payout !== null && (
                      <span className={b.payout > 0 ? 'text-acid' : 'text-destructive'}>
                        {' · '}
                        {b.payout > 0 ? `levou ${b.payout}` : 'perdeu'}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="font-mono text-[11.5px] text-muted-foreground">
              {nameOf('white')}: {sumBySide(bets, 'white')} · {nameOf('black')}: {sumBySide(bets, 'black')}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
