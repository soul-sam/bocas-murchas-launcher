import { request, type ChatMessage } from './api'

/**
 * Enquetes e drops — chamadas ao /api/polls e /api/drops.
 *
 * Módulo separado do api.ts pelo mesmo motivo que os outros por feature: o
 * arquivo central já é grande e cada feature nova crescia ele em cem linhas.
 * Os tipos aqui espelham o que o servidor devolve (Prisma), inclusive o
 * `_count` cru — por isso `optionVotes()` existe: pra ninguém precisar saber
 * em qual dos dois campos a contagem veio.
 */

// ============================================
// ENQUETES
// ============================================

export type PollType = 'single' | 'multiple'

export interface PollPerson {
  id: string
  displayName: string
  avatar?: string | null
}

export interface PollVote {
  id: string
  userId: string
  optionId: string
  user?: PollPerson
}

export interface PollOption {
  id: string
  text: string
  emoji?: string | null
  /** Contagem já resolvida pelo servidor (rotas novas). */
  voteCount?: number
  /** A mesma contagem no formato cru do Prisma (rotas antigas). */
  _count?: { votes: number }
  /** Quem votou — vazio em enquete anônima. Só vem no GET /polls/:id. */
  votes?: PollVote[]
}

export interface Poll {
  id: string
  question: string
  type: PollType
  channelId?: string | null
  createdById: string
  createdBy?: PollPerson
  isAnonymous: boolean
  isActive: boolean
  endsAt?: string | null
  createdAt: string
  options: PollOption[]
  _count?: { votes: number }
  totalVotes?: number
  /** Só na listagem: onde EU votei. */
  userVotedOptionIds?: string[]
}

export interface PollDetail {
  poll: Poll
  /** Singular por compatibilidade com cliente antigo; use o plural. */
  userVotedOptionId?: string | null
  userVotedOptionIds: string[]
  totalVotes: number
}

export interface CreatePollPayload {
  question: string
  options: Array<{ text: string; emoji?: string | null }>
  type: PollType
  channelId: string
  isAnonymous?: boolean
  /** ISO; null ou ausente = sem prazo. */
  endsAt?: string | null
}

/** Quantos votos a opção tem, venha a contagem de onde vier. */
export function optionVotes(option: PollOption): number {
  return option.voteCount ?? option._count?.votes ?? option.votes?.length ?? 0
}

export const polls = {
  async list(token: string, channelId?: string): Promise<Poll[]> {
    const query = channelId ? `?channelId=${encodeURIComponent(channelId)}` : ''
    const res = await request<{ polls: Poll[] }>(`/polls${query}`, { token })
    return res.polls
  },

  async get(token: string, id: string): Promise<PollDetail> {
    const res = await request<PollDetail>(`/polls/${id}`, { token })
    return {
      ...res,
      // Servidor antigo só mandava o singular.
      userVotedOptionIds:
        res.userVotedOptionIds ?? (res.userVotedOptionId ? [res.userVotedOptionId] : [])
    }
  },

  /** O servidor cria a enquete E posta o card no canal; volta os dois. */
  async create(
    token: string,
    payload: CreatePollPayload
  ): Promise<{ poll: Poll; message: ChatMessage | null }> {
    return request<{ poll: Poll; message: ChatMessage | null }>('/polls', {
      method: 'POST',
      token,
      body: JSON.stringify(payload)
    })
  },

  /**
   * Clicar numa opção. Em voto único troca (ou desfaz, se for a mesma); em
   * voto múltiplo liga/desliga. `action` diz o que aconteceu.
   */
  async vote(
    token: string,
    id: string,
    optionId: string
  ): Promise<{ action: 'added' | 'removed'; poll: Poll | null }> {
    return request<{ action: 'added' | 'removed'; poll: Poll | null }>(`/polls/${id}/vote`, {
      method: 'POST',
      token,
      body: JSON.stringify({ optionId })
    })
  },

  async close(token: string, id: string): Promise<Poll> {
    const res = await request<{ poll: Poll }>(`/polls/${id}/close`, {
      method: 'POST',
      token
    })
    return res.poll
  },

  async remove(token: string, id: string): Promise<void> {
    await request(`/polls/${id}`, { method: 'DELETE', token })
  }
}

// ============================================
// DROPS
// ============================================

export type DropType = 'announcement' | 'alert' | 'celebration' | 'warning'
export type DropStyle = 'default' | 'glow' | 'shake' | 'rainbow'
export type QuickDropType = 'party' | 'alert' | 'hype' | 'rip' | 'money' | 'clown'

export interface Drop {
  id: string
  type: DropType
  title: string
  content: string
  icon?: string | null
  style: DropStyle
  /** null = pra todo mundo; com id = só quem está naquele canal. */
  channelId?: string | null
  channel?: { id: string; name: string } | null
  createdById: string
  createdBy: PollPerson & { role?: string }
  isActive: boolean
  expiresAt?: string | null
  createdAt: string
}

export interface CreateDropPayload {
  type: DropType
  title: string
  content: string
  icon?: string
  style?: DropStyle
  channelId?: string | null
  /** ISO; null = não vence. */
  expiresAt?: string | null
}

export const drops = {
  /** Todos os ativos (globais e de canal); o cliente filtra por canal. */
  async list(token: string): Promise<Drop[]> {
    const res = await request<{ drops: Drop[] }>('/drops', { token })
    return res.drops
  },

  async create(token: string, payload: CreateDropPayload): Promise<Drop> {
    const res = await request<{ drop: Drop }>('/drops', {
      method: 'POST',
      token,
      body: JSON.stringify(payload)
    })
    return res.drop
  },

  /** Atalho de admin: título, ícone e estilo já vêm prontos pelo tipo. */
  async quick(
    token: string,
    type: QuickDropType,
    message: string,
    channelId?: string | null
  ): Promise<Drop> {
    const res = await request<{ drop: Drop }>(`/drops/quick/${type}`, {
      method: 'POST',
      token,
      body: JSON.stringify({ message, channelId: channelId ?? null })
    })
    return res.drop
  },

  async remove(token: string, id: string): Promise<void> {
    await request(`/drops/${id}`, { method: 'DELETE', token })
  }
}
