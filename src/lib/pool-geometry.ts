/**
 * CÓPIA das constantes de `src/lib/pool/geometry.ts` da API (api-bilhar).
 * Mantida à mão: se a mesa mudar lá, mudar aqui também.
 *
 * A MESA DE BILHAR — medidas em metros, origem no canto superior esquerdo,
 * x ao longo do comprimento. Igual em todos os temas.
 */
export const TABLE_W = 2.54
export const TABLE_H = 1.27
export const BALL_R = 0.028575
export const HEAD_LINE_X = 0.635
export const FOOT_SPOT = { x: 1.905, y: 0.635 } as const

export interface Pocket { x: number; y: number; r: number }
/** Cantos (raio de captura 0,055) e meios (0,05). Índices: 0 sup-esq, 1 sup-meio, 2 sup-dir, 3 inf-esq, 4 inf-meio, 5 inf-dir. */
export const POCKETS: readonly Pocket[] = [
  { x: 0, y: 0, r: 0.055 }, { x: TABLE_W / 2, y: -0.01, r: 0.05 }, { x: TABLE_W, y: 0, r: 0.055 },
  { x: 0, y: TABLE_H, r: 0.055 }, { x: TABLE_W / 2, y: TABLE_H + 0.01, r: 0.05 }, { x: TABLE_W, y: TABLE_H, r: 0.055 }
]

export interface Cushion { ax: number; ay: number; bx: number; by: number; nx: number; ny: number }
/** Quatro tabelas retas com normal para dentro. Caçapas são testadas antes. */
export const CUSHIONS: readonly Cushion[] = [
  { ax: 0, ay: 0, bx: TABLE_W, by: 0, nx: 0, ny: 1 },
  { ax: 0, ay: TABLE_H, bx: TABLE_W, by: TABLE_H, nx: 0, ny: -1 },
  { ax: 0, ay: 0, bx: 0, by: TABLE_H, nx: 1, ny: 0 },
  { ax: TABLE_W, ay: 0, bx: TABLE_W, by: TABLE_H, nx: -1, ny: 0 }
]

export interface AimResult {
  /** ponto onde o centro da branca para (contato) */
  cx: number; cy: number
  kind: 'ball' | 'cushion' | 'none'
  ballId: number | null
  /** direção de saída da bola alvo (unitário) e tangente da branca */
  targetDir: { x: number; y: number } | null
  cueDir: { x: number; y: number } | null
}

/** Raio de máximo offset (efeito) na branca, em metros. */
const MAX_OFFSET = 0.6

/**
 * Limita o offset (efeito) da branca ao raio 0,6. Valores dentro do raio
 * voltam inalterados; fora dele são reduzidos à borda, mantendo a direção.
 */
export function clampOffset(sx: number, sy: number): { x: number; y: number } {
  const m = Math.hypot(sx, sy)
  if (m <= MAX_OFFSET) return { x: sx, y: sy }
  return { x: (sx * MAX_OFFSET) / m, y: (sy * MAX_OFFSET) / m }
}

/**
 * Simula a mira: a partir da branca, na direção `angle`, acha a primeira bola
 * (ou a tabela) em que o centro da branca encosta. Devolve o ponto de contato
 * e as direções de saída da alvo e da branca.
 */
