import * as React from 'react'
import type { ServerStatus } from '../../electron/preload/types'

interface ServerStatusContextValue {
  status: ServerStatus | null
  refresh: () => Promise<void>
  refreshing: boolean
}

const ServerStatusContext = React.createContext<ServerStatusContextValue | null>(null)

export function ServerStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<ServerStatus | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    void window.bocas.serverStatus.get().then((s) => {
      if (alive) setStatus(s)
    })
    const off = window.bocas.serverStatus.onStatus((s) => setStatus(s))
    return () => {
      alive = false
      off()
    }
  }, [])

  const refresh = React.useCallback(async () => {
    setRefreshing(true)
    try {
      const next = await window.bocas.serverStatus.refresh()
      setStatus(next)
    } finally {
      setRefreshing(false)
    }
  }, [])

  return (
    <ServerStatusContext.Provider value={{ status, refresh, refreshing }}>
      {children}
    </ServerStatusContext.Provider>
  )
}

export function useServerStatus(): ServerStatusContextValue {
  const ctx = React.useContext(ServerStatusContext)
  if (!ctx) throw new Error('useServerStatus deve estar dentro de ServerStatusProvider')
  return ctx
}
