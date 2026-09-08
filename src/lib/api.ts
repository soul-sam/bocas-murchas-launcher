const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://api.bocasmurchas.com.br/api'

/** Raiz do servidor, sem /api — usada pra montar URL de arquivo estatico. */
export const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '')

/** Caminho vindo do banco pode ser relativo (/static/...), base64 ou URL cheia. */
export function resolveAssetUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
    return raw
  }
  return API_ORIGIN + (raw.startsWith('/') ? raw : '/' + raw)
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Exportado pra os módulos de API por feature (api-polls.ts, api-events.ts…)
 * montarem as próprias chamadas sem crescer este arquivo.
 */
export async function request<T>(
  endpoint: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token, headers, ...rest } = options
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    ...rest
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Falha na requisição' }))
    throw new ApiError(res.status, body.error || `HTTP ${res.status}`)
  }

  if (res.status === 204) return null as T
  return res.json()
}

/** Upload usa FormData: nao pode mandar Content-Type manual (o boundary se perde). */
export async function upload<T>(
  endpoint: string,
  form: FormData,
  token: string | null
): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Falha no upload' }))
    throw new ApiError(res.status, body.error || `HTTP ${res.status}`)
  }

  return res.json()
}

// ============================================
// AUTENTICACAO
// ============================================

export type UserStatus = 'online' | 'away' | 'dnd' | 'offline'

export interface ProfileLink {
  name: string
  url: string
}

export interface AuthUser {
  id: string
  username: string
  email?: string
  displayName: string
  role: 'member' | 'admin'
  avatar?: string | null
  banner?: string | null
  bio?: string | null
  pronouns?: string | null
  profileColor?: string | null
  /** JSON string de ProfileLink[] — use parseLinks(). */
  links?: string | null
  status?: UserStatus
  customStatus?: string | null
  lastSeen?: string
  createdAt?: string
  voiceChannelId?: string | null
  /** Cosméticos equipados (ids de Cosmetic) — ver gamificação. */
  title?: string | null
  nameEffect?: string | null
  avatarFrame?: string | null
  emoji?: string | null
  /** Som de entrar/sair do canal de voz (id `sound:*`); todo mundo no canal ouve. */
  joinSound?: string | null
  /** Riot ID lido do cliente do LoL. */
  riotGameName?: string | null
  riotTagLine?: string | null
  /** Dia do aniversário como "MM-DD". Sem ano — ninguém pediu idade. */
  birthday?: string | null
  /** Fuso IANA ("America/Sao_Paulo"), pro perfil mostrar a hora local. */
  timezone?: string | null
  /** JSON string de string[] — use parseFavoriteGames(). */
  favoriteGames?: string | null
}

// Tipos de presença de jogo, compartilhados com o processo main.
export type {
  GameActivity,
  ActivityGame,
  LolPhase,
  LolStatus,
  LolGameResult
} from '../../electron/preload/types'

/**
 * Jogos favoritos, guardados como JSON string igual aos links.
 *
 * Mesma tolerância do parseLinks: campo estragado no banco não pode derrubar
 * o cartão de perfil de quem abre — devolve lista vazia e a vida segue.
 */
export function parseFavoriteGames(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((g): g is string => typeof g === 'string') : []
  } catch {
    return []
  }
}

export function parseLinks(raw: string | null | undefined): ProfileLink[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

interface RawAuthResponse {
  message: string
  token: string
  user: AuthUser
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

export const auth = {
  async login(login: string, password: string): Promise<AuthResponse> {
    const res = await request<RawAuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password })
    })
    return { token: res.token, user: res.user }
  },

  async register(payload: {
    username: string
    email: string
    password: string
    displayName: string
    inviteCode: string
  }): Promise<AuthResponse> {
    const res = await request<RawAuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    return { token: res.token, user: res.user }
  },

  async me(token: string): Promise<AuthUser> {
    const res = await request<{ user: AuthUser }>('/auth/me', { token })
    return res.user
  }
}

// ============================================
// USUARIOS E PERFIL
// ============================================

export interface ProfilePatch {
  displayName?: string
  avatar?: string | null
  banner?: string | null
  bio?: string | null
  pronouns?: string | null
  profileColor?: string | null
  links?: ProfileLink[] | null
  customStatus?: string | null
  /** "MM-DD" ou null pra limpar. */
  birthday?: string | null
  /** Fuso IANA ou null pra limpar. */
  timezone?: string | null
  favoriteGames?: string[] | null
}

