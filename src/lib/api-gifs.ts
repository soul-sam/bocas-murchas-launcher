import { ApiError, request } from './api'

/**
 * Contrato com /api/gifs — a busca de GIF, que é um proxy nosso pro Giphy.
 *
 *   GET /gifs/trending?limit&offset -> { gifs, nextOffset }
 *   GET /gifs/search?q&limit&offset -> { gifs, nextOffset }
 *
 * A chave do Giphy NÃO vive aqui: vive na variável de ambiente do servidor.
 * Ver routes/gifs.routes.ts na API pro porquê (resumo: chave dentro de um app
 * distribuído é chave vazada, e o CSP do launcher só libera a nossa API).
 */

export interface Gif {
  id: string
  /** Texto pro alt/title. Pode vir vazio. */
  description: string
  /** Animado e leve, pro grid. */
  previewUrl: string
  /** Quadro parado — usado por quem pediu menos animação no sistema. */
  stillUrl: string
  /** A variante que vira avatar (leve: ~200px e menos quadros). */
  avatarUrl: string
  /** A variante que vira capa (maior, com teto de 2 MB). */
  bannerUrl: string
  width: number
  height: number
}

export interface GifPage {
  gifs: Gif[]
  /** Offset da próxima página, ou null quando acabou. */
  nextOffset: number | null
}

/** Quantos GIFs por página. 24 enche a grade sem pesar a rede. */
export const GIF_PAGE_SIZE = 24

/**
 * Erro do provedor de GIF, separado dos outros.
 *
 * O servidor responde 503 com `code: 'gif_provider_off'` quando não tem chave
 * configurada (ou o Giphy recusou a que tem). Isso não é "deu erro, tenta de
 * novo": é "essa parte está desligada", e o seletor precisa saber a diferença
 * pra mostrar o campo de colar URL em vez de um botão de tentar novamente.
 */
export function isProviderOff(error: unknown): boolean {
  return error instanceof ApiError && error.status === 503
}

export const gifs = {
  async trending(token: string, offset = 0, limit = GIF_PAGE_SIZE): Promise<GifPage> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    return request<GifPage>(`/gifs/trending?${params.toString()}`, { token })
  },

  async search(token: string, q: string, offset = 0, limit = GIF_PAGE_SIZE): Promise<GifPage> {
    const params = new URLSearchParams({ q, limit: String(limit), offset: String(offset) })
    return request<GifPage>(`/gifs/search?${params.toString()}`, { token })
  }
}
