import { request, type Sound } from '@/lib/api'

/**
 * Chamadas que só admin faz.
 *
 * Ficam fora do api.ts pelo mesmo motivo dos outros módulos por feature: o
 * arquivo principal já é grande, e nada daqui é usado fora do painel admin e
 * do menu de bloqueio do soundboard. Os convites continuam no `admin` do
 * api.ts porque já estavam lá antes.
 */

export type AdminRole = 'member' | 'admin'

/** O que GET /users/admin/all devolve — inclui email, que o perfil público não tem. */
export interface AdminUser {
  id: string
  username: string
  email: string
  displayName: string
  avatar?: string | null
  role: AdminRole
  status?: string
  lastSeen?: string | null
  createdAt: string
  inviteUsed?: { code: string } | null
}

/** Resposta genérica das ferramentas: o servidor manda `message`, o resto varia. */
export interface ToolResult {
  message?: string
  [key: string]: unknown
}

export const adminApi = {
  // --- membros --------------------------------------------------------------

  async listUsers(token: string): Promise<AdminUser[]> {
    const res = await request<{ users: AdminUser[] }>('/users/admin/all', { token })
    return res.users
  },

  async setRole(token: string, id: string, role: AdminRole): Promise<void> {
    await request(`/users/admin/${id}/role`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ role })
    })
  },

  async resetPassword(token: string, id: string, newPassword: string): Promise<string> {
    const res = await request<{ message: string }>(`/users/admin/${id}/password`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ newPassword })
    })
    return res.message
  },

  async removeUser(token: string, id: string): Promise<void> {
    await request(`/users/admin/${id}`, { method: 'DELETE', token })
  },

  // --- sons -----------------------------------------------------------------

  /** Todos os sons, inclusive os bloqueados (o GET /sounds normal esconde). */
  async listAllSounds(token: string): Promise<Sound[]> {
    const res = await request<{ sounds: Sound[] }>('/sounds/all', { token })
    return res.sounds
  },

  async setSoundBlocked(token: string, id: string, isBlocked: boolean): Promise<Sound> {
    const res = await request<{ sound: Sound }>(`/sounds/${id}/block`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ isBlocked })
    })
    return res.sound
  },

  // --- ferramentas ----------------------------------------------------------

  async seedMissions(token: string): Promise<ToolResult> {
    return request<ToolResult>('/missions/seed', { method: 'POST', token })
  },

  async runRecap(token: string): Promise<ToolResult> {
    return request<ToolResult>('/gamification/recap/run', { method: 'POST', token })
  }
}

/**
 * Senha temporária pra "resetar senha": 10 caracteres sem os que se confundem
 * lidos em voz alta ou colados no WhatsApp (0/O, 1/l/I). É pra ser trocada
 * pela pessoa no primeiro login, não pra ser a senha definitiva.
 */
export function generateTempPassword(length = 10): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const byte of bytes) out += alphabet[byte % alphabet.length]
  return out
}