export const users = {
  async list(token: string): Promise<AuthUser[]> {
    const res = await request<{ users: AuthUser[] }>('/users', { token })
    return res.users
  },

  async get(token: string, id: string): Promise<AuthUser> {
    const res = await request<{ user: AuthUser }>(`/users/${id}`, { token })
    return res.user
  },

  async updateProfile(token: string, patch: ProfilePatch): Promise<AuthUser> {
    const res = await request<{ user: AuthUser }>('/users/me', {
      method: 'PUT',
      token,
      body: JSON.stringify(patch)
    })
    return res.user
  },

  async setStatus(token: string, status: UserStatus): Promise<void> {
    await request('/users/me/status', {
      method: 'PUT',
      token,
      body: JSON.stringify({ status })
    })
  },

  async changePassword(
    token: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    await request('/users/me/password', {
      method: 'PUT',
      token,
      body: JSON.stringify({ currentPassword, newPassword })
    })
  }
}

// ============================================
// UPLOADS
// ============================================

export interface UploadedFile {
  url: string
  fileName: string
  sizeBytes: number
  mimeType: string
}

export const uploads = {
  async image(
    token: string,
    kind: 'avatar' | 'banner' | 'image',
    file: File
  ): Promise<{ url: string }> {
    const form = new FormData()
    form.append('file', file)
    return upload<{ url: string }>(`/uploads/${kind}`, form, token)
  },

  /**
   * Anexo que nao e imagem (zip, pdf, log, mod).
   *
   * Rota separada de proposito: o limite e outro (50 MB contra 8 MB), o
   * servidor grava direto no disco em vez de segurar na memoria, e a lista de
   * formatos aceitos e praticamente aberta.
   */
  async file(token: string, file: File): Promise<UploadedFile> {
    const form = new FormData()
    form.append('file', file)
    return upload<UploadedFile>('/uploads/file', form, token)
  },

  /**
   * Copia uma imagem de uma URL pro nosso storage e devolve a URL local.
   *
   * É por aqui que o GIF escolhido no seletor entra no perfil. O servidor
   * baixa e guarda em vez de a gente salvar o link do Giphy direto, porque
   * aquela URL carrega um token com validade — o avatar apareceria quebrado
   * semanas depois. Ver a rota em routes/uploads.routes.ts.
   */
  async fromUrl(
    token: string,
    kind: 'avatar' | 'banner',
    url: string
  ): Promise<{ url: string; sizeBytes: number; mimeType: string }> {
    return request('/uploads/from-url', {
      method: 'POST',
      token,
      body: JSON.stringify({ kind, url })
    })
  }
}

// ============================================
// CANAIS
// ============================================

/**
 * O tipo do canal.
 *
 * 'dm' NAO existe no servidor: e um canal sintetico que o chat-context cria
 * por cima de cada conversa direta, pra que a tela de conversa seja
 * literalmente a mesma tela de canal. Ver lib/chat-context.tsx.
 */
export type ChannelType = 'text' | 'voice' | 'announcements' | 'suggestions' | 'dm'

export interface VoiceUser {
  id: string
  displayName: string
  avatar?: string | null
  status?: string
}

export interface Channel {
  id: string
  name: string
  description?: string | null
  type: ChannelType
  icon?: string | null
  position: number
  isPrivate: boolean
  voiceUsers?: VoiceUser[]
  _count?: { messages: number }
}

