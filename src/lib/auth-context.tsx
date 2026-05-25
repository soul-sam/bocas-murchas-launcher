import * as React from 'react'
import { auth, type AuthUser, ApiError } from './api'

interface AuthState {
  user: AuthUser | null
  token: string | null
  loading: boolean
}

interface AuthContextValue extends AuthState {
  login: (identifier: string, password: string) => Promise<void>
  register: (payload: {
    username: string
    email: string
    password: string
    displayName: string
    inviteCode: string
  }) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>({
    user: null,
    token: null,
    loading: true
  })

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const stored = await window.bocas.auth.loadToken()
        if (!stored) {
          if (!cancelled) setState({ user: null, token: null, loading: false })
          return
        }
        try {
          const user = await auth.me(stored)
          if (!cancelled) setState({ user, token: stored, loading: false })
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            await window.bocas.auth.clearToken()
          }
          if (!cancelled) setState({ user: null, token: null, loading: false })
        }
      } catch {
        if (!cancelled) setState({ user: null, token: null, loading: false })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const login = React.useCallback(async (identifier: string, password: string) => {
    const res = await auth.login(identifier, password)
    await window.bocas.auth.saveToken(res.token)
    setState({ user: res.user, token: res.token, loading: false })
  }, [])

  const register = React.useCallback(
    async (payload: {
      username: string
      email: string
      password: string
      displayName: string
      inviteCode: string
    }) => {
      const res = await auth.register(payload)
      await window.bocas.auth.saveToken(res.token)
      setState({ user: res.user, token: res.token, loading: false })
    },
    []
  )

  const logout = React.useCallback(async () => {
    await window.bocas.auth.clearToken()
    setState({ user: null, token: null, loading: false })
  }, [])

  const value = React.useMemo<AuthContextValue>(
    () => ({ ...state, login, register, logout }),
    [state, login, register, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
