import { Zap, Coins, ExternalLink, Crown } from 'lucide-react'
import type { CardProps } from './index'
import { CardFrame } from './index'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { CHESS_RESULT_LABEL, TIME_CLASS_LABEL, resultCodeLabel, type ChessCardMeta } from '@/lib/api-chess'
import { useMembers } from '@/lib/members-context'
import { openExternal } from '@/lib/rich-text'
import { cn } from '@/lib/utils'

/**
 * CARTÃO DE PARTIDA DE XADREZ.
 *
 * Postado pelo servidor quando o poller acha uma blitz/rapid nova (bullet
 * não posta: seria spam). Mesma família visual do GameResultCard: a cor do
 * resultado vem primeiro, depois o modo, o adversário e a variação de rating.
 */

function accentFor(result: ChessCardMeta['result']): 'acid' | 'destructive' | 'muted' {
  if (result === 'win') return 'acid'
  if (result === 'loss') return 'destructive'
  return 'muted'
}

export function ChessResultCard({ metadata, compact }: CardProps<ChessCardMeta>) {
  const { byId } = useMembers()
  const member = byId[metadata.userId]
  const accent = accentFor(metadata.result)
  const resultColor =
    accent === 'acid' ? 'text-acid' : accent === 'destructive' ? 'text-destructive' : 'text-muted-foreground'
  const delta = metadata.ratingDelta
  const hasRewards = metadata.xpAwarded > 0 || metadata.coinsAwarded > 0

  if (compact) {
    return (
      <span className={cn('font-mono text-[11px]', resultColor)}>
        ♟ {CHESS_RESULT_LABEL[metadata.result]} · {TIME_CLASS_LABEL[metadata.timeClass]} vs {metadata.opponent}
      </span>
    )
  }

  return (
    <CardFrame
      accent={accent}
      icon={<Crown className={cn('h-3.5 w-3.5', resultColor)} />}
      title={
        <span className={resultColor}>
          {CHESS_RESULT_LABEL[metadata.result]}
          <span className="text-muted-foreground"> · {TIME_CLASS_LABEL[metadata.timeClass]}</span>
          {metadata.rules !== 'chess' && <span className="text-muted-foreground"> · {metadata.rules}</span>}
        </span>
      }
      footer={
        hasRewards ? (
          <p className="flex items-center gap-3">
            {metadata.xpAwarded > 0 && (
              <span className="flex items-center gap-1 text-acid">
                <Zap className="h-2.5 w-2.5" />+{metadata.xpAwarded} XP
              </span>
            )}
            {metadata.coinsAwarded > 0 && (
              <span className="flex items-center gap-1 text-burn">
                <Coins className="h-2.5 w-2.5" />+{metadata.coinsAwarded} murchos
              </span>
            )}
          </p>
        ) : undefined
      }
    >
      <div className="flex items-center gap-2">
        {member && (
          <UserAvatar
            src={resolveAssetUrl(member.avatar)}
            name={member.displayName}
            ringColor={member.profileColor}
            frame={member.avatarFrame}
            className="h-8 w-8"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[11px]">
            <span className="text-foreground">{member?.displayName ?? 'Alguém'}</span>
            <span className="text-muted-foreground"> ({metadata.color === 'white' ? 'brancas' : 'pretas'}) vs </span>
            <span className="text-foreground">{metadata.opponent}</span>
            <span className="text-muted-foreground"> ({metadata.opponentRating})</span>
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {resultCodeLabel(metadata.resultCode)}
            {metadata.accuracy != null && <> · precisão {metadata.accuracy.toFixed(1)}%</>}
            {!metadata.rated && <> · casual</>}
          </p>
        </div>
        <div className="text-right font-mono">
          <p className="text-sm text-foreground">{metadata.ratingAfter}</p>
          {delta != null && (
            <p className={cn('text-[10px]', delta > 0 ? 'text-acid' : delta < 0 ? 'text-destructive' : 'text-muted-foreground')}>
              {delta > 0 ? '+' : ''}
              {delta}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => openExternal(metadata.url)}
        className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-acid"
      >
        <ExternalLink className="h-3 w-3" /> ver partida
      </button>
    </CardFrame>
  )
}
