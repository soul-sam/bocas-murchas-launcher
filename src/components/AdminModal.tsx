import * as React from 'react'
import { Shield, X } from 'lucide-react'
import { useOverlays } from '@/lib/overlay-context'
import { useAuth } from '@/lib/auth-context'
import { AdminPanel } from '@/components/AdminPanel'

/**
 * Painel admin como camada global — convites, membros, sons, ferramentas.
 *
 * Camada própria (div fixa + clique fora + Esc), NÃO Dialog do Radix: esta
 * modal é aberta do menu da sidebar, do Ctrl+K e da tela do Minecraft, e pode
 * ser desmontada aberta (logout, rebaixamento). Radix arrancado da árvore
 * deixa o <body> sem clique — ver lib/interaction-guard.ts.
 */
export function AdminModal() {
  const { adminOpen, closeAdmin } = useOverlays()
  const { user } = useAuth()

  // Se a pessoa deixar de ser admin com o painel aberto, ele some sozinho.
  const open = adminOpen && user?.role === 'admin'

  React.useEffect(() => {
    if (!open) return
    const handle = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeAdmin()
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [open, closeAdmin])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={closeAdmin}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Painel admin"
        className="card-acid flex h-[80vh] w-full max-w-3xl flex-col rounded-brutal p-6 scanlines"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-start justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-acid drop-shadow-[0_0_8px_rgba(106,255,0,0.5)]" />
            <div>
              <p className="font-display text-base uppercase tracking-widest text-foreground">
                Painel admin
              </p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                convites · membros · sons · ferramentas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeAdmin}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-brutal border-2 border-border text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <AdminPanel />
      </div>
    </div>
  )
}
