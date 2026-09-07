import { request } from './api'

/**
 * CAIXA DE SUGESTÕES — chamadas ao /api/suggestions.
 *
 * A sugestão é a verdade sobre voto e status; o card no chat é só como ela
 * aparece na conversa. Por isso tanto o card quanto o quadro buscam por aqui
 * em vez de confiar no `metadata` da mensagem, que é um retrato do dia em que
 * a sugestão nasceu.
 */

export type SuggestionKind = 'ideia' | 'bug'
export type SuggestionStatus = 'aberta' | 'planejada' | 'feita' | 'recusada'

export interface SuggestionAuthor {
  id: string
  displayName: string
  avatar?: string | null
  profileColor?: string | null
}

export interface Suggestion {
  id: string
  kind: SuggestionKind
  title: string
  detail: string | null
  status: SuggestionStatus
  /** O que o admin respondeu ao mudar o status. */
  resolution: string | null
  /** Versão do launcher de quem abriu — vai sozinha, ninguém digita. */
  appVersion: string | null
  channelId: string | null
  createdAt: string
  updatedAt: string
  createdBy: SuggestionAuthor
  votes: number
  votedByMe: boolean
}

/** O que o card guarda no metadata da mensagem. Retrato, não verdade. */
export interface SuggestionCardMeta {
  suggestionId: string
  kind: SuggestionKind
  title: string
  status: SuggestionStatus
}

export const KIND_LABEL: Record<SuggestionKind, string> = {
  ideia: 'Ideia',
  bug: 'Problema'
}

export const STATUS_LABEL: Record<SuggestionStatus, string> = {
  aberta: 'Aberta',
  planejada: 'Planejada',
  feita: 'Feita',
  recusada: 'Recusada'
}

/**
 * O que cada status quer dizer, em uma frase.
 *
 * Existe porque "planejada" e "aberta" parecem sinônimos pra quem não escreveu
 * o código — e a diferença entre "alguém vai fazer" e "está na fila" é
 * exatamente o que quem sugeriu quer saber.
 */
export const STATUS_HINT: Record<SuggestionStatus, string> = {
  aberta: 'Na fila. Ainda ninguém se comprometeu com isso.',
  planejada: 'Aceita e vai ser feita — falta o quando.',
  feita: 'Já está no launcher. Atualiza aí.',
  recusada: 'Não vai ser feita. O motivo está escrito.'
}

export interface CreateSuggestionInput {
  kind: SuggestionKind
  title: string
  detail?: string
  channelId?: string | null
  appVersion?: string | null
}

export const suggestions = {
  async list(
    token: string,
    filters: {
      status?: SuggestionStatus
      kind?: SuggestionKind
      sort?: 'votadas' | 'recentes'
    } = {}
  ): Promise<Suggestion[]> {
    const query = new URLSearchParams()
    if (filters.status) query.set('status', filters.status)
    if (filters.kind) query.set('kind', filters.kind)
    if (filters.sort) query.set('sort', filters.sort)

    const suffix = query.toString() ? `?${query}` : ''
    const res = await request<{ suggestions: Suggestion[] }>(`/suggestions${suffix}`, { token })
    return res.suggestions
  },

  async get(token: string, id: string): Promise<Suggestion> {
    const res = await request<{ suggestion: Suggestion }>(`/suggestions/${id}`, { token })
    return res.suggestion
  },

  async create(token: string, input: CreateSuggestionInput): Promise<Suggestion> {
    const res = await request<{ suggestion: Suggestion }>('/suggestions', {
      method: 'POST',
      token,
      body: JSON.stringify(input)
    })
    return res.suggestion
  },

  /** Alterna o voto e devolve a contagem nova. */
  async vote(token: string, id: string): Promise<{ votes: number; votedByMe: boolean }> {
    return request<{ votes: number; votedByMe: boolean }>(`/suggestions/${id}/vote`, {
      method: 'POST',
      token
    })
  },

  async setStatus(
    token: string,
    id: string,
    patch: { status?: SuggestionStatus; resolution?: string | null }
  ): Promise<Suggestion> {
    const res = await request<{ suggestion: Suggestion }>(`/suggestions/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(patch)
    })
    return res.suggestion
  },

  async remove(token: string, id: string): Promise<void> {
    await request(`/suggestions/${id}`, { method: 'DELETE', token })
  }
}
