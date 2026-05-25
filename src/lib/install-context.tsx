import * as React from 'react'
import type { InstallStatus } from '../../electron/preload/types'

interface InstallContextValue {
  status: InstallStatus
  /** Manual re-verify (full SHA1 of every file). Triggered by user. */
  recheck: () => Promise<void>
}

const initialStatus: InstallStatus = {
  stage: 'idle',
  current: 0,
  total: 0
}

const InstallContext = React.createContext<InstallContextValue | null>(null)

export function InstallProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<InstallStatus>(initialStatus)

  React.useEffect(() => {
    const off = window.bocas.install.onProgress(setStatus)

    // On mount: load current status. If idle (fresh app start), auto-kick
    // a quick-check pass so users land on a "Tudo pronto" state without
    // having to click anything.
    void (async () => {
      const current = await window.bocas.install.status()
      setStatus(current)
      if (current.stage === 'idle') {
        await window.bocas.install.start({ quickCheck: true })
      }
    })()

    return off
  }, [])

  const recheck = React.useCallback(async () => {
    await window.bocas.install.start({ quickCheck: false })
  }, [])

  const value = React.useMemo<InstallContextValue>(() => ({ status, recheck }), [status, recheck])

  return <InstallContext.Provider value={value}>{children}</InstallContext.Provider>
}

export function useInstall(): InstallContextValue {
  const ctx = React.useContext(InstallContext)
  if (!ctx) throw new Error('useInstall must be used within an InstallProvider')
  return ctx
}
