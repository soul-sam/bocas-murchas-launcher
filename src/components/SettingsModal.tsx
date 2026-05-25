import * as React from 'react'
import { Bell, MemoryStick, RotateCcw, Settings, Volume2, VolumeX, X } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { RAM_LIMITS } from '../../electron/preload/types'
import { Button } from '@/components/ui/button'

const DEFAULT_MAX_MB = 4096

function formatMb(mb: number): string {
  if (mb < 1024) return `${mb} MB`
  const gb = mb / 1024
  return Number.isInteger(gb) ? `${gb} GB` : `${gb.toFixed(1)} GB`
}

export function SettingsModal() {
  const { settings, isOpen, close, update } = useSettings()
  const [maxRamMb, setMaxRamMb] = React.useState<number>(settings?.maxRamMb ?? DEFAULT_MAX_MB)
  const [notifyOnJoinLeave, setNotifyOnJoinLeave] = React.useState<boolean>(
    settings?.notifyOnJoinLeave ?? true
  )
  const [soundEnabled, setSoundEnabled] = React.useState<boolean>(settings?.soundEnabled ?? true)
  const [soundVolume, setSoundVolume] = React.useState<number>(settings?.soundVolume ?? 0.5)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (isOpen && settings) {
      setMaxRamMb(settings.maxRamMb)
      setNotifyOnJoinLeave(settings.notifyOnJoinLeave)
      setSoundEnabled(settings.soundEnabled)
      setSoundVolume(settings.soundVolume)
    }
  }, [isOpen, settings])

  if (!isOpen || !settings) return null

  const dirty =
    maxRamMb !== settings.maxRamMb ||
    notifyOnJoinLeave !== settings.notifyOnJoinLeave ||
    soundEnabled !== settings.soundEnabled ||
    soundVolume !== settings.soundVolume

  async function save() {
    setSaving(true)
    try {
      await update({ maxRamMb, notifyOnJoinLeave, soundEnabled, soundVolume })
      close()
    } finally {
      setSaving(false)
    }
  }

  function resetToDefault() {
    setMaxRamMb(DEFAULT_MAX_MB)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/85 p-6 backdrop-blur-sm">
      <div className="card-acid w-full max-w-md rounded-brutal p-6 scanlines">
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Settings className="h-6 w-6 text-acid" />
            <div>
              <p className="font-display text-base uppercase tracking-widest text-foreground">
                Configurações
              </p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Aplicado no próximo launch
              </p>
            </div>
          </div>
          <button
            onClick={close}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-brutal border-2 border-border text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="ram-slider" className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                <MemoryStick className="h-3 w-3" />
                RAM máxima alocada
              </label>
              <button
                onClick={resetToDefault}
                className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-acid"
                title="Voltar pro padrão (4 GB)"
              >
                <RotateCcw className="h-3 w-3" />
                Padrão
              </button>
            </div>

            <input
              id="ram-slider"
              type="range"
              min={RAM_LIMITS.min}
              max={RAM_LIMITS.max}
              step={RAM_LIMITS.step}
              value={maxRamMb}
              onChange={(e) => setMaxRamMb(Number(e.target.value))}
              className="ram-slider w-full"
            />

            <div className="mt-2 flex items-end justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {formatMb(RAM_LIMITS.min)}
              </span>
              <span className="font-display text-3xl uppercase tracking-tight text-acid drop-shadow-[0_0_8px_rgba(106,255,0,0.4)]">
                {formatMb(maxRamMb)}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {formatMb(RAM_LIMITS.max)}
              </span>
            </div>

            <p className="mt-3 rounded-brutal border-2 border-border bg-muted/20 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Mais RAM = menos lag em modpack pesado. Não passa de ~50–75% da RAM total do PC.
            </p>
          </div>

          <div className="border-t border-border pt-4">
            <label className="flex cursor-pointer items-center justify-between">
              <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                <Bell className="h-3 w-3" />
                Notificar quando alguém entra/sai
              </span>
              <input
                type="checkbox"
                checked={notifyOnJoinLeave}
                onChange={(e) => setNotifyOnJoinLeave(e.target.checked)}
                className="h-4 w-4 accent-acid"
              />
            </label>
          </div>

          <div>
            <label className="flex cursor-pointer items-center justify-between">
              <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                {soundEnabled ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
                Efeitos sonoros
              </span>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
                className="h-4 w-4 accent-acid"
              />
            </label>
            {soundEnabled && (
              <div className="mt-3">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={soundVolume}
                  onChange={(e) => setSoundVolume(Number(e.target.value))}
                  className="ram-slider w-full"
                  aria-label="Volume"
                />
                <div className="mt-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>0%</span>
                  <span className="text-acid">{Math.round(soundVolume * 100)}%</span>
                  <span>100%</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <Button variant="outline" onClick={close} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={!dirty || saving} className="flex-1">
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
