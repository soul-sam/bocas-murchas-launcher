/**
 * Desenho da mesa de bilhar — puro, só recebe o ctx e os dados (sem React).
 * Cor de pano, bola e taco é CONTEÚDO (como as peças do xadrez): não segue o
 * tema, por isso mora aqui como constante e este arquivo está na allowlist do
 * lint:design.
 *
 * Convenção: tudo é desenhado num espaço "lógico" w×h (mesa deitada). Quem
 * chama (PoolCanvas) aplica a rotação do retrato antes de chamar.
 */
import { TABLE_W, TABLE_H, BALL_R, HEAD_LINE_X, POCKETS, type AimResult } from '@/lib/pool-geometry'
import type { PoolSkin } from '../../../electron/preload/types'

export type { PoolSkin }

export interface Scene {
  balls: Array<{ id: number; x: number; y: number }>
  ghostCue: { x: number; y: number; ok: boolean } | null
  aim: { angle: number; result: AimResult; power: number } | null
  cue: { angle: number; pull: number; strike: number } | null
  lastPocketed: number[]
}

const MARGIN = 0.09 // borda de cada lado, em metros
const CLOTH: Record<PoolSkin['cloth'], string> = { verde: '#2e7d4f', azul: '#1f5f8b', vermelho: '#8b2d2d', preto: '#2a2a2a' }
const RAIL: Record<PoolSkin['rails'], string> = { madeira: '#5b3a1e', preto: '#141414' }
const BALL_COLOR: Record<number, string> = {
  1: '#f2c200', 2: '#1552b0', 3: '#d12b2b', 4: '#5b2a86', 5: '#f07d10', 6: '#1b8a3a', 7: '#7a3b16', 8: '#111111'
}
const CUE_BALL = '#f4f1e8'
const CUE_WOOD = '#c9a36a'
const CUE_TIP = '#1b3a6b'

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

