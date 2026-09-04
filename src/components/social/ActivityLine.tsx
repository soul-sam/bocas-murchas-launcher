import * as React from 'react'
import { Swords, Pickaxe } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GameActivity } from '@/lib/api'
import { queueLabel } from '@/lib/activity-context'

/**
 * Uma linha curta de "o que a pessoa está fazendo": "Champ select · Ranked
 * Solo", "Em partida 23:10 · 7/2/9", "Minecraft · No servidor".
 *
 * Usada na lista de membros, no rodapé da sidebar e no cartão de perfil.
 * O relógio anda sozinho (a cada 30s) pra "há 23 min" não congelar.
 */

function useTicker(intervalMs: number): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

export function formatElapsed(sinceMs: number, nowMs: number): string {
  const total = Math.max(0, Math.floor((nowMs - sinceMs) / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    return `${hours}h${String(minutes % 60).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function activitySummary(activity: GameActivity, nowMs: number): string {
  if (activity.game === 'minecraft') {
    return activity.server ? `Minecraft · ${activity.server}` : 'Minecraft'
  }

  const parts: string[] = []
  if (activity.phase === 'in-progress') {
    parts.push(`Em partida ${formatElapsed(activity.since, nowMs)}`)
    if (activity.champion) parts.push(activity.champion)
    if (activity.score) {
      parts.push(`${activity.score.kills}/${activity.score.deaths}/${activity.score.assists}`)
    }
  } else {
    parts.push(activity.detail ?? 'LoL')
    const queue = queueLabel(activity.queue)
    if (queue) parts.push(queue)
    if (activity.phase === 'champ-select' && activity.champion) parts.push(activity.champion)
  }
  return parts.join(' · ')
}

export function ActivityLine({
  activity,
  className,
  showIcon = true
}: {
  activity: GameActivity
  className?: string
  showIcon?: boolean
}) {
  const now = useTicker(activity.phase === 'in-progress' ? 10_000 : 30_000)
  const inGame = activity.phase === 'in-progress'
  const Icon = activity.game === 'minecraft' ? Pickaxe : Swords

  return (
    <span
      title={activitySummary(activity, now)}
      className={cn(
        'flex items-center gap-1 truncate font-mono text-[9px] uppercase tracking-widest',
        inGame ? 'text-burn' : 'text-acid/80',
        className
      )}
    >
      {showIcon && <Icon className="h-2.5 w-2.5 shrink-0" />}
      <span className="truncate">{activitySummary(activity, now)}</span>
      {activity.partyUserIds && activity.partyUserIds.length > 0 && (
        <span
          className="shrink-0 rounded-brutal bg-acid/15 px-1 text-[8px] text-acid"
          title="Gente do grupo no mesmo lobby"
        >
          +{activity.partyUserIds.length}
        </span>
      )}
    </span>
  )
}
