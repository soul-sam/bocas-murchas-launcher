import * as React from 'react'
import { parsePoolPosition, type BoardTableView, type Side } from '@/lib/api-board'
import { useBoard } from '@/lib/board-context'
import { useLayout } from '@/lib/layout-context'
import { aim } from '@/lib/pool-geometry'
import { createReplayPlayer, type ReplayPlayer } from '@/lib/pool-replay'
import { useSettings } from '@/lib/settings-context'
import { playUiSound, type UiSound } from '@/lib/ui-sounds'
import { CueBallWidget } from './CueBallWidget'
import type { PoolSkin, Scene } from './draw'
import { PoolCanvas } from './PoolCanvas'
import { PoolHud } from './PoolHud'
import { PowerBar } from './PowerBar'
import { useAim } from './useAim'

interface Props {
  table: BoardTableView
  mySide: Side | null
  /** Posso jogar agora (vez minha, nada no ar, partida rolando). */
  canAct: boolean
}

type Ball = { id: number; x: number; y: number }
interface Playing { player: ReplayPlayer; startedAt: number }

const STRIKE_MS = 120
/** Um som do mesmo tipo a cada 50 ms, no máximo (quebra com 15 bolas vira barulho branco). */
const SOUND_GAP_MS = 50
/** Pulo grande no tempo (janela escondida, aba parada): não despeja os sons atrasados. */
const SOUND_SKIP_S = 0.25
const NUDGE = Math.PI / 360 // meio grau
const NUDGE_FINE = Math.PI / 3600
const EMPTY_SCENE: Scene = { balls: [], ghostCue: null, aim: null, cue: null, lastPocketed: [] }
const NO_BALLS: Ball[] = []

/**
 * A partida de bilhar: mesa, mira, força, efeito e placar. Orquestra o
 * replay de cada tacada (relógio em `performance.now()`, rAF escrevendo em
 * `sceneRef` — o React não re-renderiza por quadro) e manda os lances.
 */
