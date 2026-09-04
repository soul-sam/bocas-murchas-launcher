import { request } from './api'

/**
 * ACHADOS — /api/links.
 *
 * Cada URL colada num canal vira um "achado" no servidor (ver módulo `links`
 * da API), com tipo, prévia (og:title/og:image buscada pelo servidor) e a
 * contagem de 🛒 na mensagem original, que é o "quero". Aqui só as chamadas;
 * o painel e o card ficam em components/social.
 */

export type LinkKind = 'video' | 'shop' | 'image' | 'article' | 'other'

export interface SharedLink {
  id: string
  url: string
  domain: string
  title: string | null
  description: string | null
  image: string | null
  kind: LinkKind
  channelId: string | null
  createdAt: string
  author: {
    id: string
    displayName: string
    avatar: string | null
    profileColor: string | null
  }
  /** Mensagem onde o link foi colado — é nela que o 🛒 vai. */
  message: { id: string; createdAt: string }
  wantCount: number
  /** Se EU já reagi 🛒. */
  wanted: boolean
}

export interface LinkListParams {
  channelId?: string
  /** Um tipo ou vários (vira `kind=a,b,c`): "Outros" é imagem+artigo+link. */
  kind?: LinkKind | LinkKind[]
  q?: string
  /** Cursor: `createdAt` do último item da página anterior. */
  before?: string
  limit?: number
}

export interface LinkStats {
  total: number
  byKind: Record<LinkKind, number>
  topDomains: { domain: string; count: number }[]
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? '?' + text : ''
}

export const links = {
  async list(token: string, params: LinkListParams = {}): Promise<SharedLink[]> {
    const res = await request<{ links: SharedLink[] }>(
      '/links' +
        toQuery({
          channelId: params.channelId,
          kind: Array.isArray(params.kind) ? params.kind.join(',') : params.kind,
          q: params.q,
          before: params.before,
          limit: params.limit
        }),
      { token }
    )
    return res.links
  },

  async stats(token: string, channelId?: string): Promise<LinkStats> {
    return request<LinkStats>('/links/stats' + toQuery({ channelId }), { token })
  },

  /** Tira do quadro; a mensagem original continua no chat. */
  async remove(token: string, id: string): Promise<void> {
    await request(`/links/${id}`, { method: 'DELETE', token })
  }
}
