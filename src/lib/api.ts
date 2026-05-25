const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://api.bocasmurchas.com.br/api'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
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

export interface AuthUser {
  id: string
  username: string
  email: string
  displayName: string
  role: 'member' | 'admin'
  avatar?: string | null
  status?: string
  customStatus?: string | null
  createdAt?: string
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
