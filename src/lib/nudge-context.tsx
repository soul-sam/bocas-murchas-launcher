import * as React from 'react'
import { useSocket } from './socket-context'
import { useSettings } from './settings-context'
import { playUiSound } from './ui-sounds'

/**
 * O "tremer a tela" do MSN.
 *
 * Três coisas acontecem juntas quando chega um nudge: a janela do Windows pula
 * (processo main), o conteúdo treme via CSS, e toca um baque. Só o CSS não
 * convence; só a janela não aparece pra quem está com ela maximizada.
 *
 * Os limites de verdade são do servidor — ele decide se o nudge sai. Aqui só
 * garantimos que dois nudges quase simultâneos não empilhem animação.
 */

const SHAKE_MS = 700
const LOCAL_COOLDOWN_MS = 2_000

export interface IncomingNudge {
  scope: 'user' | 'channel'
  from: { id: string; displayName: string; avatar?: string }
  at: number
}

interface NudgeContextValue {
  /** Verdadeiro durante a animação — o layout aplica a classe de tremor. */
  shaking: boolean
  /** Quem cutucou por último, pra mostrar o aviso na tela. */
  lastNudge: IncomingNudge | null
  /** Erro/cooldown devolvido pelo servidor na última tentativa. */
  feedback: string | null
  clearFeedback: () => void

  nudgeUser: (targetUserId: string) => void
  nudgeChannel: () => void
  /** Aciona o tremor localmente — usado pra testar nas configurações. */
  testShake: () => void
}

const NudgeContext = React.createContext<NudgeContextValue | null>(null)

export function NudgeProvider({ children }: { children: React.ReactNode }) {
  const { socket } = useSocket()
  const { settings } = useSettings()

  const [shaking, setShaking] = React.useState(false)
  const [lastNudge, setLastNudge] = React.useState<IncomingNudge | null>(null)
  const [feedback, setFeedback] = React.useState<string | null>(null)

  const lastShakeRef = React.useRef(0)
  const settingsRef = React.useRef(settings)
  settingsRef.current = settings

  const runShake = React.useCallback(() => {
    const now = Date.now()
    if (now - lastShakeRef.current < LOCAL_COOLDOWN_MS) return
    lastShakeRef.current = now

    setShaking(true)
    setTimeout(() => setShaking(false), SHAKE_MS)

    playUiSound(
      'nudge',
      settingsRef.current.soundEnabled ? settingsRef.current.soundVolume : 0
    )

    if (settingsRef.current.nudgeShakeWindow) {
      void window.bocas.nudge.shake({ intensity: 14, durationMs: SHAKE_MS })
    }
  }, [])

  // --- receber ------------------------------------------------------------
  React.useEffect(() => {
    if (!socket) return

    const handleNudge = (data: IncomingNudge): void => {
      if (settingsRef.current.nudgeOptOut) return
      if (!data?.from) return

      setLastNudge(data)
      runShake()

      // Janela escondida na bandeja ou atrás do jogo: o tremor não aparece pra
      // ninguém, então a notificação do sistema é o único aviso que funciona.
      if (!document.hasFocus()) {
        void window.bocas.notify.show({
          title:
            data.scope === 'channel'
              ? `${data.from.displayName} tremeu a sala`
              : `${data.from.displayName} te cutucou`,
          body: 'Bocas Murchas',
          silent: !settingsRef.current.soundEnabled
        })
      }

      // Aviso some sozinho.
      setTimeout(() => {
        setLastNudge((current) => (current?.at === data.at ? null : current))
      }, 4_000)
    }

    socket.on('nudge:received', handleNudge)
    return () => {
      socket.off('nudge:received', handleNudge)
    }
  }, [socket, runShake])

  // Mantém o servidor sabendo se aceito cutucada.
  React.useEffect(() => {
    if (!socket) return
    socket.emit('nudge:setOptOut', settings.nudgeOptOut)
  }, [socket, settings.nudgeOptOut])

  // --- enviar -------------------------------------------------------------
  const handleAck = React.useCallback((response: { ok: boolean; error?: string }) => {
    if (!response?.ok && response?.error) setFeedback(response.error)
  }, [])

  const nudgeUser = React.useCallback(
    (targetUserId: string) => {
      socket?.emit('nudge:send', { scope: 'user', targetUserId }, handleAck)
    },
    [socket, handleAck]
  )

  const nudgeChannel = React.useCallback(() => {
    socket?.emit('nudge:send', { scope: 'channel' }, handleAck)
  }, [socket, handleAck])

  React.useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => setFeedback(null), 3_000)
    return () => clearTimeout(timer)
  }, [feedback])

  const value = React.useMemo<NudgeContextValue>(
    () => ({
      shaking,
      lastNudge,
      feedback,
      clearFeedback: () => setFeedback(null),
      nudgeUser,
      nudgeChannel,
      testShake: runShake
    }),
    [shaking, lastNudge, feedback, nudgeUser, nudgeChannel, runShake]
  )

  return <NudgeContext.Provider value={value}>{children}</NudgeContext.Provider>
}

export function useNudge(): NudgeContextValue {
  const ctx = React.useContext(NudgeContext)
  if (!ctx) throw new Error('useNudge must be used within a NudgeProvider')
  return ctx
}
