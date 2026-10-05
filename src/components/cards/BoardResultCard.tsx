import { Crown } from 'lucide-react'
import { MurchosIcon, XpIcon } from '@/lib/bocas-icons'
import { boardGameLabel, boardReasonLabel, type BoardCardMeta, type Side } from '@/lib/api-board'
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
 */

const SIDE_LABEL: Record<Side, string> = { white: 'brancas', black: 'pretas' }

/** Texto de uma linha: serve de resumo no modo compacto. */
function summary(m: BoardCardMeta): string {
  const reason = boardReasonLabel(m.reason)
  if (!m.winner) return `Empate (${reason})`
  const winner = m[m.winner].displayName
  return `${winner} venceu por ${reason}`
}

function stakeText(m: BoardCardMeta): string {
  if (m.stake <= 0) return 'amistosa'
  if (!m.winner) return `empate, ${m.stake} murchos devolvidos`
  return `levou ${m.stake * 2} murchos`
}

export function BoardResultCard({ metadata: m, compact }: CardProps<BoardCardMeta>) {
  const title = `${boardGameLabel(m.game, m.variant)} · ${m.clock}`

  if (compact) {
    return (
      <span className="font-mono text-[11px] text-muted-foreground">
        {title} · {summary(m)}
      </span>
    )
  }

  const moves = Math.ceil(m.plies / 2)
  const a = m.analysis

  return (
    <CardFrame
      accent={m.winner ? 'acid' : 'muted'}
      icon={<GameIcon game={m.game} className="h-3.5 w-3.5" />}
      title={title}
      footer={
        m.xp.white > 0 || m.xp.black > 0 ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {(['white', 'black'] as const).map(
              (s) =>
                m.xp[s] > 0 && (
                  <span key={s} className="flex items-center gap-1 text-acid-text">
                    <XpIcon className="h-2.5 w-2.5" />
                    {m[s].displayName} +{m.xp[s]} XP
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
            {m.winner === s ? (
              <Crown className="h-3 w-3 shrink-0 text-acid" aria-label="vencedor" />
            ) : (
              <span className="h-3 w-3 shrink-0" />
            )}
            <span className={cn('min-w-0 truncate', m.winner === s ? 'text-foreground' : 'text-muted-foreground')}>
              {m[s].displayName}
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
        {summary(m)} · {moves} {moves === 1 ? 'lance' : 'lances'}
      </p>
      <p className="flex items-center gap-1 font-mono text-[11.5px] text-burn">
        {m.stake > 0 && <MurchosIcon className="h-2.5 w-2.5" />}
        {stakeText(m)}
        {m.pool > 0 && <span className="text-muted-foreground"> · bolo {m.pool}</span>}
      </p>
    </CardFrame>
  )
}
