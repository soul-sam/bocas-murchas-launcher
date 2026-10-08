import * as React from 'react'
import { POOL_CLOTHS, POOL_FINISHES, POOL_RAILS, type PoolSkin } from '../../../electron/preload/types'
import { cn } from '@/lib/utils'
import { CLOTH, RAIL } from './draw'

const CLOTH_LABEL: Record<PoolSkin['cloth'], string> = { verde: 'Verde', azul: 'Azul', vermelho: 'Vermelho', preto: 'Preto' }
const FINISH_LABEL: Record<PoolSkin['finish'], string> = { fosco: 'Fosco', brilho: 'Com brilho' }
const RAIL_LABEL: Record<PoolSkin['rails'], string> = { madeira: 'Madeira', preto: 'Preto' }

/**
 * A mesa de bilhar de cada um: pano, acabamento e bordas. Três fileiras de
 * botões; a amostra de cor é a mesma do desenho (draw.ts), porque pano é
 * conteúdo, não tema. Sempre manda a skin INTEIRA (o merge das configurações
 * é raso nesse campo).
 */
export function PoolSkinPicker({ value, onChange }: { value: PoolSkin; onChange: (skin: PoolSkin) => void }): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <Row label="Pano">
        {POOL_CLOTHS.map((c) => (
          <Choice key={c} on={value.cloth === c} onClick={() => onChange({ ...value, cloth: c })} swatch={CLOTH[c]}>
            {CLOTH_LABEL[c]}
          </Choice>
        ))}
      </Row>
      <Row label="Acabamento">
        {POOL_FINISHES.map((f) => (
          <Choice key={f} on={value.finish === f} onClick={() => onChange({ ...value, finish: f })}>
            {FINISH_LABEL[f]}
          </Choice>
        ))}
      </Row>
      <Row label="Bordas">
        {POOL_RAILS.map((r) => (
          <Choice key={r} on={value.rails === r} onClick={() => onChange({ ...value, rails: r })} swatch={RAIL[r]}>
            {RAIL_LABEL[r]}
          </Choice>
        ))}
      </Row>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11.5px] text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function Choice({
  on,
  onClick,
  swatch,
  children
}: {
  on: boolean
  onClick: () => void
  swatch?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-brutal border px-2 py-1 text-xs transition-colors',
        on ? 'border-acid bg-acid/5 text-foreground' : 'border-line text-muted-foreground hover:border-line-strong hover:text-foreground'
      )}
    >
      {swatch && <span aria-hidden className="h-3 w-3 shrink-0 rounded-full border border-line" style={{ backgroundColor: swatch }} />}
      {children}
    </button>
  )
}
