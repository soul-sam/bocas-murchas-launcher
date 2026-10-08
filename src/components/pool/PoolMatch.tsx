import * as React from 'react'
import { parsePoolPosition, type BoardTableView, type PoolPosition, type Side } from '@/lib/api-board'
import { useBoard } from '@/lib/board-context'
import { useLayout } from '@/lib/layout-context'
import { aimPath, BALL_R } from '@/lib/pool-geometry'
import { IDENTITY, orthonormalize, roll, seeded, type Mat3 } from '@/lib/pool-roll'
import { createReplayPlayer, type ReplayPlayer } from '@/lib/pool-replay'
import { useSettings } from '@/lib/settings-context'
import { playUiSound, type UiSound } from '@/lib/ui-sounds'
import { cn } from '@/lib/utils'
import { CueBallWidget } from './CueBallWidget'
import { pocketCenter, type PoolSkin, type Scene, type SceneBall } from './draw'
import { PoolCanvas } from './PoolCanvas'
import { FOUL_LABEL, PoolHud } from './PoolHud'
import { PowerBar } from './PowerBar'
import { useAim } from './useAim'

interface Props {
  table: BoardTableView
  mySide: Side | null
  /** Posso jogar agora (vez minha, nada no ar, partida rolando). */
  canAct: boolean
}

type Ball = { id: number; x: number; y: number }
interface Playing {
  player: ReplayPlayer
  /** Instante (performance.now) em que t = 0; com prelúdio fica no futuro. */
  startedAt: number
  /** Quem assiste vê o taco bater antes das bolas andarem. */
  prelude: { angle: number; pull: number } | null
  /** Bolas e grupos de ANTES da tacada: o placar não entrega o fim enquanto as bolas rolam. */
  start: Ball[]
  startGroups: PoolPosition['groups'] | null
  /** Última posição de cada bola (o rolamento vem do deslocamento). */
  lastPos: Map<number, { x: number; y: number }>
  /** Bola caindo: encolhe até o centro da caçapa. */
  sinking: Map<number, { t0: number; fromX: number; fromY: number; toX: number; toY: number }>
  gone: Set<number>
  prevT: number
  cueSounded: boolean
}
interface Callout {
  key: number
  text: string
  sub?: string
  tone: 'good' | 'bad' | 'neutral'
}

const STRIKE_MS = 130
/** O taco do adversário batendo, antes das bolas andarem (quem assiste). */
const PRELUDE_MS = 280
/** Bola afundando na caçapa. */
const SINK_S = 0.26
/** Um som do mesmo tipo a cada 50 ms, no máximo (quebra com 15 bolas vira barulho branco). */
const SOUND_GAP_MS = 50
/** Pulo grande no tempo (janela escondida, aba parada): não despeja os sons atrasados. */
const SOUND_SKIP_S = 0.25
/** Mira do adversário sem novidade há tanto tempo: some (a vez já mudou de qualquer jeito). */
const PEER_STALE_MS = 45_000
const NUDGE = Math.PI / 360 // meio grau
const NUDGE_FINE = Math.PI / 3600
const CALLOUT_MS = 1_700
const EMPTY_SCENE: Scene = { balls: [], ghostCue: null, aim: null, cue: null, peer: null, t: 0 }
const NO_BALLS: Ball[] = []
/** Proporção da mesa desenhada (com a madeira). */
const TABLE_RATIO = 274 / 147
/** No PC: a coluna de controles ao lado (largura) ou a faixa embaixo (altura) — o que der a mesa maior. */
const SIDE_COL_PX = 252
const BOTTOM_STRIP_PX = 170
const PLACAS_PX = 136

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a <= -Math.PI) a += Math.PI * 2
  return a
}
function hashOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
const easeIn = (k: number) => k * k
const easeOut = (k: number) => 1 - (1 - k) * (1 - k)

/** A tacada que acabou de chegar, pelo lance canônico guardado na mesa. */
function lastShotOf(table: BoardTableView): { a: number; p: number } | null {
  const raw = table.moves[table.moves.length - 1]
  if (!raw) return null
  try {
    const m = JSON.parse(raw) as { t?: string; a?: number; p?: number }
    if (m.t === 'shot' && typeof m.a === 'number' && typeof m.p === 'number') return { a: m.a, p: m.p }
  } catch {
    /* lance de outro formato */
  }
  return null
}

