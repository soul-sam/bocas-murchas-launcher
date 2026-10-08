/**
 * ROLAMENTO DAS BOLAS — só visual. O replay traz posições; daqui sai a
 * orientação de cada bola (matriz 3×3) girando como se rolasse sem deslizar:
 * eixo perpendicular ao deslocamento, no plano da mesa, ângulo = distância/R.
 *
 * Convenção: x pra direita, y pra baixo (tela), z pra fora da tela. O
 * desenho (draw.ts) lê colunas da matriz: `col(m, 2)` é o polo (onde fica o
 * número), `col(m, 0)` a direita do número, `col(m, 1)` o "pra baixo" dele.
 */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number]
export type Vec3 = { x: number; y: number; z: number }

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]

/** Coluna `i` da matriz (imagem do eixo local `i`). */
export function col(m: Mat3, i: 0 | 1 | 2): Vec3 {
  return { x: m[i], y: m[3 + i], z: m[6 + i] }
}

/** Rotação de `theta` em torno do eixo unitário `a`, composta POR FORA (no referencial da mesa): R·m. */
export function rotate(m: Mat3, a: Vec3, theta: number): Mat3 {
  const c = Math.cos(theta), s = Math.sin(theta), k = 1 - c
  // Rodrigues
  const r00 = c + a.x * a.x * k, r01 = a.x * a.y * k - a.z * s, r02 = a.x * a.z * k + a.y * s
  const r10 = a.y * a.x * k + a.z * s, r11 = c + a.y * a.y * k, r12 = a.y * a.z * k - a.x * s
  const r20 = a.z * a.x * k - a.y * s, r21 = a.z * a.y * k + a.x * s, r22 = c + a.z * a.z * k
  return [
    r00 * m[0] + r01 * m[3] + r02 * m[6], r00 * m[1] + r01 * m[4] + r02 * m[7], r00 * m[2] + r01 * m[5] + r02 * m[8],
    r10 * m[0] + r11 * m[3] + r12 * m[6], r10 * m[1] + r11 * m[4] + r12 * m[7], r10 * m[2] + r11 * m[5] + r12 * m[8],
    r20 * m[0] + r21 * m[3] + r22 * m[6], r20 * m[1] + r21 * m[4] + r22 * m[7], r20 * m[2] + r21 * m[5] + r22 * m[8]
  ]
}

/**
 * A bola andou (dx, dy) metros: gira em torno de (−dy, dx, 0) por |d|/R. O
 * topo da bola anda no sentido do movimento, como no pano de verdade.
 */
export function roll(m: Mat3, dx: number, dy: number, radius: number): Mat3 {
  const d = Math.hypot(dx, dy)
  if (d < 1e-7) return m
  return rotate(m, { x: -dy / d, y: dx / d, z: 0 }, d / radius)
}

/** Giro em torno do eixo vertical (efeito lateral), só pra enfeitar o replay. */
export function spin(m: Mat3, theta: number): Mat3 {
  return rotate(m, { x: 0, y: 0, z: 1 }, theta)
}

/** Realinha as colunas (Gram–Schmidt): depois de milhares de quadros a matriz derrapa. */
export function orthonormalize(m: Mat3): Mat3 {
  let a = col(m, 0), b = col(m, 1)
  a = unit(a)
  const ab = a.x * b.x + a.y * b.y + a.z * b.z
  b = unit({ x: b.x - ab * a.x, y: b.y - ab * a.y, z: b.z - ab * a.z })
  const c = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
  return [a.x, b.x, c.x, a.y, b.y, c.y, a.z, b.z, c.z]
}

function unit(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / l, y: v.y / l, z: v.z / l }
}

/** Orientação "sortida" mas determinística (a mesma mesa mostra as mesmas bolas pros dois lados). */
export function seeded(id: number, seed: number): Mat3 {
  let h = (seed * 73856093) ^ (id * 19349663)
  const next = () => {
    h = (h * 1664525 + 1013904223) >>> 0
    return h / 4294967296
  }
  let m: Mat3 = IDENTITY
  m = rotate(m, { x: 0, y: 0, z: 1 }, next() * Math.PI * 2)
  m = rotate(m, { x: 1, y: 0, z: 0 }, (next() - 0.5) * 1.2)
  m = rotate(m, { x: 0, y: 1, z: 0 }, (next() - 0.5) * 1.2)
  return m
}
