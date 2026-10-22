/**
 * Cópia embaralhada (Fisher–Yates). A original fica intacta: é o estado da
 * tela, e embaralhar ela mudaria a ordem que a pessoa está vendo.
 *
 * O "Aleatório" da playlist embaralha AQUI, a lista inteira, e só depois corta
 * no teto do envio — senão uma playlist de 300 sortearia sempre entre as 100
 * primeiras.
 */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * Só as playlists do Spotify que dá pra tocar. Desde fev/2026 o Spotify só
 * entrega as faixas das que a pessoa criou ou colabora — as salvas de outros
 * vêm só com nome e capa, e mostrar elas era prometer o que não abre.
 * `readable` ausente (API antiga) conta como tocável.
 */
export function playablePlaylists<T extends { readable?: boolean }>(playlists: readonly T[]): T[] {
  return playlists.filter((playlist) => playlist.readable !== false)
}

/** Lê página atrás de página (de 50) até acabar ou chegar no teto. */
export async function collectPages<T>(
  fetchPage: (offset: number) => Promise<{ tracks: T[]; hasMore: boolean }>,
  max: number,
  onPage?: (soFar: T[]) => void
): Promise<T[]> {
  const all: T[] = []
  while (all.length < max) {
    const page = await fetchPage(all.length)
    all.push(...page.tracks)
    onPage?.(all.slice(0, max))
    if (!page.hasMore || page.tracks.length === 0) break
  }
  return all.slice(0, max)
}

type SpotifyLike = { spotifyId: string; videoId?: string }

/**
 * Garante o vídeo das faixas do Spotify que vão tocar. As que o grupo já tocou
 * vêm com `videoId`; as outras são procuradas de 50 em 50 até a cota do dia
 * acabar. Devolve as tocáveis NA ORDEM pedida.
 */
export async function withSpotifyVideos<T extends SpotifyLike>(
  wanted: readonly T[],
  resolveMany: (
    spotifyIds: string[]
  ) => Promise<{ tracks: SpotifyLike[]; failed: number; quota: boolean }>
): Promise<{ ready: (T & { videoId: string })[]; failed: number; quota: boolean }> {
  const missing = [...new Set(wanted.filter((t) => !t.videoId).map((t) => t.spotifyId))]
  const found = new Map<string, string>()
  let failed = 0
  let quota = false
  for (let i = 0; i < missing.length && !quota; i += 50) {
    const page = await resolveMany(missing.slice(i, i + 50))
    for (const track of page.tracks) if (track.videoId) found.set(track.spotifyId, track.videoId)
    failed += page.failed
    quota = page.quota
  }
  const ready = wanted
    .map((t) => (t.videoId ? t : { ...t, videoId: found.get(t.spotifyId) }))
    .filter((t): t is T & { videoId: string } => !!t.videoId)
  return { ready, failed, quota }
}
