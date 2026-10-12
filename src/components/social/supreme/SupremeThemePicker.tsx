import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { ThemeSwatch } from '@/components/ThemeSwatch'
import { useSettings } from '@/lib/settings-context'
import { supremeThemeVars } from '@/lib/supreme-theme'
import type { OwnedColor } from '@/lib/supreme-shop'
import { ColorSelect } from './SupremeColorPicker'

export function SupremeThemePicker({ ownedColors }: { ownedColors: OwnedColor[] }) {
  const { settings, update } = useSettings()
  const cfg = settings.supremeTheme
  const set = (patch: Partial<typeof cfg>) => void update({ supremeTheme: { ...cfg, ...patch } })
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Modo do tema" className="flex gap-1">
        {(['dark', 'light'] as const).map((mode) => (
          <Button
            key={mode}
            size="sm"
            role="radio"
            aria-checked={cfg.mode === mode}
            variant={cfg.mode === mode ? 'default' : 'ghost'}
            onClick={() => set({ mode })}
          >
            {mode === 'dark' ? 'Escuro' : 'Claro'}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        <ColorSelect label="Cor 1" value={cfg.c1} options={ownedColors} onChange={(c1) => set({ c1 })} />
        <ColorSelect label="Cor 2" value={cfg.c2} options={ownedColors} onChange={(c2) => set({ c2 })} />
      </div>
      <ThemeSwatch theme="supremo" mode={cfg.mode} style={supremeThemeVars(cfg) as React.CSSProperties} />
      <Button size="sm" disabled={settings.theme === 'supremo'} onClick={() => void update({ theme: 'supremo' })}>
        {settings.theme === 'supremo' ? 'Em uso' : 'Usar tema'}
      </Button>
    </div>
  )
}
