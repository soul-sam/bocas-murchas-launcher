import { Zap, BellOff } from 'lucide-react'
import { useNudge } from '@/lib/nudge-context'
import { useSettings } from '@/lib/settings-context'

/**
 * Avisos do nudge: quem cutucou e por que a cutucada nao saiu.
 *
 * O tremor em si e aplicado pelo layout (classe CSS na raiz) e pela janela no
 * processo main. Aqui e so o texto por cima.
 */
export function NudgeOverlay() {
  const { lastNudge, feedback } = useNudge()
  const { settings } = useSettings()

  return (
    <>
      {lastNudge && (
        <div className="pointer-events-none fixed left-1/2 top-14 z-[70] -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-brutal border-2 border-burn bg-void px-4 py-2 shadow-[0_0_30px_rgba(242,183,5,0.35)]">
            <Zap className="h-4 w-4 shrink-0 text-burn" />
            <span className="font-display text-sm uppercase tracking-wide text-dirty-white">
              {lastNudge.scope === 'channel' ? (
                <>
                  <span className="text-burn">{lastNudge.from.displayName}</span> tremeu a
                  sala inteira
                </>
              ) : (
                <>
                  <span className="text-burn">{lastNudge.from.displayName}</span> te cutucou
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {feedback && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[70] -translate-x-1/2">
          <div className="rounded-brutal border-2 border-line bg-void px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {feedback}
          </div>
        </div>
      )}

      {settings.nudgeOptOut && (
        <div
          title="Você desativou cutucadas nas configurações"
          className="pointer-events-none fixed bottom-3 right-3 z-[60] flex items-center gap-1 rounded-brutal border border-line bg-void/90 px-2 py-1 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground"
        >
          <BellOff className="h-3 w-3" />
          cutucadas off
        </div>
      )}
    </>
  )
}
