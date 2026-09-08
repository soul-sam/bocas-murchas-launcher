import { ApiError, request } from './api'

/**
 * Contrato com /api/music — a busca da jukebox.
 *
 *   GET  /music/search?q&limit -> { tracks }
 *   POST /music/resolve        { spotifyId } -> { track }
 *
 * A busca é no Spotify e quem toca é o YouTube. O porquê inteiro (e por que
 * as chaves não moram aqui) está em routes/music.routes.ts na API; o resumo é
 * que o Spotify tem o catálogo bom mas não deixa a call inteira ouvir a mesma
 * faixa, e a busca do YouTube tem cota diária apertada demais pra uma barra
 * que responde a cada tecla.
 */

export interface MusicResult {
  /** Id no Spotify. É o que vai no /resolve. */
  spotifyId: string
  title: string
  artist: string
  artUrl?: string
  durationMs?: number
  /**
   * Vídeo que toca isso. Já vem preenchido nas que o grupo tocou antes — e
   * clicar numa dessas toca NA HORA, sem passar pelo /resolve e sem gastar
   * cota. É por isso que o painel trata as duas de formas diferentes.
   */
  videoId?: string
}

/** Quantos resultados por busca. 12 enche a lista sem virar rolagem infinita. */
export const MUSIC_PAGE_SIZE = 12

/**
 * A busca está desligada (faltou chave no servidor, ou o provedor recusou a
 * que tem)? Não é "deu erro, tenta de novo": é "essa parte não existe agora",
 * e o painel precisa saber a diferença pra mostrar o campo de colar link em
 * vez de um botão de tentar novamente. Mesma ideia do seletor de GIF.
 */
export function isProviderOff(error: unknown): boolean {
  return error instanceof ApiError && error.status === 503
}

/** O YouTube não tem essa faixa (ou a cota acabou pra descobrir). */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

/** A conta do Spotify não está vinculada (ou o acesso foi revogado lá). */
export function isNotLinked(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409
}

export interface SpotifyStatus {
  /** O servidor tem as chaves: dá pra oferecer o botão de vincular. */
  available: boolean
  linked: boolean
  displayName: string | null
  linkedAt: string | null
}

export interface SpotifyPlaylist {
  id: string
  name: string
  /** Quantas faixas tem no total (não quantas vieram). */
  total: number
  artUrl?: string
}

/** Id especial: as músicas curtidas não são uma playlist de verdade no Spotify. */
export const CURTIDAS = 'curtidas'

export const music = {
  async search(
    token: string,
    q: string,
    signal?: AbortSignal,
    limit = MUSIC_PAGE_SIZE
  ): Promise<{ tracks: MusicResult[] }> {
    const params = new URLSearchParams({ q, limit: String(limit) })
    return request<{ tracks: MusicResult[] }>(`/music/search?${params.toString()}`, {
      token,
      signal
    })
  },

  /**
   * De faixa do Spotify pro vídeo que toca ela. Só o id vai — título, artista
   * e capa voltam do servidor, que os relê do Spotify.
   */
  async resolve(token: string, spotifyId: string): Promise<{ track: MusicResult }> {
    return request<{ track: MusicResult }>('/music/resolve', {
      token,
      method: 'POST',
      body: JSON.stringify({ spotifyId })
    })
  }
}

/**
 * Vincular a conta pessoal.
 *
 * Vincular NÃO muda quem toca — o áudio continua saindo do YouTube. O que ela
 * traz é o catálogo pessoal (as suas playlists, as suas curtidas), que a busca
 * pública não alcança. O token de acesso nunca chega até aqui: fica cifrado na
 * API e o launcher só sabe "vinculada: sim/não".
 */
export const spotify = {
  async status(token: string): Promise<SpotifyStatus> {
    return request<SpotifyStatus>('/music/spotify/status', { token })
  },

  /** Devolve a URL do Spotify pra abrir no navegador PADRÃO da pessoa. */
  async loginUrl(token: string): Promise<{ url: string }> {
    return request<{ url: string }>('/music/spotify/login', { token })
  },

  async unlink(token: string): Promise<void> {
    await request('/music/spotify/link', { token, method: 'DELETE' })
  },

  async playlists(token: string): Promise<{ playlists: SpotifyPlaylist[] }> {
    return request<{ playlists: SpotifyPlaylist[] }>('/music/spotify/playlists', { token })
  },

  async tracks(
    token: string,
    playlistId: string,
    signal?: AbortSignal
  ): Promise<{ tracks: MusicResult[]; total: number; hasMore: boolean }> {
    return request<{ tracks: MusicResult[]; total: number; hasMore: boolean }>(
      `/music/spotify/playlists/${encodeURIComponent(playlistId)}/tracks?limit=50`,
      { token, signal }
    )
  }
}
