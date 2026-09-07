import * as React from 'react'
import { Zap, Shield, ExternalLink, Coins, Flame } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { UserAvatar } from '@/components/ui/avatar'
import { parseLinks, resolveAssetUrl } from '@/lib/api'
import { formatCompact, RARITY_COLOR, type GamificationProfile } from '@/lib/api-gamification'
import type { Member } from '@/lib/members-context'
import { useAuth } from '@/lib/auth-context'
import { useNudge } from '@/lib/nudge-context'
import { useActivity } from '@/lib/activity-context'
import { useGamification } from '@/lib/gamification-context'
import { cn } from '@/lib/utils'
import { ActivityLine } from './ActivityLine'
import { NameEffect } from './NameEffect'
import { NameEmoji } from './NameEmoji'
import { LevelRing } from './LevelRing'
import { BetPopover } from './BetPopover'
import { ChessBlock } from './ChessBlock'

const STATUS_LABEL: Record<string, string> = {
  online: 'Online',
  away: 'Ausente',
  dnd: 'Não perturbe',
  offline: 'Offline'
}

/** Quantas badges cabem antes do "+n". */
const BADGES_SHOWN = 8

/**
 * Cartão de perfil. É onde fica o botão de cutucar — precisa de um alvo, então
 * não faz sentido em lugar nenhum além de "olhando o perfil de alguém".
 *
 * A parte de gamificação (nível, XP, murchos, badges) é buscada SÓ quando o
 * cartão abre: são 30 pessoas na lista e ninguém abre 30 perfis por noite.
 * O contexto guarda em cache por um minuto.
 */
