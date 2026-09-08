import { Swords, Pickaxe, Clock, Zap, Coins } from 'lucide-react'
import type { CardProps } from './index'
import { CardFrame } from './index'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { formatCompact, type GameCardMeta } from '@/lib/api-gamification'
import { useMembers } from '@/lib/members-context'
import { queueLabel } from '@/lib/activity-context'
import { cn } from '@/lib/utils'
import { NameEmoji } from '@/components/social/NameEmoji'

/**
 * CARTÃO DE PÓS-JOGO.
 *
 * Postado pelo servidor quando uma partida acaba. Verde pra vitória, vermelho
 * pra derrota, cinza pra remake — a cor é a primeira coisa que se lê, antes
 * de qualquer número. O KDA vem grande; o resto (CS, ouro, dano, visão) é pra
 * quem quer discutir o jogo.
 *
 * Nomes e avatares dos aliados vêm da lista de membros pelo userId: o
 * metadata guarda só o id, e a pessoa pode ter trocado de avatar depois.
 */

const RESULT_LABEL: Record<GameCardMeta['result'], string> = {
  win: 'Vitória',
  loss: 'Derrota',
  remake: 'Remake',
  unknown: 'Partida'
}

function accentFor(result: GameCardMeta['result']): 'acid' | 'destructive' | 'muted' {
  if (result === 'win') return 'acid'
  if (result === 'loss') return 'destructive'
  return 'muted'
}