export const channels = {
  async list(token: string): Promise<Channel[]> {
    const res = await request<{ channels: Channel[] }>('/channels', { token })
    return res.channels
  },

  async create(
    token: string,
    payload: { name: string; description?: string; type?: ChannelType; icon?: string }
  ): Promise<Channel> {
    const res = await request<{ channel: Channel }>('/channels', {
      method: 'POST',
      token,
      body: JSON.stringify(payload)
    })
    return res.channel
  },

  async update(
    token: string,
    id: string,
    patch: { name?: string; description?: string | null; icon?: string | null }
  ): Promise<Channel> {
    const res = await request<{ channel: Channel }>(`/channels/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(patch)
    })
    return res.channel
  },

  async remove(token: string, id: string): Promise<void> {
    await request(`/channels/${id}`, { method: 'DELETE', token })
  },

  /** A ordem INTEIRA de uma vez — ver o comentario na rota. */
  async reorder(token: string, order: string[]): Promise<Channel[]> {
    const res = await request<{ channels: Channel[] }>('/channels/reorder', {
      method: 'POST',
      token,
      body: JSON.stringify({ order: order.map((id, position) => ({ id, position })) })
    })
    return res.channels
  },

  async seedDefaults(token: string): Promise<void> {
    await request('/channels/seed', { method: 'POST', token })
  }
}

// ============================================
// MENSAGENS
// ============================================

export interface MessageAuthor {
  id: string
  username: string
  displayName: string
  avatar?: string | null
  role: string
}

export interface MessageReaction {
  id: string
  emoji: string
  userId: string
  user?: { id: string; displayName: string }
}

/**
 * Mensagens-cartão: o launcher desenha um componente em vez do texto. O que
 * o cartão precisa vem em `metadata` (JSON) — ver components/cards.
 */
export type CardMessageType =
  | 'poll'
  | 'event'
  | 'game'
  | 'recap'
  | 'party'
  | 'wager'
  | 'watch'
  | 'system'
  | 'chess'
  | 'suggestion'

export type MessageType = 'text' | 'gif' | 'sticker' | 'image' | 'file' | CardMessageType

export const CARD_MESSAGE_TYPES: ReadonlySet<string> = new Set<CardMessageType>([
  'poll',
  'event',
  'game',
  'recap',
  'party',
  'wager',
  'watch',
  'system',
  'chess',
  'suggestion'
])

export function isCardMessage(message: { type: string }): boolean {
  return CARD_MESSAGE_TYPES.has(message.type)
}

/** `metadata` vem como string JSON; devolve objeto ou null sem estourar. */
export function parseMetadata<T = Record<string, unknown>>(
  raw: string | null | undefined
): T | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as T) : null
  } catch {
    return null
  }
}

export interface ChatMessage {
  id: string
  content: string
  type: MessageType
  /** JSON por tipo de cartão — use parseMetadata(). */
  metadata?: string | null
  gifUrl?: string | null
  stickerUrl?: string | null
  imageUrl?: string | null
  /** Anexo generico (zip, pdf, log, mod). O nome original vem separado. */
  fileUrl?: string | null
  fileName?: string | null
  fileSize?: number | null
  fileMime?: string | null
  author: MessageAuthor
  /** Uma das duas vem preenchida: mensagem de canal OU de conversa direta. */
  channelId?: string | null
  conversationId?: string | null
  /** So nos resultados de busca, pra dizer ONDE a mensagem estava. */
  channel?: { id: string; name: string; type: ChannelType } | null
  replyToId?: string | null
  replyTo?: {
    id: string
    content: string
    author: { displayName: string }
  } | null
  reactions?: MessageReaction[]
  isEdited: boolean
  isPinned: boolean
  createdAt: string
}

/** Mesmo corpo pro canal e pra conversa: as duas rotas aceitam os mesmos campos. */
export interface SendMessagePayload {
  content: string
  type?: ChatMessage['type']
  imageUrl?: string
  gifUrl?: string
  stickerUrl?: string
  fileUrl?: string
  fileName?: string
  fileSize?: number
  fileMime?: string
  replyToId?: string
  /** Objeto: o servidor guarda como JSON. */
  metadata?: Record<string, unknown>
}

export const messages = {
  async list(
    token: string,
    channelId: string,
    options: { limit?: number; before?: string } = {}
  ): Promise<ChatMessage[]> {
    const params = new URLSearchParams()
    if (options.limit) params.set('limit', String(options.limit))
    if (options.before) params.set('before', options.before)
    const query = params.toString()

    const res = await request<{ messages: ChatMessage[] }>(
      `/messages/channel/${channelId}${query ? '?' + query : ''}`,
      { token }
    )
    return res.messages
  },

  async send(
    token: string,
    channelId: string,
    payload: SendMessagePayload
  ): Promise<ChatMessage> {
    const res = await request<{ message: ChatMessage }>(`/messages/channel/${channelId}`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload)
    })
    return res.message
  },

  async edit(token: string, id: string, content: string): Promise<ChatMessage> {
    const res = await request<{ message: ChatMessage }>(`/messages/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ content })
    })
    return res.message
  },

  async remove(token: string, id: string): Promise<void> {
    await request(`/messages/${id}`, { method: 'DELETE', token })
  },

  async react(
    token: string,
    id: string,
    emoji: string
  ): Promise<{ action: 'added' | 'removed' }> {
    return request<{ action: 'added' | 'removed' }>(`/messages/${id}/react`, {
      method: 'POST',
      token,
      body: JSON.stringify({ emoji })
    })
  },

  async togglePin(token: string, id: string): Promise<{ isPinned: boolean }> {
    return request<{ isPinned: boolean }>(`/messages/${id}/pin`, {
      method: 'POST',
      token
    })
  },

  async listPinned(token: string, channelId: string): Promise<ChatMessage[]> {
    const res = await request<{ messages: ChatMessage[] }>(
      `/messages/channel/${channelId}/pinned`,
      { token }
    )
    return res.messages
  },

  /**
   * Busca no historico.
   *
   * O servidor so devolve o que VOCE pode ver: canais (abertos a todos) mais
   * as conversas diretas de que voce participa. DM de terceiro nunca entra no
   * resultado — a checagem e la, nao aqui.
   */
  async search(
    token: string,
    term: string,
    options: { channelId?: string; authorId?: string; limit?: number } = {}
  ): Promise<ChatMessage[]> {
    const params = new URLSearchParams({ q: term })
    if (options.channelId) params.set('channelId', options.channelId)
    if (options.authorId) params.set('authorId', options.authorId)
    if (options.limit) params.set('limit', String(options.limit))

    const res = await request<{ messages: ChatMessage[] }>(
      `/messages/search?${params.toString()}`,
      { token }
    )
    return res.messages
  }
}

