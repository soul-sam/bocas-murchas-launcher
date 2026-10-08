/**
 * Desenho da mesa de bilhar — puro, só recebe o ctx e os dados (sem React).
 * Cor de pano, bola e taco é CONTEÚDO (como as peças do xadrez): não segue o
 * tema, por isso mora aqui como constante e este arquivo está na allowlist do
 * lint:design.
 *
 * Referências: a mesa vista de cima do Side Pocket (Data East, SNES) — madeira
 * quente, caçapas de latão, linha-guia pontilhada que rasteja — e as bolas
 * com volume do 8 Ball Pool. As bolas ROLAM: cada uma carrega uma matriz de
 * orientação (lib/pool-roll) e o número/listra é a projeção da esfera.
 *
 * Convenção: tudo é desenhado num espaço "lógico" w×h (mesa deitada). Quem
 * chama (PoolCanvas) aplica a rotação do retrato antes de chamar.
 */
import { TABLE_W, TABLE_H, BALL_R, HEAD_LINE_X, FOOT_SPOT, POCKETS, type AimPath, type Pt } from '@/lib/pool-geometry'
import { col, IDENTITY, type Mat3, type Vec3 } from '@/lib/pool-roll'
import type { PoolSkin } from '../../../electron/preload/types'

export type { PoolSkin }

export interface SceneBall {
  id: number
  x: number
  y: number
  /** orientação (rolamento); sem ela o número fica de frente */
  m?: Mat3
  /** caindo na caçapa: encolhe e some */
  scale?: number
  alpha?: number
}
export interface CueView {
  angle: number
  /** recuo do taco (0..1, a força) */
  pull: number
}
export interface Scene {
  balls: SceneBall[]
  /** branca na mão seguindo o ponteiro */
  ghostCue: { x: number; y: number; ok: boolean } | null
  /** a minha mira */
  aim: { path: AimPath; power: number } | null
  /** o meu taco */
  cue: CueView | null
  /** o taco de quem está na vez (adversário ou, pra quem assiste, qualquer um) e a mira dele */
  peer: { cue: CueView | null; path: AimPath | null; ghost: Pt | null } | null
  /** relógio (ms) do rastejo dos pontinhos; 0 = parado */
  t: number
}

/** Borda de madeira de cada lado, em metros (fora do retângulo jogável). */
const MARGIN = 0.1
/** Faixa da tabela (borracha forrada), entre o pano jogável e a madeira. */
const CUSHION_W = 0.036

export const CLOTH: Record<PoolSkin['cloth'], string> = { verde: '#2b8d55', azul: '#2563a8', vermelho: '#96303c', preto: '#2f3236' }
export const RAIL: Record<PoolSkin['rails'], string> = { madeira: '#7b4b22', cereja: '#5c2219', preto: '#1b1b1e' }
const BALL_COLOR: Record<number, string> = {
  1: '#f4c21a', 2: '#1d56b8', 3: '#d9262c', 4: '#5b2b8c', 5: '#f27d14', 6: '#1a8c3f', 7: '#7d3a16', 8: '#141416'
}
const CUE_BALL = '#f6f2e8'
const CUE_DOT = '#c8262c'
const BRASS = ['#f3d98a', '#b8862b', '#f6e3a8', '#8a6118']

/** Cor de uma bola (e se é listrada), para as miniaturas do placar. */
export function ballLook(id: number): { color: string; striped: boolean } {
  return { color: id === 0 ? CUE_BALL : BALL_COLOR[id <= 8 ? id : id - 8], striped: id >= 9 }
}

/** Fundo CSS de uma bolinha do placar (esfera com brilho; listrada com a faixa). */
export function miniBallCss(id: number): string {
  const { color, striped } = ballLook(id)
  const shine = 'radial-gradient(circle at 34% 28%, rgba(255,255,255,0.75), rgba(255,255,255,0) 40%)'
  const shadow = 'radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%)'
  const body = striped ? `linear-gradient(${CUE_BALL} 0 26%, ${color} 26% 74%, ${CUE_BALL} 74%)` : color
  return `${shine}, ${shadow}, ${body}`
}

/** A branca grande do seletor de efeito: esfera branca com as pintas de treino. */
export function cueBallSphereCss(): string {
  return `radial-gradient(circle at 36% 30%, #ffffff 0%, ${CUE_BALL} 38%, #cfc8b8 78%, #8f887a 100%)`
}
export const CUE_DOT_COLOR = CUE_DOT

