import * as React from 'react'
import { clampOffset, HEAD_LINE_X, insideTable, overlaps } from '@/lib/pool-geometry'

export type AimPhase = 'locked' | 'idle' | 'aiming' | 'charging' | 'placing'
export interface AimState { angle: number; power: number; sx: number; sy: number; phase: AimPhase; ghost: { x: number; y: number } | null }

interface Opts {
  enabled: boolean
  ballInHand: boolean
  breakPending: boolean
  cue: { x: number; y: number } | null
  balls: ReadonlyArray<{ id: number; x: number; y: number }>
  onShoot: (shot: { a: number; p: number; sx: number; sy: number }) => void
  onPlace: (x: number, y: number) => void
}

interface Raw { angle: number; power: number; sx: number; sy: number; aiming: boolean; ghost: { x: number; y: number } | null }
const INITIAL: Raw = { angle: 0, power: 0, sx: 0, sy: 0, aiming: false, ghost: null }
const FINE_RADIUS = 0.15
const FINE_GAIN = 0.8
const MIN_POWER = 0.02

/** Estado da mira: ângulo, força, efeito e bola na mão. Handlers estáveis (leem opts por ref). */
export function useAim(opts: Opts) {
  const [raw, setRaw] = React.useState<Raw>(INITIAL)
  const rawRef = React.useRef(raw)
  const optsRef = React.useRef(opts)
  optsRef.current = opts
  const last = React.useRef<{ x: number; y: number } | null>(null)
  const down = React.useRef(false)

  const commit = React.useCallback((patch: Partial<Raw>) => {
    rawRef.current = { ...rawRef.current, ...patch }
    setRaw(rawRef.current)
  }, [])

  // perdeu a vez / entrou replay: zera força e arrasto
  React.useEffect(() => {
    if (!opts.enabled) {
      down.current = false
      last.current = null
      commit({ power: 0, aiming: false, ghost: null })
    }
  }, [opts.enabled, commit])
  // saiu da bola na mão: some o fantasma
  React.useEffect(() => {
    if (!opts.ballInHand) commit({ ghost: null })
  }, [opts.ballInHand, commit])

  const validSpot = (x: number, y: number): boolean => {
    const o = optsRef.current
    if (!insideTable(x, y) || overlaps(x, y, o.balls.filter((b) => b.id !== 0))) return false
    return !o.breakPending || x <= HEAD_LINE_X
  }

  const onPointer = React.useCallback((ev: { kind: 'down' | 'move' | 'up'; x: number; y: number; id: number }) => {
    const o = optsRef.current
    if (!o.enabled) return
    if (o.ballInHand) {
      if (ev.kind === 'up') {
        if (validSpot(ev.x, ev.y)) { commit({ ghost: null }); o.onPlace(ev.x, ev.y) }
        return
      }
      commit({ ghost: validSpot(ev.x, ev.y) ? { x: ev.x, y: ev.y } : null })
      return
    }
    if (!o.cue) return
    const r = rawRef.current
    const far = Math.hypot(ev.x - o.cue.x, ev.y - o.cue.y) > FINE_RADIUS
    if (ev.kind === 'down') {
      down.current = true
      last.current = { x: ev.x, y: ev.y }
      commit({ aiming: true, angle: far ? Math.atan2(ev.y - o.cue.y, ev.x - o.cue.x) : r.angle })
    } else if (ev.kind === 'move') {
      if (!down.current) return
      const prev = last.current ?? { x: ev.x, y: ev.y }
      last.current = { x: ev.x, y: ev.y }
      if (far) {
        commit({ angle: Math.atan2(ev.y - o.cue.y, ev.x - o.cue.x) })
      } else {
        const dx = ev.x - prev.x
        const dy = ev.y - prev.y
        commit({ angle: r.angle + (dx * -Math.sin(r.angle) + dy * Math.cos(r.angle)) * FINE_GAIN })
      }
    } else {
      down.current = false
      last.current = null
      commit({ aiming: false })
    }
  }, [commit])

  const setOffset = React.useCallback((sx: number, sy: number) => {
    if (!optsRef.current.enabled) return
    const c = clampOffset(sx, sy)
    commit({ sx: c.x, sy: c.y })
  }, [commit])
  const centerOffset = React.useCallback(() => {
    if (optsRef.current.enabled) commit({ sx: 0, sy: 0 })
  }, [commit])
  const setPower = React.useCallback((p: number) => {
    if (!optsRef.current.enabled || optsRef.current.ballInHand) return
    commit({ power: Math.min(1, Math.max(0, p)) })
  }, [commit])
  const cancel = React.useCallback(() => commit({ power: 0, aiming: false }), [commit])
  const release = React.useCallback(() => {
    const o = optsRef.current
    const r = rawRef.current
    if (!o.enabled || o.ballInHand || r.power <= MIN_POWER) { commit({ power: 0 }); return }
    commit({ power: 0, aiming: false })
    o.onShoot({ a: r.angle, p: r.power, sx: r.sx, sy: r.sy })
  }, [commit])
  const nudge = React.useCallback((d: number) => {
    const o = optsRef.current
    if (!o.enabled || o.ballInHand) return
    commit({ angle: rawRef.current.angle + d })
  }, [commit])

  const phase: AimPhase = !opts.enabled ? 'locked'
    : opts.ballInHand ? 'placing'
    : raw.power > 0 ? 'charging'
    : raw.aiming ? 'aiming' : 'idle'
  const state: AimState = {
    angle: raw.angle, power: raw.power, sx: raw.sx, sy: raw.sy, phase,
    ghost: opts.enabled && opts.ballInHand ? raw.ghost : null,
  }
  return { state, onPointer, setOffset, centerOffset, setPower, release, cancel, nudge }
}
