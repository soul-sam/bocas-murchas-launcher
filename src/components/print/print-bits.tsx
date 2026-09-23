import * as React from 'react'
import { Box } from 'lucide-react'
import { resolveAssetUrl } from '@/lib/api'
import type { FilamentSlotUse } from '@/lib/api-print'
import { cn } from '@/lib/utils'

/**
 * Pedacinhos da impressora que aparecem em mais de uma tela: a miniatura da
 * peça (fila, mural, card do chat) e as bolinhas de filamento.
 */

/** Miniatura que o fatiador embutiu no arquivo; sem ela, um cubo. */
export function PrintThumb({
  url,
  alt,
  className
}: {
  url: string | null | undefined
  alt: string
  className?: string
}) {
  const [broken, setBroken] = React.useState(false)
  const src = resolveAssetUrl(url ?? undefined)

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-brutal border border-line bg-void',
        className
      )}
    >
      {src && !broken ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          draggable={false}
          onError={() => setBroken(true)}
          className="h-full w-full object-contain"
        />
      ) : (
        <Box className="h-1/2 w-1/2 text-muted-foreground/60" aria-hidden />
      )}
    </div>
  )
}

/** Uma bolinha de cor de filamento. `null` vira tracejado (sem informação). */
export function ColorDot({ hex, className, title }: { hex: string | null | undefined; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-block h-3 w-3 shrink-0 rounded-full border',
        hex ? 'border-line-strong' : 'border-dashed border-line-strong',
        className
      )}
      style={hex ? { backgroundColor: hex } : undefined}
      aria-hidden={!title}
    />
  )
}

/** "slot 1 · PLA" com a bolinha da cor, uma por filamento que a peça usa. */
export function FilamentChips({ filaments, className }: { filaments: FilamentSlotUse[] | undefined; className?: string }) {
  if (!filaments || filaments.length === 0) return null
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      {filaments.map((use) => (
        <span
          key={use.tool}
          className="inline-flex items-center gap-1 rounded-brutal border border-line px-1.5 py-px text-[11px] text-muted-foreground"
        >
          <ColorDot hex={use.colorHex} />
          <span className="font-mono">{use.tool + 1}</span>
          {use.type && <span>{use.type}</span>}
        </span>
      ))}
    </span>
  )
}

/** "2h15 · 48 g" */
export function gramsLabel(grams: number | null | undefined): string | null {
  if (grams === null || grams === undefined || !Number.isFinite(grams) || grams <= 0) return null
  return grams >= 1000 ? `${(grams / 1000).toFixed(2).replace('.', ',')} kg` : `${Math.round(grams)} g`
}