export function aim(cue: { x: number; y: number }, angle: number, balls: ReadonlyArray<{ id: number; x: number; y: number }>): AimResult {
  const dx = Math.cos(angle), dy = Math.sin(angle)
  let best: { t: number; id: number; x: number; y: number } | null = null
  for (const b of balls) {
    if (b.id === 0) continue
    // interseção raio (cue + t·d) com círculo raio 2R em b
    const fx = cue.x - b.x, fy = cue.y - b.y
    const bq = 2 * (fx * dx + fy * dy)
    const c = fx * fx + fy * fy - (2 * BALL_R) ** 2
    const disc = bq * bq - 4 * c
    if (disc < 0) continue
    const t = (-bq - Math.sqrt(disc)) / 2
    if (t <= 0) continue
    if (!best || t < best.t) best = { t, id: b.id, x: b.x, y: b.y }
  }
  // tabela: menor t em que o centro chega a R da borda
  let tc = Infinity
  if (dx > 0) tc = Math.min(tc, (TABLE_W - BALL_R - cue.x) / dx)
  if (dx < 0) tc = Math.min(tc, (BALL_R - cue.x) / dx)
  if (dy > 0) tc = Math.min(tc, (TABLE_H - BALL_R - cue.y) / dy)
  if (dy < 0) tc = Math.min(tc, (BALL_R - cue.y) / dy)
  if (best && best.t < tc) {
    const cx = cue.x + dx * best.t, cy = cue.y + dy * best.t
    const nx = (best.x - cx) / (2 * BALL_R), ny = (best.y - cy) / (2 * BALL_R)
    const dot = dx * nx + dy * ny
    const tx = dx - dot * nx, ty = dy - dot * ny
    const tl = Math.hypot(tx, ty) || 1
    return { cx, cy, kind: 'ball', ballId: best.id, targetDir: { x: nx, y: ny }, cueDir: { x: tx / tl, y: ty / tl } }
  }
  if (!Number.isFinite(tc)) return { cx: cue.x, cy: cue.y, kind: 'none', ballId: null, targetDir: null, cueDir: null }
  return { cx: cue.x + dx * tc, cy: cue.y + dy * tc, kind: 'cushion', ballId: null, targetDir: null, cueDir: null }
}

// ---------------------------------------------------------------------------
// A linha-guia inteira (estilo Side Pocket): a branca até a primeira bola,
// com as tabelas no caminho; depois do contato, pra onde a alvo vai até a
// tabela ou a caçapa; e a tangente curta da branca.
// ---------------------------------------------------------------------------

export type Pt = { x: number; y: number }
export type StopKind = 'ball' | 'cushion' | 'pocket' | 'none'

export interface Trace {
  /** Pontos do caminho do centro: começo, cada tabela, e onde para. */
  points: Pt[]
  kind: StopKind
  /** Bola em que encostou (kind 'ball') ou caçapa em que cai (kind 'pocket', índice de POCKETS). */
  ballId: number | null
  pocket: number | null
  /** Direção de chegada (unitário) no último ponto. */
  dir: Pt
}

export interface AimPath {
  cue: Trace
  /** Fantasma da branca no contato (último ponto de `cue.points`), só com kind 'ball'. */
  ghost: Pt | null
  /** Caminho da bola alvo depois do contato (do centro dela até a tabela/caçapa/outra bola). */
  target: Trace | null
  /** Tangente da branca depois do contato (unitário); nulo em tacada cheia. */
  tangent: Pt | null
}

interface Hit { t: number; kind: StopKind; ballId: number | null; pocket: number | null; cushion: Cushion | null; ball: Pt | null }

/** Primeiro evento no raio `from + t·dir` para uma bola de raio R: bola, caçapa ou tabela. */
function firstHit(from: Pt, dir: Pt, balls: ReadonlyArray<{ id: number; x: number; y: number }>, skipId: number): Hit {
  let best: Hit = { t: Infinity, kind: 'none', ballId: null, pocket: null, cushion: null, ball: null }
  for (const b of balls) {
    if (b.id === skipId) continue
    const t = rayCircle(from, dir, b, 2 * BALL_R)
    if (t !== null && t < best.t) best = { t, kind: 'ball', ballId: b.id, pocket: null, cushion: null, ball: { x: b.x, y: b.y } }
  }
  POCKETS.forEach((p, i) => {
    const t = rayCircle(from, dir, p, p.r)
    if (t !== null && t < best.t) best = { t, kind: 'pocket', ballId: null, pocket: i, cushion: null, ball: null }
  })
  for (const c of CUSHIONS) {
    // o centro chega a R da reta (normal pra dentro): (from + t·dir − a)·n = R
    const vn = dir.x * c.nx + dir.y * c.ny
    if (vn >= 0) continue
    const d = (from.x - c.ax) * c.nx + (from.y - c.ay) * c.ny
    const t = (BALL_R - d) / vn
    if (t > 1e-9 && t < best.t) best = { t, kind: 'cushion', ballId: null, pocket: null, cushion: c, ball: null }
  }
  return best
}