export function ProfileCard({
  member,
  children
}: {
  member: Member
  children: React.ReactNode
}) {
  const { user } = useAuth()
  const { nudgeUser } = useNudge()
  const { activityOf } = useActivity()
  const { profile: myProfile, profileOf, cosmeticName } = useGamification()

  const [open, setOpen] = React.useState(false)
  const [remote, setRemote] = React.useState<GamificationProfile | null>(null)

  const isSelf = member.id === user?.id
  const color = member.profileColor ?? '#6AFF00'
  const links = parseLinks(member.links)
  const status = member.isOnline ? (member.status ?? 'online') : 'offline'
  const activity = member.isOnline ? activityOf(member.id) : undefined
  const riotId = member.riotGameName ? `${member.riotGameName}#${member.riotTagLine ?? ''}` : null
  const title = cosmeticName(member.title)
  const inMatch = !isSelf && activity?.phase === 'in-progress'

  React.useEffect(() => {
    if (!open || isSelf) return
    let cancelled = false
    void profileOf(member.id)
      .then((p) => {
        if (!cancelled) setRemote(p)
      })
      .catch(() => {
        // Sem gamificação pra essa pessoa (ou rota fora): o cartão fica como era.
      })
    return () => {
      cancelled = true
    }
  }, [open, isSelf, member.id, profileOf])

  const gp = isSelf ? myProfile : remote
  const progress = gp && gp.nextLevelXp > 0 ? gp.levelXp / gp.nextLevelXp : 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" side="left" className="w-72 p-0">
        <div
          className="h-16"
          style={
            member.banner
              ? {
                  backgroundImage: `url(${resolveAssetUrl(member.banner)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }
              : { background: `linear-gradient(135deg, ${color}33, transparent)` }
          }
        />

        <div className="px-3 pb-3">
          <div className="-mt-8 mb-2 flex items-end justify-between gap-2">
            {gp ? (
              <LevelRing level={gp.level} progress={progress} size={68}>
                <UserAvatar
                  src={resolveAssetUrl(member.avatar)}
                  name={member.displayName}
                  status={status}
                  ringColor={color}
                  frame={member.avatarFrame}
                  className="h-14 w-14 border-2"
                />
              </LevelRing>
            ) : (
              // Mesmo tamanho do anel, pra nada pular quando ele chegar.
              <div className="flex h-[68px] w-[68px] shrink-0 items-center justify-center">
                <UserAvatar
                  src={resolveAssetUrl(member.avatar)}
                  name={member.displayName}
                  status={status}
                  ringColor={color}
                  frame={member.avatarFrame}
                  className="h-14 w-14 border-2"
                />
              </div>
            )}

            <div className="mb-1 flex items-center gap-1">
              {inMatch && (
                <BetPopover userId={member.id} targetName={member.displayName} side="left" align="start">
                  <button
                    type="button"
                    title={`Apostar murchos na partida de ${member.displayName}`}
                    className={cn(
                      'flex items-center gap-1 rounded-brutal border-2 border-acid-dark px-2 py-1',
                      'font-mono text-[10px] uppercase tracking-widest text-acid',
                      'transition-colors hover:bg-acid/15 disabled:cursor-not-allowed disabled:opacity-40'
                    )}
                  >
                    <Coins className="h-3 w-3" />
                    apostar
                  </button>
                </BetPopover>
              )}

              {!isSelf && member.isOnline && (
                <button
                  type="button"
                  onClick={() => nudgeUser(member.id)}
                  title="Cutucar (treme a tela dessa pessoa)"
                  className={cn(
                    'flex items-center gap-1 rounded-brutal border-2 border-burn/60 px-2 py-1',
                    'font-mono text-[10px] uppercase tracking-widest text-burn',
                    'transition-colors hover:bg-burn/15'
                  )}
                >
                  <Zap className="h-3 w-3" />
                  cutucar
                </button>
              )}
            </div>
          </div>

          <p
            className="flex items-center gap-1.5 font-display text-base leading-tight"
            style={{ color }}
          >
            <NameEffect effect={member.nameEffect} className="truncate">
              {member.displayName}
            </NameEffect>
            <NameEmoji id={member.emoji} size="md" />
            {member.role === 'admin' && (
              <Shield className="h-3.5 w-3.5 shrink-0 text-burn" aria-label="admin" />
            )}
          </p>

          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span className="truncate">
              @{member.username}
              {member.pronouns && ` · ${member.pronouns}`}
            </span>
            {title && (
              <span className="shrink-0 rounded-brutal border border-burn/40 px-1 leading-4 text-burn">
                {title}
              </span>
            )}
          </p>

          {gp && <GamificationBlock profile={gp} />}
          <ChessBlock userId={member.id} isSelf={isSelf} open={open} />

          {activity && (
            <div className="mt-2 rounded-brutal border border-burn/40 bg-burn/[0.06] px-2 py-1.5">
              <ActivityLine activity={activity} className="text-[10px]" />
            </div>
          )}

          {riotId && (
            <p
              className="mt-1.5 font-mono text-[10px] text-muted-foreground"
              title="Riot ID lido do cliente do LoL"
            >
              ⚔ {riotId}
            </p>
          )}

          {member.customStatus && (
            <p className="mt-2 rounded-brutal border border-[#1a1a1a] bg-void/60 px-2 py-1 text-xs text-foreground">
              {member.customStatus}
            </p>
          )}

          {member.bio && (
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {member.bio}
            </p>
          )}

          {links.length > 0 && (
            <div className="mt-2 space-y-1">
              {links.map((link, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => void window.bocas.shell.openExternal(link.url)}
                  className="flex w-full items-center gap-1.5 truncate text-left text-xs text-acid transition-colors hover:underline"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="truncate">{link.name}</span>
                </button>
              ))}
            </div>
          )}

          <p className="mt-3 border-t border-[#1a1a1a] pt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {STATUS_LABEL[status] ?? status}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Barra de XP, murchos, streak e badges — o pedaço "RPG" do cartão. */
function GamificationBlock({ profile }: { profile: GamificationProfile }) {
  const pct =
    profile.nextLevelXp > 0
      ? Math.max(0, Math.min(100, Math.round((profile.levelXp / profile.nextLevelXp) * 100)))
      : 0
  const shown = profile.badges.slice(0, BADGES_SHOWN)
  const rest = profile.badges.length - shown.length

  return (
    <div className="mt-2 space-y-1.5 rounded-brutal border border-[#1a1a1a] bg-void/60 px-2 py-1.5">
      <div>
        <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          <span>
            nível <span className="text-acid">{profile.level}</span>
          </span>
          <span>
            {formatCompact(profile.levelXp)} / {formatCompact(profile.nextLevelXp)} XP
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-brutal bg-[#1a1a1a]">
          <div className="xp-fill h-full bg-acid" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex items-center gap-3 font-mono text-[10px]">
        <span className="flex items-center gap-1 text-burn" title="Murchos (moeda da casa)">
          <Coins className="h-3 w-3" />
          {formatCompact(profile.coins)}
        </span>
        <span
          className={cn('flex items-center gap-1', profile.streak >= 2 ? 'text-burn' : 'text-muted-foreground')}
          title={`Streak de check-in · melhor: ${profile.bestStreak}`}
        >
          <Flame className="h-3 w-3" />
          {profile.streak}
        </span>
        <span className="ml-auto text-muted-foreground" title="Partidas ganhas / jogadas">
          {profile.gamesWon}/{profile.gamesPlayed} W
        </span>
      </div>

      {profile.badges.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {shown.map((badge) => (
            <span
              key={badge.id}
              title={`${badge.name} — ${badge.description}`}
              className="flex h-6 w-6 items-center justify-center rounded-brutal border bg-void text-sm leading-none"
              style={{ borderColor: `${RARITY_COLOR[badge.rarity] ?? RARITY_COLOR.common}66` }}
            >
              {badge.icon}
            </span>
          ))}
          {rest > 0 && (
            <span className="font-mono text-[9px] text-muted-foreground">+{rest}</span>
          )}
        </div>
      )}
    </div>
  )
}
