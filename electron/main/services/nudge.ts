import { BrowserWindow } from 'electron'

/**
 * O "tremer a tela" do MSN, versao janela de verdade.
 *
 * O renderer tambem sacode o conteudo via CSS. Os dois juntos e que dao a
 * sensacao certa: a janela pula na tela E o conteudo treme dentro dela.
 *
 * O servidor ja limita quem pode cutucar e com que frequencia. O limite daqui e
 * segunda linha de defesa: garante que nem um bug nem um servidor comprometido
 * conseguem deixar a janela pulando sem parar.
 */

const FRAME_MS = 16 // ~60fps
const MIN_INTERVAL_MS = 3_000 // nunca dois tremores colados
const MAX_DURATION_MS = 1_200
const MAX_INTENSITY_PX = 24

export interface NudgeOptions {
  /** Deslocamento maximo em pixels. */
  intensity?: number
  /** Duracao total em ms. */
  durationMs?: number
}

export interface NudgeResult {
  shook: boolean
  /** Por que nao sacudiu, quando shook = false. */
  reason?: 'cooldown' | 'no-window' | 'maximized' | 'minimized'
}

let lastNudgeAt = 0
let activeTimer: NodeJS.Timeout | null = null

function stopActive(): void {
  if (activeTimer) {
    clearInterval(activeTimer)
    activeTimer = null
  }
}

export function shakeWindow(options: NudgeOptions = {}): NudgeResult {
  const now = Date.now()

  if (now - lastNudgeAt < MIN_INTERVAL_MS) {
    return { shook: false, reason: 'cooldown' }
  }

  const win = BrowserWindow.getAllWindows()[0]
  if (!win || win.isDestroyed()) {
    return { shook: false, reason: 'no-window' }
  }

  lastNudgeAt = now

  // Sempre pisca na barra de tarefas: e o aviso que funciona mesmo se a pessoa
  // estiver no jogo em tela cheia.
  win.flashFrame(true)
  setTimeout(() => {
    if (!win.isDestroyed()) win.flashFrame(false)
  }, 3_000)

  if (win.isMinimized()) {
    // Mover janela minimizada nao aparece pra ninguem; o flash ja resolve.
    return { shook: false, reason: 'minimized' }
  }

  // setPosition numa janela maximizada a tira do estado maximizado, o que e bem
  // pior que nao tremer. Nesse caso fica so o tremor de CSS do renderer.
  if (win.isMaximized() || win.isFullScreen()) {
    return { shook: false, reason: 'maximized' }
  }

  const intensity = Math.min(
    MAX_INTENSITY_PX,
    Math.max(4, Math.round(options.intensity ?? 14))
  )
  const durationMs = Math.min(
    MAX_DURATION_MS,
    Math.max(200, Math.round(options.durationMs ?? 700))
  )

  stopActive()

  const [baseX, baseY] = win.getPosition()
  const startedAt = Date.now()

  const restore = (): void => {
    stopActive()
    if (!win.isDestroyed() && !win.isMaximized() && !win.isFullScreen()) {
      win.setPosition(baseX, baseY)
    }
  }

  activeTimer = setInterval(() => {
    if (win.isDestroyed()) {
      stopActive()
      return
    }

    const elapsed = Date.now() - startedAt
    if (elapsed >= durationMs) {
      restore()
      return
    }

    // Se a pessoa maximizar no meio do tremor, para na hora pra nao brigar
    // com o gerenciador de janelas.
    if (win.isMaximized() || win.isFullScreen()) {
      stopActive()
      return
    }

    // Amplitude cai ate zero: termina suave em vez de parar seco.
    const decay = 1 - elapsed / durationMs
    const amp = intensity * decay
    const dx = Math.round((Math.random() * 2 - 1) * amp)
    const dy = Math.round((Math.random() * 2 - 1) * amp)

    win.setPosition(baseX + dx, baseY + dy)
  }, FRAME_MS)

  return { shook: true }
}