/** Menor t > 0 em que o raio entra no círculo (centro c, raio r); nulo se não entra. */
function rayCircle(from: Pt, dir: Pt, c: Pt, r: number): number | null {
  const fx = from.x - c.x, fy = from.y - c.y
  const b = fx * dir.x + fy * dir.y
  const q = fx * fx + fy * fy - r * r
  const disc = b * b - q
  if (disc < 0) return null
  const t = -b - Math.sqrt(disc)
  return t > 1e-9 ? t : null
}

/**
 * Traça o caminho de uma bola a partir de `from` na direção `dir`, batendo
 * em até `bounces` tabelas (reflexão simples), até encostar numa bola, cair
 * numa caçapa ou esgotar `maxLen` metros.
 */
export function trace(
  from: Pt,
  dir: Pt,
  balls: ReadonlyArray<{ id: number; x: number; y: number }>,
  skipId: number,
  bounces: number,
  maxLen: number
): Trace {
  const points: Pt[] = [{ x: from.x, y: from.y }]
  let p = from
  let d = dir
  let left = maxLen
  for (let i = 0; ; i++) {
    const h = firstHit(p, d, balls, skipId)
    if (h.kind === 'none' || !Number.isFinite(h.t)) return { points, kind: 'none', ballId: null, pocket: null, dir: d }
    const t = Math.min(h.t, left)
    const q = { x: p.x + d.x * t, y: p.y + d.y * t }
    points.push(q)
    left -= t
    if (t < h.t) return { points, kind: 'none', ballId: null, pocket: null, dir: d }
    if (h.kind !== 'cushion' || i >= bounces || left <= 0) {
      return { points, kind: h.kind, ballId: h.ballId, pocket: h.pocket, dir: d }
    }
    const c = h.cushion!
    const vn = d.x * c.nx + d.y * c.ny
    d = { x: d.x - 2 * vn * c.nx, y: d.y - 2 * vn * c.ny }
    p = q
  }
}

/**
 * A linha-guia completa: a branca até a primeira bola (com até `bounces`
 * tabelas no caminho), a saída da alvo até a tabela ou a caçapa e a tangente
 * da branca. É só geometria: a física real (efeito, throw) pode desviar.
 */
export function aimPath(cue: Pt, angle: number, balls: ReadonlyArray<{ id: number; x: number; y: number }>, bounces = 2): AimPath {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) }
  const cuePath = trace(cue, dir, balls, 0, bounces, 6)
  if (cuePath.kind !== 'ball' || cuePath.ballId === null) return { cue: cuePath, ghost: null, target: null, tangent: null }
  const ghost = cuePath.points[cuePath.points.length - 1]
  const hit = balls.find((b) => b.id === cuePath.ballId)!
  const nx = (hit.x - ghost.x) / (2 * BALL_R), ny = (hit.y - ghost.y) / (2 * BALL_R)
  const d = cuePath.dir
  const dot = d.x * nx + d.y * ny
  // alvo sai pela linha dos centros; com corte muito fino quase não anda
  const target = dot > 0.02 ? trace(hit, { x: nx, y: ny }, balls, hit.id, 0, 3) : null
  const tx = d.x - dot * nx, ty = d.y - dot * ny
  const tl = Math.hypot(tx, ty)
  const tangent = tl > 1e-3 ? { x: tx / tl, y: ty / tl } : null
  return { cue: cuePath, ghost, target, tangent }
}

/** Centro da bola (raio R) cabe inteiro dentro da mesa. */
export function insideTable(x: number, y: number): boolean {
  return x >= BALL_R && x <= TABLE_W - BALL_R && y >= BALL_R && y <= TABLE_H - BALL_R
}

/** Uma bola em (x, y) sobrepõe alguma das `balls` (distância menor que 2R). */
export function overlaps(x: number, y: number, balls: ReadonlyArray<{ x: number; y: number }>): boolean {
  return balls.some((b) => Math.hypot(b.x - x, b.y - y) < 2 * BALL_R)
}

/** Centro em cima de uma caçapa (o servidor recusa a branca ali). */
export function inPocket(x: number, y: number): boolean {
  return POCKETS.some((p) => Math.hypot(x - p.x, y - p.y) <= p.r)
}
