import { Shield } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { resolveAssetUrl } from '@/lib/api'
import { useMembers, type Member } from '@/lib/members-context'
import { ProfileCard } from './ProfileCard'

export function MemberList() {
  const { online, offline, loading } = useMembers()

  if (loading) return <aside className="w-56 shrink-0 border-l border-[#1a1a1a]" />

  return (
    <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-l border-[#1a1a1a] bg-[#0D0D0D] py-3">
      <Group label="Online" count={online.length} members={online} />
      {offline.length > 0 && (
        <Group label="Offline" count={offline.length} members={offline} dimmed />
      )}
    </aside>
  )
}

function Group({
  label,
  count,
  members,
  dimmed
}: {
  label: string
  count: number
  members: Member[]
  dimmed?: boolean
}) {
  return (
    <section className="mb-3 px-2">
      <h3 className="px-2 pb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label} — {count}
      </h3>

      <div className="space-y-0.5">
        {members.map((member) => (
          <ProfileCard key={member.id} member={member}>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-brutal px-2 py-1 text-left transition-colors hover:bg-void-light',
                dimmed && 'opacity-45 hover:opacity-100'
              )}
            >
              <UserAvatar
                src={resolveAssetUrl(member.avatar)}
                name={member.displayName}
                status={member.isOnline ? (member.status ?? 'online') : 'offline'}
                ringColor={member.profileColor}
                className="h-7 w-7"
              />

              <span className="min-w-0 flex-1">
                <span
                  className="flex items-center gap-1 truncate text-sm"
                  style={member.profileColor ? { color: member.profileColor } : undefined}
                >
                  <span className="truncate">{member.displayName}</span>
                  {member.role === 'admin' && (
                    <Shield className="h-3 w-3 shrink-0 text-burn" aria-label="admin" />
                  )}
                </span>
                {member.customStatus && (
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {member.customStatus}
                  </span>
                )}
              </span>
            </button>
          </ProfileCard>
        ))}
      </div>
    </section>
  )
}
