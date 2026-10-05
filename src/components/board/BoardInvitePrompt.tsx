import * as React from 'react'
import { X } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { NaFila } from '@/components/ui/filas'
import { resolveAssetUrl } from '@/lib/api'
import { boardGameLabel } from '@/lib/api-board'
import { useBoard } from '@/lib/board-context'
import { useMembers } from '@/lib/members-context'
import { useTicker } from '@/lib/use-now'
import { GameIcon } from '@/components/social/GameIcon'

/**
 * "Fulano te chamou pra uma partida — aceita?"
 *
 * Mesmo molde do PartyCallPrompt: banner no canto, sem modal, porque a
 * pessoa pode estar no meio de outra coisa. O convite expira sozinho no
 * board-context; aqui só se conta o tempo que falta. Aceitar abre a mesa
 * (o contexto grava a vista do ack) e leva pra tela do jogo.
 */
export function BoardInvitePrompt() {
  const { invite, answerInvite } = useBoard()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const { byId } = useMembers()
  // O relógio compartilhado só anda enquanto há convite na tela.
  const now = useTicker(1000, !!invite)

  // Erro de um convite não vale pro próximo.
  const inviteId = invite?.tableId
  React.useEffect(() => {
    setError(null)
    setBusy(false)
  }, [inviteId])

  if (!invite) return null

  const from = invite.from
  const member = byId[from.userId]
  const name = member?.displayName ?? from.displayName
  const left = Math.max(0, Math.ceil((invite.expiresAt - now) / 1000))
  const worth = invite.stake > 0 ? `valendo ${invite.stake.toLocaleString('pt-BR')} murchos` : 'amistosa'

  // O contexto já grava a mesa e leva pra tela do jogo no aceite: chamar
  // `goToBoard` aqui abriria a mesa de novo (segundo `board:open`).
  const accept = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    const ack = await answerInvite(true)
    setBusy(false)
    if (!ack.ok) setError(ack.error ?? 'Não deu pra aceitar o convite.')
  }
  const decline = (): void => {
    void answerInvite(false)
  }

  return (
    <NaFila fila="canto" ordem={31}>
      <div
        role="alertdialog"
        aria-label="Convite para partida"
        className="pointer-events-auto w-80 max-w-full overflow-hidden rounded-brutal border-2 border-acid-dark bg-void shadow-[0_0_30px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
          <GameIcon game={invite.game} className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="flex-1 text-[11.5px] text-muted-foreground">Convite para jogar</span>
          <span className="font-mono text-[11.5px] text-muted-foreground" aria-label={`Expira em ${left} segundos`}>
            {left}s
          </span>
          <button
            type="button"
            onClick={decline}
            aria-label="Recusar"
            className="rounded-brutal p-0.5 text-muted-foreground transition-colors hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <div className="flex items-center gap-2 px-3 py-2">
          <UserAvatar
            userId={from.userId}
            src={resolveAssetUrl(member?.avatar ?? from.avatar)}
            name={name}
            ringColor={member?.profileColor ?? undefined}
            className="h-8 w-8 shrink-0"
          />
          <p className="min-w-0 flex-1 text-xs text-foreground">
            <span className="font-medium">{name}</span> te chamou pra{' '}
            <span className="font-medium">{boardGameLabel(invite.game, invite.variant)}</span>
            {' · '}
            <span className="font-mono">{invite.clock}</span>
            {' · '}
            <span className={invite.stake > 0 ? 'text-burn' : 'text-muted-foreground'}>{worth}</span>
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="mx-3 mb-2 rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
          >
            {error}
          </p>
        )}

        <div className="flex gap-1.5 px-3 pb-2.5">
          <Button size="sm" className="flex-1" disabled={busy} onClick={() => void accept()}>
            Aceitar
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={decline}>
            Recusar
          </Button>
        </div>
      </div>
    </NaFila>
  )
}
