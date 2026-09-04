import * as React from 'react'
import type { UpdaterStatus } from '../../electron/preload/types'

interface UpdaterContextValue {
  status: UpdaterStatus
  /** Procura versao nova agora. O download comeca sozinho se achar. */
  check: () => Promise<void>
  /** Reinicia aplicando o que ja foi baixado. */
  applyUpdate: () => Promise<void>
}

const initial: UpdaterStatus = { stage: 'idle' }

const UpdaterContext = React.createContext<UpdaterContextValue | null>(null)

export function UpdaterProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<UpdaterStatus>(initial)

  React.useEffect(() => {
    void window.bocas.updater.status().then(setStatus)
    const off = window.bocas.updater.onStatus(setStatus)
    return off
  }, [])

  const check = React.useCallback(async () => {
    setStatus(await window.bocas.updater.check())
  }, [])

  const applyUpdate = React.useCallback(async () => {
    await window.bocas.updater.quitAndInstall()
  }, [])

  const value = React.useMemo<UpdaterContextValue>(
    () => ({ status, check, applyUpdate }),
    [status, check, applyUpdate]
  )
  return <UpdaterContext.Provider value={value}>{children}</UpdaterContext.Provider>
}

export function useUpdater(): UpdaterContextValue {
  const ctx = React.useContext(UpdaterContext)
  if (!ctx) throw new Error('useUpdater must be used within an UpdaterProvider')
  return ctx
}