// ============================================
// CONVERSAS DIRETAS
// ============================================

export interface ConversationPeer {
  id: string
  username: string
  displayName: string
  avatar?: string | null
  status?: UserStatus
  profileColor?: string | null
}

export interface Conversation {
  id: string
  other: ConversationPeer
  lastMessageAt: string
  lastMessage?: {
    id: string
    content: string
    imageUrl?: string | null
    fileName?: string | null
    createdAt: string
    authorId: string
  } | null
  unread: number
}

export const dm = {
  async list(token: string): Promise<Conversation[]> {
    const res = await request<{ conversations: Conversation[] }>('/dm', { token })
    return res.conversations
  },

  /** Abre a conversa com alguem — cria na primeira vez. */
  async open(token: string, userId: string): Promise<Conversation> {
    const res = await request<{ conversation: Conversation }>(`/dm/with/${userId}`, {
      method: 'POST',
      token
    })
    return res.conversation
  },

  async messages(
    token: string,
    conversationId: string,
    options: { limit?: number; before?: string } = {}
  ): Promise<ChatMessage[]> {
    const params = new URLSearchParams()
    if (options.limit) params.set('limit', String(options.limit))
    if (options.before) params.set('before', options.before)
    const query = params.toString()

    const res = await request<{ messages: ChatMessage[] }>(
      `/dm/${conversationId}/messages${query ? '?' + query : ''}`,
      { token }
    )
    return res.messages
  },

  async send(
    token: string,
    conversationId: string,
    payload: SendMessagePayload
  ): Promise<ChatMessage> {
    const res = await request<{ message: ChatMessage }>(`/dm/${conversationId}/messages`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload)
    })
    return res.message
  },

  async markRead(token: string, conversationId: string): Promise<void> {
    await request(`/dm/${conversationId}/read`, { method: 'POST', token })
  },

  /**
   * Fecha a conversa PRA MIM. Nada e apagado: some da lista e volta se a
   * pessoa mandar mensagem nova (ou se eu abrir a DM de novo).
   */
  async close(token: string, conversationId: string): Promise<void> {
    await request(`/dm/${conversationId}`, { method: 'DELETE', token })
  }
}

// ============================================
// SOUNDBOARD
// ============================================

export interface Sound {
  id: string
  name: string
  emoji: string
  url: string
  durationMs: number
  sizeBytes: number
  volume: number
  category: string
  playCount: number
  isBlocked: boolean
  createdAt: string
  uploadedBy: { id: string; displayName: string; avatar?: string | null }
}

