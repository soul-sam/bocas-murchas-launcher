import { request, upload } from './api'

/**
 * CLIPES — chamadas de /api/clips e os tipos que o card e o painel usam.
 *
 * A gravação em si não mora aqui: ela vive em `clip-context.tsx`, que segura
 * o buffer rolante da call. Este arquivo só fala com o servidor.
 */

export interface ClipAuthor {
  id: string
  displayName: string
  avatar?: string | null
}

export interface Clip {
  id: string
  title: string
  url: string
  mimeType: string
  durationMs: number
  sizeBytes: number
  /** Quem estava na call quando isso foi gravado. */
  participants: string[]
  channelId: string | null
  messageId: string | null
  playCount: number
  createdAt: string
  author: ClipAuthor
}

/** O que o card do chat guarda em `metadata`. */
export interface ClipCardMetadata {
  clipId: string
  title: string
  url: string
  durationMs: number
  participants?: string[]
}

export interface SaveClipInput {
  blob: Blob
  durationMs: number
  title?: string
  /** Quem estava na call. */
  participants: string[]
  /** Canal de voz onde o clipe nasceu — só informativo. */
  channelId?: string | null
  /** Canal de TEXTO onde o card deve ser postado. */
  postChannelId?: string | null
}

export const clips = {
  list: (token: string, options: { limit?: number; before?: string; mine?: boolean } = {}) => {
    const params = new URLSearchParams()
    if (options.limit) params.set('limit', String(options.limit))
    if (options.before) params.set('before', options.before)
    if (options.mine) params.set('mine', '1')
    const query = params.toString()
    return request<{ clips: Clip[] }>(`/clips${query ? `?${query}` : ''}`, { token }).then(
      (r) => r.clips
    )
  },

  save: (token: string, input: SaveClipInput) => {
    const form = new FormData()
    /**
     * O nome do arquivo importa: o servidor usa a extensão como plano B
     * quando o MIME não ajuda, e o MIME do MediaRecorder vem com codecs
     * grudados ("audio/webm;codecs=opus").
     */
    const ext = input.blob.type.includes('ogg') ? 'ogg' : input.blob.type.includes('mp4') ? 'm4a' : 'webm'
    form.append('file', input.blob, `clipe.${ext}`)
    form.append('durationMs', String(Math.round(input.durationMs)))
    form.append('participants', JSON.stringify(input.participants))
    if (input.title) form.append('title', input.title)
    if (input.channelId) form.append('channelId', input.channelId)
    if (input.postChannelId) form.append('postChannelId', input.postChannelId)

    return upload<{ clip: Clip }>('/clips', form, token).then((r) => r.clip)
  },

  /** Conta uma escuta. Não espera resposta: é estatística. */
  countPlay: (token: string, id: string) =>
    request<null>(`/clips/${id}/play`, { method: 'POST', token }).catch(() => undefined),

  remove: (token: string, id: string) =>
    request<{ message: string }>(`/clips/${id}`, { method: 'DELETE', token })
}

/** "0:28" — clipe é sempre curto, minuto e segundo basta. */
export function formatClipDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