/** O aviso arcade depois da tacada (e do estouro de tempo). */
function calloutFor(position: PoolPosition, mySide: Side | null, table: BoardTableView): Omit<Callout, 'key'> | null {
  const last = position.lastShot
  if (!last || table.result) return null
  const name = (side: Side) => table[side]?.displayName ?? 'Adversário'
  const mine = last.by === mySide
  if (last.fouls.includes('timeout')) {
    return { text: 'TEMPO!', sub: mine ? 'você estourou os 30 s' : `${name(last.by)} estourou os 30 s`, tone: 'bad' }
  }
  if (last.fouls.length > 0) {
    const why = last.fouls.map((f) => FOUL_LABEL[f] ?? f).join(' · ')
    const hand = position.ballInHand && position.turn === mySide ? ' · bola na mão' : ''
    return { text: mine ? 'FALTA' : `FALTA DE ${name(last.by).toUpperCase()}`, sub: why + hand, tone: 'bad' }
  }
  const made = last.pocketed.filter((id) => id !== 0 && id !== 8)
  if (made.length >= 2) return { text: 'QUE TACADA!', sub: `${made.length} bolas de uma vez`, tone: 'good' }
  if (made.length === 1) return { text: mine ? 'BOA!' : 'BOA TACADA', sub: `bola ${made[0]}`, tone: 'good' }
  return null
}

/**
 * A partida de bilhar: mesa, mira, força, efeito e placar. Orquestra o
 * replay de cada tacada (relógio em `performance.now()`, rAF escrevendo em
 * `sceneRef` — o React não re-renderiza por quadro), o taco do adversário
 * (mira que chega por socket, lida por ref no quadro) e manda os lances.
 */
