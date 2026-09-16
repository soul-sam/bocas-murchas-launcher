import * as React from 'react'
import { auth, setUnauthorizedHandler, tokenExpiresAt, type AuthUser, ApiError } from './api'

/**
 * A SESSÃO — e por que ela se renova sozinha.
 *
 * O token da API vale 7 dias e o launcher fica aberto dias seguidos. Antes,
 * quando ele vencia NO MEIO da sessão, nada acontecia na tela: o usuário está
 * na memória desta janela, então o app continuava logado enquanto o servidor
 * recusava tudo. Cada contexto engolia o 401 no seu `catch {}` e o estrago
 * aparecia espalhado — a aposta que não entra, o saldo e as estatísticas
 * parados no último valor que deu certo, a sobreposição dizendo "Token
 * inválido ou expirado" em cima do jogo, o socket preso em "Reconectando...".
 *
 * Agora são dois mecanismos, e um cobre o outro:
 *
 *   1. RENOVAÇÃO — faltando menos de `RENEW_WHEN_LEFT_MS` pro vencimento, o
 *      token é trocado por outro de 7 dias. Quem abre o launcher na semana
 *      nunca mais chega no vencimento.
 *   2. QUEDA DE VERDADE — 401 em QUALQUER chamada com token derruba a sessão
 *      na hora (`setUnauthorizedHandler`), limpa o cofre e devolve a tela de
 *      login com o aviso de que ela venceu. É o caminho de quem ficou mais de
 *      7 dias sem abrir, e a rede de segurança se a renovação falhar.
 */

/**
 * Quando falta menos que isto, renova. Dois dias dão folga de sobra: a troca
 * só precisa pegar o launcher aberto uma vez em cinco dias.
 */
const RENEW_WHEN_LEFT_MS = 2 * 24 * 60 * 60 * 1000
/** De quanto em quanto tempo olhamos o relógio do token. */
const RENEW_CHECK_MS = 60 * 60 * 1000

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
  /** Aplica localmente o perfil salvo, sem precisar refazer o /auth/me. */
  applyUser: (user: AuthUser) => void
  /**
   * A sessão caiu SOZINHA (token vencido ou recusado), e não por clique em
   * sair. É o que a tela de login lê pra explicar por que a pessoa voltou pra
   * lá do nada.
   */
  expired: boolean
  /** Derruba a sessão agora. Idempotente: o 401 costuma vir de várias chamadas juntas. */
  expireSession: () => void
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>({
    user: null,
    token: null,
    loading: true
  })
  const [expired, setExpired] = React.useState(false)

  const expireSession = React.useCallback(() => {
    setExpired(true)
    // O cofre é do processo main: limpar é assíncrono e pode falhar (disco,
    // safeStorage). A tela não espera por isso — quem tira a pessoa de dentro
    // do app é o estado daqui.
    void window.bocas.auth.clearToken().catch(() => {})
    setState((prev) =>
      prev.user || prev.token ? { user: null, token: null, loading: false } : prev
    )
  }, [])

  /**
   * Qualquer 401 com token na mão cai aqui, venha de onde vier — inclusive do
   * poll de apostas e do avatar que estava subindo.
   */
  React.useEffect(() => {
    setUnauthorizedHandler(expireSession)
    return () => setUnauthorizedHandler(null)
  }, [expireSession])

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

  /**
   * A renovação.
   *
   * Roda ao entrar, de hora em hora e toda vez que a janela volta pro foco —
   * essa última é a que importa numa máquina que dorme: o timer não corre
   * enquanto o Windows está suspenso, e quem abre o launcher de manhã depois
   * de uma semana precisa da troca ANTES da primeira aposta.
   */
  React.useEffect(() => {
    const token = state.token
    if (!token) return

    let cancelled = false

    const renewIfNeeded = async (): Promise<void> => {
      const expiresAt = tokenExpiresAt(token)
      // Token sem `exp` legível: não dá pra decidir nada. Deixa quieto — o 401
      // da próxima chamada resolve, e é melhor que renovar de hora em hora à toa.
      if (expiresAt === null) return
      if (expiresAt - Date.now() > RENEW_WHEN_LEFT_MS) return

      try {
        const fresh = await auth.refresh(token)
        await window.bocas.auth.saveToken(fresh)
        if (cancelled) return
        // Só o token muda: o usuário continua o mesmo, e trocar o objeto dele
        // aqui remontaria meio app por nada.
        setState((prev) => (prev.token === token ? { ...prev, token: fresh } : prev))
      } catch {
        // 401 já derrubou a sessão pelo caminho de cima. Qualquer outro erro é
        // rede ou servidor fora: tenta de novo no próximo tique, ainda dentro
        // da folga de dois dias.
      }
    }

    void renewIfNeeded()
    const timer = setInterval(() => void renewIfNeeded(), RENEW_CHECK_MS)
    const onFocus = (): void => void renewIfNeeded()
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [state.token])

  const login = React.useCallback(async (identifier: string, password: string) => {
    const res = await auth.login(identifier, password)
    await window.bocas.auth.saveToken(res.token)
    setExpired(false)
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
      setExpired(false)
      setState({ user: res.user, token: res.token, loading: false })
    },
    []
  )

  const logout = React.useCallback(async () => {
    await window.bocas.auth.clearToken()
    setExpired(false)
    setState({ user: null, token: null, loading: false })
  }, [])

  const applyUser = React.useCallback((user: AuthUser) => {
    setState((prev) => (prev.user ? { ...prev, user: { ...prev.user, ...user } } : prev))
  }, [])

  const value = React.useMemo<AuthContextValue>(
    () => ({ ...state, expired, login, register, logout, applyUser, expireSession }),
    [state, expired, login, register, logout, applyUser, expireSession]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
