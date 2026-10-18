import * as React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './auth-context'
import { useSocketClient } from './socket-context'
import { useAfk } from './afk-context'
import { useLayout } from './layout-context'
import { isPopout } from './platform'
import {
  pendencias as pendenciasApi,
  type Pendencia,
  type PendenciaAviso
} from './api-pendencias'

/**
 * PENDÊNCIAS — o que o grupo espera de mim, fora do chat.
 *
 * O censo de 13/10 mostrou que ninguém lê o chat de trás pra frente: agenda
 * com 0 de 10 respostas, clipe sem nenhuma reação. Então a pendência não
 * depende de rolar a conversa. Ela aparece em quatro lugares:
 *
 * 1. o sino na barra de ícones, com o número em vermelho;
 * 2. a bolinha na barra de tarefas e o item na bandeja (tray.setPendencias),
 *    com a janela piscando quando o número sobe e ela está fora de foco;
 * 3. o cartão "enquanto você estava fora" no canto, que abre sozinho quando
 *    há algo que a pessoa ainda não viu (ao abrir o launcher, ao voltar do
 *    AFK, ou quando o servidor manda lembrar) e deixa responder ali mesmo;
 * 4. a notificação do Windows (ou da sobreposição, em jogo), quando o
 *    servidor decide que é hora de lembrar (`pendencias:aviso`).
 *
 * A lista é do servidor (GET /pendencias) e é RELIDA a cada
 * `pendencias:changed` — a mesma escolha da AgendaPanel: recarregar garante
 * a regra do servidor (quem deve o quê, até quando) sem duplicá-la aqui.
 *
 * "Vistas" (localStorage, por pessoa) são as pendências que já passaram pelo
 * cartão do canto e a pessoa fechou: não reabrem o cartão sozinhas. Continuam
 * no sino até serem respondidas — fechar o cartão não é responder.
 */

interface PendenciasContextValue {
  items: Pendencia[]
  count: number
  loading: boolean
  refresh: () => Promise<void>
  /** A resposta foi dada por aqui: some da lista na hora, o servidor confirma depois. */
  resolvido: (id: string) => void
  /** "Não quero": some da lista e da cobrança. */
  dispensar: (item: Pendencia) => Promise<void>
  /** Vai pra tela social e abre o painel. */
  abrirPainel: () => void
  /** Cartão "enquanto você estava fora". */
  chegadaAberta: boolean
  fecharChegada: () => void
}

const PendenciasContext = React.createContext<PendenciasContextValue | null>(null)

const REFRESH_DEBOUNCE_MS = 400

function chaveVistas(userId: string): string {
  return `bocas:pendencias-vistas:${userId}`
}

