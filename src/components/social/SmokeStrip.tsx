import * as React from 'react'
import { Flame, Headphones, Loader2, Plus, X } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'
import { useLayout } from '@/lib/layout-context'
import { useOverlays } from '@/lib/overlay-context'
import { useSmoke, smokeCountdown, type Smoke } from '@/lib/smoke-context'
import { useVoice } from '@/lib/voice-context'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'

/**
 * FAIXA DO SINAL DE FUMAÇA — barra de canais, logo acima dos "bora?".
 *
 * Duas coisas dividem esta faixa, e as duas respondem à mesma pergunta ("vale
 * a pena eu ficar aqui agora?"):
 *
 *   - o CONVITE de call cheia, quando o aviso de "me avisa quando encher"
 *     dispara. Fica no topo porque é a única coisa aqui que é sobre AGORA;
 *   - as FUMAÇAS no ar, cada uma com sua contagem.
 *
 * Quando não há nem uma nem outra, a faixa vira um botão discreto de acender —
 * e isso é de propósito. A alternativa (esconder tudo) deixaria a feature
 * invisível justamente na hora em que ela serve: quando a sala está vazia.
 */
export function SmokeStrip() {
  const { smokes, mySmoke, joinSmoke, leaveSmoke, callAlert, dismissCallAlert } = useSmoke()
  const { user } = useAuth()
  const { setActiveChannel, voiceChannels } = useChat()
  const { setView } = useLayout()
  const { openSmokeComposer } = useOverlays()
  const voice = useVoice()
  const now = useNow(20_000)

  const [busyId, setBusyId] = React.useState<string | null>(null)

  const handleClick = async (smoke: Smoke): Promise<void> => {
    if (busyId) return
    const me = user?.id
    const inside = !!me && smoke.members.some((m) => m.id === me)

    // Quem acendeu clica pra ir até o card; sair da própria fumaça é apagar
    // ela, e isso merece o botão de verdade no card.
    if (smoke.createdBy.id === me) {
      if (smoke.channelId) {
        setActiveChannel(smoke.channelId)
        setView('chat')
      }
      return
    }

    setBusyId(smoke.id)
    if (inside) await leaveSmoke(smoke.id)
    else await joinSmoke(smoke.id)
    setBusyId(null)
  }

  const joinCall = (channelId: string): void => {
    const channel = voiceChannels.find((c) => c.id === channelId)
    if (!channel) return
    dismissCallAlert()
    setView('voice')
    void voice.join(channel)
  }

  const nothing = smokes.length === 0 && !callAlert

  return (
    <div className="shrink-0 space-y-1 border-t border-line px-2 py-2">
      {callAlert && !voice.connected && (
        <div className="rounded-brutal border-2 border-acid bg-acid/10 px-2 py-1.5">
          <div className="flex items-start gap-2">
            <Headphones className="mt-0.5 h-3.5 w-3.5 shrink-0 text-acid" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-acid">Encheu: {callAlert.size} na call</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {callAlert.members
                  .slice(0, 3)
                  .map((m) => m.displayName.split(/\s+/)[0])
                  .join(', ')}
                {callAlert.channelName ? ` · #${callAlert.channelName}` : ''}
              </p>
            </div>
            <button
              type="button"
              aria-label="Dispensar"
              onClick={dismissCallAlert}
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => joinCall(callAlert.channelId)}
            className="mt-1.5 w-full rounded-brutal border-2 border-acid bg-acid px-2 py-1 text-[11.5px] font-bold uppercase tracking-wider text-void transition-colors hover:brightness-110"
          >
            Entrar
          </button>
        </div>
      )}

      {smokes.map((smoke) => {
        const me = user?.id
        const inside = !!me && smoke.members.some((m) => m.id === me)
        const mine = smoke.createdBy.id === me
        const busy = busyId === smoke.id
        const due = smoke.status === 'due'

        const suffix = mine
          ? 'sua'
          : inside
            ? 'você topou'
            : due
              ? 'agora'
              : 'eu também'

        return (
          <button
            key={smoke.id}
            type="button"
            onClick={() => void handleClick(smoke)}
            disabled={busy}
            title={
              smoke.note
                ? `${smoke.createdBy.displayName}: ${smoke.note}`
                : `${smoke.createdBy.displayName} entra ${smokeCountdown(smoke.at, now.getTime())}`
            }
            className={cn(
              'flex w-full items-center gap-2 rounded-brutal border px-2 py-1.5 text-left text-[11.5px] transition-colors',
              inside
                ? 'border-burn/60 bg-burn/[0.08] text-burn hover:bg-burn/15'
                : due
                  ? 'border-acid/60 bg-acid/[0.08] text-acid hover:bg-acid/15'
                  : 'border-line-strong text-muted-foreground hover:border-burn/50 hover:text-foreground'
            )}
          >
            <Flame className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {smokeCountdown(smoke.at, now.getTime())} · {smoke.members.length}
              {smoke.arrived.length > 0 && ` (${smoke.arrived.length} já entrou)`}
            </span>
            {busy ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            ) : (
              <span className="shrink-0 opacity-80">· {suffix}</span>
            )}
          </button>
        )
      })}

      {!mySmoke && (
        <button
          type="button"
          onClick={openSmokeComposer}
          className={cn(
            'flex w-full items-center gap-2 rounded-brutal border border-dashed px-2 py-1.5 text-left text-[11.5px] transition-colors',
            nothing
              ? 'border-line-strong text-muted-foreground hover:border-burn/50 hover:text-burn'
              : 'border-line text-muted-foreground hover:border-burn/50 hover:text-burn'
          )}
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {nothing ? 'Sinal de fumaça — avise que você entra' : 'Acender a sua'}
          </span>
        </button>
      )}
    </div>
  )
}
