import * as React from 'react'
import type { DeviceCodeInfo, McAuthProgressEvent } from '../../electron/preload/types'

interface McProfile {
  id: string
  name: string
}

type ModalState =
  | { kind: 'closed' }
  | { kind: 'awaiting'; code: DeviceCodeInfo; startedAt: number }
  | { kind: 'expired' }
  | { kind: 'error'; message: string; code?: string }

interface McAuthState {
  profile: McProfile | null
  loading: boolean
  modal: ModalState
}

interface McAuthContextValue {
  profile: McProfile | null
  loading: boolean
  modal: ModalState
  connect: () => Promise<void>
  cancel: () => Promise<void>
  closeModal: () => void
  disconnect: () => Promise<void>
}

const McAuthContext = React.createContext<McAuthContextValue | null>(null)

export function McAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<McAuthState>({
    profile: null,
    loading: true,
    modal: { kind: 'closed' }
  })

  React.useEffect(() => {
    let cancelled = false
    void window.bocas.mcAuth.getProfile().then((profile) => {
      if (!cancelled) setState((s) => ({ ...s, profile, loading: false }))
    })

    const off = window.bocas.mcAuth.onProgress((event: McAuthProgressEvent) => {
      switch (event.state) {
        case 'awaiting':
          // Already shown when start() returned. Refresh in case of new code.
          setState((s) => ({
            ...s,
            modal: { kind: 'awaiting', code: event.code, startedAt: Date.now() }
          }))
          break
        case 'success':
          setState({
            profile: event.profile,
            loading: false,
            modal: { kind: 'closed' }
          })
          break
        case 'expired':
          setState((s) => ({ ...s, modal: { kind: 'expired' } }))
          break
        case 'cancelled':
          setState((s) => ({ ...s, modal: { kind: 'closed' } }))
          break
        case 'error':
          setState((s) => ({
            ...s,
            modal: { kind: 'error', message: event.error.message, code: event.error.code }
          }))
          break
      }
    })

    return () => {
      cancelled = true
      off()
    }
  }, [])

  const connect = React.useCallback(async () => {
    const result = await window.bocas.mcAuth.start()
    if (result.ok) {
      setState((s) => ({
        ...s,
        modal: { kind: 'awaiting', code: result.code, startedAt: Date.now() }
      }))
    } else {
      setState((s) => ({
        ...s,
        modal: { kind: 'error', message: result.error.message, code: result.error.code }
      }))
    }
  }, [])

  const cancel = React.useCallback(async () => {
    await window.bocas.mcAuth.cancel()
    setState((s) => ({ ...s, modal: { kind: 'closed' } }))
  }, [])

  const closeModal = React.useCallback(() => {
    setState((s) => ({ ...s, modal: { kind: 'closed' } }))
  }, [])

  const disconnect = React.useCallback(async () => {
    await window.bocas.mcAuth.logout()
    setState({ profile: null, loading: false, modal: { kind: 'closed' } })
  }, [])

  const value = React.useMemo<McAuthContextValue>(
    () => ({
      profile: state.profile,
      loading: state.loading,
      modal: state.modal,
      connect,
      cancel,
      closeModal,
      disconnect
    }),
    [state, connect, cancel, closeModal, disconnect]
  )

  return <McAuthContext.Provider value={value}>{children}</McAuthContext.Provider>
}

export function useMcAuth(): McAuthContextValue {
  const ctx = React.useContext(McAuthContext)
  if (!ctx) throw new Error('useMcAuth must be used within a McAuthProvider')
  return ctx
}
