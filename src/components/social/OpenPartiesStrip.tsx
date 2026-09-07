import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { GameIcon } from './GameIcon'
import { gameLabel } from '@/lib/api-events'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'
import { useParty, type Party } from '@/lib/party-context'
import { cn } from '@/lib/utils'

/**
 * "BORA?" ABERTOS — faixa na barra de canais, acima do rodapé.
 *
 * O card fica no canal onde foi chamado; quem está em outro canal (ou na aba
 * do Minecraft com a barra visível) não veria. Um chip por party: clicar
 * entra; quem já está dentro clica pra sair; quem chamou clica pra ir até o
 * card (sair do próprio bora seria cancelar, e isso merece o botão de
 * verdade no card). Some quando não há nenhum.
 */
export function OpenPartiesStrip() {
  const { parties, joinParty, leaveParty } = useParty()
  const { user } = useAuth()
  const { setActiveChannel } = useChat()
  const [busyId, setBusyId] = React.useState<string | null>(null)

  if (parties.length === 0) return null

  const handleClick = async (party: Party): Promise<void> => {
    if (busyId) return
    const me = user?.id
    const inside = !!me && party.members.some((m) => m.id === me)
    const creator = party.createdBy.id === me

    if (creator) {
      if (party.channelId) setActiveChannel(party.channelId)
      return
    }

    setBusyId(party.id)
    if (inside) await leaveParty(party.id)
    else if (party.status === 'open') await joinParty(party.id)
    setBusyId(null)
  }

  return (
    <div className="shrink-0 space-y-1 border-t border-line px-2 py-2">
      {parties.map((party) => {
        const me = user?.id
        const inside = !!me && party.members.some((m) => m.id === me)
        const creator = party.createdBy.id === me
        const full = party.status === 'full'
        const busy = busyId === party.id

        const suffix = creator
          ? 'seu bora'
          : inside
            ? 'você está dentro'
            : full
              ? 'cheio'
              : 'entrar'

        return (
          <button
            key={party.id}
            type="button"
            onClick={() => void handleClick(party)}
            disabled={busy || (!inside && !creator && full)}
            title={
              party.note
                ? `${party.createdBy.displayName}: ${party.note}`
                : `${party.createdBy.displayName} chamou pra ${gameLabel(party.game)}`
            }
            className={cn(
              'flex w-full items-center gap-2 rounded-brutal border px-2 py-1.5 text-left font-mono text-[11.5px] uppercase tracking-widest transition-colors',
              inside
                ? 'border-acid/50 bg-acid/[0.06] text-acid hover:bg-acid/15'
                : full
                  ? 'border-line-strong text-muted-foreground'
                  : 'border-burn/50 bg-burn/[0.06] text-burn hover:bg-burn/15',
              busy && 'opacity-60'
            )}
          >
            <GameIcon game={party.game} className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {gameLabel(party.game)} {party.members.length}/{party.slots}
            </span>
            {busy ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            ) : (
              <span className="shrink-0 opacity-80">· {suffix}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
