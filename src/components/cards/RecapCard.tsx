import { ScrollText } from 'lucide-react'
import type { CardProps } from './index'
import { CardFrame } from './index'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { formatCompact, type RecapCardMeta } from '@/lib/api-gamification'
import { useMembers } from '@/lib/members-context'
import { NameEmoji } from '@/components/social/NameEmoji'
import { AwardIcon, BadgeIcon } from '@/lib/cosmetic-icons'

/**
 * CARTÃO DE RECAP SEMANAL.
 *
 * O servidor posta um por semana com os "prêmios" (quem mais falou, quem
 * mais ficou em call, o melhor KDA…) e os totais do grupo. É o cartão que a
 * galera volta pra ler, então cada prêmio tem linha própria com avatar — não
 * uma lista de texto.
 */

function shortDate(iso: string | undefined): string {
  if (!iso) return '?'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return hours > 0 ? `${hours}h${String(rest).padStart(2, '0')}` : `${rest} min`
}

export function RecapCard({ message, metadata }: CardProps<RecapCardMeta>) {
  const { byId } = useMembers()

  const awards = Array.isArray(metadata.awards) ? metadata.awards : []
  const totals = metadata.totals
  const badges = Array.isArray(metadata.badgesGranted) ? metadata.badgesGranted : []

  const totalTiles: { label: string; value: string }[] = totals
    ? [
        { label: 'msgs', value: formatCompact(totals.messages ?? 0) },
        { label: 'em call', value: formatMinutes(totals.voiceMinutes ?? 0) },
        { label: 'partidas', value: `${totals.games ?? 0}` },
        { label: 'vitórias', value: `${totals.wins ?? 0}` },
        { label: 'sons', value: formatCompact(totals.soundPlays ?? 0) },
        { label: 'cutucadas', value: formatCompact(totals.nudges ?? 0) },
        { label: 'xp', value: formatCompact(totals.xp ?? 0) }
      ]
    : []

  return (
    <CardFrame
      accent="burn"
      icon={<ScrollText className="h-3.5 w-3.5 text-burn" />}
      title={
        <span>
          Recap da semana{' '}
          <span className="text-burn">
            {shortDate(metadata.weekStart)} – {shortDate(metadata.weekEnd)}
          </span>
        </span>
      }
      footer={
        badges.length > 0 ? (
          <div>
            <p className="">badges novas</p>
            <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 normal-case">
              {badges.map((grant, index) => {
                const who = byId[grant.userId]
                return (
                  <li key={`${grant.userId}-${grant.badgeId}-${index}`} className="flex items-center gap-1">
                    <BadgeIcon badgeId={grant.badgeId} className="h-3 w-3 shrink-0 text-burn" />
                    <span className="text-foreground">{grant.name}</span>
                    <span className="text-muted-foreground">→</span>
                    <span style={who?.profileColor ? { color: who.profileColor } : undefined}>
                      {who?.displayName ?? 'alguém'}
                    </span>
                    <NameEmoji id={who?.emoji} />
                  </li>
                )
              })}
            </ul>
          </div>
        ) : undefined
      }
    >
      {awards.length === 0 && !totals ? (
        <p className="text-sm text-foreground">{message.content}</p>
      ) : (
        <>
          {awards.length > 0 && (
            <ul className="space-y-1">
              {awards.map((award) => {
                const who = byId[award.userId]
                const name = who?.displayName ?? award.displayName
                const color = who?.profileColor ?? undefined
                return (
                  <li key={award.key} className="flex items-center gap-2">
                    <span className="flex w-6 shrink-0 items-center justify-center text-burn">
                      <AwardIcon awardKey={award.key} className="h-4 w-4" />
                    </span>
                    <UserAvatar
                      src={resolveAssetUrl(who?.avatar)}
                      name={name}
                      ringColor={color}
                      frame={who?.avatarFrame}
                      className="h-6 w-6"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {award.title}
                      </span>
                      <span className="flex items-center gap-1 font-display text-sm leading-tight" style={color ? { color } : undefined}>
                        <span className="truncate">{name}</span>
                        <NameEmoji id={who?.emoji} />
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[11.5px] text-burn">
                      {formatCompact(award.value)} {award.label}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}

          {totalTiles.length > 0 && (
            <div className="mt-2 grid grid-cols-4 gap-1">
              {totalTiles.map((tile) => (
                <div key={tile.label} className="rounded-brutal border border-line bg-void/60 px-1 py-1 text-center">
                  <p className="truncate font-mono text-xs text-foreground">{tile.value}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {tile.label}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </CardFrame>
  )
}
