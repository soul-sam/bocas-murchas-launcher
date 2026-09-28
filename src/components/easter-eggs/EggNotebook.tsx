import * as React from 'react'
import { X } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { RARITY_COLOR } from '@/lib/api-gamification'
import { EGG_GLYPH, Glyph } from '@/lib/cosmetic-glyphs'
import { eggs, type EggNotebook as Notebook } from '@/lib/easter-eggs/api'

/**
 * O caderninho de ovos: quantos a pessoa achou, e uma dica pra cada um que
 * falta. Abrir ele já é um ovo ("Curioso").
 *
 * Camada própria, sem Radix, pelo mesmo motivo das outras que vivem nos
 * GlobalOverlays: abre por tecla, de qualquer tela, e não pode trancar o
 * <body> (ver lib/interaction-guard.ts).
 */
export function EggNotebook({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token } = useAuth()
  const [data, setData] = React.useState<Notebook | null>(null)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    if (!open || !token) return
    let alive = true
    setError(false)
    // Um instante pro POST do "Curioso" chegar antes: senão o caderninho abre
    // dizendo que o próprio caderninho ainda não foi achado.
    const timer = window.setTimeout(() => {
      eggs
        .notebook(token)
        .then((next) => alive && setData(next))
        .catch(() => alive && setError(true))
    }, 400)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [open, token])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-dialogo flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-label="Caderninho de ovos"
        className="card-acid relative flex max-h-[85vh] w-full max-w-md flex-col rounded-brutal p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-4 flex items-center gap-3">
          <Glyph art={EGG_GLYPH} className="h-7 w-7 text-burn" />
          <div className="min-w-0">
            <h2 className="title-brutal text-2xl">Caderninho de ovos</h2>
            <p className="text-[11.5px] text-muted-foreground">
              {data ? `${data.found} de ${data.total} achados` : 'Abrindo…'}
            </p>
          </div>
        </div>

        {data && (
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-void">
            <div
              className="h-full bg-burn transition-[width] duration-500"
              style={{ width: `${(data.found / Math.max(1, data.total)) * 100}%` }}
            />
          </div>
        )}

        {error && <p className="text-[12px] text-destructive">Não deu pra abrir o caderninho agora.</p>}

        <ul className="min-h-0 space-y-1.5 overflow-y-auto pr-1">
          {data?.eggs.map((egg) => {
            const found = egg.foundAt !== null
            return (
              <li
                key={egg.id}
                className="flex gap-3 rounded-brutal border border-line bg-void px-3 py-2"
              >
                <Glyph
                  art={EGG_GLYPH}
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: found ? RARITY_COLOR[egg.rarity] : undefined, opacity: found ? 1 : 0.35 }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={found ? 'text-[13px] font-semibold text-foreground' : 'text-[13px] text-muted-foreground'}>
                      {found ? egg.name : '???'}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {found ? 'achado' : `+${egg.coins} murchos`}
                    </span>
                  </div>
                  <p className="text-[12px] leading-snug text-muted-foreground">
                    {found ? egg.description : egg.hint}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
