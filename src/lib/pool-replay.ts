import type { PoolEvent, PoolReplay } from './api-board.ts'

/**
 * Tocador de replay do bilhar. Puro: não toca em DOM nem em áudio.
 * Recebe o replay já decodificado (frames em milímetros, eventos com tempo)
 * e devolve posições interpoladas e eventos que ainda não saíram.
 */
export interface ReplayPlayer {
  duration: number
  /** posições (m) de todas as bolas no tempo t; bolas não presentes mantêm a última posição conhecida */
  at(t: number): Map<number, { x: number; y: number }>
  /** eventos com tempo em (prev, t]; cada evento sai uma vez */
  eventsBetween(prev: number, t: number): PoolEvent[]
}

/**
 * Cria o tocador a partir do replay da API. `start` são as posições iniciais
 * (em metros), usadas como primeira amostra de cada bola em t = 0.
 */
export function createReplayPlayer(replay: PoolReplay, start: ReadonlyArray<{ id: number; x: number; y: number }>): ReplayPlayer {
  // trilha por bola: lista de (t, x, y) em metros, começando pela posição inicial
  const tracks = new Map<number, Array<[number, number, number]>>()
  for (const b of start) tracks.set(b.id, [[0, b.x, b.y]])
  for (const f of replay.frames) {
    const seen = new Set<number>()
    for (const [id, mx, my] of f.b) {
      const tr = tracks.get(id) ?? []
      tr.push([f.t, mx / 1000, my / 1000])
      tracks.set(id, tr)
      seen.add(id)
    }
    // bola ausente neste quadro segue parada na última posição conhecida (amostra no mesmo t)
    for (const [id, tr] of tracks) {
      if (seen.has(id)) continue
      const last = tr[tr.length - 1]
      tr.push([f.t, last[1], last[2]])
    }
  }
  const sorted = [...replay.events].sort((a, b) => a.t - b.t)
  return {
    duration: replay.duration,
    at(t) {
      const out = new Map<number, { x: number; y: number }>()
      for (const [id, tr] of tracks) {
        // última amostra com tempo <= t
        let i = tr.length - 1
        while (i > 0 && tr[i][0] > t) i--
        const a = tr[i], b = tr[i + 1]
        if (!b || t <= a[0]) { out.set(id, { x: a[1], y: a[2] }); continue }
        // interpola linearmente até a próxima amostra
        const k = (t - a[0]) / (b[0] - a[0])
        out.set(id, { x: a[1] + (b[1] - a[1]) * k, y: a[2] + (b[2] - a[2]) * k })
      }
      return out
    },
    eventsBetween(prev, t) { return sorted.filter((e) => e.t > prev && e.t <= t) }
  }
}
