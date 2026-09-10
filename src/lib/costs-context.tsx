import * as React from 'react'
import { costs as costsApi, type CostSummary } from './api-costs'
import { useAuth } from './auth-context'

/**
 * A CONTA DA HOSPEDAGEM — quanto custa manter isto de pé e quanto cabe a cada um.
 *
 * Um estado só pra dois lugares: a faixa no topo (components/social/
 * CostShareBanner) e a tela com a explicação e o Pix (components/CostsModal).
 * Se cada um buscasse o seu, marcar "paguei" na tela deixaria a faixa em pé
 * até o próximo recarregamento — que é exatamente o que ela não pode fazer.
 *
 * Recarrega sozinho de hora em hora porque o mês vira: quem deixa o launcher
 * aberto de 30 pra 1º precisa ver a conta do mês novo sem reabrir nada.
 */

/** O mês vira à meia-noite; de hora em hora é de sobra pra perceber. */
const REFRESH_MS = 60 * 60 * 1000

interface CostsContextValue {
  summary: CostSummary | null
  /** Já tentou buscar (deu certo ou não). Evita a faixa piscar na abertura. */
  ready: boolean
  refresh: () => Promise<void>
  markPaid: () => Promise<void>
  unmarkPaid: () => Promise<void>
}

const CostsContext = React.createContext<CostsContextValue | null>(null)

export function CostsProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  const [summary, setSummary] = React.useState<CostSummary | null>(null)
  const [ready, setReady] = React.useState(false)

  const refresh = React.useCallback(async () => {
    if (!token) return
    try {
      setSummary(await costsApi.get(token))
    } catch {
      // Sem a conta na tela o app funciona igual. Falhar aqui não pode
      // atrapalhar quem só quer entrar na call.
    } finally {
      setReady(true)
    }
  }, [token])

  React.useEffect(() => {
    if (!token) {
      setSummary(null)
      setReady(false)
      return
    }
    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [token, refresh])

  const markPaid = React.useCallback(async () => {
    if (!token) return
    setSummary(await costsApi.markPaid(token))
  }, [token])

  const unmarkPaid = React.useCallback(async () => {
    if (!token) return
    setSummary(await costsApi.unmarkPaid(token))
  }, [token])

  const value = React.useMemo<CostsContextValue>(
    () => ({ summary, ready, refresh, markPaid, unmarkPaid }),
    [summary, ready, refresh, markPaid, unmarkPaid]
  )

  return <CostsContext.Provider value={value}>{children}</CostsContext.Provider>
}

export function useCosts(): CostsContextValue {
  const ctx = React.useContext(CostsContext)
  if (!ctx) throw new Error('useCosts must be used within a CostsProvider')
  return ctx
}
