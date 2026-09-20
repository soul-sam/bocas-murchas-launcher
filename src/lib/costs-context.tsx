import * as React from 'react'
import { costs as costsApi, type CostSummary } from './api-costs'
import { useAuth } from './auth-context'
import { useSocket } from './socket-context'
import { useSettings } from './settings-context'
import { playUiSound } from './ui-sounds'

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
 *
 * E recarrega NA HORA quando o servidor avisa (`costs:changed`): quem confirma
 * um Pix numa janela precisa ver a fila encolher na outra, e quem foi
 * confirmado precisa entrar na lista sem esperar a hora cheia.
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
  /** Só vale pra quem confirma (o servidor recusa o resto com 403). */
  confirmPaid: (userId: string) => Promise<void>
  rejectPaid: (userId: string) => Promise<void>
}

const CostsContext = React.createContext<CostsContextValue | null>(null)

export function CostsProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  const { socket } = useSocket()
  const { settings } = useSettings()
  const [summary, setSummary] = React.useState<CostSummary | null>(null)
  const [ready, setReady] = React.useState(false)

  /** Por ref: os handlers do socket são registrados uma vez e não devem
      ficar presos ao volume de quando o launcher abriu. */
  const settingsRef = React.useRef(settings)
  settingsRef.current = settings

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

  const confirmPaid = React.useCallback(
    async (userId: string) => {
      if (!token) return
      setSummary(await costsApi.confirm(token, userId))
    },
    [token]
  )

  const rejectPaid = React.useCallback(
    async (userId: string) => {
      if (!token) return
      setSummary(await costsApi.reject(token, userId))
    },
    [token]
  )

  /**
   * O que o servidor manda enquanto a tela está aberta.
   *
   * `costs:changed` é pra todo mundo e só refaz a conta. Os outros dois são
   * dirigidos e viram AVISO: `costs:pending` chega em quem confirma quando
   * alguém marca, e `costs:undone` em quem teve a marcação desfeita — esse
   * segundo importa porque, sem ele, a marcação sumiria da tela sozinha e a
   * cobrança voltaria sem nenhuma explicação.
   *
   * O push do celular é o outro lado disto e mora na API: ele só dispara pra
   * quem está com tudo fechado, então os dois nunca chegam juntos.
   */
  React.useEffect(() => {
    if (!socket) return

    const onChanged = (): void => void refresh()

    const onPending = (data: { displayName?: string }): void => {
      const s = settingsRef.current
      void window.bocas.notify.show({
        title: 'Tem Pix pra conferir',
        body: `${data?.displayName ?? 'Alguém'} marcou que pagou a parte do mês.`,
        silent: !s.soundEnabled
      })
      playUiSound('mention', s.soundEnabled ? s.soundVolume : 0)
      void refresh()
    }

    const onUndone = (data: { title?: string; body?: string }): void => {
      const s = settingsRef.current
      void window.bocas.notify.show({
        title: data?.title ?? 'Sua marcação da vaquinha foi desfeita',
        body: data?.body ?? 'É só marcar de novo quando pagar.',
        silent: !s.soundEnabled
      })
      void refresh()
    }

    socket.on('costs:changed', onChanged)
    socket.on('costs:pending', onPending)
    socket.on('costs:undone', onUndone)

    return () => {
      socket.off('costs:changed', onChanged)
      socket.off('costs:pending', onPending)
      socket.off('costs:undone', onUndone)
    }
  }, [socket, refresh])

  const value = React.useMemo<CostsContextValue>(
    () => ({ summary, ready, refresh, markPaid, unmarkPaid, confirmPaid, rejectPaid }),
    [summary, ready, refresh, markPaid, unmarkPaid, confirmPaid, rejectPaid]
  )

  return <CostsContext.Provider value={value}>{children}</CostsContext.Provider>
}

export function useCosts(): CostsContextValue {
  const ctx = React.useContext(CostsContext)
  if (!ctx) throw new Error('useCosts must be used within a CostsProvider')
  return ctx
}