function formatDuration(sec: number | undefined): string | null {
  if (!sec || sec <= 0) return null
  const minutes = Math.floor(sec / 60)
  const seconds = Math.round(sec % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function GameResultCard({ message, metadata }: CardProps<GameCardMeta>) {
  const { byId } = useMembers()

  const result = metadata.result ?? 'unknown'
  const accent = accentFor(result)
  const isMinecraft = metadata.game === 'minecraft'
  const GameIcon = isMinecraft ? Pickaxe : Swords

  const player = byId[metadata.userId]
  const playerName = player?.displayName ?? message.author.displayName
  const playerColor = player?.profileColor ?? undefined

  const kills = metadata.kills ?? 0
  const deaths = metadata.deaths ?? 0
  const assists = metadata.assists ?? 0
  const kda = deaths === 0 ? kills + assists : (kills + assists) / deaths
  const duration = formatDuration(metadata.durationSec)
  const queue = queueLabel(metadata.queue ?? undefined)

  const multis: { label: string; count: number }[] = [
    { label: 'penta', count: metadata.pentaKills ?? 0 },
    { label: 'quadra', count: metadata.quadraKills ?? 0 },
    { label: 'triple', count: metadata.tripleKills ?? 0 },
    { label: 'double', count: metadata.doubleKills ?? 0 }
  ].filter((m) => m.count > 0)

  const stats: { label: string; value: string }[] = isMinecraft
    ? []
    : [
        { label: 'cs', value: metadata.cs != null ? String(metadata.cs) : '—' },
        { label: 'ouro', value: metadata.gold != null ? formatCompact(metadata.gold) : '—' },
        {
          label: 'dano',
          value: metadata.damageToChampions != null ? formatCompact(metadata.damageToChampions) : '—'
        },
        { label: 'visão', value: metadata.visionScore != null ? String(metadata.visionScore) : '—' }
      ]

  const teammates = (metadata.teammates ?? []).filter((t) => t.userId !== metadata.userId)
  const wagers = metadata.wagers ?? []
  const hasRewards = (metadata.xpAwarded ?? 0) > 0 || (metadata.coinsAwarded ?? 0) > 0

  const resultColor =
    accent === 'acid' ? 'text-acid' : accent === 'destructive' ? 'text-destructive' : 'text-muted-foreground'

  return (
    <CardFrame
      accent={accent}
      icon={<GameIcon className={cn('h-3.5 w-3.5', resultColor)} />}
      title={
        <span className={resultColor}>
          {RESULT_LABEL[result]}
          {queue && <span className="text-muted-foreground"> · {queue}</span>}
          {isMinecraft && !queue && <span className="text-muted-foreground"> · Minecraft</span>}
        </span>
      }
      footer={
        hasRewards || wagers.length > 0 ? (
          <div className="space-y-1">
            {hasRewards && (
              <p className="flex items-center gap-3">
                {(metadata.xpAwarded ?? 0) > 0 && (
                  <span className="flex items-center gap-1 text-acid-text">
                    <Zap className="h-2.5 w-2.5" />+{metadata.xpAwarded} XP
                  </span>
                )}
                {(metadata.coinsAwarded ?? 0) > 0 && (
                  <span className="flex items-center gap-1 text-burn">
                    <Coins className="h-2.5 w-2.5" />+{metadata.coinsAwarded} murchos
                  </span>
                )}
              </p>
            )}
            {wagers.length > 0 && (
              <div>
                <p className="">
                  {wagers.length} {wagers.length === 1 ? 'aposta' : 'apostas'}
                </p>
                <ul className="mt-0.5 space-y-0.5">
                  {wagers.slice(0, 5).map((wager, index) => {
                    const who = byId[wager.userId]
                    const won = wager.payout > 0
                    return (
                      <li key={`${wager.userId}-${index}`} className="flex items-center gap-1.5 normal-case">
                        <span
                          className="truncate"
                          style={who?.profileColor ? { color: who.profileColor } : undefined}
                        >
                          {who?.displayName ?? 'alguém'}
                        </span>
                        <NameEmoji id={who?.emoji} />
                        <span className="text-muted-foreground">
                          {wager.amount} em {wager.prediction === 'win' ? 'vitória' : 'derrota'}
                        </span>
                        <span className={cn('ml-auto shrink-0', won ? 'text-acid' : 'text-destructive')}>
                          {won ? `+${wager.payout}` : `−${wager.amount}`}
                        </span>
                      </li>
                    )
                  })}
                  {wagers.length > 5 && (
                    <li className="text-muted-foreground">+{wagers.length - 5} apostas</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="flex items-start gap-3">
        <UserAvatar
          src={resolveAssetUrl(player?.avatar ?? message.author.avatar)}
          name={playerName}
          ringColor={playerColor}
          frame={player?.avatarFrame}
          className="h-10 w-10"
        />

        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-1.5">
            <span className="truncate font-display text-sm" style={playerColor ? { color: playerColor } : undefined}>
              {playerName}
            </span>
            <NameEmoji id={player?.emoji} />
            {metadata.champion && (
              <span className="truncate text-[11.5px] text-muted-foreground">
                de {metadata.champion}
              </span>
            )}
          </p>

          {!isMinecraft && (
            <div className="mt-1 flex items-end gap-3">
              <p className="font-display text-3xl leading-none tracking-tight">
                <span className="text-foreground">{kills}</span>
                <span className="text-muted-foreground"> / </span>
                <span className="text-destructive">{deaths}</span>
                <span className="text-muted-foreground"> / </span>
                <span className="text-foreground">{assists}</span>
              </p>
              <p className="pb-0.5 text-[11.5px] text-muted-foreground">
                <span className={cn('text-sm', kda >= 4 ? 'text-acid' : kda < 1.5 ? 'text-destructive' : 'text-foreground')}>
                  {kda.toFixed(2)}
                </span>{' '}
                kda
              </p>
            </div>
          )}

          {multis.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {multis.map((m) => (
                <span
                  key={m.label}
                  className={cn(
                    'rounded-brutal border px-1 text-[11px]',
                    m.label === 'penta'
                      ? 'border-burn bg-burn/15 text-burn'
                      : 'border-line-strong text-muted-foreground'
                  )}
                >
                  {m.label}
                  {m.count > 1 && ` ×${m.count}`}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {stats.length > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-1">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-brutal border border-line bg-void/60 px-1.5 py-1 text-center">
              <p className="font-mono text-xs text-foreground">{stat.value}</p>
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {(duration || teammates.length > 0) && (
        <div className="mt-2 flex items-center gap-3 font-mono text-[11.5px] text-muted-foreground">
          {duration && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {duration}
            </span>
          )}
          {teammates.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="">com</span>
              <span className="flex -space-x-1.5">
                {teammates.slice(0, 4).map((mate, index) => {
                  const who = byId[mate.userId]
                  if (!who) {
                    return (
                      <span
                        key={`${mate.userId}-${index}`}
                        title={mate.riotId ?? mate.userId}
                        className="flex h-5 w-5 items-center justify-center rounded-brutal border border-line bg-void-light text-[11px]"
                      >
                        ?
                      </span>
                    )
                  }
                  return (
                    <span key={who.id} title={who.displayName}>
                      <UserAvatar
                        userId={who.id}
                        src={resolveAssetUrl(who.avatar)}
                        name={who.displayName}
                        ringColor={who.profileColor}
                        className="h-5 w-5"
                      />
                    </span>
                  )
                })}
              </span>
              {teammates.length > 4 && <span>+{teammates.length - 4}</span>}
            </span>
          )}
        </div>
      )}
    </CardFrame>
  )
}
