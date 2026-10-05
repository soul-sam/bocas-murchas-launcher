import { Crown } from 'lucide-react'
import { MurchosIcon, XpIcon } from '@/lib/bocas-icons'
import { boardGameLabel, boardReasonLabel, type BoardCardMeta, type BoardPerson, type Side } from '@/lib/api-board'
import { GameIcon } from '@/components/social/GameIcon'
import { cn } from '@/lib/utils'
import type { CardProps } from './index'
import { CardFrame } from './index'

/**
 * CARTÃO DE PARTIDA DE XADREZ OU DAMA (jogada aqui, não no Chess.com).
 *
 * Postado pelo servidor quando a partida acaba. Mesma família do
 * ChessResultCard: o vencedor vem marcado, depois o motivo, o valor e o que
 * cada um ganhou. A análise (precisão e rating estimado) só vem se o Stockfish
 * respondeu; sem ela o cartão não muda de forma.
 *
 * O metadata é JSON guardado: pode vir incompleto ou de versão antiga. Tudo é
 * normalizado no topo, porque um throw aqui derruba a linha inteira do chat.
 */

const SIDE_LABEL: Record<Side, string> = { white: 'brancas', black: 'pretas' }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const num = (v: unknown): number => (isNum(v) ? v : 0)

function person(raw: Partial<BoardPerson> | null | undefined, fallback: string): BoardPerson {
  return {
    userId: typeof raw?.userId === 'string' ? raw.userId : '',
    displayName: typeof raw?.displayName === 'string' && raw.displayName ? raw.displayName : fallback,
    avatar: typeof raw?.avatar === 'string' ? raw.avatar : null
  }
}

function normalize(m: Partial<BoardCardMeta> | null | undefined) {
  const players: Record<Side, BoardPerson> = {
    white: person(m?.white, 'Brancas'),
    black: person(m?.black, 'Pretas')
  }
  const acc = m?.analysis?.accuracy
  const rating = m?.analysis?.ratingEst
  const analysis =
    isNum(acc?.white) && isNum(acc?.black)
      ? {
          accuracy: { white: acc.white, black: acc.black },
          ratingEst: {
            white: isNum(rating?.white) ? rating.white : null,
            black: isNum(rating?.black) ? rating.black : null
          }
        }
      : null
  return {
    game: m?.game ?? 'chess',
    variant: m?.variant ?? null,
    clock: m?.clock ?? '',
    players,
    winner: m?.winner === 'white' || m?.winner === 'black' ? m.winner : null,
    reason: typeof m?.reason === 'string' ? m.reason : '',
    plies: num(m?.plies),
    stake: num(m?.stake),
    pool: num(m?.pool),
    xp: { white: num(m?.xp?.white), black: num(m?.xp?.black) },
    analysis
  }
}

type Norm = ReturnType<typeof normalize>

/** Texto de uma linha: serve de resumo no modo compacto. */
function summary(n: Norm): string {
  const reason = boardReasonLabel(n.reason)
  if (!n.winner) return `Empate (${reason})`
  return `${n.players[n.winner].displayName} venceu por ${reason}`
}

function stakeText(n: Norm): string {
  if (n.stake <= 0) return 'amistosa'
  if (!n.winner) return `empate, ${n.stake} murchos devolvidos`
  return `levou ${n.stake * 2} murchos`
}

export function BoardResultCard({ metadata, compact }: CardProps<BoardCardMeta>) {
  const n = normalize(metadata)
  const title = [boardGameLabel(n.game, n.variant), n.clock].filter(Boolean).join(' · ')

  if (compact) {
    return (
      <span className="font-mono text-[11px] text-muted-foreground">
        {title} · {summary(n)}
      </span>
    )
  }

  const moves = Math.ceil(n.plies / 2)
  const a = n.analysis

  return (
    <CardFrame
      accent={n.winner ? 'acid' : 'muted'}
      icon={<GameIcon game={n.game} className="h-3.5 w-3.5" />}
      title={title}
      footer={
        n.xp.white > 0 || n.xp.black > 0 ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {(['white', 'black'] as const).map(
              (s) =>
                n.xp[s] > 0 && (
                  <span key={s} className="flex items-center gap-1 text-acid-text">
                    <XpIcon className="h-2.5 w-2.5" />
                    {n.players[s].displayName} +{n.xp[s]} XP
                  </span>
                )
            )}
          </p>
        ) : undefined
      }
    >
      <ul className="flex flex-col gap-0.5">
        {(['white', 'black'] as const).map((s) => (
          <li key={s} className="flex items-center gap-2 font-mono text-[11px]">
            {n.winner === s ? (
              <Crown className="h-3 w-3 shrink-0 text-acid" aria-label="vencedor" />
            ) : (
              <span className="h-3 w-3 shrink-0" />
            )}
            <span className={cn('min-w-0 truncate', n.winner === s ? 'text-foreground' : 'text-muted-foreground')}>
              {n.players[s].displayName}
            </span>
            <span className="text-muted-foreground">({SIDE_LABEL[s]})</span>
            {a && (
              <span className="ml-auto shrink-0 text-muted-foreground">
                {a.accuracy[s].toFixed(1)}%
                {a.ratingEst[s] !== null && <> · rating estimado {a.ratingEst[s]}</>}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 font-mono text-[11.5px] text-muted-foreground">
        {summary(n)} · {moves} {moves === 1 ? 'lance' : 'lances'}
      </p>
      <p className="flex items-center gap-1 font-mono text-[11.5px] text-burn">
        {n.stake > 0 && <MurchosIcon className="h-2.5 w-2.5" />}
        {stakeText(n)}
        {n.pool > 0 && <span className="text-muted-foreground"> · bolo {n.pool}</span>}
      </p>
    </CardFrame>
  )
}