export const sounds = {
  async list(token: string): Promise<Sound[]> {
    const res = await request<{ sounds: Sound[] }>('/sounds', { token })
    return res.sounds
  },

  async create(
    token: string,
    payload: {
      file: File
      name: string
      emoji: string
      durationMs: number
      category?: string
      volume?: number
    }
  ): Promise<Sound> {
    const form = new FormData()
    form.append('file', payload.file)
    form.append('name', payload.name)
    form.append('emoji', payload.emoji)
    form.append('durationMs', String(Math.round(payload.durationMs)))
    if (payload.category) form.append('category', payload.category)
    if (payload.volume !== undefined) form.append('volume', String(payload.volume))

    const res = await upload<{ sound: Sound }>('/sounds', form, token)
    return res.sound
  },

  async update(
    token: string,
    id: string,
    patch: { name?: string; emoji?: string; category?: string; volume?: number }
  ): Promise<Sound> {
    const res = await request<{ sound: Sound }>(`/sounds/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(patch)
    })
    return res.sound
  },

  async remove(token: string, id: string): Promise<void> {
    await request(`/sounds/${id}`, { method: 'DELETE', token })
  }
}

// ============================================
// LIVEKIT
// ============================================

export const livekit = {
  async token(token: string, roomName: string): Promise<{ token: string; url: string }> {
    return request<{ token: string; url: string }>('/livekit/token', {
      method: 'POST',
      token,
      body: JSON.stringify({ roomName })
    })
  }
}

// ============================================
// PARTIDAS (presença de jogo -> servidor)
// ============================================

export interface GameSessionSummary {
  id: string
  userId: string
  game: 'lol' | 'minecraft'
  startedAt: string
  endedAt?: string | null
  result?: 'win' | 'loss' | 'remake' | 'unknown' | null
  queue?: string | null
  champion?: string | null
  kills?: number | null
  deaths?: number | null
  assists?: number | null
  durationSec?: number | null
  messageId?: string | null
}

/**
 * Contrato com /api/games (implementado no backend pelo módulo de partidas).
 *
 *   POST /games/session            { game, queue?, champion?, startedAt }      -> { session }
 *   POST /games/session/:id/end    { result, kills, deaths, assists, durationSec,
 *                                    champion?, queue?, data?, teammateRiotIds?,
 *                                    postCard }                                -> { session, message? }
 *   POST /games/riot-id            { gameName, tagLine }                       -> { user }
 *   GET  /games/recent?limit=      -> { sessions }  (com user)
 *   GET  /games/live               -> { sessions }  partidas em andamento (pra apostar)
 */
export const games = {
  async start(
    token: string,
    payload: { game: 'lol' | 'minecraft'; queue?: string; champion?: string; startedAt: string }
  ): Promise<GameSessionSummary> {
    const res = await request<{ session: GameSessionSummary }>('/games/session', {
      method: 'POST',
      token,
      body: JSON.stringify(payload)
    })
    return res.session
  },

  async end(
    token: string,
    sessionId: string,
    payload: {
      result: 'win' | 'loss' | 'remake' | 'unknown'
      kills: number
      deaths: number
      assists: number
      durationSec: number
      champion?: string
      queue?: string
      data?: unknown
      /** Riot IDs (nome#tag) dos aliados — o servidor resolve quem é do grupo. */
      teammateRiotIds?: string[]
      postCard: boolean
    }
  ): Promise<{ session: GameSessionSummary; message?: ChatMessage }> {
    return request(`/games/session/${sessionId}/end`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload)
    })
  },

  async setRiotId(token: string, gameName: string, tagLine: string): Promise<void> {
    await request('/games/riot-id', {
      method: 'POST',
      token,
      body: JSON.stringify({ gameName, tagLine })
    })
  }
}

// ============================================
// ADMIN
// ============================================

export interface InviteSummary {
  id: string
  code: string
  maxUses: number
  uses: number
  isActive: boolean
  expiresAt: string | null
  createdAt: string
  createdBy?: { displayName: string }
}

export const admin = {
  async createInvite(
    token: string,
    options: { maxUses?: number; expiresInDays?: number } = {}
  ): Promise<{ code: string; maxUses: number; expiresAt: string | null }> {
    const res = await request<{
      invite: { code: string; maxUses: number; expiresAt: string | null }
    }>('/auth/invite', {
      method: 'POST',
      token,
      body: JSON.stringify({
        maxUses: options.maxUses ?? 1,
        ...(options.expiresInDays !== undefined
          ? { expiresInDays: options.expiresInDays }
          : {})
      })
    })
    return res.invite
  },

  async listInvites(token: string): Promise<InviteSummary[]> {
    const res = await request<{ invites: InviteSummary[] }>('/auth/invites', { token })
    return res.invites
  },

  async deactivateInvite(token: string, id: string): Promise<void> {
    await request('/auth/invite/' + id, { method: 'DELETE', token })
  }
}
