import * as React from 'react'
import type { HotkeyBinding, HotkeyRegistration } from '../../electron/preload/types'
import { useSettings } from './settings-context'
import { useVoice } from './voice-context'
import { useSoundboard } from './soundboard-context'
import { useNudge } from './nudge-context'

/**
 * Cola entre as configuracoes de atalho e o que eles fazem.
 *
 * Os atalhos globais (valem com o launcher em segundo plano) sao registrados no
 * processo main. O push-to-talk "segurando a tecla" e tratado aqui no renderer
 * porque o globalShortcut do Electron so avisa no key down — sem key up nao da
 * pra saber quando soltar o mic. Entao:
 *
 *   - janela em foco  -> PTT de verdade, segurando a tecla
 *   - janela em fundo -> o atalho global de PTT alterna o mic
 */

interface HotkeysContextValue {
  /** Resultado do ultimo registro — mostra qual atalho deu conflito. */
  registrations: HotkeyRegistration[]
  /** Verdadeiro enquanto o PTT esta transmitindo. */
  pttActive: boolean
  probe: (accelerator: string) => Promise<{ ok: boolean; error?: string }>
}

const HotkeysContext = React.createContext<HotkeysContextValue | null>(null)

export function HotkeysProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings()
  const voice = useVoice()
  const soundboard = useSoundboard()
  const nudge = useNudge()

  const [registrations, setRegistrations] = React.useState<HotkeyRegistration[]>([])
  const [pttActive, setPttActive] = React.useState(false)

  // Handlers mudam a cada render; o listener de IPC e registrado uma vez só.
  const actionsRef = React.useRef({ voice, soundboard, nudge })
  actionsRef.current = { voice, soundboard, nudge }

  // --- registrar os atalhos globais ---------------------------------------
  const hotkeys = settings.hotkeys

  React.useEffect(() => {
    const bindings: HotkeyBinding[] = []

    if (hotkeys.mute) {
      bindings.push({ id: 'mute', accelerator: hotkeys.mute, action: { kind: 'mute' } })
    }
    if (hotkeys.deafen) {
      bindings.push({ id: 'deafen', accelerator: hotkeys.deafen, action: { kind: 'deafen' } })
    }
    if (hotkeys.pttToggle) {
      bindings.push({
        id: 'ptt-toggle',
        accelerator: hotkeys.pttToggle,
        action: { kind: 'ptt-toggle' }
      })
    }
    if (hotkeys.nudgeChannel) {
      bindings.push({
        id: 'nudge-channel',
        accelerator: hotkeys.nudgeChannel,
        action: { kind: 'nudge-channel' }
      })
    }

    for (const [soundId, accelerator] of Object.entries(hotkeys.sounds)) {
      if (!accelerator) continue
      bindings.push({
        id: `sound:${soundId}`,
        accelerator,
        action: { kind: 'sound', soundId }
      })
    }

    void window.bocas.hotkeys.set(bindings).then(setRegistrations)
  }, [hotkeys])

  // --- reagir aos disparos ------------------------------------------------
  React.useEffect(() => {
    return window.bocas.hotkeys.onTriggered((event) => {
      const { voice: v, soundboard: sb, nudge: n } = actionsRef.current

      switch (event.action.kind) {
        case 'mute':
        case 'ptt-toggle':
          void v.toggleMic()
          break
        case 'deafen':
          v.toggleDeafen()
          break
        case 'nudge-channel':
          n.nudgeChannel()
          break
        case 'sound':
          void sb.play(event.action.soundId)
          break
      }
    })
  }, [])

  // --- push-to-talk com a janela em foco ----------------------------------
  const pttKey = settings.voice.pttKey
  const pttMode = settings.voice.mode === 'push-to-talk'
  const inVoice = voice.connected

  React.useEffect(() => {
    if (!pttMode || !inVoice) {
      setPttActive(false)
      return
    }

    let held = false

    const isTyping = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null
      if (!el) return false
      return (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.isContentEditable === true
      )
    }

    const handleDown = (e: KeyboardEvent): void => {
      if (e.code !== pttKey || held || e.repeat) return
      if (isTyping(e.target)) return

      e.preventDefault()
      held = true
      setPttActive(true)
      void actionsRef.current.voice.setMic(true)
    }

    const handleUp = (e: KeyboardEvent): void => {
      if (e.code !== pttKey || !held) return
      e.preventDefault()
      held = false
      setPttActive(false)
      void actionsRef.current.voice.setMic(false)
    }

    // Perder o foco com a tecla apertada deixaria o mic aberto pra sempre.
    const handleBlur = (): void => {
      if (!held) return
      held = false
      setPttActive(false)
      void actionsRef.current.voice.setMic(false)
    }

    window.addEventListener('keydown', handleDown)
    window.addEventListener('keyup', handleUp)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleDown)
      window.removeEventListener('keyup', handleUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [pttMode, pttKey, inVoice])

  const probe = React.useCallback(
    (accelerator: string) => window.bocas.hotkeys.probe(accelerator),
    []
  )

  const value = React.useMemo<HotkeysContextValue>(
    () => ({ registrations, pttActive, probe }),
    [registrations, pttActive, probe]
  )

  return <HotkeysContext.Provider value={value}>{children}</HotkeysContext.Provider>
}

export function useHotkeys(): HotkeysContextValue {
  const ctx = React.useContext(HotkeysContext)
  if (!ctx) throw new Error('useHotkeys must be used within a HotkeysProvider')
  return ctx
}
