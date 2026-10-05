import * as React from 'react'
import { users as usersApi, type AuthUser, type UserStatus } from './api'
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

/**
 * A bolinha de alguém, num lugar só.
 *
 * Quem não tem socket é cinza, escolha o que escolher no banco; quem tem usa
 * o status que a presença traz. É a MESMA regra da lista de membros — e é
 * pra ser usada onde quer que uma pessoa apareça com bolinha (conversa
 * direta, cabeçalho do chat), em vez do `status` que veio no REST, que é
 * uma foto velha de quando o app abriu.
 */
export function statusOf(member: Member | undefined, fallback: UserStatus = 'offline'): UserStatus {
  if (!member) return fallback
  if (!member.isOnline) return 'offline'
  return member.status ?? 'online'
}

export function MembersProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth()
  const { onlineIds, presenceById, profileUpdates } = useSocket()

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
        /**
         * Tres camadas, da mais velha pra mais nova.
         *
         * `raw` e a foto REST tirada quando o app abriu. A edicao de perfil
         * (`user:profileUpdated`) vem por cima: e o aviso que traz os campos
         * que a presenca nao carrega (emoji, bio, moldura). E a PRESENCA por
         * cima de tudo, porque e um retrato fresco do banco a cada entrada e
         * saida de alguem — e porque a edicao ja foi dobrada nela (ver
         * handleProfileUpdated em socket-context), entao ela nunca e mais
         * velha que a edicao.
         *
         * A ordem era a inversa, e isso era um bug: `profileUpdates` nunca
         * vence. Um unico `user:profileUpdated` com status 'away' ou 'offline'
         * ficava por cima de TODO retrato de presenca dali em diante — a
         * pessoa voltava, o servidor dizia online, e a lista de todo mundo
         * continuava mostrando ela ausente/cinza ate alguem reabrir o app.
         * Era o "demora muito pra atualizar" que nunca atualizava.
         */
        const patched = profileUpdates[member.id]
        const edited = patched ? { ...member, ...patched } : member

        const presence = presenceById[member.id]
        const merged = presence
          ? {
              ...edited,
              displayName: presence.displayName || edited.displayName,
              avatar: presence.avatar ?? edited.avatar,
              status: presence.status ?? edited.status,
              // `null` e "limpou o recado"; so `undefined` e "nao veio".
              customStatus:
                presence.customStatus === undefined ? edited.customStatus : presence.customStatus,
              profileColor: presence.profileColor ?? edited.profileColor
            }
          : edited

        return {
          ...merged,
          // O proprio usuario esta sempre online — ele esta olhando a tela.
          // O bot tambem: ele nao tem socket, mas responde a qualquer hora.
          isOnline: onlineIds.has(member.id) || member.id === user?.id || member.role === 'bot'
        }
      })
      .sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1
        return a.displayName.localeCompare(b.displayName, 'pt-BR')
      })
  }, [raw, presenceById, profileUpdates, onlineIds, user?.id])

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

/** Pra componente de `ui/` que pode ser desenhado fora da árvore logada. */
export function useMembersOptional(): MembersContextValue | null {
  return React.useContext(MembersContext)
}
