import * as React from 'react'
import { DEFAULT_SETTINGS, type LauncherSettings } from '../../electron/preload/types'

interface SettingsContextValue {
  /**
   * Nunca e null: enquanto o arquivo nao carrega, valem os defaults. Antes isso
   * era `LauncherSettings | null` e cada componente social precisaria de um
   * `settings?.voice?.mode` — com uma arvore desse tamanho, um esquecimento
   * viraria tela branca.
   */
  settings: LauncherSettings
  loading: boolean
  isOpen: boolean
  open: () => void
  close: () => void
  update: (patch: Partial<LauncherSettings>) => Promise<void>
}

const SettingsContext = React.createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = React.useState<LauncherSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = React.useState(true)
  const [isOpen, setIsOpen] = React.useState(false)

  React.useEffect(() => {
    void window.bocas.settings.get().then((s) => {
      setSettings(s)
      setLoading(false)
    })
  }, [])

  // O tema e um atributo do <html>: as cinco folhas de token em globals.css
  // escolhem os valores por `data-theme`, e nenhum componente precisa saber
  // qual esta ativo. Aplicado aqui (e nao no App) pra valer tambem nas telas
  // de login/cadastro, que ficam fora da casca autenticada.
  React.useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

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
