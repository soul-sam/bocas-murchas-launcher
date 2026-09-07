import { X, Zap, ArrowUp, Award, Coins, Flame, Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BadgeIcon } from '@/lib/cosmetic-icons'
import type { GamificationToast } from '@/lib/gamification-context'
import '@/styles/effects.css'

/**
 * Pilha de avisos da gamificação no canto de baixo à direita.
 *
 * Recebe a lista por props (e não pelo useGamification) porque é o próprio
 * provider que monta este componente — puxar o contexto de dentro dele seria
 * import circular por nada.
 *
 * Fica em z-40 com o PartyCallPrompt (que mora em bottom-20): os dois são
 * avisos passageiros, nenhum precisa passar por cima de modal.
 */
export function XpToasts({
  toasts,
  onDismiss
}: {
  toasts: GamificationToast[]
  onDismiss: (id: number) => void
}) {
  if (toasts.length === 0) return null

  return (
    // Mais novo embaixo, colado no canto; os antigos vão subindo até sumir.
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex w-64 flex-col justify-end gap-1.5">
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  )
}

const ACCENT: Record<GamificationToast['kind'], { border: string; text: string; Icon: typeof Zap }> = {
  xp: { border: 'border-acid-dark', text: 'text-acid', Icon: Zap },
  levelup: { border: 'border-acid', text: 'text-acid', Icon: ArrowUp },
  badge: { border: 'border-burn/60', text: 'text-burn', Icon: Award },
  coins: { border: 'border-burn/60', text: 'text-burn', Icon: Coins },
  checkin: { border: 'border-burn/60', text: 'text-burn', Icon: Flame },
  info: { border: 'border-line-strong', text: 'text-muted-foreground', Icon: Info },
  error: { border: 'border-destructive/60', text: 'text-destructive', Icon: TriangleAlert }
}

function ToastRow({ toast, onDismiss }: { toast: GamificationToast; onDismiss: () => void }) {
  const accent = ACCENT[toast.kind] ?? ACCENT.info
  const Icon = accent.Icon
  const loud = toast.kind === 'levelup' || toast.kind === 'badge'

  return (
    <div
      role="status"
      className={cn(
        'toast-in pointer-events-auto flex items-center gap-2 rounded-brutal border-2 bg-void px-2.5 py-1.5',
        'shadow-[0_0_20px_rgba(0,0,0,0.7)]',
        accent.border,
        loud && 'shadow-[0_0_20px_rgb(var(--neon-rgb)/0.15)]'
      )}
    >
      <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center', accent.text)}>
        {/* Badge nova mostra o ícone DELA; o resto usa o ícone do tipo. */}
        {toast.badgeId ? (
          <BadgeIcon badgeId={toast.badgeId} className="h-4 w-4" />
        ) : (
          <Icon className="h-3.5 w-3.5" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate font-display leading-tight',
            loud ? 'text-base' : 'text-sm',
            accent.text
          )}
        >
          {toast.title}
        </span>
        {toast.body && (
          <span className="block truncate text-[11px] text-muted-foreground">
            {toast.body}
          </span>
        )}
      </span>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar"
        className="shrink-0 rounded-brutal p-0.5 text-muted-foreground transition-colors hover:text-destructive"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
