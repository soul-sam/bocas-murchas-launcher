import * as React from 'react'
import { Zap, Shield, ExternalLink } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { UserAvatar } from '@/components/ui/avatar'
import { parseLinks, resolveAssetUrl } from '@/lib/api'
import type { Member } from '@/lib/members-context'
import { useAuth } from '@/lib/auth-context'
import { useNudge } from '@/lib/nudge-context'
import { cn } from '@/lib/utils'

const STATUS_LABEL: Record<string, string> = {
  online: 'Online',
  away: 'Ausente',
  dnd: 'Não perturbe',
  offline: 'Offline'
}

/**
 * Cartão de perfil. É onde fica o botão de cutucar — precisa de um alvo, então
 * não faz sentido em lugar nenhum além de "olhando o perfil de alguém".
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

  const isSelf = member.id === user?.id
  const color = member.profileColor ?? '#6AFF00'
  const links = parseLinks(member.links)
  const status = member.isOnline ? (member.status ?? 'online') : 'offline'

  return (
    <Popover>
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
          <div className="-mt-7 mb-2 flex items-end justify-between gap-2">
            <UserAvatar
              src={resolveAssetUrl(member.avatar)}
              name={member.displayName}
              status={status}
              ringColor={color}
              className="h-14 w-14 border-2"
            />

            {!isSelf && member.isOnline && (
              <button
                type="button"
                onClick={() => nudgeUser(member.id)}
                title="Cutucar (treme a tela dessa pessoa)"
                className={cn(
                  'mb-1 flex items-center gap-1 rounded-brutal border-2 border-burn/60 px-2 py-1',
                  'font-mono text-[10px] uppercase tracking-widest text-burn',
                  'transition-colors hover:bg-burn/15'
                )}
              >
                <Zap className="h-3 w-3" />
                cutucar
              </button>
            )}
          </div>

          <p
            className="flex items-center gap-1.5 font-display text-base leading-tight"
            style={{ color }}
          >
            <span className="truncate">{member.displayName}</span>
            {member.role === 'admin' && (
              <Shield className="h-3.5 w-3.5 shrink-0 text-burn" aria-label="admin" />
            )}
          </p>

          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            @{member.username}
            {member.pronouns && ` · ${member.pronouns}`}
          </p>

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