export function PoolMatch({ table, mySide, canAct }: Props): JSX.Element | null {
  const { play, replay, consumeReplay, peerAim, peerAimLive, sendAim } = useBoard()
  const { settings, update } = useSettings()
  const { isPhone } = useLayout()

  const position = React.useMemo(() => parsePoolPosition(table.position), [table.position])
  const positionRef = React.useRef(position)
  positionRef.current = position
  const balls = React.useMemo<Ball[]>(
    () => (position ? position.balls.filter((b) => b.state === 's').map(({ id, x, y }) => ({ id, x, y })) : NO_BALLS),
    [position]
  )
  const cueBall = balls.find((b) => b.id === 0) ?? null

  const [playing, setPlaying] = React.useState<Playing | null>(null)
  const [striking, setStriking] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [callout, setCallout] = React.useState<Callout | null>(null)
  const playingRef = React.useRef<Playing | null>(null)
  playingRef.current = playing
  const strikeRef = React.useRef<{ t0: number; angle: number; pull0: number } | null>(null)
  /** Bolas da vista anterior: o replay começa da posição de ANTES da tacada. */
  const lastViewRef = React.useRef<{ tableId: string; balls: Ball[]; groups: PoolPosition['groups'] | null } | null>(null)
  /** Último `ply` que já virou replay (não toca duas vezes a mesma tacada). */
  const lastPlyRef = React.useRef<string | null>(null)
  const sceneRef = React.useRef<Scene>(EMPTY_SCENE)
  const soundAtRef = React.useRef<Record<string, number>>({})
  /** Orientação de cada bola (visual): persiste entre tacadas, zera por mesa. */
  const orientRef = React.useRef<{ tableId: string; map: Map<number, Mat3> }>({ tableId: '', map: new Map() })
  /** Mira do adversário suavizada (o pacote chega a 20 Hz; o taco gira a 60). */
  const peerSmooth = React.useRef<{ angle: number | null; pull: number }>({ angle: null, pull: 0 })
  const calloutPlyRef = React.useRef<string | null>(null)
  const reducedMotion = React.useMemo(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  )

  // PC: mede o espaço da mesa e escolhe controles ao lado ou embaixo (o que deixa a mesa maior).
  const rootRef = React.useRef<HTMLDivElement>(null)
  const [mode, setMode] = React.useState<'side' | 'bottom'>('side')
  React.useLayoutEffect(() => {
    if (isPhone) return
    const el = rootRef.current?.parentElement
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = (): void => {
      const w = el.clientWidth
      const h = el.clientHeight - PLACAS_PX
      if (w <= 0 || h <= 0) return
      const side = Math.min(w - SIDE_COL_PX, h * TABLE_RATIO)
      const bottom = Math.min(w, (h - BOTTOM_STRIP_PX) * TABLE_RATIO)
      setMode(bottom > side * 1.08 ? 'bottom' : 'side')
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isPhone])

  const settingsRef = React.useRef(settings)
  settingsRef.current = settings
  const sound = React.useCallback((name: UiSound, factor = 1): void => {
    const s = settingsRef.current
    playUiSound(name, s.soundEnabled ? s.soundVolume * factor : 0)
  }, [])

  const orientOf = React.useCallback(
    (id: number): Mat3 => {
      const o = orientRef.current
      if (o.tableId !== table.id) {
        o.tableId = table.id
        o.map = new Map()
      }
      let m = o.map.get(id)
      if (!m) {
        m = id === 0 ? IDENTITY : seeded(id, hashOf(table.id))
        o.map.set(id, m)
      }
      return m
    },
    [table.id]
  )

  // Replay que vale para esta vista: mesma mesa e o lance que acabou de chegar.
  const replayKey = replay ? `${replay.tableId}:${replay.ply}` : null
  const replayFits = !!replay && replay.tableId === table.id && replay.ply === table.moves.length
  const prevSame = lastViewRef.current && lastViewRef.current.tableId === table.id ? lastViewRef.current : null
  const prevView = prevSame ? prevSame.balls : null
  // Ainda não começou (o efeito abaixo liga): desenha a posição de antes, sem piscar a final.
  const aboutToPlay = replayFits && lastPlyRef.current !== replayKey && !!prevView

  React.useLayoutEffect(() => {
    if (replay) {
      if (replayFits && lastPlyRef.current !== replayKey && prevView) {
        lastPlyRef.current = replayKey
        const player = createReplayPlayer(replay.replay, prevView)
        soundAtRef.current = {}
        // Quem não tacou vê o taco bater primeiro (o ângulo vem do próprio lance).
        const shot = lastShotOf(table)
        const iShot = !!position?.lastShot && position.lastShot.by === mySide
        const prelude = !iShot && shot && !reducedMotion ? { angle: shot.a, pull: 0.2 + shot.p * 0.8 } : null
        const now = performance.now()
        const lastPos = new Map<number, { x: number; y: number }>()
        for (const b of prevView) lastPos.set(b.id, { x: b.x, y: b.y })
        setPlaying({
          player,
          startedAt: now + (prelude ? PRELUDE_MS : 0),
          prelude,
          start: prevView,
          startGroups: prevSame?.groups ?? null,
          lastPos,
          sinking: new Map(),
          gone: new Set(),
          prevT: -1e-6,
          cueSounded: !prelude
        })
      } else if (!replayFits || !prevView) {
        // Outra mesa/outro lance, ou sem a posição de antes (acabei de abrir a mesa): fica a final.
        if (!playingRef.current) consumeReplay()
      }
    }
    lastViewRef.current = { tableId: table.id, balls, groups: position?.groups ?? null }
    // `prevView` e `replayFits` saem de `replay`/`table`: as deps abaixo cobrem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay, table.id, table.moves.length, balls, consumeReplay])

  // Mesa nova: nada do replay da outra fica.
  React.useEffect(() => {
    setPlaying(null)
    setStriking(false)
    strikeRef.current = null
    setError(null)
    setCallout(null)
    calloutPlyRef.current = null
    peerSmooth.current = { angle: null, pull: 0 }
  }, [table.id])

  React.useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 4_500)
    return () => clearTimeout(t)
  }, [error])

  // --- mira -------------------------------------------------------------------
  const myTurn = !!position && mySide !== null && position.turn === mySide
  const enabled =
    canAct && !playing && !aboutToPlay && !striking && table.phase === 'playing' && !table.result && myTurn

  const send = React.useCallback(
    (move: Record<string, unknown>) => {
      void play(JSON.stringify(move), 'click').then((ack) => {
        if (!ack.ok) {
          setError(ack.error ?? 'A tacada não foi aceita.')
          strikeRef.current = null
          setStriking(false)
        }
      })
    },
    [play]
  )
  const onShoot = React.useCallback(
    (shot: { a: number; p: number; sx: number; sy: number }) => {
      sound('pool-cue', 0.5 + shot.p * 0.5)
      strikeRef.current = { t0: performance.now(), angle: shot.a, pull0: shot.p }
      setStriking(true)
      send({ t: 'shot', a: shot.a, p: shot.p, sx: shot.sx, sy: shot.sy })
    },
    [send, sound]
  )
  const onPlace = React.useCallback((x: number, y: number) => send({ t: 'place', x, y }), [send])

  // A bola mais sensata pra começar a vez: do meu grupo (qualquer uma com a
  // mesa aberta; a 8 quando o grupo acabou), de preferência com linha limpa.
  const initialAngle = React.useMemo<number | null>(() => {
    if (!cueBall || !position || mySide === null) return null
    const group = position.groups[mySide]
    const ofGroup = (id: number) => (id >= 1 && id <= 7 ? 'solids' : id >= 9 && id <= 15 ? 'stripes' : 'open')
    let targets = balls.filter((b) => b.id !== 0 && b.id !== 8 && (group === 'open' || ofGroup(b.id) === group))
    if (targets.length === 0) targets = balls.filter((b) => b.id === 8)
    let best: { a: number; score: number } | null = null
    for (const b of targets) {
      const a = Math.atan2(b.y - cueBall.y, b.x - cueBall.x)
      const path = aimPath(cueBall, a, balls, 0)
      const clear = path.cue.kind === 'ball' && path.cue.ballId === b.id
      const score = (clear ? 0 : 10) + Math.hypot(b.x - cueBall.x, b.y - cueBall.y)
      if (!best || score < best.score) best = { a, score }
    }
    return best ? best.a : null
  }, [cueBall, balls, position, mySide])

  const aimCtl = useAim({
    enabled,
    ballInHand: !!position?.ballInHand,
    breakPending: !!position?.breakPending,
    cue: cueBall,
    balls,
    initialAngle,
    onShoot,
    onPlace
  })
  const st = aimCtl.state

  // ←/→ giram a mira (Shift: ajuste fino). Nada disso com o foco num campo.
  const nudge = aimCtl.nudge
  React.useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      nudge((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? NUDGE_FINE : NUDGE))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, nudge])

  // A minha mira vai pro adversário (o contexto acelera pra 20 Hz); ao perder a vez, apaga lá.
  const sentRef = React.useRef(false)
  const ghostX = st.ghost?.x, ghostY = st.ghost?.y
  React.useEffect(() => {
    if (!enabled) {
      if (sentRef.current) {
        sentRef.current = false
        sendAim({ a: null, p: 0, sx: 0, sy: 0, off: true })
      }
      return
    }
    sentRef.current = true
    sendAim({
      a: st.phase === 'placing' ? null : st.angle,
      p: st.power,
      sx: st.sx,
      sy: st.sy,
      g: ghostX !== undefined && ghostY !== undefined ? [ghostX, ghostY] : null
    })
  }, [enabled, st.phase, st.angle, st.power, st.sx, st.sy, ghostX, ghostY, sendAim])

  // --- cena parada ------------------------------------------------------------
  const showCue = st.phase === 'idle' || st.phase === 'aiming' || st.phase === 'charging'
  const scene = React.useMemo<Scene>(() => {
    const shown = aboutToPlay && prevView ? prevView : balls
    const cue = shown.find((b) => b.id === 0) ?? null
    const aiming = showCue && !!cue && !aboutToPlay
    return {
      balls: shown.map((b) => ({ id: b.id, x: b.x, y: b.y, m: orientOf(b.id) })),
      ghostCue: st.ghost,
      aim: aiming && cue ? { path: aimPath(cue, st.angle, shown), power: st.power } : null,
      cue: aiming ? { angle: st.angle, pull: st.power } : null,
      peer: null,
      t: 0
    }
    // `playing` entra de propósito: no fim do replay as orientações mudaram e a cena parada precisa delas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aboutToPlay, prevView, balls, showCue, st.ghost, st.angle, st.power, orientOf, playing])
  const sceneLive = React.useRef(scene)
  sceneLive.current = scene
  if (!playing && !striking) sceneRef.current = scene

  // --- o quadro (replay, a batida do taco, a mira viva) ---------------------------
  // Não há rAF aqui: o PoolCanvas roda o ÚNICO loop enquanto `animating` e chama
  // `onFrame` antes de pintar `sceneRef`.
  const idleCrawl = enabled && showCue && !reducedMotion
  const animating = !!playing || striking || idleCrawl || peerAimLive
  const onFrame = React.useCallback(
    (now: number): void => {
      const p = playingRef.current
      if (p) {
        const t = (now - p.startedAt) / 1000
        const orient = orientRef.current.map
        if (t < 0 && p.prelude) {
          // prelúdio: o taco do outro recua e bate; as bolas ainda paradas
          const k = Math.min(1, Math.max(0, 1 + t / (PRELUDE_MS / 1000)))
          const pull = k < 0.35 ? p.prelude.pull * easeOut(k / 0.35) : p.prelude.pull * (1 - easeIn((k - 0.35) / 0.65))
          sceneRef.current = {
            balls: p.start.map((b) => ({ id: b.id, x: b.x, y: b.y, m: orient.get(b.id) ?? IDENTITY })),
            ghostCue: null,
            aim: null,
            cue: null,
            peer: { cue: { angle: p.prelude.angle, pull }, path: null, ghost: null },
            t: 0
          }
          return
        }
        if (!p.cueSounded) {
          p.cueSounded = true
          sound('pool-cue', 0.5 + (p.prelude?.pull ?? 0.5) * 0.5)
        }
        const prevT = p.prevT
        const quiet = t - prevT > SOUND_SKIP_S
        for (const ev of p.player.eventsBetween(prevT, t)) {
          if (ev.k === 'pocket') {
            p.gone.add(ev.a)
            const from = p.lastPos.get(ev.a)
            const to = pocketCenter(ev.pocket)
            if (from) p.sinking.set(ev.a, { t0: ev.t, fromX: from.x, fromY: from.y, toX: to.x, toY: to.y })
          }
          if (quiet) continue
          const last = soundAtRef.current[ev.k] ?? -Infinity
          if (now - last < SOUND_GAP_MS) continue
          soundAtRef.current[ev.k] = now
          if (ev.k === 'hit') sound('pool-hit', Math.min(1, 0.25 + ev.v / 4))
          else if (ev.k === 'cushion') sound('pool-cushion', Math.min(1, 0.3 + ev.v / 3))
          else sound('pool-pocket')
        }
        p.prevT = t
        const out: SceneBall[] = []
        for (const [id, b] of p.player.at(t)) {
          if (p.gone.has(id)) {
            const sk = p.sinking.get(id)
            if (sk) {
              const k = (t - sk.t0) / SINK_S
              if (k < 1) {
                const e = easeIn(Math.max(0, k))
                out.push({
                  id,
                  x: sk.fromX + (sk.toX - sk.fromX) * e,
                  y: sk.fromY + (sk.toY - sk.fromY) * e,
                  m: orient.get(id) ?? IDENTITY,
                  scale: 1 - 0.65 * e,
                  alpha: 1 - e
                })
              }
            }
            continue
          }
          const prev = p.lastPos.get(id)
          let m = orient.get(id) ?? IDENTITY
          if (prev) {
            const dx = b.x - prev.x, dy = b.y - prev.y
            if (dx !== 0 || dy !== 0) {
              m = roll(m, dx, dy, BALL_R)
              orient.set(id, m)
            }
          }
          p.lastPos.set(id, { x: b.x, y: b.y })
          out.push({ id, x: b.x, y: b.y, m })
        }
        sceneRef.current = { balls: out, ghostCue: null, aim: null, cue: null, peer: null, t: 0 }
        if (t >= p.player.duration + SINK_S) {
          // fim: a vista do servidor (posição final) volta a mandar
          for (const [id, m] of orient) orient.set(id, orthonormalize(m))
          playingRef.current = null
          strikeRef.current = null
          setPlaying(null)
          setStriking(false)
          consumeReplay()
        }
        return
      }
      const base = sceneLive.current
      const s = strikeRef.current
      if (s) {
        const k = (now - s.t0) / STRIKE_MS
        if (k >= 1) {
          // taco bateu; até a mesa nova chegar, a cena parada sem taco
          sceneRef.current = { ...base, aim: null, cue: null, peer: null, t: 0 }
          strikeRef.current = null
          setStriking(false)
          return
        }
        sceneRef.current = { ...base, aim: null, cue: { angle: s.angle, pull: s.pull0 * (1 - easeIn(k)) }, peer: null, t: 0 }
        return
      }
      // parado: a minha linha rasteja; o taco do adversário segue a mira que chega
      let peer: Scene['peer'] = null
      const pa = peerAim.current
      const cue = base.balls.find((b) => b.id === 0) ?? null
      if (pa && pa.side !== mySide && now - pa.at < PEER_STALE_MS) {
        const sm = peerSmooth.current
        if (pa.a !== null) sm.angle = sm.angle === null ? pa.a : wrap(sm.angle + wrap(pa.a - sm.angle) * 0.35)
        sm.pull += (pa.p - sm.pull) * 0.4
        const hasCue = pa.a !== null && sm.angle !== null && !!cue
        peer = {
          cue: hasCue ? { angle: sm.angle!, pull: sm.pull } : null,
          path: hasCue ? aimPath(cue!, sm.angle!, base.balls) : null,
          ghost: pa.g ? { x: pa.g[0], y: pa.g[1] } : null
        }
      } else {
        peerSmooth.current = { angle: null, pull: 0 }
      }
      sceneRef.current = { ...base, peer, t: now }
    },
    [consumeReplay, sound, peerAim, mySide]
  )

  // Aviso arcade depois que as bolas param (ou do estouro de tempo, que não tem replay).
  React.useEffect(() => {
    if (!position || playing || aboutToPlay || table.phase !== 'playing') return
    const key = `${table.id}:${table.moves.length}:${position.lastShot?.by ?? ''}:${position.timeouts.white}:${position.timeouts.black}`
    if (calloutPlyRef.current === key) return
    const first = calloutPlyRef.current === null
    calloutPlyRef.current = key
    if (first) return // abri a mesa agora: o que já aconteceu não é novidade
    const c = calloutFor(position, mySide, table)
    if (!c) return
    sound(c.tone === 'good' ? 'pool-nice' : c.tone === 'bad' ? 'pool-foul' : 'pool-nice', 0.8)
    setCallout({ ...c, key: Date.now() })
  }, [position, playing, aboutToPlay, table, mySide, sound])
  React.useEffect(() => {
    if (!callout) return
    const t = setTimeout(() => setCallout(null), CALLOUT_MS)
    return () => clearTimeout(t)
  }, [callout])

  // Desmontou: solta o tocador e as referências.
  React.useEffect(
    () => () => {
      playingRef.current = null
      strikeRef.current = null
      soundAtRef.current = {}
      sceneRef.current = EMPTY_SCENE
    },
    []
  )

  const onSkin = React.useCallback((poolSkin: PoolSkin) => void update({ poolSkin }), [update])
  const aimAt = aimCtl.aimAt
  const onAimBall = React.useCallback(
    (id: number) => {
      const b = balls.find((x) => x.id === id)
      if (b) aimAt(b.x, b.y)
    },
    [balls, aimAt]
  )

  if (!position) return null

  const iPlay = mySide !== null
  // Esperando adversário ou a contagem: só a mesa posta, sem placar.
  const showHud = table.phase === 'playing' || table.phase === 'finished'
  // Efeito e força só com a partida rolando (no fim fica só o placar).
  const controls = iPlay && table.phase === 'playing'
  const controlsOff = !enabled || position.ballInHand
  // Enquanto as bolas rolam o placar mostra a mesa de ANTES (bolas e grupos).
  const before = playing ? { balls: playing.start, groups: playing.startGroups } : aboutToPlay ? { balls: prevView, groups: prevSame?.groups ?? null } : null
  const hudPosition =
    before && before.balls && before.groups
      ? { ...position, groups: before.groups, balls: before.balls.map((b) => ({ ...b, state: 's' as const })) }
      : position
  const hud = showHud && (
    <PoolHud
      table={table}
      position={hudPosition}
      mySide={mySide}
      replaying={!!playing || aboutToPlay}
      compact={isPhone}
      error={error}
      skin={settings.poolSkin}
      onSkin={onSkin}
      onAimBall={enabled && !position.ballInHand ? onAimBall : undefined}
      wide={!isPhone && mode === 'bottom'}
    />
  )
  const aviso = callout && (
    <div key={callout.key} className={cn('pool-aviso', `pool-aviso--${callout.tone}`)} role="status" aria-live="polite">
      <span className="pool-aviso-texto">{callout.text}</span>
      {callout.sub && <span className="pool-aviso-sub">{callout.sub}</span>}
    </div>
  )
  const canvas = (
    <PoolCanvas
      scene={scene}
      skin={settings.poolSkin}
      rotated={isPhone}
      onPointer={iPlay ? aimCtl.onPointer : undefined}
      animating={animating}
      sceneRef={sceneRef}
      onFrame={onFrame}
    />
  )
  const bottom = !isPhone && mode === 'bottom'
  const widget = (
    <CueBallWidget
      sx={st.sx}
      sy={st.sy}
      onChange={aimCtl.setOffset}
      onCenter={aimCtl.centerOffset}
      disabled={controlsOff}
      size={isPhone ? 80 : bottom ? 88 : 108}
    />
  )
  const bar = (
    <PowerBar
      power={st.power}
      onChange={aimCtl.setPower}
      onRelease={aimCtl.release}
      onCancel={aimCtl.cancel}
      disabled={controlsOff}
      vertical={!bottom}
      focusOnEnable
      hint={!isPhone}
    />
  )
  const dica = enabled && !isPhone && (
    <p className="pool-dica">
      {position.ballInHand ? (
        <>Toque na mesa pra colocar a branca</>
      ) : (
        <>
          Toque na mesa pra apontar · arraste pra girar · <kbd>←</kbd> <kbd>→</kbd> ajuste fino · <kbd>Espaço</kbd> medidor
        </>
      )}
    </p>
  )

  if (isPhone) {
    // Retrato: a mesa em pé em cima, os controles numa linha embaixo.
    return (
      <div className="flex w-full min-w-0 flex-col gap-2">
        <div className="pool-palco pool-mesa-fone">
          {canvas}
          {aviso}
        </div>
        {controls ? (
          <div className="flex min-w-0 items-start gap-2">
            {widget}
            {bar}
            <div className="min-w-0 flex-1">{hud}</div>
          </div>
        ) : (
          hud
        )}
      </div>
    )
  }

  // PC apertado em altura: a mesa na largura toda e a faixa de controles embaixo.
  if (bottom) {
    return (
      <div ref={rootRef} className="flex min-h-0 min-w-0 flex-col items-center gap-2">
        <div className="pool-palco pool-mesa-baixo">
          {canvas}
          {aviso}
        </div>
        {showHud && (
          <div className="pool-faixa">
            <div className="min-w-0 flex-1">{hud}</div>
            {controls && (
              <div className="pool-faixa-controles">
                {widget}
                <div className="pool-faixa-forca">{bar}</div>
              </div>
            )}
          </div>
        )}
        {dica}
      </div>
    )
  }

  // PC: a mesa deitada à esquerda; efeito e força lado a lado, o placar embaixo.
  return (
    <div ref={rootRef} className="flex min-w-0 items-center gap-3">
      <div className="pool-palco pool-mesa-pc">
        {canvas}
        {aviso}
      </div>
      {showHud && (
        <div className="pool-controles flex w-60 shrink-0 flex-col gap-3 overflow-y-auto">
          {hud}
          {controls && (
            <div className="pool-painel">
              {widget}
              {bar}
            </div>
          )}
          {dica}
        </div>
      )}
    </div>
  )
}
