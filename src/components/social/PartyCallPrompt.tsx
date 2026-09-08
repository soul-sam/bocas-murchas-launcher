import { Headphones, X, Swords } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { useActivity } from '@/lib/activity-context'
import { useMembers } from '@/lib/members-context'

/**
 * "Tem gente do grupo no seu lobby — entrar na call?"
 *
 * Aparece quando o cliente do LoL mostra 2+ pessoas do Bocas no mesmo lobby e
 * ninguem esta em call (modo "perguntar" nas configuracoes). Um banner no
 * canto, sem modal: a pessoa esta no meio de um champ select.
 */
export function PartyCallPrompt() {
  const { pendingCall, acceptPendingCall, dismissPendingCall } = useActivity()
  const { byId } = useMembers()

  if (!pendingCall) return null

  const people = pendingCall.userIds.map((id) => byId[id]).filter(Boolean)
  const names = people.map((p) => p.displayName.split(/\s+/)[0]).join(', ')

  return (
    <div className="pointer-events-auto fixed bottom-20 right-4 z-40 w-80 overflow-hidden rounded-brutal border-2 border-acid-dark bg-void shadow-[0_0_30px_rgba(0,0,0,0.7)]">
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
        <Swords className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1 text-[11.5px] text-muted-foreground">
          Lobby do grupo
        </span>
        <button
          type="button"
          onClick={dismissPendingCall}
          aria-label="Fechar"
          className="rounded-brutal p-0.5 text-muted-foreground transition-colors hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex -space-x-2">
          {people.slice(0, 4).map((p) => (
            <UserAvatar
              userId={p.id}
              key={p.id}
              src={resolveAssetUrl(p.avatar)}
              name={p.displayName}
              ringColor={p.profileColor}
              className="h-7 w-7"
            />
          ))}
        </div>
        <p className="min-w-0 flex-1 text-xs text-foreground">
          <span className="font-medium">{names || 'Gente do grupo'}</span> no seu lobby.
          Entrar na call?
        </p>
      </div>

      <div className="flex gap-1 px-3 pb-2">
        <button
          type="button"
          onClick={acceptPendingCall}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-brutal bg-acid px-2 py-1.5 font-mono text-[11.5px] uppercase tracking-widest text-void transition-colors hover:bg-acid/90"
        >
          <Headphones className="h-3.5 w-3.5" />
          entrar na call
        </button>
        <button
          type="button"
          onClick={dismissPendingCall}
          className="rounded-brutal border border-line px-2 py-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-acid/50 hover:text-foreground"
        >
          agora não
        </button>
      </div>
    </div>
  )
}