export function PoolMatch({ table, mySide, canAct }: Props): JSX.Element | null {
  const { play, replay, consumeReplay } = useBoard()
  const { settings, update } = useSettings()
  const { isPhone } = useLayout()

  const position = React.useMemo(() => parsePoolPosition(table.position), [table.position])
  const balls = React.useMemo<Ball[]>(
    () => (position ? position.balls.filter((b) => b.state === 's').map(({ id, x, y }) => ({ id, x, y })) : NO_BALLS),
    [position]
  )
  const cueBall = balls.find((b) => b.id === 0) ?? null

  const [playing, setPlaying] = React.useState<Playing | null>(null)
  const [striking, setStriking] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const playingRef = React.useRef<Playing | null>(null)
  playingRef.current = playing
  const strikeRef = React.useRef<{ t0: number; angle: number } | null>(null)
  /** Bolas da vista anterior: o replay começa da posição de ANTES da tacada. */
  const lastViewRef = React.useRef<{ tableId: string; balls: Ball[] } | null>(null)
  /** Último `ply` que já virou replay (não toca duas vezes a mesma tacada). */
  const lastPlyRef = React.useRef<string | null>(null)
  const sceneRef = React.useRef<Scene>(EMPTY_SCENE)
  const soundAtRef = React.useRef<Record<string, number>>({})

  const settingsRef = React.useRef(settings)
  settingsRef.current = settings
  const sound = React.useCallback((name: UiSound, factor = 1): void => {
    const s = settingsRef.current
    playUiSound(name, s.soundEnabled ? s.soundVolume * factor : 0)
  }, [])

  // Replay que vale para esta vista: mesma mesa e o lance que acabou de chegar.
  const replayKey = replay ? `${replay.tableId}:${replay.ply}` : null
  const replayFits = !!replay && replay.tableId === table.id && replay.ply === table.moves.length
  const prevView = lastViewRef.current && lastViewRef.current.tableId === table.id ? lastViewRef.current.balls : null
  // Ainda não começou (o efeito abaixo liga): desenha a posição de antes, sem piscar a final.
  const aboutToPlay = replayFits && lastPlyRef.current !== replayKey && !!prevView

  React.useLayoutEffect(() => {
    if (replay) {
      if (replayFits && lastPlyRef.current !== replayKey && prevView) {
        lastPlyRef.current = replayKey
        const player = createReplayPlayer(replay.replay, prevView)
        soundAtRef.current = {}
        setPlaying({ player, startedAt: performance.now() })
      } else if (!replayFits || !prevView) {
        // Outra mesa/outro lance, ou sem a posição de antes (acabei de abrir a mesa): fica a final.
        if (!playingRef.current) consumeReplay()
      }
    }
    lastViewRef.current = { tableId: table.id, balls }
    // `prevView` e `replayFits` saem de `replay`/`table`: as deps abaixo cobrem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay, table.id, table.moves.length, balls, consumeReplay])

  // Mesa nova: nada do replay da outra fica.
  React.useEffect(() => {
    setPlaying(null)
    setStriking(false)
    strikeRef.current = null
    setError(null)
  }, [table.id])

  React.useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 4_500)
    return () => clearTimeout(t)
  }, [error])

  // --- mira -------------------------------------------------------------------
  const myTurn = !!position && mySide !== null && position.turn === mySide
  const enabled = canAct && !playing && !striking && table.phase === 'playing' && !table.result && myTurn

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
      strikeRef.current = { t0: performance.now(), angle: shot.a }
      setStriking(true)
      send({ t: 'shot', a: shot.a, p: shot.p, sx: shot.sx, sy: shot.sy })
    },
    [send, sound]
  )
  const onPlace = React.useCallback((x: number, y: number) => send({ t: 'place', x, y }), [send])

  const aimCtl = useAim({
    enabled,
    ballInHand: !!position?.ballInHand,
    breakPending: !!position?.breakPending,
    cue: cueBall,
    balls,
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

  // --- cena parada ------------------------------------------------------------
  const showCue = st.phase === 'idle' || st.phase === 'aiming' || st.phase === 'charging'
  const scene = React.useMemo<Scene>(() => {
    const shown = aboutToPlay && prevView ? prevView : balls
    const cue = shown.find((b) => b.id === 0) ?? null
    const aiming = showCue && !!cue && !aboutToPlay
    return {
      balls: shown,
      ghostCue: st.ghost,
      aim: aiming && cue ? { angle: st.angle, result: aim(cue, st.angle, shown), power: st.power } : null,
      cue: aiming ? { angle: st.angle, pull: st.power, strike: 0 } : null,
      lastPocketed: position?.lastShot?.pocketed ?? []
    }
  }, [aboutToPlay, prevView, balls, showCue, st.ghost, st.angle, st.power, position])
  const sceneLive = React.useRef(scene)
  sceneLive.current = scene
  if (!playing && !striking) sceneRef.current = scene

  // --- o loop (replay e a batida do taco) ---------------------------------------
  const animating = !!playing || striking
  React.useEffect(() => {
    if (!animating) return
    let raf = 0
    let prevT = -1e-6
    const gone = new Set<number>()
    const tick = (now: number): void => {
      const p = playingRef.current
      if (p) {
        const t = (now - p.startedAt) / 1000
        const quiet = t - prevT > SOUND_SKIP_S
        for (const ev of p.player.eventsBetween(prevT, t)) {
          if (ev.k === 'pocket') gone.add(ev.a)
          if (quiet) continue
          const last = soundAtRef.current[ev.k] ?? -Infinity
          if (now - last < SOUND_GAP_MS) continue
          soundAtRef.current[ev.k] = now
          if (ev.k === 'hit') sound('pool-hit', Math.min(1, ev.v / 4))
          else if (ev.k === 'cushion') sound('pool-cushion', Math.min(1, ev.v / 3))
          else sound('pool-pocket')
        }
        prevT = t
        const at = p.player.at(t)
        const out: Ball[] = []
        for (const [id, b] of at) if (!gone.has(id)) out.push({ id, x: b.x, y: b.y })
        sceneRef.current = { balls: out, ghostCue: null, aim: null, cue: null, lastPocketed: [] }
        if (t >= p.player.duration) {
          // fim: a vista do servidor (posição final) volta a mandar
          playingRef.current = null
          strikeRef.current = null
          setPlaying(null)
          setStriking(false)
          consumeReplay()
          return
        }
      } else {
        const s = strikeRef.current
        const k = s ? (now - s.t0) / STRIKE_MS : 1
        const base = sceneLive.current
        if (k >= 1 || !s) {
          // taco bateu; até a mesa nova chegar, a cena parada sem taco
          sceneRef.current = { ...base, aim: null, cue: null }
          setStriking(false)
          return
        }
        sceneRef.current = { ...base, aim: null, cue: { angle: s.angle, pull: 0, strike: k } }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // `playing` também: uma tacada nova no meio da outra recomeça o relógio e as caçapas
  }, [animating, playing, consumeReplay, sound])

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

  if (!position) return null

  const iPlay = mySide !== null
  // Esperando adversário ou a contagem: só a mesa posta, sem placar.
  const showHud = table.phase === 'playing' || table.phase === 'finished'
  // Efeito e força só com a partida rolando (no fim fica só o placar).
  const controls = iPlay && table.phase === 'playing'
  const controlsOff = !enabled || position.ballInHand
  const hud = showHud && (
    <PoolHud
      table={table}
      position={position}
      mySide={mySide}
      replaying={!!playing || aboutToPlay}
      compact={isPhone}
      error={error}
      skin={settings.poolSkin}
      onSkin={onSkin}
    />
  )
  const canvas = (
    <PoolCanvas
      scene={scene}
      skin={settings.poolSkin}
      rotated={isPhone}
      onPointer={iPlay ? aimCtl.onPointer : undefined}
      animating={animating}
      sceneRef={sceneRef}
    />
  )
  const widget = (
    <CueBallWidget
      sx={st.sx}
      sy={st.sy}
      onChange={aimCtl.setOffset}
      onCenter={aimCtl.centerOffset}
      disabled={controlsOff}
      size={isPhone ? 80 : 112}
    />
  )
  const bar = (
    <PowerBar
      power={st.power}
      onChange={aimCtl.setPower}
      onRelease={aimCtl.release}
      onCancel={aimCtl.cancel}
      disabled={controlsOff}
      focusOnEnable
      hint={!isPhone}
    />
  )

  if (isPhone) {
    // Retrato: a mesa em pé em cima, os controles numa linha embaixo.
    return (
      <div className="flex w-full min-w-0 flex-col gap-2">
        <div className="pool-mesa-fone">{canvas}</div>
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

  // PC: a mesa deitada à esquerda; efeito e força lado a lado, o placar embaixo.
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="pool-mesa-pc">{canvas}</div>
      {showHud && (
        <div className="pool-controles flex w-56 shrink-0 flex-col gap-3 overflow-y-auto">
          {controls && (
            <div className="flex items-start justify-center gap-3">
              {widget}
              {bar}
            </div>
          )}
          {hud}
        </div>
      )}
    </div>
  )
}
