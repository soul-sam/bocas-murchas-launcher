import * as React from 'react'
import logoUrl from '@/assets/bocas-murchas-claro.svg'
import { canvasToTable, drawScene, drawTable, type PoolSkin, type Scene } from './draw'
import './pool.css'

export interface PoolPointerEvent { kind: 'down' | 'move' | 'up'; x: number; y: number; id: number }

interface Props {
  scene: Scene
  skin: PoolSkin
  /** retrato: mesa em pé */
  rotated: boolean
  /** coordenadas em metros da mesa */
  onPointer?: (ev: PoolPointerEvent) => void
  /** com true, um rAF em loop lê `sceneRef.current`; com false não há rAF nenhum */
  animating: boolean
  sceneRef: React.MutableRefObject<Scene>
}

const MAX_DPR = 2

export function PoolCanvas({ scene, skin, rotated, onPointer, animating, sceneRef }: Props): JSX.Element {
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  // mesa pré-renderizada (só refaz quando skin/tamanho/logo mudam)
  const tableRef = React.useRef<HTMLCanvasElement | null>(null)
  const tableKeyRef = React.useRef('')
  const logoRef = React.useRef<HTMLImageElement | null>(null)
  const [size, setSize] = React.useState({ w: 0, h: 0 })
  const [logoTick, setLogoTick] = React.useState(0)

  // as props mais novas sem recriar callbacks
  const live = React.useRef({ skin, rotated, size, onPointer })
  live.current = { skin, rotated, size, onPointer }

  // logo
  React.useEffect(() => {
    const img = new Image()
    img.onload = () => { logoRef.current = img; setLogoTick((n) => n + 1) }
    img.src = logoUrl
    return () => { img.onload = null }
  }, [])

  // tamanho do container
  React.useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const paint = React.useCallback((sc: Scene) => {
    const canvas = canvasRef.current
    const { skin: sk, rotated: rot, size: sz } = live.current
    if (!canvas || sz.w <= 0 || sz.h <= 0) return
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    const pw = Math.round(sz.w * dpr), ph = Math.round(sz.h * dpr)
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // espaço lógico: mesa deitada; no retrato gira 90° para ficar em pé
    const lw = rot ? sz.h : sz.w
    const lh = rot ? sz.w : sz.h

    const key = `${sk.cloth}|${sk.finish}|${sk.rails}|${lw}x${lh}@${dpr}|${logoRef.current ? 1 : 0}`
    if (!tableRef.current || tableKeyRef.current !== key) {
      const off = tableRef.current ?? document.createElement('canvas')
      off.width = Math.round(lw * dpr)
      off.height = Math.round(lh * dpr)
      const octx = off.getContext('2d')
      if (octx) {
        octx.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawTable(octx, lw, lh, sk, logoRef.current)
      }
      tableRef.current = off
      tableKeyRef.current = key
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.scale(dpr, dpr)
    if (rot) { ctx.translate(sz.w, 0); ctx.rotate(Math.PI / 2) }
    ctx.drawImage(tableRef.current, 0, 0, lw, lh)
    drawScene(ctx, lw, lh, sc)
  }, [])

  // parado: redesenha só quando algo muda
  React.useEffect(() => {
    if (!animating) paint(scene)
  }, [animating, scene, skin, rotated, size, logoTick, paint])

  // animando: um único loop de rAF
  React.useEffect(() => {
    if (!animating) return
    let raf = 0
    const tick = () => { paint(sceneRef.current); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [animating, paint, sceneRef])

  // desmontar: solta a mesa pré-renderizada
  React.useEffect(() => () => { tableRef.current = null; tableKeyRef.current = '' }, [])

  const emit = (kind: PoolPointerEvent['kind'], e: React.PointerEvent<HTMLCanvasElement>) => {
    const { onPointer: cb, rotated: rot, size: sz } = live.current
    if (!cb) return
    const rect = e.currentTarget.getBoundingClientRect()
    const p = canvasToTable(e.clientX - rect.left, e.clientY - rect.top, sz.w, sz.h, rot)
    cb({ kind, x: p.x, y: p.y, id: e.pointerId })
  }

  return (
    <div ref={wrapRef} className="pool-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="pool-canvas"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); emit('down', e) }}
        onPointerMove={(e) => emit('move', e)}
        onPointerUp={(e) => {
          emit('up', e)
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
        }}
        onPointerCancel={(e) => emit('up', e)}
      />
    </div>
  )
}
