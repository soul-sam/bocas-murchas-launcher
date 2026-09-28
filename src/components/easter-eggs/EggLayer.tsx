import * as React from 'react'
import { Sparkle } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useGamification } from '@/lib/gamification-context'
import { useSettings } from '@/lib/settings-context'
import { playUiSound, type UiSound } from '@/lib/ui-sounds'
import { ApiError } from '@/lib/api'
import { isWeb } from '@/lib/platform'
import { eggs } from '@/lib/easter-eggs/api'
import { emitEgg, onEgg, setTitleDecor, useTitleDecor, type EggEffect } from '@/lib/easter-eggs/bus'
import { clockNow, deadHour, decorFor, newYear, shootingStarTime } from '@/lib/easter-eggs/clock'
import {
  BUFFER_SIZE,
  completedSequence,
  isTypingTarget,
  normalizeKey
} from '@/lib/easter-eggs/sequences'
import { EggNotebook } from './EggNotebook'
import { DecorButton } from './DecorButton'
import { Fireworks, MatrixRain } from './canvases'
import '@/styles/easter-eggs.css'

/**
 * A CAMADA DOS OVOS — escuta, desenha e registra.
 *
 * Escuta três fontes: o teclado (sequências fora de campo de texto), o
 * barramento (`lib/easter-eggs/bus.ts`: TitleBar e comandos de barra do chat)
 * e o relógio (datas e horários, conferidos a cada 10 s).
 *
 * Registrar é mandar `POST /gamification/eggs/:id`. A API responde com badge +
 * murchos pelo socket na primeira vez, e o toast é o de sempre da
 * gamificação — daqui só sai toast de piada, não de prêmio. Cada id vai no
 * máximo uma vez por sessão; o servidor já é idempotente, isto só poupa rede.
 *
 * Mora nos GlobalOverlays: só existe logado, e não desmonta ao trocar de aba.
 */

/** Quanto cada efeito fica na tela. */
const EFFECT_MS: Record<EggEffect, number> = {
  konami: 3_500,
  murcho: 2_400,
  iddqd: 8_000,
  murchar: 4_000,
  f: 5_000,
  sudo: 6_000,
  matrix: 7_000,
  xyzzy: 0,
  girar: 1_300,
  virada: 12_000
}

/** Efeitos que são uma classe no <html> (mexem no app inteiro). */
const HTML_CLASS: Partial<Record<EggEffect, string>> = {
  murchar: 'egg-murchar',
  girar: 'egg-girar'
}

const EFFECT_SOUND: Partial<Record<EggEffect, UiSound>> = {
  konami: 'levelup',
  iddqd: 'levelup',
  murchar: 'self-leave',
  matrix: 'message',
  virada: 'levelup'
}

const JOKE: Partial<Record<EggEffect, { title: string; body?: string }>> = {
  murcho: { title: 'Murchou.', body: 'Olha a boquinha lá em cima.' },
  iddqd: { title: 'Modo Deus ligado', body: 'Nenhum dano pelos próximos 8 segundos. Aproveita.' },
  xyzzy: { title: 'Nada acontece.' },
  virada: { title: 'Feliz ano novo murcho', body: 'Mais um ano sem ninguém ter consertado a impressora.' }
}

interface Running {
  effect: EggEffect
  seed?: string
  /** Muda a cada disparo pra reiniciar a animação do mesmo efeito. */
  key: number
}

let runSeq = 0