/** Centro desenhado da caçapa `i` (ligeiramente pra fora do canto, onde o buraco aparece). */
export function pocketCenter(i: number): Pt {
  const p = POCKETS[i]
  const corner = i !== 1 && i !== 4
  const dx = p.x === 0 ? -1 : p.x === TABLE_W ? 1 : 0
  const dy = p.y <= 0 ? -1 : 1
  const off = corner ? 0.016 : 0.02
  return { x: p.x + dx * off, y: p.y + dy * off }
}

export function tableToCanvas(w: number, h: number): { scale: number; ox: number; oy: number } {
  const scale = Math.min(w / (TABLE_W + MARGIN * 2), h / (TABLE_H + MARGIN * 2))
  return { scale, ox: (w - TABLE_W * scale) / 2, oy: (h - TABLE_H * scale) / 2 }
}

/**
 * Inverso: ponto do ponteiro (px, no canvas físico w×h) → metros da mesa.
 * `rotated` = mesa em pé: o espaço lógico é h×w e o ponto gira de volta.
 */
export function canvasToTable(px: number, py: number, w: number, h: number, rotated: boolean): { x: number; y: number } {
  const lw = rotated ? h : w
  const lh = rotated ? w : h
  const lx = rotated ? py : px
  const ly = rotated ? w - px : py
  const { scale, ox, oy } = tableToCanvas(lw, lh)
  return { x: (lx - ox) / scale, y: (ly - oy) / scale }
}

// ---------------------------------------------------------------------------
// A mesa (pré-renderizada: só muda com skin/tamanho)
// ---------------------------------------------------------------------------

