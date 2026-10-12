import { request, upload } from './api'
import { SUPREME_IDS } from './api-gamification'

export type SupremeSlot = 'join' | 'leave' | 'both'
export interface SupremeSoundState {
  joinSoundUrl: string | null
  leaveSoundUrl: string | null
  sounds: { id: string; url: string; label: string; durationMs: number; brokenAt: string | null; inUse: boolean }[]
}

/** Áudio Supremo (/api/gamification/supreme-sound): WAV do próprio usuário, tocado na call. */
export const supremeSoundApi = {
  list: (token: string) => request<SupremeSoundState>('/gamification/supreme-sound', { token }),
  upload(token: string, slot: SupremeSlot, wav: Blob, label: string) {
    const form = new FormData()
    form.append('file', wav, 'supremo.wav')
    form.append('label', label)
    return upload<SupremeSoundState>(`/gamification/supreme-sound/${slot}`, form, token)
  },
  use: (token: string, slot: SupremeSlot, soundId: string) =>
    request<SupremeSoundState>(`/gamification/supreme-sound/${slot}`, { method: 'PUT', token, body: JSON.stringify({ soundId }) }),
  clear: (token: string, slot: SupremeSlot) =>
    request<SupremeSoundState>(`/gamification/supreme-sound/${slot}`, { method: 'DELETE', token }),
  report: (token: string, userId: string, url: string) =>
    request<{ broken: boolean }>('/gamification/supreme-sound/report', { method: 'POST', token, body: JSON.stringify({ userId, url }) })
}

/** URL do áudio da fase, só pra quem está com o Áudio Supremo vestido. */
export function supremeSoundUrl(
  member: { joinSound?: string | null; joinSoundUrl?: string | null; leaveSoundUrl?: string | null } | undefined,
  phase: 'join' | 'leave'
): string | null {
  if (member?.joinSound !== SUPREME_IDS.sound) return null
  return (phase === 'join' ? member.joinSoundUrl : member.leaveSoundUrl) ?? null
}
