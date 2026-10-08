import * as React from 'react'
import { Settings2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { clockNow } from '@/lib/board-position'
import { SHOT_CLOCK_MS, type BoardTableView, type PoolGroup, type PoolPosition, type Side } from '@/lib/api-board'
import { cn } from '@/lib/utils'
import { ballLook, type PoolSkin } from './draw'
import { PoolSkinPicker } from './PoolSkinPicker'

const SOLIDS = [1, 2, 3, 4, 5, 6, 7]
const STRIPES = [9, 10, 11, 12, 13, 14, 15]

const FOUL_LABEL: Record<string, string> = {
  scratch: 'Branca na caçapa',
  'no-hit': 'Não tocou bola',
  'wrong-ball': 'Tocou bola errada',
  'no-rail': 'Nenhuma bola na tabela',
  timeout: 'Tempo esgotado'
}

const GROUP_LABEL: Record<PoolGroup, string> = { open: 'Mesa aberta', solids: 'Lisas', stripes: 'Listradas' }

interface Props {
  table: BoardTableView
  position: PoolPosition
  mySide: Side | null
  /** Replay da tacada rodando: o aviso da jogada espera a bola parar. */
  replaying: boolean
  compact?: boolean
  error: string | null
  skin: PoolSkin
  onSkin: (skin: PoolSkin) => void
}

/** O placar do bilhar: de quem é a vez, o tempo da tacada, os grupos e o aviso da última jogada. */
export function PoolHud({ table, position, mySide, replaying, compact, error, skin, onSkin }: Props): JSX.Element {
  const live = table.phase === 'playing' && !table.result
  const turn = position.turn
  const onTable = new Set(position.balls.filter((b) => b.state === 's').map((b) => b.id))
  const name = (side: Side) => table[side]?.displayName ?? (side === 'white' ? 'Quem abre' : 'Adversário')

  let turnText: string | null = null
  if (live) turnText = mySide === turn ? 'Sua vez' : `Vez de ${name(turn)}`

  // Aviso da última jogada (só depois que o replay termina, pra não entregar o fim).
  const notes: string[] = []
  if (live && !replaying) {
    const last = position.lastShot
    if (last && last.fouls.length > 0) {
      const who = mySide === last.by ? 'Sua falta' : `Falta de ${name(last.by)}`
      notes.push(`${who}: ${last.fouls.map((f) => FOUL_LABEL[f] ?? f).join(' · ')}`)
    }
    if (position.ballInHand) {
      if (mySide === turn) {
        notes.push(
          position.breakPending
            ? 'Bola na mão: toque na mesa, atrás da linha, para colocar a branca'
            : 'Bola na mão: toque na mesa para colocar a branca'
        )
      } else {
        notes.push(`Bola na mão para ${name(turn)}`)
      }
    }
  }

  return (
    <div className={cn('flex w-full min-w-0 flex-col', compact ? 'gap-1.5' : 'gap-2.5')}>
      <div className="flex items-center gap-2">
        <p className={cn('board-vez min-w-0 flex-1', live && mySide === turn && 'board-vez--minha')}>
          <span className="board-vez-ponto" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{turnText ?? (table.result ? 'Fim de partida' : 'Bilhar')}</span>
        </p>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Aparência da mesa"
              title="Aparência da mesa"
              className="shrink-0 rounded-brutal border border-line p-1.5 text-muted-foreground transition-colors hover:border-line-strong hover:text-foreground"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <PoolSkinPicker value={skin} onChange={onSkin} />
          </PopoverContent>
        </Popover>
      </div>

      {live && table.clockRunning && <ShotTimer table={table} />}

      <div className={cn('flex flex-col', compact ? 'gap-1' : 'gap-2')}>
        {(['white', 'black'] as const).map((side) => (
          <SideRow
            key={side}
            label={mySide === side ? `${name(side)} (você)` : name(side)}
            group={position.groups[side]}
            onTable={onTable}
            active={live && turn === side}
          />
        ))}
      </div>

      {notes.map((n) => (
        <p key={n} role="status" className="rounded-brutal border border-burn/40 bg-burn/10 px-2 py-1 text-xs text-foreground">
          {n}
        </p>
      ))}
      {error && (
        <p role="alert" className="rounded-brutal border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * Barra que esvazia até o fim da tacada. Animação em CSS (sem tique de
 * React): a chave muda a cada tacada/vez e a barra recomeça do que sobrou.
 */
function ShotTimer({ table }: { table: BoardTableView }) {
  const left = clockNow(table.clocks, table.clockAt, table.clockRunning, table.turn, Date.now())[table.turn]
  const from = Math.max(0, Math.min(1, left / SHOT_CLOCK_MS))
  const style = { '--pool-timer-from': from, '--pool-timer-ms': `${Math.max(0, left)}ms` } as React.CSSProperties
  return (
    <div className="pool-timer" role="timer" aria-label={`Tempo da tacada: ${Math.ceil(left / 1000)} segundos`}>
      <div key={`${table.clockAt}:${table.turn}`} className="pool-timer-fill" style={style} />
    </div>
  )
}

function SideRow({ label, group, onTable, active }: { label: string; group: PoolGroup; onTable: Set<number>; active: boolean }) {
  const ids = group === 'solids' ? SOLIDS : group === 'stripes' ? STRIPES : null
  const left = ids ? ids.filter((id) => onTable.has(id)).length : null
  return (
    <div className={cn('flex flex-col gap-1 rounded-brutal border px-2 py-1.5', active ? 'border-acid/60' : 'border-line')}>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{label}</span>
        {ids ? (
          <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
            <MiniBall id={ids[0]} />
            {GROUP_LABEL[group]}
          </span>
        ) : (
          <span className="shrink-0 font-mono text-muted-foreground" title={GROUP_LABEL.open}>
            ?
          </span>
        )}
      </div>
      {ids && (
        <div className="flex flex-wrap items-center gap-1" aria-label={`${left} bola${left === 1 ? '' : 's'} na mesa`}>
          {ids.map((id) => (
            <MiniBall key={id} id={id} gone={!onTable.has(id)} />
          ))}
          {left === 0 && (
            <>
              <span className="text-[11px] text-muted-foreground">falta a</span>
              <MiniBall id={8} gone={!onTable.has(8)} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Bolinha do placar com a cor da bola de verdade (a cor vem do desenho da mesa). */
function MiniBall({ id, gone }: { id: number; gone?: boolean }) {
  const { color, striped } = ballLook(id)
  const white = ballLook(0).color
  const background = striped ? `linear-gradient(${white} 0 28%, ${color} 28% 72%, ${white} 72%)` : color
  return (
    <span
      title={`Bola ${id}${gone ? ' (encaçapada)' : ''}`}
      className={cn('pool-mini-bola', gone && 'pool-mini-bola--fora')}
      style={{ background }}
    />
  )
}