export function drawTable(ctx: CanvasRenderingContext2D, w: number, h: number, skin: PoolSkin, logo: CanvasImageSource | null): void {
  const { scale: s, ox, oy } = tableToCanvas(w, h)
  const m = MARGIN * s
  const cw = TABLE_W * s, ch = TABLE_H * s
  const cu = CUSHION_W * s
  ctx.clearRect(0, 0, w, h)

  // --- a madeira --------------------------------------------------------------
  const rail = RAIL[skin.rails]
  ctx.save()
  roundRect(ctx, ox - m, oy - m, cw + m * 2, ch + m * 2, m * 0.5)
  ctx.fillStyle = rail
  ctx.fill()
  ctx.clip()
  if (skin.rails !== 'preto') woodGrain(ctx, ox - m, oy - m, cw + m * 2, ch + m * 2, rail)
  else {
    // laca preta: um reflexo diagonal suave
    const g = ctx.createLinearGradient(ox - m, oy - m, ox + cw + m, oy + ch + m)
    g.addColorStop(0, 'rgba(255,255,255,0.10)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.02)')
    g.addColorStop(1, 'rgba(255,255,255,0.08)')
    ctx.fillStyle = g
    ctx.fillRect(ox - m, oy - m, cw + m * 2, ch + m * 2)
  }
  // bisel: luz por cima/esquerda, sombra por baixo/direita
  ctx.lineWidth = Math.max(1, m * 0.08)
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  roundRect(ctx, ox - m + ctx.lineWidth / 2, oy - m + ctx.lineWidth / 2, cw + m * 2 - ctx.lineWidth, ch + m * 2 - ctx.lineWidth, m * 0.46)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  roundRect(ctx, ox - m + ctx.lineWidth * 1.5, oy - m + ctx.lineWidth * 1.5, cw + m * 2 - ctx.lineWidth * 3, ch + m * 2 - ctx.lineWidth * 3, m * 0.42)
  ctx.stroke()
  ctx.restore()

  // sombra da madeira sobre o pano (a borda tem altura)
  ctx.save()
  ctx.beginPath()
  ctx.rect(ox - cu, oy - cu, cw + cu * 2, ch + cu * 2)
  ctx.clip()
  // --- o pano (campo + faixa das tabelas) --------------------------------------
  const cloth = CLOTH[skin.cloth]
  ctx.fillStyle = cloth
  ctx.fillRect(ox - cu, oy - cu, cw + cu * 2, ch + cu * 2)
  clothTexture(ctx, ox - cu, oy - cu, cw + cu * 2, ch + cu * 2)
  if (skin.finish === 'brilho') {
    const g = ctx.createRadialGradient(ox + cw / 2, oy + ch * 0.45, 0, ox + cw / 2, oy + ch / 2, Math.max(cw, ch) * 0.62)
    g.addColorStop(0, 'rgba(255,255,255,0.16)')
    g.addColorStop(0.55, 'rgba(255,255,255,0.03)')
    g.addColorStop(1, 'rgba(0,0,0,0.18)')
    ctx.fillStyle = g
    ctx.fillRect(ox - cu, oy - cu, cw + cu * 2, ch + cu * 2)
  } else {
    const g = ctx.createRadialGradient(ox + cw / 2, oy + ch / 2, Math.min(cw, ch) * 0.3, ox + cw / 2, oy + ch / 2, Math.max(cw, ch) * 0.7)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.22)')
    ctx.fillStyle = g
    ctx.fillRect(ox - cu, oy - cu, cw + cu * 2, ch + cu * 2)
  }
  ctx.restore()

  // --- as tabelas (seis faixas com as "bocas" chanfradas nas caçapas) ------------
  const dark = shade(cloth, -0.22)
  const light = shade(cloth, 0.14)
  const jaw = cu * 1.9 // quanto a faixa recua perto da caçapa
  const sideJaw = cu * 1.4
  const bands: Array<[number, number, number, number, number, number, number, number]> = []
  // topo: dois trechos (esq/dir da caçapa do meio); base igual; laterais um cada
  const half = cw / 2
  const sideR = POCKETS[1].r * s * 1.05
  bands.push([ox + jaw, oy - cu, ox + half - sideR - sideJaw * 0.3, oy - cu, ox + half - sideR - sideJaw, oy, ox + jaw * 0.55, oy])
  bands.push([ox + half + sideR + sideJaw * 0.3, oy - cu, ox + cw - jaw, oy - cu, ox + cw - jaw * 0.55, oy, ox + half + sideR + sideJaw, oy])
  bands.push([ox + jaw * 0.55, oy + ch, ox + half - sideR - sideJaw, oy + ch, ox + half - sideR - sideJaw * 0.3, oy + ch + cu, ox + jaw, oy + ch + cu])
  bands.push([ox + half + sideR + sideJaw, oy + ch, ox + cw - jaw * 0.55, oy + ch, ox + cw - jaw, oy + ch + cu, ox + half + sideR + sideJaw * 0.3, oy + ch + cu])
  bands.push([ox - cu, oy + jaw, ox, oy + jaw * 0.55, ox, oy + ch - jaw * 0.55, ox - cu, oy + ch - jaw])
  bands.push([ox + cw, oy + jaw * 0.55, ox + cw + cu, oy + jaw, ox + cw + cu, oy + ch - jaw, ox + cw, oy + ch - jaw * 0.55])
  for (const b of bands) {
    ctx.beginPath()
    ctx.moveTo(b[0], b[1]); ctx.lineTo(b[2], b[3]); ctx.lineTo(b[4], b[5]); ctx.lineTo(b[6], b[7]); ctx.closePath()
    ctx.fillStyle = dark
    ctx.fill()
    // o nariz da tabela (a aresta de dentro) pega luz
    ctx.strokeStyle = light
    ctx.lineWidth = Math.max(1, cu * 0.16)
    ctx.beginPath()
    // a aresta interna é o lado que encosta no campo: índices 4-6 nas de cima, 0-2 nas de baixo, etc.
    const [ix1, iy1, ix2, iy2] = innerEdge(b, ox, oy, cw, ch)
    ctx.moveTo(ix1, iy1); ctx.lineTo(ix2, iy2)
    ctx.stroke()
  }

  // --- caçapas: buraco e aro de latão -----------------------------------------
  for (let i = 0; i < POCKETS.length; i++) {
    const p = POCKETS[i]
    const corner = i !== 1 && i !== 4
    const dx = p.x === 0 ? -1 : p.x === TABLE_W ? 1 : 0
    const dy = p.y <= 0 ? -1 : 1
    const off = corner ? 0.016 : 0.02
    const px = ox + (p.x + dx * off) * s
    const py = oy + (corner ? p.y + dy * off : p.y + dy * off) * s
    const r = (corner ? 0.064 : 0.058) * s
    // aro
    const ring = ctx.createLinearGradient(px - r, py - r, px + r, py + r)
    ring.addColorStop(0, BRASS[0]); ring.addColorStop(0.45, BRASS[1]); ring.addColorStop(0.6, BRASS[2]); ring.addColorStop(1, BRASS[3])
    ctx.beginPath()
    ctx.arc(px, py, r + Math.max(1.5, 0.012 * s), 0, Math.PI * 2)
    ctx.fillStyle = ring
    ctx.fill()
    // buraco com fundo
    const hole = ctx.createRadialGradient(px - r * 0.2, py - r * 0.2, r * 0.1, px, py, r)
    hole.addColorStop(0, '#2a2a2c'); hole.addColorStop(0.6, '#0c0c0d'); hole.addColorStop(1, '#000000')
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fillStyle = hole
    ctx.fill()
  }

  // --- losangos (miras) na madeira --------------------------------------------
  const railMid = cu + (m - cu) * 0.5
  const diamond = (x: number, y: number) => {
    const d = Math.max(2.5, 0.013 * s)
    ctx.beginPath()
    ctx.moveTo(x, y - d); ctx.lineTo(x + d * 0.62, y); ctx.lineTo(x, y + d); ctx.lineTo(x - d * 0.62, y); ctx.closePath()
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x, y - d * 0.85); ctx.lineTo(x + d * 0.52, y - d * 0.12); ctx.lineTo(x, y + d * 0.62); ctx.lineTo(x - d * 0.52, y - d * 0.12); ctx.closePath()
    ctx.fillStyle = '#efe6cf'
    ctx.fill()
  }
  for (const k of [1, 2, 3, 5, 6, 7]) {
    diamond(ox + (cw * k) / 8, oy - railMid)
    diamond(ox + (cw * k) / 8, oy + ch + railMid)
  }
  for (const k of [1, 2, 3]) {
    diamond(ox - railMid, oy + (ch * k) / 4)
    diamond(ox + cw + railMid, oy + (ch * k) / 4)
  }

  // --- marcas do pano: linha de cabeça e pintas --------------------------------
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.lineWidth = Math.max(1, 0.004 * s)
  ctx.beginPath()
  ctx.moveTo(ox + HEAD_LINE_X * s, oy)
  ctx.lineTo(ox + HEAD_LINE_X * s, oy + ch)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  for (const sp of [{ x: HEAD_LINE_X, y: TABLE_H / 2 }, FOOT_SPOT]) {
    ctx.beginPath()
    ctx.arc(ox + sp.x * s, oy + sp.y * s, Math.max(1.5, 0.006 * s), 0, Math.PI * 2)
    ctx.fill()
  }

  // logo: depois do pano, antes das bolas
  if (logo) {
    const src = logo as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number }
    const iw = src.naturalWidth || src.width || 0
    const ih = src.naturalHeight || src.height || 0
    if (iw > 0 && ih > 0) {
      const lw = cw * 0.26
      const lh = lw * (ih / iw)
      ctx.save()
      ctx.globalAlpha = 0.1
      ctx.drawImage(logo, ox + (cw - lw) / 2, oy + (ch - lh) / 2, lw, lh)
      ctx.restore()
    }
  }
}

