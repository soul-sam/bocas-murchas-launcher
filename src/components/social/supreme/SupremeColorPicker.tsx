import * as React from 'react'
import { Button } from '@/components/ui/button'
import { nameStyle } from '@/lib/api-gamification'
import type { OwnedColor } from '@/lib/supreme-shop'

/** Select nativo com uma bolinha da cor ao lado: só as cores de nome que a pessoa tem. */
export function ColorSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: string
  options: OwnedColor[]
  onChange(color: string): void
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11.5px] text-muted-foreground">
      {label}
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="h-4 w-4 shrink-0 rounded-full border border-line-strong" style={{ background: value || undefined }} />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded-brutal border border-line bg-void px-1.5 py-1 text-xs text-foreground"
        >
          {!options.some((o) => o.color.toLowerCase() === value.toLowerCase()) && <option value={value}>—</option>}
          {options.map((o) => (
            <option key={o.id} value={o.color}>
              {o.name}
            </option>
          ))}
        </select>
      </span>
    </label>
  )
}

export function SupremeColorPicker({
  ownedColors,
  current,
  onEquip,
  name
}: {
  ownedColors: OwnedColor[]
  current: [string, string] | null
  onEquip(colors: [string, string]): Promise<void>
  name: string
}) {
  const [a, setA] = React.useState(current?.[0] ?? ownedColors[0]?.color ?? '')
  const [b, setB] = React.useState(current?.[1] ?? ownedColors[1]?.color ?? '')
  const [busy, setBusy] = React.useState(false)
  const pair: [string, string] = [a, b]
  const valid = !!a && !!b && a.toLowerCase() !== b.toLowerCase()
  return (
    <div className="flex flex-col gap-2">
      <p className="name-gradient truncate font-display text-base" style={valid ? nameStyle(null, `${a},${b}`) : undefined}>
        {name}
      </p>
      <div className="flex gap-2">
        <ColorSelect label="Cor 1" value={a} options={ownedColors} onChange={setA} />
        <ColorSelect label="Cor 2" value={b} options={ownedColors} onChange={setB} />
      </div>
      {!valid && a && b && <p className="text-[11.5px] text-muted-foreground">Escolha duas cores diferentes.</p>}
      <Button
        size="sm"
        disabled={!valid || busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onEquip(pair)
          } finally {
            setBusy(false)
          }
        }}
      >
        Equipar
      </Button>
    </div>
  )
}
