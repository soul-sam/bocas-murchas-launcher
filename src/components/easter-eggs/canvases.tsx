import * as React from 'react'

/**
 * Os dois efeitos que são desenho de verdade: a chuva do /matrix e os fogos
 * da virada. Canvas, e não mil <span>: são centenas de partículas por quadro.
 * Os dois se desligam sozinhos quando a camada os desmonta.
 */

/** Cor do neon do tema atual (`--neon-rgb` é "106 255 0"). */
function neon(alpha: number): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--neon-rgb').trim() || '106 255 0'
  return `rgb(${raw} / ${alpha})`
}

function useFullCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void) {
  const ref = React.useRef<HTMLCanvasElement>(null)
  const drawRef = React.useRef(draw)
  drawRef.current = draw

  React.useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const fit = (): void => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    fit()
    window.addEventListener('resize', fit)
    let frame = 0
    const loop = (t: number): void => {
      drawRef.current(ctx, canvas.width, canvas.height, t)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', fit)
    }
  }, [])

  return ref
}

const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトBOCASMURCHAS0123456789'
const CELL = 16

export function MatrixRain() {
  const columns = React.useRef<number[]>([])
  const last = React.useRef(0)

  const ref = useFullCanvas((ctx, w, h, t) => {
    // ~20 quadros por segundo: mais rápido que isso vira borrão, não chuva.
    if (t - last.current < 50) return
    last.current = t
    const count = Math.ceil(w / CELL)
    if (columns.current.length !== count) {
      columns.current = Array.from({ length: count }, () => Math.floor((Math.random() * -h) / CELL))
    }
    ctx.fillStyle = 'rgb(0 0 0 / 0.12)'
    ctx.fillRect(0, 0, w, h)
    ctx.font = `${CELL - 2}px monospace`
    columns.current.forEach((row, i) => {
      const char = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
      ctx.fillStyle = Math.random() > 0.95 ? 'rgb(255 255 255 / 0.9)' : neon(0.85)
      ctx.fillText(char, i * CELL, row * CELL)
      columns.current[i] = row * CELL > h && Math.random() > 0.975 ? 0 : row + 1
    })
  })

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-sobretela opacity-90" />
}

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  hue: number
}

export function Fireworks() {
  const sparks = React.useRef<Spark[]>([])
  const nextBurst = React.useRef(0)

  const ref = useFullCanvas((ctx, w, h, t) => {
    if (t > nextBurst.current) {
      nextBurst.current = t + 350 + Math.random() * 500
      const x = w * (0.15 + Math.random() * 0.7)
      const y = h * (0.15 + Math.random() * 0.35)
      const hue = Math.floor(Math.random() * 360)
      for (let i = 0; i < 70; i++) {
        const angle = (Math.PI * 2 * i) / 70
        const speed = 1.5 + Math.random() * 3
        sparks.current.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, hue })
      }
    }
    ctx.clearRect(0, 0, w, h)
    sparks.current = sparks.current.filter((s) => s.life > 0)
    for (const s of sparks.current) {
      s.x += s.vx
      s.y += s.vy
      s.vy += 0.04
      s.vx *= 0.985
      s.life -= 0.012
      ctx.fillStyle = `hsl(${s.hue} 100% 65% / ${Math.max(0, s.life)})`
      ctx.fillRect(s.x, s.y, 2.5, 2.5)
    }
  })

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-sobretela" />
}