export function EggLayer() {
  const { token, user } = useAuth()
  const { pushToast } = useGamification()
  const { settings } = useSettings()
  const decor = useTitleDecor()

  const [running, setRunning] = React.useState<Running | null>(null)
  const [notebookOpen, setNotebookOpen] = React.useState(false)
  const [star, setStar] = React.useState<number | null>(null)
  const [dark, setDark] = React.useState(false)

  const tokenRef = React.useRef(token)
  tokenRef.current = token
  const settingsRef = React.useRef(settings)
  settingsRef.current = settings

  // Cada id sai no máximo uma vez por sessão (o servidor já não paga duas).
  const claimed = React.useRef(new Set<string>())
  const claim = React.useCallback((id: string): void => {
    const current = tokenRef.current
    if (!current || claimed.current.has(id)) return
    claimed.current.add(id)
    eggs.claim(current, id).catch((error: unknown) => {
      // 404 = ovo que o servidor não conhece (launcher mais novo que a API);
      // 409 = fora da janela no relógio dele. Nos dois, tentar de novo não
      // muda nada. Qualquer outra coisa (rede) libera pra próxima vez.
      if (error instanceof ApiError && (error.status === 404 || error.status === 409)) return
      claimed.current.delete(id)
    })
  }, [])

  const sound = React.useCallback((name: UiSound): void => {
    const { soundEnabled, soundVolume } = settingsRef.current
    playUiSound(name, soundEnabled ? soundVolume : 0)
  }, [])

  const run = React.useCallback(
    (effect: EggEffect, seed?: string): void => {
      claim(effect)
      const joke = JOKE[effect]
      if (joke) pushToast({ kind: 'info', ...joke })
      const cue = EFFECT_SOUND[effect]
      if (cue) sound(cue)
      if (EFFECT_MS[effect] > 0) setRunning({ effect, seed, key: ++runSeq })
    },
    [claim, pushToast, sound]
  )

  // Efeito na tela → some sozinho; classe no <html> sai junto.
  React.useEffect(() => {
    if (!running) return
    const htmlClass = HTML_CLASS[running.effect]
    if (htmlClass) document.documentElement.classList.add(htmlClass)
    const timer = window.setTimeout(() => setRunning(null), EFFECT_MS[running.effect])
    return () => {
      window.clearTimeout(timer)
      if (htmlClass) document.documentElement.classList.remove(htmlClass)
    }
  }, [running])

  // Barramento: TitleBar e comandos de barra.
  React.useEffect(
    () =>
      onEgg((event) => {
        switch (event.type) {
          case 'run':
            run(event.effect, event.seed)
            break
          case 'found':
            claim(event.id)
            break
          case 'notebook':
            setNotebookOpen(true)
            claim('caderninho')
            break
          case 'toast':
            pushToast({ kind: 'info', title: event.title, body: event.body })
            break
        }
      }),
    [run, claim, pushToast]
  )

  // Teclado: sequências digitadas fora de campo de texto.
  React.useEffect(() => {
    const buffer: string[] = []
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
      const key = normalizeKey(e.key)
      if (!key) return
      buffer.push(key)
      if (buffer.length > BUFFER_SIZE) buffer.shift()
      const done = completedSequence(buffer)
      if (!done) return
      buffer.length = 0
      // Pelo barramento, e não `run()` direto: a TitleBar também escuta (o
      // "murcho" murcha a boca dela).
      if (done === 'notebook') emitEgg({ type: 'notebook' })
      else emitEgg({ type: 'run', effect: done })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Relógio: enfeite da barra, estrela cadente, hora morta e virada.
  const shown = React.useRef(new Set<string>())
  React.useEffect(() => {
    const tick = (): void => {
      const now = clockNow()
      const next = decorFor(now)
      setTitleDecor(next)
      // 1337 vale só por estar ali — a barra fala h4ck3r e é isso.
      if (next === 'leet') claim('leet')

      const minuteKey = `${now.month}-${now.day}-${now.hour}:${now.minute}`
      const once = (what: string): boolean => {
        const k = `${what}@${minuteKey}`
        if (shown.current.has(k)) return false
        shown.current.add(k)
        return true
      }
      if (shootingStarTime(now) && once('estrela')) setStar(Date.now())
      if (deadHour(now) && once('hora-morta')) {
        setDark(true)
        claim('hora-morta')
      }
      if (newYear(now) && once(`virada-${now.hour}`)) run('virada')
    }
    tick()
    const timer = window.setInterval(tick, 10_000)
    return () => {
      window.clearInterval(timer)
      setTitleDecor(null)
    }
  }, [claim, run])

  React.useEffect(() => {
    if (!dark) return
    const timer = window.setTimeout(() => setDark(false), 6_000)
    return () => window.clearTimeout(timer)
  }, [dark])

  React.useEffect(() => {
    if (star === null) return
    const timer = window.setTimeout(() => setStar(null), 7_000)
    return () => window.clearTimeout(timer)
  }, [star])

  const who = user?.username ?? 'voce'

  return (
    <>
      {running && <EffectView key={running.key} running={running} who={who} />}

      {dark && <div aria-hidden className="egg-hora-morta pointer-events-none fixed inset-0 z-sobretela" />}

      {star !== null && (
        <button
          key={star}
          type="button"
          aria-label="Estrela cadente"
          title="Faz um pedido"
          onClick={() => {
            setStar(null)
            claim('onze-onze')
            pushToast({ kind: 'info', title: 'Pedido anotado', body: 'Não conta pra ninguém, senão não vale.' })
          }}
          className="egg-estrela fixed left-0 top-0 z-sobretela p-2 text-burn drop-shadow-[0_0_8px_hsl(var(--burn))]"
        >
          <Sparkle className="h-5 w-5" />
        </button>
      )}

      {/* Na web não existe barra de título: o enfeite do dia flutua no canto. */}
      {isWeb() && decor && decor !== 'leet' && (
        <div className="fixed right-3 top-3 z-flutuante">
          <DecorButton decor={decor} />
        </div>
      )}

      <EggNotebook open={notebookOpen} onClose={() => setNotebookOpen(false)} />
    </>
  )
}

function EffectView({ running, who }: { running: Running; who: string }) {
  switch (running.effect) {
    case 'konami':
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-sobretela flex items-center justify-center">
          <div className="egg-crt absolute inset-0" />
          <p className="egg-crt-title title-brutal text-5xl text-acid drop-shadow-[0_0_18px_rgb(var(--neon-rgb)/0.6)]">
            +30 VIDAS
          </p>
        </div>
      )
    case 'iddqd':
      return <div aria-hidden className="egg-god pointer-events-none fixed inset-0 z-sobretela" />
    case 'f':
      return <FRain />
    case 'sudo':
      return <SudoTerminal seed={running.seed} who={who} />
    case 'matrix':
      return <MatrixRain />
    case 'virada':
      return <Fireworks />
    default:
      return null
  }
}

/** /f — uma chuva de F. */
function FRain() {
  const drops = React.useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        duration: 2.2 + Math.random() * 2,
        delay: Math.random() * 1.8,
        size: 14 + Math.random() * 26
      })),
    []
  )
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-sobretela overflow-hidden">
      {drops.map((d) => (
        <span
          key={d.id}
          className="egg-f font-display text-acid"
          style={{
            left: `${d.left}%`,
            fontSize: d.size,
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`
          }}
        >
          F
        </span>
      ))}
    </div>
  )
}

/** /sudo — o terminal que recusa. */
function SudoTerminal({ seed, who }: { seed?: string; who: string }) {
  const command = seed?.trim() || 'make me a sandwich'
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-sobretela flex justify-center px-4">
      <pre className="card-acid max-w-lg overflow-hidden whitespace-pre-wrap rounded-brutal bg-void p-4 font-mono text-[12px] leading-relaxed text-acid-text">
        {`$ sudo ${command}\n[sudo] senha de ${who}: ********\n${who} não está no arquivo sudoers. Este incidente será reportado.\n\n(foi reportado pro admin)`}
      </pre>
    </div>
  )
}