export function drawTable(ctx: CanvasRenderingContext2D, w: number, h: number, skin: PoolSkin, logo: CanvasImageSource | null): void {
  const { scale: s, ox, oy } = tableToCanvas(w, h)
  const m = MARGIN * s
  ctx.clearRect(0, 0, w, h)

  // bordas: retângulo grande com cantos arredondados
  ctx.fillStyle = RAIL[skin.rails]
  roundRect(ctx, ox - m, oy - m, TABLE_W * s + m * 2, TABLE_H * s + m * 2, m * 0.6)
  ctx.fill()
  if (skin.rails === 'madeira') {
    // veio: duas faixas mais escuras na borda
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'
    ctx.lineWidth = Math.max(1, m * 0.12)
    for (const k of [0.35, 0.65]) {
      const o = m * k
      roundRect(ctx, ox - m + o, oy - m + o, TABLE_W * s + (m - o) * 2, TABLE_H * s + (m - o) * 2, m * 0.3)
      ctx.stroke()
    }
  }

  // pano
  const cw = TABLE_W * s, ch = TABLE_H * s
  ctx.fillStyle = CLOTH[skin.cloth]
  ctx.fillRect(ox, oy, cw, ch)
  if (skin.finish === 'brilho') {
    const g = ctx.createRadialGradient(ox + cw / 2, oy + ch / 2, 0, ox + cw / 2, oy + ch / 2, Math.max(cw, ch) * 0.6)
    g.addColorStop(0, 'rgba(255,255,255,0.18)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(ox, oy, cw, ch)
  }

  // linha de cabeça
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(ox + HEAD_LINE_X * s, oy)
  ctx.lineTo(ox + HEAD_LINE_X * s, oy + ch)
  ctx.stroke()

  // logo: depois do pano, antes das bolas
  if (logo) {
    const src = logo as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number }
    const iw = src.naturalWidth || src.width || 0
    const ih = src.naturalHeight || src.height || 0
    if (iw > 0 && ih > 0) {
      const lw = cw * 0.3
      const lh = lw * (ih / iw)
      ctx.save()
      ctx.globalAlpha = 0.12
      ctx.drawImage(logo, ox + (cw - lw) / 2, oy + (ch - lh) / 2, lw, lh)
      ctx.restore()
    }
  }

  // caçapas
  for (const p of POCKETS) {
    const r = p.r * s * 1.1
    ctx.beginPath()
    ctx.arc(ox + p.x * s, oy + p.y * s, r, 0, Math.PI * 2)
    ctx.fillStyle = '#0a0a0a'
    ctx.fill()
    ctx.strokeStyle = '#3a2a1a'
    ctx.lineWidth = Math.max(1.5, r * 0.18)
    ctx.stroke()
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, scene: Scene): void {
  const { scale: s, ox, oy } = tableToCanvas(w, h)
  const X = (x: number) => ox + x * s
  const Y = (y: number) => oy + y * s
  const r = BALL_R * s
  const cue = scene.balls.find((b) => b.id === 0) ?? null

  // mira
  if (scene.aim && cue) {
    const { result } = scene.aim
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = Math.max(1, r * 0.12)
    ctx.setLineDash([r * 0.6, r * 0.5])
    ctx.beginPath()
    ctx.moveTo(X(cue.x), Y(cue.y))
    ctx.lineTo(X(result.cx), Y(result.cy))
    ctx.stroke()
    ctx.setLineDash([])
    // fantasma da branca no contato
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    ctx.arc(X(result.cx), Y(result.cy), r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
    if (result.kind === 'ball') {
      if (result.targetDir) segment(ctx, X(result.cx), Y(result.cy), result.targetDir, 0.25 * s)
      const cd = result.cueDir
      // tacada reta: cueDir ~ zero = a branca para, sem tangente
      if (cd && Math.hypot(cd.x, cd.y) >= 1e-6) segment(ctx, X(result.cx), Y(result.cy), cd, 0.12 * s)
    }
    ctx.restore()
  }

  // bolas
  for (const b of scene.balls) drawBall(ctx, X(b.x), Y(b.y), r, b.id)

  // branca na mão seguindo o ponteiro
  if (scene.ghostCue) {
    ctx.save()
    ctx.globalAlpha = scene.ghostCue.ok ? 0.75 : 0.35
    drawBall(ctx, X(scene.ghostCue.x), Y(scene.ghostCue.y), r, 0)
    if (!scene.ghostCue.ok) {
      ctx.globalAlpha = 0.9
      ctx.strokeStyle = '#d12b2b'
      ctx.lineWidth = Math.max(1.5, r * 0.15)
      ctx.beginPath()
      ctx.arc(X(scene.ghostCue.x), Y(scene.ghostCue.y), r, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  }

  // taco: atrás da branca, afilado
  if (scene.cue && cue) {
    const { angle, pull, strike } = scene.cue
    const gap = (0.05 + pull * 0.25 - strike * 0.3) * s + r
    const len = 1.45 * s
    const tipW = r * 0.34, buttW = r * 0.7
    ctx.save()
    ctx.translate(X(cue.x), Y(cue.y))
    ctx.rotate(angle + Math.PI) // x local aponta para longe da branca
    ctx.translate(gap, 0)
    ctx.fillStyle = CUE_WOOD
    ctx.beginPath()
    ctx.moveTo(0, -tipW / 2)
    ctx.lineTo(len, -buttW / 2)
    ctx.lineTo(len, buttW / 2)
    ctx.lineTo(0, tipW / 2)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = CUE_TIP
    ctx.fillRect(0, -tipW / 2, Math.max(2, 0.012 * s), tipW)
    ctx.restore()
  }
}

function segment(ctx: CanvasRenderingContext2D, x: number, y: number, d: { x: number; y: number }, len: number): void {
  const m = Math.hypot(d.x, d.y) || 1
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + (d.x / m) * len, y + (d.y / m) * len)
  ctx.stroke()
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, id: number): void {
  const base = id === 0 ? CUE_BALL : BALL_COLOR[id <= 8 ? id : id - 8]
  const striped = id >= 9
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = striped ? CUE_BALL : base
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
  if (striped) {
    ctx.fillStyle = base
    ctx.fillRect(x - r, y - r * 0.55, r * 2, r * 1.1) // faixa de 55% da altura
  }
  if (id !== 0) {
    ctx.beginPath()
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.fillStyle = '#111111'
    ctx.font = `bold ${Math.max(6, r * 0.62)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(id), x, y + r * 0.03)
  }
  // volume: brilho em cima-esquerda e sombra embaixo-direita
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r)
  g.addColorStop(0, 'rgba(255,255,255,0.55)')
  g.addColorStop(0.4, 'rgba(255,255,255,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
  ctx.restore()
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
