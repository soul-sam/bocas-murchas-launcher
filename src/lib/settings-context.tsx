import * as React from 'react'
import type { LauncherSettings } from '../../electron/preload/types'

interface SettingsContextValue {
  settings: LauncherSettings | null
  loading: boolean
  isOpen: boolean
  open: () => void
  close: () => void
  update: (patch: Partial<LauncherSettings>) => Promise<void>
}

const SettingsContext = React.createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = React.useState<LauncherSettings | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [isOpen, setIsOpen] = React.useState(false)

  React.useEffect(() => {
    void window.bocas.settings.get().then((s) => {
      setSettings(s)
      setLoading(false)
    })
  }, [])

  const open = React.useCallback(() => setIsOpen(true), [])
  const close = React.useCallback(() => setIsOpen(false), [])

  const update = React.useCallback(async (patch: Partial<LauncherSettings>) => {
    const next = await window.bocas.settings.update(patch)
    setSettings(next)
  }, [])

  const value = React.useMemo<SettingsContextValue>(
    () => ({ settings, loading, isOpen, open, close, update }),
    [settings, loading, isOpen, open, close, update]
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = React.useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider')
  return ctx
}
