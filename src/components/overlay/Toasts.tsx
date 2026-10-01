import {
  Bell,
  CircleDot,
  Swords,
  UserMinus,
  UserPlus
} from 'lucide-react'
import { ChatIcon } from '@/lib/bocas-icons'
import type { IconComponent } from '@/lib/icon-component'
import { cn } from '@/lib/utils'
import type { OverlaySide, OverlayToast } from '../../../electron/preload/types'

/**
 * Quanto uma notificação fica flutuando do lado da aba. Vive aqui porque a barra
 * de tempo do cartão esvazia exatamente nesse prazo — duas constantes iguais em
 * dois arquivos sairiam de fase.
 */
export const TOAST_TTL_MS = 6_000

/** Ícone de traço + o tom do azulejo, por tipo. Nada de emoji: ver a regra da casa. */
export const TOAST_LOOK: Record<
  OverlayToast['kind'],
  { icon: IconComponent; tone: string; tile: string }
> = {
  'voice-join': { icon: UserPlus, tone: 'text-acid-text', tile: 'border-acid-dark/60 bg-acid/10' },
  'voice-leave': {
    icon: UserMinus,
    tone: 'text-muted-foreground',
    tile: 'border-line bg-surface-raised'
  },
  online: { icon: CircleDot, tone: 'text-acid-text', tile: 'border-acid-dark/60 bg-acid/10' },
  game: { icon: Swords, tone: 'text-burn', tile: 'border-burn/40 bg-burn/10' },
  message: { icon: ChatIcon, tone: 'text-foreground', tile: 'border-line bg-surface-raised' },
  info: { icon: Bell, tone: 'text-foreground', tile: 'border-line bg-surface-raised' }
}

export function toastLook(kind: OverlayToast['kind']) {
  return TOAST_LOOK[kind] ?? TOAST_LOOK.info
}

/**
 * As notificações flutuando do lado da aba/logo.
 *
 * SEM `data-overlay-hit`, de propósito: elas passam por cima do jogo e o
 * clique atravessa — um aviso que come o clique de uma habilidade é pior que
 * aviso nenhum. Somem sozinhas; quem quiser reler abre o painel.
 */
export function ToastStack({
  toasts,
  side,
  offset,
  inset
}: {
  toasts: OverlayToast[]
  side: OverlaySide
  offset: number
  inset?: string
}) {
  return (
    <div
      style={{
        // Centrada na aba, mas sem sair da tela: a pilha cheia tem ~13rem.
        top: `clamp(1rem, calc(${offset * 100}% - 6rem), calc(100% - 14rem))`
      }}
      className={cn(
        'pointer-events-none absolute z-gaveta flex w-[19rem] flex-col gap-1.5',
        // A aba do jogo tem 32px: 48px deixa 16 de respiro entre ela e o aviso.
        inset ?? (side === 'left' ? 'left-12' : 'right-12')
      )}
    >
      {toasts.map((toast) => (
        <ToastCard key={`${toast.at}-${toast.title}`} toast={toast} side={side} />
      ))}
    </div>
  )
}

function ToastCard({ toast, side }: { toast: OverlayToast; side: OverlaySide }) {
  const { icon: Icon, tone, tile } = toastLook(toast.kind)
  // O aviso pode chegar com a janela já aberta há tempo: a barra começa de onde
  // o prazo realmente está, e não cheia.
  const left = Math.max(0, TOAST_TTL_MS - (Date.now() - toast.at))

  return (
    <div
      className={cn(
        'relative flex items-start gap-2.5 overflow-hidden rounded-[10px] border border-line',
        'bg-void/95 p-2.5 shadow-neon-2',
        side === 'left' ? 'ov-in-left' : 'ov-in-right'
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-brutal border',
          tile
        )}
      >
        <Icon className={cn('h-4 w-4', tone)} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pb-0.5">
        <p className="truncate text-xs font-semibold leading-tight text-foreground">{toast.title}</p>
        {toast.body && (
          <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">
            {toast.body}
          </p>
        )}
      </div>
      {/* Esvazia até o aviso sumir: dá pra ler quanto tempo ainda tem. */}
      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-0.5 animate-shrink-width bg-acid/60"
        style={{ animationDuration: `${left}ms` }}
      />
    </div>
  )
}
