import { request } from './api'

/**
 * "ME AVISA QUANDO ENCHER" — /api/alerts.
 *
 * A preferência mora no SERVIDOR e não no settings.json, ao contrário de
 * quase tudo em Configurações. O motivo é o ponto inteiro da feature: ela
 * precisa funcionar com o launcher fechado, e um arquivo no disco desta
 * máquina não avisa ninguém quando o processo não existe.
 */

export interface VoiceAlert {
  enabled: boolean
  /** Quantas pessoas na mesma call disparam o aviso. */
  threshold: number
  /** ISO ou null. Enquanto estiver no futuro, nada é enviado. */
  snoozeUntil: string | null
  lastFiredAt: string | null
}

export interface VoiceAlertResponse {
  alert: VoiceAlert
  min: number
  max: number
}

/** O aviso em si, chegando pela sala pessoal do socket. */
export interface VoiceAlertEvent {
  channelId: string
  channelName: string | null
  size: number
  members: Array<{ id: string; displayName: string }>
  at: number
}

export const alerts = {
  get: (token: string) => request<VoiceAlertResponse>('/alerts/voice', { token }),

  update: (
    token: string,
    patch: { enabled?: boolean; threshold?: number; snoozeMinutes?: number | null }
  ) =>
    request<{ alert: VoiceAlert }>('/alerts/voice', {
      method: 'PUT',
      token,
      body: JSON.stringify(patch)
    }).then((r) => r.alert)
}

/** A soneca ainda vale? */
export function isSnoozed(alert: VoiceAlert | null, now = Date.now()): boolean {
  if (!alert?.snoozeUntil) return false
  return new Date(alert.snoozeUntil).getTime() > now
}
