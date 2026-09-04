import { request, type ChatMessage } from './api'

/**
 * AGENDA — chamadas de /api/events e os tipos que o card e o painel usam.
 *
 * Separado do api.ts pelo mesmo motivo dos outros módulos por feature: o
 * arquivo central já é grande, e quem mexe na agenda não precisa rolar por
 * DM e soundboard.
 */

export type RsvpStatus = 'going' | 'maybe' | 'no'

export interface EventPerson {
  id: string
  displayName: string
  avatar?: string | null
  profileColor?: string | null
}

export interface EventRsvp {
  id: string
  eventId: string
  userId: string
  status: RsvpStatus
  user?: EventPerson
}

export interface AgendaEvent {
  id: string
  title: string
  game?: string | null
  note?: string | null
  startsAt: string
  endsAt?: string | null
  createdById: string
  createdBy?: EventPerson
  channelId?: string | null
  messageId?: string | null
  remindedAt?: string | null
  cancelledAt?: string | null
  createdAt: string
  updatedAt: string
  rsvps: EventRsvp[]
}

/**
 * O que vem no `metadata` do card de evento. IDs, não pessoas: nome e avatar
 * saem da lista de membros que o launcher já tem em memória.
 */
export interface EventCardMetadata {
  eventId: string
  title: string
  game?: string | null
  note?: string | null
  startsAt: string
  createdById: string
  cancelled: boolean
  rsvps: Record<RsvpStatus, string[]>
}

export type PartyStatus = 'open' | 'full' | 'closed'

/** `metadata` do card "bora?". O estado vivo vem do socket; isto é o retrato gravado. */
export interface PartyCardMetadata {
  partyId: string
  game: string
  slots: number
  note?: string | null
  createdById: string
  status: PartyStatus
  members: string[]
}

export interface CreateEventPayload {
  title: string
  game?: string
  note?: string
  /** ISO. Tem que ser no futuro; o servidor confere. */
  startsAt: string
  /** Canal de texto onde o card cai. Sem isso o evento fica só na agenda. */
  channelId?: string
}

export const events = {
  async create(
    token: string,
    payload: CreateEventPayload
  ): Promise<{ event: AgendaEvent; message: ChatMessage | null }> {
    return request('/events', { method: 'POST', token, body: JSON.stringify(payload) })
  },

  async upcoming(token: string): Promise<AgendaEvent[]> {
    const res = await request<{ events: AgendaEvent[] }>('/events/upcoming', { token })
    return res.events
  },

  async get(token: string, id: string): Promise<AgendaEvent> {
    const res = await request<{ event: AgendaEvent }>(`/events/${id}`, { token })
    return res.event
  },

  async rsvp(token: string, id: string, status: RsvpStatus): Promise<AgendaEvent> {
    const res = await request<{ event: AgendaEvent }>(`/events/${id}/rsvp`, {
      method: 'POST',
      token,
      body: JSON.stringify({ status })
    })
    return res.event
  },

  async update(
    token: string,
    id: string,
    patch: Partial<Pick<CreateEventPayload, 'title' | 'game' | 'note' | 'startsAt'>>
  ): Promise<AgendaEvent> {
    const res = await request<{ event: AgendaEvent }>(`/events/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(patch)
    })
    return res.event
  },

  async cancel(token: string, id: string): Promise<AgendaEvent> {
    const res = await request<{ event: AgendaEvent }>(`/events/${id}`, {
      method: 'DELETE',
      token
    })
    return res.event
  }
}

// ============================================
// JOGOS — rótulos compartilhados por card, painel e compositores
// ============================================

export type KnownGame = 'lol' | 'minecraft' | 'outro'

const GAME_LABELS: Record<string, string> = {
  lol: 'LoL',
  minecraft: 'Minecraft',
  outro: 'Outro'
}

/** "lol" -> "LoL"; jogo livre ("valorant") volta como veio. */
export function gameLabel(game: string | null | undefined): string {
  if (!game) return 'Outro'
  return GAME_LABELS[game] ?? game
}

/**
 * Adivinha o jogo a partir de texto solto ("/bora lol", "marcar sexta 21h
 * minecraft"). Só pros dois que o launcher conhece; o resto é "outro".
 */
export function guessGame(text: string): KnownGame | null {
  const flat = text.toLowerCase()
  if (/\b(lol|league|aram|ranked|flex|arena)\b/.test(flat)) return 'lol'
  if (/\b(minecraft|mine|mc)\b/.test(flat)) return 'minecraft'
  return null
}
