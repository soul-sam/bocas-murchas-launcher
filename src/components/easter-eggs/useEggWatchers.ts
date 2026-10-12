import * as React from 'react'
import { useAuth } from '@/lib/auth-context'
import { useSettings } from '@/lib/settings-context'
import { useVoice } from '@/lib/voice-context'
import { isWeb } from '@/lib/platform'

/**
 * OVOS DE COMPORTAMENTO (out/2026) — os que não são tecla, comando nem
 * relógio: são coisas que a pessoa FAZ com o launcher. Cada vigia aqui só
 * observa e chama `found(id, recado)`; quem registra (e não registra duas
 * vezes) é a camada (EggLayer).
 *
 * Tudo em memória, por sessão: fechar o launcher no meio da hora sozinho na
 * call zera a conta, e é justo — o ovo é ficar, não somar.
 */

type Found = (id: string, title: string, body?: string) => void

/** Tamanho mínimo da janela (electron/main/index.ts, minWidth/minHeight). */
const MIN_WIDTH = 1000
const MIN_HEIGHT = 640

const HOUR = 60 * 60 * 1000

/** Instantes dentro da janela, contando o novo. */
function push(times: number[], now: number, windowMs: number): number {
  times.push(now)
  while (times.length > 0 && now - times[0] > windowMs) times.shift()
  return times.length
}

export function useEggWatchers(found: Found): void {
  const { user } = useAuth()
  const { settings } = useSettings()
  const voice = useVoice()

  const foundRef = React.useRef(found)
  foundRef.current = found

  // ---- Indeciso: 5 trocas de tema em 1 minuto ------------------------------
  const themeTimes = React.useRef<number[]>([])
  const lastTheme = React.useRef(settings.theme)
  React.useEffect(() => {
    if (settings.theme === lastTheme.current) return
    lastTheme.current = settings.theme
    if (push(themeTimes.current, Date.now(), 60_000) >= 5) {
      foundRef.current('indeciso', 'Indeciso', 'Escolhe um, vai.')
    }
  }, [settings.theme])

  // ---- Apertadinho: janela no tamanho mínimo (só no app; a web não tem) ----
  React.useEffect(() => {
    if (isWeb()) return
    const check = (): void => {
      if (window.innerWidth <= MIN_WIDTH && window.innerHeight <= MIN_HEIGHT) {
        foundRef.current('apertadinho', 'Apertadinho', 'Menor que isso não dá.')
      }
    }
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ---- Estátua: 1 hora sem mexer em nada ------------------------------------
  React.useEffect(() => {
    let last = Date.now()
    const touch = (): void => {
      last = Date.now()
    }
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const
    for (const name of events) window.addEventListener(name, touch, { passive: true })
    const timer = window.setInterval(() => {
      if (Date.now() - last >= HOUR) foundRef.current('estatua', 'Estátua', 'Uma hora sem mexer. Tá vivo?')
    }, 60_000)
    return () => {
      for (const name of events) window.removeEventListener(name, touch)
      window.clearInterval(timer)
    }
  }, [])

  // ---- Narciso: 10 cliques na própria foto em 10 s --------------------------
  // Captura: a foto para a propagação (abre o perfil), mas a fase de captura
  // da janela vem antes dela. O `data-avatar-of` sai do UserAvatar.
  const avatarClicks = React.useRef<number[]>([])
  const myId = user?.id
  React.useEffect(() => {
    if (!myId) return
    const onClick = (event: MouseEvent): void => {
      const target = event.target instanceof Element ? event.target : null
      if (!target?.closest(`[data-avatar-of="${CSS.escape(myId)}"]`)) return
      if (push(avatarClicks.current, Date.now(), 10_000) >= 10) {
        avatarClicks.current = []
        foundRef.current('narciso', 'Narciso', 'Que foto, hein. A gente já sabe.')
      }
    }
    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  }, [myId])

  // ---- Pisca-Pisca: 10 trocas de mudo em 10 s -------------------------------
  const micTimes = React.useRef<number[]>([])
  const lastMic = React.useRef(voice.micEnabled)
  React.useEffect(() => {
    if (voice.micEnabled === lastMic.current) return
    lastMic.current = voice.micEnabled
    if (!voice.connected) return
    if (push(micTimes.current, Date.now(), 10_000) >= 10) {
      micTimes.current = []
      foundRef.current('pisca-pisca', 'Pisca-Pisca', 'O microfone pediu arrego.')
    }
  }, [voice.micEnabled, voice.connected])

  // ---- Porta Giratória: entrar na call 10 vezes em 1 minuto ----------------
  const joinTimes = React.useRef<number[]>([])
  const wasConnected = React.useRef(voice.connected)
  React.useEffect(() => {
    const before = wasConnected.current
    wasConnected.current = voice.connected
    if (before || !voice.connected) return
    if (push(joinTimes.current, Date.now(), 60_000) >= 10) {
      joinTimes.current = []
      foundRef.current('porta-giratoria', 'Porta Giratória', 'Decide: entra ou sai?')
    }
  }, [voice.connected])

  // ---- Surdo por Opção (10 min ensurdecido) e Solitário (1 h sozinho) -------
  const deafSince = React.useRef<number | null>(null)
  const aloneSince = React.useRef<number | null>(null)
  const alone = voice.connected && voice.participants.length <= 1
  const deaf = voice.connected && voice.deafened
  React.useEffect(() => {
    deafSince.current = deaf ? (deafSince.current ?? Date.now()) : null
  }, [deaf])
  React.useEffect(() => {
    aloneSince.current = alone ? (aloneSince.current ?? Date.now()) : null
  }, [alone])
  React.useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now()
      if (deafSince.current !== null && now - deafSince.current >= 10 * 60_000) {
        foundRef.current('surdo', 'Surdo por Opção', 'Dez minutos sem ouvir ninguém. Paz.')
      }
      if (aloneSince.current !== null && now - aloneSince.current >= HOUR) {
        foundRef.current('solitario', 'Solitário', 'Uma hora sozinho na call. Chama alguém.')
      }
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [])
}
