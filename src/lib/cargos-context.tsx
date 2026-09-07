import * as React from 'react'
import { cargoSlug, cargosApi, type Cargo, type CargosState } from './api-cargos'
import { useAuth } from './auth-context'
import { useSocket } from './socket-context'

export type { Cargo } from './api-cargos'

/**
 * CARGOS do grupo — catálogo, quem tem o quê, e a pergunta "eu posso?".
 *
 * Carrega uma vez ao logar e depois só escuta `cargos:updated`, que traz o
 * estado INTEIRO (é um punhado de crachás e um punhado de gente; um delta
 * exigiria acertar a ordem de chegada de "criou cargo" e "deu cargo" pra não
 * desenhar chip de um cargo desconhecido).
 *
 * ## Sobre o `can()`
 *
 * Ele decide o que APARECE, nunca o que é permitido: o servidor confere
 * permissão em toda rota que importa, independente do que a tela pensa. Um
 * launcher adulterado que force `can('print')` ganha um botão que responde
 * 403. Isso é de propósito — a alternativa (o cliente ser a autoridade) é o
 * jeito de vazar a impressora pra quem não rachou.
 *
 * Enquanto o catálogo não chegou, `can()` é FALSO. Vale pensar no que isso
 * significa na tela: a aba da impressora não pisca pra quem não tem o cargo,
 * ao custo de aparecer meio segundo depois pra quem tem. O contrário — supor
 * que pode até saber que não — mostraria a aba pro grupo todo a cada abertura
 * do launcher, que é exatamente o que o cargo existe pra evitar.
 */

interface CargosContextValue {
  /** Todos os cargos que existem, maior prioridade primeiro. */
  cargos: Cargo[]
  /** Os cargos de alguém, maior prioridade primeiro. Vazio se não tem. */
  cargosOf: (userId: string | null | undefined) => Cargo[]
  /**
   * O cargo que representa a pessoa: o de maior prioridade. É ele que pinta o
   * nome de quem não escolheu cor de perfil, e o chip que aparece quando só
   * cabe um.
   */
  topCargoOf: (userId: string | null | undefined) => Cargo | null
  /** Permissões efetivas de quem está logado (admin recebe todas). */
  can: (permission: string) => boolean
  /**
   * token de menção em minúsculas -> cargo. Tem duas chaves por cargo (o id e
   * o slug do nome atual), porque renomear não muda o id.
   */
  byMentionToken: Map<string, Cargo>
  /** Os cargos citados num texto que EU tenho — "essa mensagem fala comigo?". */
  myCargoIds: Set<string>
  /** Já sabemos a resposta? Antes disso `can()` é falso. */
  ready: boolean
  refresh: () => Promise<void>
}

const CargosContext = React.createContext<CargosContextValue | null>(null)

const EMPTY: Cargo[] = []

export function CargosProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth()
  const { socket } = useSocket()

  const [state, setState] = React.useState<CargosState>({ cargos: [], members: {} })
  const [ready, setReady] = React.useState(false)

  const refresh = React.useCallback(async () => {
    if (!token) {
      setState({ cargos: [], members: {} })
      setReady(false)
      return
    }
    try {
      setState(await cargosApi.list(token))
      setReady(true)
    } catch (err) {
      // Sem cargo o launcher continua funcionando: o que se perde é o chip e a
      // aba da impressora. Derrubar a tela por causa disso seria pior.
      console.warn('[cargos] falha ao carregar:', err)
    }
  }, [token])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    if (!socket) return
    const handle = (payload: CargosState): void => {
      if (!payload?.cargos) return
      setState(payload)
      setReady(true)
    }
    socket.on('cargos:updated', handle)
    return () => {
      socket.off('cargos:updated', handle)
    }
  }, [socket])

  const byId = React.useMemo(() => {
    const map: Record<string, Cargo> = {}
    for (const cargo of state.cargos) map[cargo.id] = cargo
    return map
  }, [state.cargos])

  const cargosOf = React.useCallback(
    (userId: string | null | undefined): Cargo[] => {
      if (!userId) return EMPTY
      const ids = state.members[userId]
      if (!ids?.length) return EMPTY
      // `?? []` e não `?? cargo genérico`: um id sem cargo no catálogo é um
      // cargo apagado que o mapa ainda cita, e desenhar chip vazio é pior que
      // não desenhar.
      return ids.map((id) => byId[id]).filter((c): c is Cargo => Boolean(c))
    },
    [state.members, byId]
  )

  const topCargoOf = React.useCallback(
    (userId: string | null | undefined): Cargo | null => cargosOf(userId)[0] ?? null,
    [cargosOf]
  )

  const byMentionToken = React.useMemo(() => {
    const map = new Map<string, Cargo>()
    for (const cargo of state.cargos) {
      map.set(cargo.id.toLowerCase(), cargo)
      map.set(cargoSlug(cargo.name), cargo)
    }
    return map
  }, [state.cargos])

  const myCargoIds = React.useMemo(
    () => new Set(user ? cargosOf(user.id).map((c) => c.id) : []),
    [user, cargosOf]
  )

  const myPermissions = React.useMemo(() => {
    const out = new Set<string>()
    if (!user) return out
    for (const cargo of cargosOf(user.id)) {
      for (const key of cargo.permissions) out.add(key)
    }
    return out
  }, [user, cargosOf])

  const can = React.useCallback(
    (permission: string): boolean => {
      if (!user) return false
      // Admin do grupo vê tudo — a mesma regra do servidor (lib/cargos.ts).
      // Sem isso o admin não conseguiria abrir a tela onde se dá o cargo.
      if (user.role === 'admin') return true
      if (!ready) return false
      return myPermissions.has(permission)
    },
    [user, ready, myPermissions]
  )

  const value = React.useMemo<CargosContextValue>(
    () => ({
      cargos: state.cargos,
      cargosOf,
      topCargoOf,
      byMentionToken,
      myCargoIds,
      can,
      ready,
      refresh
    }),
    [state.cargos, cargosOf, topCargoOf, byMentionToken, myCargoIds, can, ready, refresh]
  )

  return <CargosContext.Provider value={value}>{children}</CargosContext.Provider>
}

export function useCargos(): CargosContextValue {
  const ctx = React.useContext(CargosContext)
  if (!ctx) throw new Error('useCargos precisa estar dentro de um CargosProvider')
  return ctx
}