function innerEdge(b: number[], ox: number, oy: number, cw: number, ch: number): [number, number, number, number] {
  // escolhe os dois vértices que estão na borda do campo
  const pts = [[b[0], b[1]], [b[2], b[3]], [b[4], b[5]], [b[6], b[7]]]
  const on = pts.filter(([x, y]) => Math.abs(x - ox) < 0.5 || Math.abs(x - ox - cw) < 0.5 || Math.abs(y - oy) < 0.5 || Math.abs(y - oy - ch) < 0.5)
  if (on.length < 2) return [pts[0][0], pts[0][1], pts[1][0], pts[1][1]]
  return [on[0][0], on[0][1], on[1][0], on[1][1]]
}

/** Veio de madeira determinístico: linhas finas ao longo do comprimento, tom variando. */
function woodGrain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string): void {
  let seed = 7
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  const lightC = shade(base, 0.18), darkC = shade(base, -0.2)
  const bg = ctx.createLinearGradient(x, y, x + w, y + h)
  bg.addColorStop(0, shade(base, 0.08)); bg.addColorStop(0.5, base); bg.addColorStop(1, shade(base, -0.06))
  ctx.fillStyle = bg
  ctx.fillRect(x, y, w, h)
  ctx.lineWidth = 1
  const n = Math.round(h / 3)
  for (let i = 0; i < n; i++) {
    const yy = y + (i / n) * h + rnd() * 3
    const amp = 2 + rnd() * 5
    const a = 0.05 + rnd() * 0.12
    ctx.strokeStyle = rnd() > 0.5 ? lightC : darkC
    ctx.globalAlpha = a
    ctx.beginPath()
    ctx.moveTo(x, yy)
    const segs = 6
    for (let k = 1; k <= segs; k++) {
      const cx = x + (w * (k - 0.5)) / segs
      ctx.quadraticCurveTo(cx, yy + (rnd() - 0.5) * amp * 2, x + (w * k) / segs, yy + (rnd() - 0.5) * amp)
    }
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

/** Textura de feltro: pontinhos claros e escuros, bem leves. */
function clothTexture(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const pat = clothPattern(ctx)
  if (!pat) return
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.fillStyle = pat
  ctx.translate(x, y)
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

let clothPatternCache: CanvasPattern | null = null
let clothPatternCtx: CanvasRenderingContext2D | null = null
function clothPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (clothPatternCache && clothPatternCtx === ctx) return clothPatternCache
  const c = document.createElement('canvas')
  c.width = 96; c.height = 96
  const g = c.getContext('2d')
  if (!g) return null
  const img = g.createImageData(96, 96)
  let seed = 99
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const v = seed / 4294967296
    const light = v > 0.5
    img.data[i] = light ? 255 : 0
    img.data[i + 1] = light ? 255 : 0
    img.data[i + 2] = light ? 255 : 0
    img.data[i + 3] = Math.round(Math.abs(v - 0.5) * 2 * 18)
  }
  g.putImageData(img, 0, 0)
  clothPatternCache = ctx.createPattern(c, 'repeat')
  clothPatternCtx = ctx
  return clothPatternCache
}

// ---------------------------------------------------------------------------
// A cena (bolas, mira, taco)
// ---------------------------------------------------------------------------

export function drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, scene: Scene): void {
  const { scale: s, ox, oy } = tableToCanvas(w, h)
  const X = (x: number) => ox + x * s
  const Y = (y: number) => oy + y * s
  const r = BALL_R * s
  const cue = scene.balls.find((b) => b.id === 0) ?? null

  // mira do adversário (ou de quem está na vez), por baixo da minha
  if (scene.peer?.path) drawAimPath(ctx, X, Y, s, r, scene.peer.path, scene.t, 0.55)
  if (scene.aim) drawAimPath(ctx, X, Y, s, r, scene.aim.path, scene.t, 1)

  // sombras primeiro, depois as bolas (uma bola não deve sombrear a vizinha por cima)
  for (const b of scene.balls) drawShadow(ctx, X(b.x), Y(b.y), r * (b.scale ?? 1), b.alpha ?? 1)
  for (const b of scene.balls) drawBall(ctx, X(b.x), Y(b.y), r * (b.scale ?? 1), b.id, b.m ?? IDENTITY, b.alpha ?? 1)

  // branca na mão seguindo o ponteiro (a minha ou a de quem está na vez)
  const ghost = scene.ghostCue ?? (scene.peer?.ghost ? { ...scene.peer.ghost, ok: true } : null)
  if (ghost) {
    ctx.save()
    ctx.globalAlpha = ghost.ok ? 0.8 : 0.4
    drawShadow(ctx, X(ghost.x), Y(ghost.y), r, 0.6)
    drawBall(ctx, X(ghost.x), Y(ghost.y), r, 0, IDENTITY, 1)
    if (!ghost.ok) {
      ctx.globalAlpha = 0.95
      ctx.strokeStyle = '#e0323a'
      ctx.lineWidth = Math.max(1.5, r * 0.16)
      ctx.beginPath()
      ctx.arc(X(ghost.x), Y(ghost.y), r * 1.15, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  }

  // tacos: o do adversário mais apagado, o meu por cima
  if (scene.peer?.cue && cue) drawCue(ctx, X(cue.x), Y(cue.y), s, r, scene.peer.cue, 0.82)
  if (scene.cue && cue) drawCue(ctx, X(cue.x), Y(cue.y), s, r, scene.cue, 1)
}

function drawAimPath(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, s: number, r: number, path: AimPath, t: number, alpha: number): void {
  const px = (p: Pt) => ({ x: X(p.x), y: Y(p.y) })
  const spacing = r * 1.05
  const phase = t > 0 ? ((t / 1000) * spacing * 2.2) % spacing : 0
  ctx.save()
  ctx.globalAlpha = alpha
  // caminho da branca
  dots(ctx, path.cue.points.map(px), spacing, r * 0.14, phase, 'rgba(255,255,255,0.92)')
  // a caçapa onde a branca cairia: aviso em vermelho
  if (path.cue.kind === 'pocket' && path.cue.pocket !== null) pocketRing(ctx, X, Y, s, path.cue.pocket, '#e0323a', t)
  if (path.ghost) {
    const g = px(path.ghost)
    ctx.beginPath()
    ctx.arc(g.x, g.y, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    ctx.fill()
    ctx.setLineDash([r * 0.45, r * 0.35])
    ctx.lineWidth = Math.max(1, r * 0.1)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.stroke()
    ctx.setLineDash([])
  }
  if (path.target) {
    const pts = path.target.points.map(px)
    dots(ctx, pts, spacing, r * 0.11, phase, 'rgba(255,255,255,0.75)')
    const end = pts[pts.length - 1]
    if (path.target.kind === 'pocket' && path.target.pocket !== null) {
      pocketRing(ctx, X, Y, s, path.target.pocket, '#f3d98a', t)
    } else if (path.target.kind !== 'none') {
      ctx.beginPath()
      ctx.arc(end.x, end.y, r * 0.55, 0, Math.PI * 2)
      ctx.lineWidth = Math.max(1, r * 0.1)
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.stroke()
    }
  }
  if (path.tangent && path.ghost) {
    const g = px(path.ghost)
    const L = 0.16 * s
    dots(ctx, [g, { x: g.x + path.tangent.x * L, y: g.y + path.tangent.y * L }], spacing * 0.8, r * 0.09, phase, 'rgba(255,255,255,0.5)')
  }
  ctx.restore()
}

/** Anel pulsando numa caçapa (a alvo vai cair ali, ou a branca). */
function pocketRing(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, s: number, i: number, color: string, t: number): void {
  const p = POCKETS[i]
  const corner = i !== 1 && i !== 4
  const dx = p.x === 0 ? -1 : p.x === TABLE_W ? 1 : 0
  const dy = p.y <= 0 ? -1 : 1
  const off = corner ? 0.016 : 0.02
  const cx = X(p.x + dx * off), cy = Y(p.y + dy * off)
  const base = (corner ? 0.064 : 0.058) * s
  const k = t > 0 ? 0.5 + 0.5 * Math.sin(t / 180) : 1
  ctx.save()
  ctx.globalAlpha = 0.55 + 0.4 * k
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1.5, 0.008 * s)
  ctx.beginPath()
  ctx.arc(cx, cy, base + 0.012 * s + k * 0.008 * s, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** Pontinhos ao longo de uma polilinha, a cada `spacing` px, começando em `phase`. */
function dots(ctx: CanvasRenderingContext2D, pts: Pt[], spacing: number, radius: number, phase: number, color: string): void {
  if (pts.length < 2) return
  let carry = phase
  ctx.fillStyle = color
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 1e-6) continue
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len
    let d = carry
    while (d <= len) {
      const x = a.x + ux * d, y = a.y + uy * d
      ctx.beginPath()
      ctx.arc(x + 0.6, y + 0.8, radius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      d += spacing
    }
    carry = d - len
  }
}

// ---------------------------------------------------------------------------
// Bolas com volume e rolamento
// ---------------------------------------------------------------------------

const NUMBER_CAP = Math.cos((24 * Math.PI) / 180)
const STRIPE_CAP = 0.5
const DOT_CAP = Math.cos((6.5 * Math.PI) / 180)

function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
  const sp = shadowSprite(r)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.drawImage(sp.c, x - sp.half + r * 0.22, y - sp.half + r * 0.3)
  ctx.restore()
}

export function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, id: number, m: Mat3, alpha: number): void {
  const look = ballLook(id)
  const n = col(m, 2)
  ctx.save()
  if (alpha < 1) ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = look.color
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
  if (id === 0) {
    // branca de treino: seis pintas vermelhas, pra ver o giro
    ctx.fillStyle = CUE_DOT
    for (const axis of [col(m, 0), col(m, 1), n]) {
      fillCap(ctx, x, y, r, axis, DOT_CAP)
      fillCap(ctx, x, y, r, neg(axis), DOT_CAP)
    }
  } else {
    if (look.striped) {
      ctx.fillStyle = CUE_BALL
      fillCap(ctx, x, y, r, n, STRIPE_CAP)
      fillCap(ctx, x, y, r, neg(n), STRIPE_CAP)
    }
    // os dois círculos do número
    for (const sign of [1, -1] as const) {
      const pole = sign === 1 ? n : neg(n)
      if (pole.z <= -0.05) continue
      ctx.fillStyle = '#ffffff'
      fillCap(ctx, x, y, r, pole, NUMBER_CAP)
      const vis = Math.min(1, Math.max(0, (pole.z - 0.12) / 0.3))
      if (vis <= 0) continue
      const e1 = col(m, 0), e2 = col(m, 1)
      const rx = sign === 1 ? e1.x : -e1.x, ry = sign === 1 ? e1.y : -e1.y
      ctx.save()
      ctx.globalAlpha = alpha * vis
      ctx.transform(rx, ry, e2.x, e2.y, x + pole.x * r, y + pole.y * r)
      ctx.fillStyle = '#151515'
      ctx.font = `700 ${(id >= 10 ? 0.5 : 0.58) * r}px "Inter", "Segoe UI", system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(id), 0, r * 0.02)
      ctx.restore()
    }
  }
  ctx.restore()
  // volume: brilho em cima-esquerda, sombra na borda
  const sp = shadeSprite(r)
  ctx.save()
  if (alpha < 1) ctx.globalAlpha = alpha
  ctx.drawImage(sp.c, x - sp.half, y - sp.half)
  ctx.restore()
}

function neg(v: Vec3): Vec3 {
  return { x: -v.x, y: -v.y, z: -v.z }
}

/**
 * Pinta a parte VISÍVEL da calota {p·n > c} da esfera de raio r em (x, y),
 * vista de +z. O chamador já recortou o disco da bola.
 *
 * Geometria: a borda da calota (círculo de raio √(1−c²) centrado em c·n) vira
 * uma elipse na projeção; a metade visível é a elipse unida ao semiplano
 * além da corda (polo virado pra frente) ou o semiplano menos a elipse (polo
 * virado pra trás).
 */
function fillCap(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, n: Vec3, c: number): void {
  const h = Math.hypot(n.x, n.y)
  const s = Math.sqrt(Math.max(0, 1 - c * c))
  if (h < 1e-4) {
    if (n.z > 0) {
      ctx.beginPath()
      ctx.arc(x, y, s * r, 0, Math.PI * 2)
      ctx.fill()
    }
    return
  }
  const ux = n.x / h, uy = n.y / h
  const rot = Math.atan2(uy, ux)
  const ex = x + c * n.x * r, ey = y + c * n.y * r
  const a = Math.abs(n.z) * s * r, b = s * r
  if (n.z > 0) {
    ctx.beginPath()
    ctx.ellipse(ex, ey, Math.max(a, 0.01), b, rot, 0, Math.PI * 2)
    ctx.fill()
    if (h > c) {
      halfPlane(ctx, x, y, r, rot, c / h)
      ctx.fill()
    }
  } else {
    if (h <= c) return
    ctx.save()
    halfPlane(ctx, x, y, r, rot, c / h)
    ctx.clip()
    ctx.beginPath()
    ctx.rect(x - r - 1, y - r - 1, r * 2 + 2, r * 2 + 2)
    ctx.ellipse(ex, ey, Math.max(a, 0.01), b, rot, 0, Math.PI * 2)
    ctx.fill('evenodd')
    ctx.restore()
  }
}

/** Caminho do semiplano {u > k·r} (u ao longo da direção `rot`), dentro de um quadrado que cobre a bola. */
function halfPlane(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, k: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.beginPath()
  ctx.rect(k * r, -r * 2, r * 4, r * 4)
  ctx.restore()
}

const spriteCache = new Map<string, { c: HTMLCanvasElement; half: number }>()

function shadeSprite(r: number): { c: HTMLCanvasElement; half: number } {
  const key = `s${Math.round(r * 4)}`
  const hit = spriteCache.get(key)
  if (hit) return hit
  const half = Math.ceil(r + 2)
  const c = document.createElement('canvas')
  c.width = c.height = half * 2
  const g = c.getContext('2d')!
  g.beginPath()
  g.arc(half, half, r, 0, Math.PI * 2)
  g.clip()
  const hi = g.createRadialGradient(half - r * 0.38, half - r * 0.42, r * 0.02, half - r * 0.3, half - r * 0.3, r * 0.9)
  hi.addColorStop(0, 'rgba(255,255,255,0.75)')
  hi.addColorStop(0.18, 'rgba(255,255,255,0.35)')
  hi.addColorStop(0.5, 'rgba(255,255,255,0)')
  g.fillStyle = hi
  g.fillRect(0, 0, half * 2, half * 2)
  const rim = g.createRadialGradient(half, half, r * 0.55, half, half, r)
  rim.addColorStop(0, 'rgba(0,0,0,0)')
  rim.addColorStop(0.75, 'rgba(0,0,0,0.18)')
  rim.addColorStop(1, 'rgba(0,0,0,0.55)')
  g.fillStyle = rim
  g.fillRect(0, 0, half * 2, half * 2)
  // reflexo do pano por baixo (luz que volta)
  const bounce = g.createRadialGradient(half + r * 0.3, half + r * 0.45, r * 0.1, half + r * 0.3, half + r * 0.45, r * 0.7)
  bounce.addColorStop(0, 'rgba(255,255,255,0.10)')
  bounce.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = bounce
  g.fillRect(0, 0, half * 2, half * 2)
  const out = { c, half }
  spriteCache.set(key, out)
  return out
}

function shadowSprite(r: number): { c: HTMLCanvasElement; half: number } {
  const key = `h${Math.round(r * 4)}`
  const hit = spriteCache.get(key)
  if (hit) return hit
  const half = Math.ceil(r * 1.6 + 2)
  const c = document.createElement('canvas')
  c.width = c.height = half * 2
  const g = c.getContext('2d')!
  const sh = g.createRadialGradient(half, half, r * 0.2, half, half, r * 1.35)
  sh.addColorStop(0, 'rgba(0,0,0,0.42)')
  sh.addColorStop(0.6, 'rgba(0,0,0,0.22)')
  sh.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = sh
  g.beginPath()
  g.ellipse(half, half, r * 1.3, r * 1.1, 0, 0, Math.PI * 2)
  g.fill()
  const out = { c, half }
  spriteCache.set(key, out)
  return out
}

// ---------------------------------------------------------------------------
// O taco
// ---------------------------------------------------------------------------

/**
 * Seções do taco, da ponta pro cabo: [comprimento (m), cor]. Um taco de
 * verdade tem 1,47 m; aqui é mais curto (1,2 m) pra caber na tela com a mesa
 * inteira — o que importa é a ponta.
 */
const CUE_PARTS: Array<[number, string]> = [
  [0.008, '#2a4a7a'], // sola (couro azul)
  [0.02, '#f1e9d6'], // virola
  [0.56, '#d9b27a'], // vara de bordo
  [0.01, '#c9a23c'], // anel da junta
  [0.24, '#4a2a16'], // antebraço
  [0.25, '#8c7a5c'], // empunhadura de linho
  [0.1, '#3a2012'], // cabo
  [0.012, '#141414'] // batente
]
const CUE_LEN = CUE_PARTS.reduce((a, [l]) => a + l, 0)
const CUE_TIP_W = 0.013
const CUE_BUTT_W = 0.03
/** Recuo máximo do taco (m) com força total. */
const CUE_PULL = 0.22

function drawCue(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: number, cue: CueView, alpha: number): void {
  const gap = r + (0.02 + cue.pull * CUE_PULL) * s
  const total = CUE_LEN * s
  const widthAt = (d: number) => (CUE_TIP_W + (CUE_BUTT_W - CUE_TIP_W) * (d / total)) * s
  ctx.save()
  ctx.globalAlpha = alpha
  // sombra no pano
  ctx.save()
  ctx.translate(x + 0.014 * s, y + 0.02 * s)
  ctx.rotate(cue.angle + Math.PI)
  ctx.translate(gap, 0)
  ctx.fillStyle = 'rgba(0,0,0,0.32)'
  ctx.beginPath()
  ctx.moveTo(0, -widthAt(0) / 2)
  ctx.lineTo(total, -widthAt(total) / 2)
  ctx.lineTo(total, widthAt(total) / 2)
  ctx.lineTo(0, widthAt(0) / 2)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  ctx.translate(x, y)
  ctx.rotate(cue.angle + Math.PI) // x local aponta para longe da branca
  ctx.translate(gap, 0)
  let d = 0
  for (const [len, color] of CUE_PARTS) {
    const l = len * s
    const w0 = widthAt(d), w1 = widthAt(d + l)
    const g = ctx.createLinearGradient(0, -w1 / 2, 0, w1 / 2)
    g.addColorStop(0, shade(color, -0.35))
    g.addColorStop(0.3, shade(color, 0.22))
    g.addColorStop(0.55, color)
    g.addColorStop(1, shade(color, -0.45))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(d, -w0 / 2)
    ctx.lineTo(d + l, -w1 / 2)
    ctx.lineTo(d + l, w1 / 2)
    ctx.lineTo(d, w0 / 2)
    ctx.closePath()
    ctx.fill()
    d += l
  }
  // listras finas da empunhadura
  const wrapStart = CUE_PARTS.slice(0, 5).reduce((a, [l]) => a + l, 0) * s
  const wrapLen = CUE_PARTS[5][0] * s
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'
  ctx.lineWidth = 1
  const step = Math.max(2, 0.012 * s)
  for (let k = wrapStart + step; k < wrapStart + wrapLen; k += step) {
    const w = widthAt(k)
    ctx.beginPath()
    ctx.moveTo(k, -w / 2)
    ctx.lineTo(k, w / 2)
    ctx.stroke()
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// utilitários
// ---------------------------------------------------------------------------

/** Clareia (k > 0) ou escurece (k < 0) um #rrggbb. */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => {
    const t = k >= 0 ? v + (255 - v) * k : v * (1 + k)
    return Math.max(0, Math.min(255, Math.round(t)))
  }
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
