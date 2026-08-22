import * as React from 'react'
import { users as usersApi, type AuthUser } from './api'
import { useAuth } from './auth-context'
import { useSocket } from './socket-context'

/**
 * Lista de membros do servidor.
 *
 * A lista completa vem do REST uma vez; presenca e edicoes de perfil chegam por
 * socket e sao aplicadas por cima. Sem esse merge, quem trocasse o avatar so
 * apareceria diferente pros outros no proximo F5.
 */

export interface Member extends AuthUser {
  isOnline: boolean
}

interface MembersContextValue {
  members: Member[]
  online: Member[]
  offline: Member[]
  byId: Record<string, Member>
  loading: boolean
  refresh: () => Promise<void>
}

const MembersContext = React.createContext<MembersContextValue | null>(null)

export function MembersProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth()
  const { onlineIds, profileUpdates } = useSocket()

  const [raw, setRaw] = React.useState<AuthUser[]>([])
  const [loading, setLoading] = React.useState(true)

  const refresh = React.useCallback(async () => {
    if (!token) return
    try {
      setRaw(await usersApi.list(token))
    } catch {
      // Lista de membros e secundaria; falhar aqui nao pode derrubar o chat.
    } finally {
      setLoading(false)
    }
  }, [token])

  React.useEffect(() => {
    if (!token) {
      setRaw([])
      setLoading(false)
      return
    }
    void refresh()
  }, [token, refresh])

  /**
   * Ids desconhecidos que ja motivaram um refetch.
   *
   * Sem isso, um id que NUNCA aparece na lista (usuario apagado com socket
   * ainda aberto) faria o efeito buscar de novo a cada resposta, pra sempre.
   */
  const refetchedForRef = React.useRef(new Set<string>())

  React.useEffect(() => {
    if (loading || raw.length === 0) return

    const known = new Set(raw.map((m) => m.id))
    const unknown = Array.from(onlineIds).filter(
      (id) => !known.has(id) && !refetchedForRef.current.has(id)
    )

    if (unknown.length === 0) return

    for (const id of unknown) refetchedForRef.current.add(id)
    void refresh()
  }, [onlineIds, raw, loading, refresh])

  const members = React.useMemo<Member[]>(() => {
    return raw
      .map((member) => {
        const patched = profileUpdates[member.id]
        const merged = patched ? { ...member, ...patched } : member
        return {
          ...merged,
          // O proprio usuario esta sempre online — ele esta olhando a tela.
          isOnline: onlineIds.has(member.id) || member.id === user?.id
        }
      })
      .sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1
        return a.displayName.localeCompare(b.displayName, 'pt-BR')
      })
  }, [raw, profileUpdates, onlineIds, user?.id])

  const byId = React.useMemo(() => {
    const map: Record<string, Member> = {}
    for (const member of members) map[member.id] = member
    return map
  }, [members])

  const value = React.useMemo<MembersContextValue>(
    () => ({
      members,
      online: members.filter((m) => m.isOnline),
      offline: members.filter((m) => !m.isOnline),
      byId,
      loading,
      refresh
    }),
    [members, byId, loading, refresh]
  )

  return <MembersContext.Provider value={value}>{children}</MembersContext.Provider>
}

export function useMembers(): MembersContextValue {
  const ctx = React.useContext(MembersContext)
  if (!ctx) throw new Error('useMembers must be used within a MembersProvider')
  return ctx
}
