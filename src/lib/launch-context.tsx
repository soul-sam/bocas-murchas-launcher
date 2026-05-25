import * as React from 'react'
import type { LaunchStatus } from '../../electron/preload/types'

interface LaunchContextValue {
  status: LaunchStatus
  launch: () => Promise<void>
}

const initialStatus: LaunchStatus = { stage: 'idle' }

const LaunchContext = React.createContext<LaunchContextValue | null>(null)

export function LaunchProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<LaunchStatus>(initialStatus)

  React.useEffect(() => {
    void window.bocas.game.status().then(setStatus)
    const off = window.bocas.game.onStatus(setStatus)
    return off
  }, [])

  const launch = React.useCallback(async () => {
    const s = await window.bocas.game.launch()
    setStatus(s)
  }, [])

  const value = React.useMemo<LaunchContextValue>(() => ({ status, launch }), [status, launch])
  return <LaunchContext.Provider value={value}>{children}</LaunchContext.Provider>
}

export function useLaunch(): LaunchContextValue {
  const ctx = React.useContext(LaunchContext)
  if (!ctx) throw new Error('useLaunch must be used within a LaunchProvider')
  return ctx
}
