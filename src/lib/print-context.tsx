import * as React from 'react'
import { useAuth } from './auth-context'
import { useSocket } from './socket-context'
import { printApi, type PrintState } from './api-print'

/**
 * Estado da impressora 3D pra tela.
 *
 * Uma requisição só (`/print/state`) traz impressora, fila, cota e permissão —
 * a página não precisa costurar quatro chamadas pra desenhar a primeira vez.
 *
 * Sobre a atualização: quando o agente da impressora existir, ele empurra
 * telemetria por socket e isto passa a ouvir `print:*`. Enquanto não existe,
 * um poll de 15s enquanto a aba está aberta é honesto e barato — e o
 * `visibilitychange` evita ficar batendo na API com o launcher minimizado na
 * bandeja, que é onde ele passa a maior parte do dia.
 */

interface PrintContextValue {
  state: PrintState | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  refreshing: boolean
}

const PrintContext = React.createContext<PrintContextValue | null>(null)

const POLL_MS = 15_000

export function PrintProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  const { socket } = useSocket()
  const [state, setState] = React.useState<PrintState | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(
    async (silent = false) => {
      if (!token) return
      if (!silent) setRefreshing(true)
      try {
        setState(await printApi.state(token))
        setError(null)
      } catch (err) {
        // Silencioso não apaga o que está na tela: um poll que falhou por
        // oscilação de rede não deve limpar a fila que a pessoa está lendo.
        if (!silent) setError(err instanceof Error ? err.message : 'Erro ao ler a impressora')
      } finally {
        setLoading(false)
        if (!silent) setRefreshing(false)
      }
    },
    [token]
  )

  React.useEffect(() => {
    if (!token) {
      setState(null)
      setLoading(false)
      return
    }

    let alive = true
    void load()

    const timer = setInterval(() => {
      if (!alive) return
      if (document.hidden) return
      void load(true)
    }, POLL_MS)

    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [token, load])

  // O backend emite os eventos da impressora desde que o agente existe; o poll
  // virou rede de segurança.
  React.useEffect(() => {
    if (!socket) return
    const onChange = (): void => void load(true)

    /**
     * Telemetria é evento PRÓPRIO, e não recarrega a tela.
     *
     * `print:job` refaz `/print/state` inteiro — mandar isso a cada barra de
     * progresso seria uma consulta completa de fila a cada 5 s durante nove
     * horas de impressão, vezes quantas janelas estiverem abertas. Aqui chega
     * só o número, e ele é costurado na peça que já está desenhada.
     */
    const onTelemetry = (payload: {
      jobId?: string
      progress?: number | null
      currLayer?: number | null
      totalLayers?: number | null
      remainSeconds?: number | null
      stage?: string | null
      percent?: number | null
    }): void => {
      setState((prev) => {
        if (!prev?.running || !payload?.jobId || prev.running.id !== payload.jobId) return prev
        return {
          ...prev,
          running: {
            ...prev.running,
            progress: payload.progress ?? prev.running.progress,
            currLayer: payload.currLayer ?? prev.running.currLayer,
            totalLayers: payload.totalLayers ?? prev.running.totalLayers,
            remainSeconds: payload.remainSeconds ?? prev.running.remainSeconds,
            stage: payload.stage ?? null,
            stagePercent: payload.stage ? (payload.percent ?? 0) : null,
            // Chegou número novo: a barra voltou a ser verdade.
            telemetryStale: false
          }
        }
      })
    }

    // Luz: só o booleano muda, não vale refazer `/print/state`.
    const onLight = (payload: { on?: boolean | null }): void => {
      setState((prev) =>
        prev ? { ...prev, printer: { ...prev.printer, lightOn: payload?.on ?? null } } : prev
      )
    }

    socket.on('print:queue', onChange)
    socket.on('print:printer', onChange)
    socket.on('print:job', onChange)
    socket.on('print:telemetry', onTelemetry)
    socket.on('print:light', onLight)
    return () => {
      socket.off('print:queue', onChange)
      socket.off('print:printer', onChange)
      socket.off('print:job', onChange)
      socket.off('print:telemetry', onTelemetry)
      socket.off('print:light', onLight)
    }
  }, [socket, load])

  const value = React.useMemo(
    () => ({ state, loading, error, refresh: () => load(), refreshing }),
    [state, loading, error, load, refreshing]
  )

  return <PrintContext.Provider value={value}>{children}</PrintContext.Provider>
}

export function usePrint(): PrintContextValue {
  const ctx = React.useContext(PrintContext)
  if (!ctx) throw new Error('usePrint deve estar dentro de PrintProvider')
  return ctx
}