function lerVistas(userId: string): Set<string> {
  try {
    const bruto = window.localStorage.getItem(chaveVistas(userId))
    const lista = bruto ? JSON.parse(bruto) : []
    return new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function gravarVistas(userId: string, ids: Iterable<string>): void {
  try {
    window.localStorage.setItem(chaveVistas(userId), JSON.stringify([...ids].slice(-200)))
  } catch {
    // Sem storage (aba anônima): o cartão só reabre mais vezes.
  }
}

export function PendenciasProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth()
  const { socket } = useSocketClient()
  const { afk } = useAfk()
  const { openPendencias } = useLayout()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const popout = isPopout()

  const [items, setItems] = React.useState<Pendencia[]>([])
  const [loading, setLoading] = React.useState(true)
  const [chegadaAberta, setChegadaAberta] = React.useState(false)

  const itemsRef = React.useRef<Pendencia[]>([])
  itemsRef.current = items
  const userId = user?.id ?? null

  /** Abre o cartão se houver pendência que a pessoa ainda não fechou no cartão. */
  const abrirSeHouverNovidade = React.useCallback(
    (lista: Pendencia[]) => {
      if (!userId || popout || lista.length === 0) return
      const vistas = lerVistas(userId)
      if (lista.some((p) => !vistas.has(p.id))) setChegadaAberta(true)
    },
    [userId, popout]
  )

  const primeiraCarga = React.useRef(true)

  const refresh = React.useCallback(async () => {
    if (!token) return
    try {
      const lista = await pendenciasApi.list(token)
      setItems(lista)
      if (lista.length === 0) setChegadaAberta(false)
      // Abriu o launcher: o que nasceu enquanto estava fechado aparece no canto.
      if (primeiraCarga.current) {
        primeiraCarga.current = false
        abrirSeHouverNovidade(lista)
      }
    } catch {
      // Servidor sem a rota (API antiga) ou fora do ar: sem sino, sem drama.
    } finally {
      setLoading(false)
    }
  }, [token, abrirSeHouverNovidade])

  React.useEffect(() => {
    primeiraCarga.current = true
    void refresh()
  }, [refresh])

  // Socket: relê quando a lista muda; reconectou, relê (perdeu o que mudou).
  React.useEffect(() => {
    if (!socket) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const agendar = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS)
    }

    const aoAvisar = (aviso: PendenciaAviso): void => {
      void refresh()
      if (popout) return
      // O servidor decidiu que é hora de lembrar: o cartão abre de novo mesmo
      // pro que já tinha sido fechado (é o "é amanhã", "começa em 3h").
      setChegadaAberta(true)
      if (!document.hasFocus()) {
        void window.bocas.notify.show({
          title: aviso.title,
          body: aviso.body,
          command: 'open-pendencias'
        })
      }
    }

    socket.on('pendencias:changed', agendar)
    socket.on('connect', agendar)
    socket.on('pendencias:aviso', aoAvisar)
    return () => {
      if (timer) clearTimeout(timer)
      socket.off('pendencias:changed', agendar)
      socket.off('connect', agendar)
      socket.off('pendencias:aviso', aoAvisar)
    }
  }, [socket, refresh, popout])

  // Voltou do AFK: o que chegou enquanto estava fora aparece no canto.
  const estavaAfk = React.useRef(afk)
  React.useEffect(() => {
    if (estavaAfk.current && !afk) abrirSeHouverNovidade(itemsRef.current)
    estavaAfk.current = afk
  }, [afk, abrirSeHouverNovidade])

  // Número fora da janela: barra de tarefas, bandeja, ícone do PWA.
  const count = items.length
  React.useEffect(() => {
    if (popout) return
    void window.bocas.tray.setPendencias(count).catch(() => undefined)
  }, [count, popout])

  const abrirPainel = React.useCallback(() => {
    if (pathname !== '/') navigate('/')
    openPendencias()
    setChegadaAberta(false)
  }, [pathname, navigate, openPendencias])

  // Item da bandeja e clique na notificação.
  React.useEffect(() => {
    if (popout) return
    return window.bocas.tray.onCommand((payload) => {
      if (payload.command === 'open-pendencias') abrirPainel()
    })
  }, [abrirPainel, popout])

  const fecharChegada = React.useCallback(() => {
    setChegadaAberta(false)
    if (!userId) return
    const vistas = lerVistas(userId)
    for (const p of itemsRef.current) vistas.add(p.id)
    gravarVistas(userId, vistas)
  }, [userId])

  const resolvido = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const dispensar = React.useCallback(
    async (item: Pendencia) => {
      if (!token) return
      resolvido(item.id)
      try {
        await pendenciasApi.dispensar(token, item.kind, item.refId)
      } catch {
        void refresh()
      }
    },
    [token, resolvido, refresh]
  )

  React.useEffect(() => {
    if (items.length === 0) setChegadaAberta(false)
  }, [items.length])

  const value = React.useMemo<PendenciasContextValue>(
    () => ({
      items,
      count,
      loading,
      refresh,
      resolvido,
      dispensar,
      abrirPainel,
      chegadaAberta,
      fecharChegada
    }),
    [items, count, loading, refresh, resolvido, dispensar, abrirPainel, chegadaAberta, fecharChegada]
  )

  return <PendenciasContext.Provider value={value}>{children}</PendenciasContext.Provider>
}

export function usePendencias(): PendenciasContextValue {
  const ctx = React.useContext(PendenciasContext)
  if (!ctx) throw new Error('usePendencias precisa do PendenciasProvider')
  return ctx
}
