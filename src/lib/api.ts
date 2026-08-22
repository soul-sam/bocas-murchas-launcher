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

async function request<T>(
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
async function upload<T>(
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

export const uploads = {
  async image(
    token: string,
    kind: 'avatar' | 'banner' | 'image',
    file: File
  ): Promise<{ url: string }> {
    const form = new FormData()
    form.append('file', file)
    return upload<{ url: string }>(`/uploads/${kind}`, form, token)
  }
}

// ============================================
// CANAIS
// ============================================

export type ChannelType = 'text' | 'voice' | 'announcements'

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

  async remove(token: string, id: string): Promise<void> {
    await request(`/channels/${id}`, { method: 'DELETE', token })
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

export interface ChatMessage {
  id: string
  content: string
  type: 'text' | 'gif' | 'sticker' | 'system' | 'image'
  gifUrl?: string | null
  stickerUrl?: string | null
  imageUrl?: string | null
  author: MessageAuthor
  channelId: string
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
    payload: {
      content: string
      type?: ChatMessage['type']
      imageUrl?: string
      gifUrl?: string
      replyToId?: string
    }
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
