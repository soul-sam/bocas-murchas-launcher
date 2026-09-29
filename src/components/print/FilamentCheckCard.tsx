import { ArrowRight } from 'lucide-react'
import type { ToolCheck } from '@/lib/api-print'
import { cn } from '@/lib/utils'
import { ColorDot } from './print-bits'

/**
 * O FILAMENTO DA PEÇA CONTRA A MÁQUINA — uma linha por ferramenta: o que o
 * arquivo pede, o que está no slot, e o veredito.
 *
 * O veredito vem pronto do servidor (`ToolCheck`). Aqui ninguém compara cor
 * nem material: se a tela refizesse a conta, ela diria "pode ir" e a fila
 * travaria.
 */

/** Tem alguma coisa que vale mostrar pra quem acabou de subir a peça? */
export function hasFilamentNews(checks: ToolCheck[] | undefined): boolean {
  return !!checks && checks.some((check) => check.status !== 'ok')
}

/** Trava por material/cor: "tanto faz a cor" resolve. */
export function blocksByColor(checks: ToolCheck[] | undefined): boolean {
  return !!checks && checks.some((check) => ['mismatch', 'empty', 'elsewhere'].includes(check.status))
}

/** Trava por dono: só alguém do grupo (ou quem opera) resolve. */
export function blocksByGroup(checks: ToolCheck[] | undefined): boolean {
  return !!checks && checks.some((check) => check.status === 'private')
}

export function checkText(check: ToolCheck): string {
  switch (check.status) {
    case 'ok':
      return 'bate com a peça'
    case 'unknown':
      return 'ninguém marcou o que tem nesse slot'
    case 'empty':
      return 'o slot está vazio'
    case 'elsewhere':
      return check.suggestedSlot !== null
        ? `o que a peça pede está no slot ${check.suggestedSlot + 1}`
        : 'diferente do que a peça pede'
    case 'private':
      return `rolo do grupo "${check.group?.name ?? 'outro grupo'}"`
    default:
      return 'diferente do que a peça pede'
  }
}

function label(side: { type: string | null; colorHex: string | null }, fallback: string): string {
  return side.type ?? (side.colorHex ? side.colorHex : fallback)
}

export function FilamentCheckCard({ checks, className }: { checks: ToolCheck[]; className?: string }) {
  if (checks.length === 0) return null

  return (
    <ul className={cn('space-y-1.5', className)}>
      {checks.map((check) => {
        const stops = check.status !== 'ok' && check.status !== 'unknown'
        return (
          <li
            key={check.tool}
            className={cn(
              'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-brutal border px-3 py-2',
              stops ? 'border-burn/50 bg-burn/5' : 'border-line bg-void/40'
            )}
          >
            <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">slot {check.tool + 1}</span>

            <span className="flex items-center gap-1.5 text-xs text-foreground" title="o que a peça pede">
              <ColorDot hex={check.want.colorHex} className="h-4 w-4" />
              {label(check.want, 'qualquer')}
            </span>

            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />

            <span className="flex items-center gap-1.5 text-xs text-foreground" title="o que está na máquina">
              <ColorDot hex={check.status === 'empty' ? null : check.have.colorHex} className="h-4 w-4" />
              {check.status === 'empty' ? 'vazio' : label(check.have, check.have.source === 'none' ? '?' : '—')}
            </span>

            <span className={cn('text-[11.5px]', stops ? 'text-burn' : 'text-muted-foreground')}>
              {checkText(check)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
