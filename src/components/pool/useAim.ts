import * as React from 'react'
import { BALL_R, clampOffset, HEAD_LINE_X, inPocket, insideTable, overlaps } from '@/lib/pool-geometry'

/** Branca na mão seguindo o ponteiro; `ok` falso = lugar proibido (desenha em vermelho). */
export interface Ghost { x: number; y: number; ok: boolean }
export type AimPhase = 'locked' | 'idle' | 'aiming' | 'charging' | 'placing'
export interface AimState { angle: number; power: number; sx: number; sy: number; phase: AimPhase; ghost: Ghost | null }

interface Opts {
  enabled: boolean
  ballInHand: boolean
  breakPending: boolean
  cue: { x: number; y: number } | null
  balls: ReadonlyArray<{ id: number; x: number; y: number }>
  /** Pra onde o taco aponta quando a vez começa (a bola mais sensata); nulo = fica como estava. */
  initialAngle: number | null
  onShoot: (shot: { a: number; p: number; sx: number; sy: number }) => void
  onPlace: (x: number, y: number) => void
}

interface Raw { angle: number; power: number; sx: number; sy: number; aiming: boolean; ghost: Ghost | null }
const INITIAL: Raw = { angle: 0, power: 0, sx: 0, sy: 0, aiming: false, ghost: null }
const MIN_POWER = 0.02
/** Toque sem andar mais que isso (m) = "aponta pra cá"; andou = gira o taco junto com o dedo. */
const TAP_EPS = 0.012
/** Perto demais da branca o ângulo do ponteiro é instável: nessa roda o arrasto não gira. */
const NEAR = 0.07

/** Normaliza para (−π, π]. */
function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a <= -Math.PI) a += Math.PI * 2
  return a
}

/**
 * Estado da mira: ângulo, força, efeito e bola na mão. Handlers estáveis
 * (leem opts por ref).
 *
 * Como no 8 Ball Pool: um TOQUE aponta o taco pro lugar tocado; ARRASTAR gira
 * o taco acompanhando o dedo em volta da branca (quanto mais longe da branca,
 * mais fino o ajuste). ←/→ (PoolMatch) ajustam meio grau.
 */
export function useAim(opts: Opts) {
  const [raw, setRaw] = React.useState<Raw>(INITIAL)
  const rawRef = React.useRef(raw)
  const optsRef = React.useRef(opts)
  optsRef.current = opts
  const drag = React.useRef<{ x: number; y: number; angle0: number; pa0: number | null; moved: boolean } | null>(null)

  const commit = React.useCallback((patch: Partial<Raw>) => {
    rawRef.current = { ...rawRef.current, ...patch }
    setRaw(rawRef.current)
  }, [])

  // perdeu a vez / entrou replay: zera força e arrasto
  React.useEffect(() => {
    if (!opts.enabled) {
      drag.current = null
      commit({ power: 0, aiming: false, ghost: null })
    }
  }, [opts.enabled, commit])
  // saiu da bola na mão: some o fantasma
  React.useEffect(() => {
    if (!opts.ballInHand) commit({ ghost: null })
  }, [opts.ballInHand, commit])
  // A vez começou (ou a branca acabou de ser posta): o taco já aponta pra bola mais sensata.
  React.useEffect(() => {
    const o = optsRef.current
    if (o.enabled && !o.ballInHand && o.initialAngle !== null) commit({ angle: o.initialAngle })
    // só nas transições: quem já girou o taco não é interrompido
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled, opts.ballInHand, commit])

  const validSpot = (x: number, y: number): boolean => {
    const o = optsRef.current
    if (!insideTable(x, y) || inPocket(x, y) || overlaps(x, y, o.balls.filter((b) => b.id !== 0))) return false
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
      commit({ ghost: { x: ev.x, y: ev.y, ok: validSpot(ev.x, ev.y) } })
      return
    }
    if (!o.cue) return
    const r = rawRef.current
    const dist = Math.hypot(ev.x - o.cue.x, ev.y - o.cue.y)
    const pa = Math.atan2(ev.y - o.cue.y, ev.x - o.cue.x)
    if (ev.kind === 'down') {
      drag.current = { x: ev.x, y: ev.y, angle0: r.angle, pa0: dist > NEAR ? pa : null, moved: false }
      commit({ aiming: true })
    } else if (ev.kind === 'move') {
      const d = drag.current
      if (!d) return
      if (!d.moved && Math.hypot(ev.x - d.x, ev.y - d.y) > TAP_EPS) d.moved = true
      if (!d.moved || dist <= NEAR) return
      if (d.pa0 === null) {
        // começou colado na branca: vale o ângulo absoluto a partir de agora
        d.pa0 = pa
        d.angle0 = pa
      }
      commit({ angle: wrap(d.angle0 + wrap(pa - d.pa0)) })
    } else {
      const d = drag.current
      drag.current = null
      if (d && !d.moved && dist > 2 * BALL_R) commit({ angle: pa, aiming: false })
      else commit({ aiming: false })
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
    commit({ angle: wrap(rawRef.current.angle + d) })
  }, [commit])
  /** Aponta pra um lugar da mesa (atalho: toque numa bola do placar, por exemplo). */
  const aimAt = React.useCallback((x: number, y: number) => {
    const o = optsRef.current
    if (!o.enabled || o.ballInHand || !o.cue) return
    commit({ angle: Math.atan2(y - o.cue.y, x - o.cue.x) })
  }, [commit])

  const phase: AimPhase = !opts.enabled ? 'locked'
    : opts.ballInHand ? 'placing'
    : raw.power > 0 ? 'charging'
    : raw.aiming ? 'aiming' : 'idle'
  const state: AimState = {
    angle: raw.angle, power: raw.power, sx: raw.sx, sy: raw.sy, phase,
    ghost: opts.enabled && opts.ballInHand ? raw.ghost : null,
  }
  return { state, onPointer, setOffset, centerOffset, setPower, release, cancel, nudge, aimAt }
}
