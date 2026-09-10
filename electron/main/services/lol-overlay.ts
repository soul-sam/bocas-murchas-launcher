import { BrowserWindow, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type {
  LolSettings,
  LolStatus,
  OverlayAction,
  OverlayCorner,
  OverlayState
} from '../../preload/types.js'

/**
 * SOBREPOSICAO EM PARTIDA — a janelinha que aparece por cima do League.
 *
 * O QUE ELA E: uma BrowserWindow transparente, sem moldura, sempre por cima e
 * fora da barra de tarefas, que nasce quando a fase do cliente vira
 * 'in-progress' e morre quando a partida acaba. Ela carrega `overlay.html`, um
 * segundo ponto de entrada do mesmo renderer.
 *
 * O QUE ELA NAO E: um segundo app. Ela nao tem token, nao abre socket e nao
 * fala com a API. Quem faz isso e a janela principal, que ja tem tudo de pe e
 * empurra o retrato pronto por IPC (`overlay:push`); os cliques voltam por
 * `overlay:action` e sao executados la. Este arquivo e so o encanamento entre
 * as duas janelas — por isso ele nao sabe o que e uma aposta.
 *
 * CLIQUE QUE ATRAVESSA: a janela nasce com `setIgnoreMouseEvents(true,
 * { forward: true })`. O mouse passa direto pro jogo, mas o `forward` continua
 * entregando o movimento pro renderer — e assim que a tela percebe que o
 * ponteiro entrou no painel e pede `setInteractive(true)`. Sem isso a
 * sobreposicao roubaria a mira do jogo inteiro.
 *
 * `focusable: false` (WS_EX_NOACTIVATE no Windows): clicar no painel NAO tira
 * o foco do jogo. E o que permite apostar sem que o League minimize. Em troca,
 * a janela nunca recebe teclado — por isso o formulario de aposta e so botao,
 * sem campo de digitar.
 *
 * LIMITE CONHECIDO: nada disso aparece com o jogo em tela cheia EXCLUSIVA. O
 * League usa "sem bordas" por padrao, onde funciona; quem trocou pra exclusiva
 * nao ve a sobreposicao (nem a da Riot, nem a do Discord).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Tamanho fixo. O conteudo se ancora no canto de dentro da janela, entao um
 * painel curto (so a minha pool) e um comprido (varias partidas pra apostar)
 * cabem nos mesmos 360x520 sem redimensionar — mexer no tamanho de uma janela
 * transparente a cada render pisca por cima do jogo.
 */
const WIDTH = 360
const HEIGHT = 520
/** Respiro pra borda da tela. */
const MARGIN = 16

let overlayWindow: BrowserWindow | null = null
let lastState: OverlayState | null = null
let lolSettings: Pick<LolSettings, 'enabled' | 'overlay' | 'overlayCorner'> = {
  enabled: true,
  overlay: true,
  overlayCorner: 'top-right'
}

/** `phaseSince` da partida em andamento (0 fora de partida). */
let currentPhaseSince = 0
/**
 * `phaseSince` da partida que a pessoa mandou embora. Guardar o inicio da
 * partida — e nao um booleano — e o que faz o "fechar" valer so pra ELA: a
 * proxima tem outro `phaseSince` e a sobreposicao volta sozinha.
 */
let dismissedSince: number | null = null

/** Todas as janelas menos a propria sobreposicao. Na pratica, a principal. */
function mainWindow(): BrowserWindow | null {
  return (
    BrowserWindow.getAllWindows().find((win) => win !== overlayWindow && !win.isDestroyed()) ?? null
  )
}

function cornerPosition(corner: OverlayCorner): { x: number; y: number } {
  // Display primario, e nao o da janela principal: durante a partida ela pode
  // estar minimizada na bandeja, e a posicao de uma janela escondida nao diz
  // nada sobre onde a pessoa esta jogando.
  const area = screen.getPrimaryDisplay().workArea
  const left = area.x + MARGIN
  const right = area.x + area.width - WIDTH - MARGIN
  const top = area.y + MARGIN
  const bottom = area.y + area.height - HEIGHT - MARGIN

  switch (corner) {
    case 'top-left':
      return { x: left, y: top }
    case 'bottom-left':
      return { x: left, y: bottom }
    case 'bottom-right':
      return { x: right, y: bottom }
    case 'top-right':
    default:
      return { x: right, y: top }
  }
}

function createOverlayWindow(): BrowserWindow {
  const { x, y } = cornerPosition(lolSettings.overlayCorner)

  const win = new BrowserWindow({
    x,
    y,
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // Ver o cabecalho: e o que impede o clique na aposta de minimizar o jogo.
    focusable: false,
    alwaysOnTop: true,
    title: 'Bocas Murchas — sobreposicao',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      // Janela sem foco entra em "background throttling" e os timers caem pra
      // 1/s — o cronometro da partida travaria, e a sobreposicao passa a
      // partida inteira sem foco.
      backgroundThrottling: false
    }
  })

  // 'screen-saver' e o nivel mais alto do Electron. Abaixo disso o jogo em
  // "sem bordas" fica por cima e a sobreposicao simplesmente nao aparece.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setIgnoreMouseEvents(true, { forward: true })

  // Um link no painel nao pode virar uma segunda janela sem moldura por cima
  // do jogo. Quem quiser abrir algo pede pra janela principal.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  win.webContents.on('did-finish-load', () => {
    // O ultimo retrato ja empurrado pinta o painel no primeiro quadro; o
    // pedido abaixo busca pool fresca (o poll da principal e de 30s).
    if (lastState) win.webContents.send('overlay:state', lastState)
    requestOverlayState()
  })

  win.on('closed', () => {
    if (overlayWindow === win) overlayWindow = null
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) win.loadURL(`${devUrl}/overlay.html`)
  else win.loadFile(path.join(__dirname, '../renderer/overlay.html'))

  return win
}

function showOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (!overlayWindow.isVisible()) overlayWindow.showInactive()
    return
  }
  const win = createOverlayWindow()
  overlayWindow = win
  // showInactive e nao show: `show()` tenta ativar a janela e, mesmo com
  // focusable:false, isso pisca por cima do jogo no comeco da partida.
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.showInactive()
  })
}

function closeOverlay(): void {
  const win = overlayWindow
  overlayWindow = null
  if (win && !win.isDestroyed()) win.destroy()
}

// ---------------- ciclo de vida ----------------

/** Chamado no boot e a cada salvamento das configuracoes. */
export function applyOverlaySettings(lol: LolSettings): void {
  const cornerChanged = lolSettings.overlayCorner !== lol.overlayCorner
  lolSettings = {
    enabled: lol.enabled,
    overlay: lol.overlay,
    overlayCorner: lol.overlayCorner
  }

  if (!lol.enabled || !lol.overlay) {
    closeOverlay()
    return
  }

  // Trocou o canto com a sobreposicao na tela: refaz a janela em vez de so
  // mover. O canto tambem decide de que lado o CONTEUDO se ancora dentro
  // dela, e essa leitura acontece na montagem — mover a janela deixaria o
  // painel colado na borda errada ate a partida seguinte. Na pratica isso
  // quase nunca roda no meio de um jogo: quem esta mexendo nas configuracoes
  // nao esta em partida.
  if (cornerChanged && overlayWindow && !overlayWindow.isDestroyed()) {
    closeOverlay()
    showOverlay()
  }
}

/**
 * Liga a sobreposicao a fase do cliente. Chamado de dentro do watcher do LoL a
 * cada publicacao de status — idempotente de proposito, porque o status sai
 * varias vezes durante a mesma partida.
 */
export function syncOverlayWithLol(status: LolStatus): void {
  const inGame = status.clientRunning && status.phase === 'in-progress'

  if (!inGame) {
    // Partida acabou: a proxima merece sobreposicao de novo, mesmo que esta
    // tenha sido fechada na mao.
    currentPhaseSince = 0
    dismissedSince = null
    closeOverlay()
    return
  }

  currentPhaseSince = status.phaseSince
  if (!lolSettings.enabled || !lolSettings.overlay) return
  if (dismissedSince === status.phaseSince) return

  showOverlay()
}

/** Fecha ate a proxima partida (botao X do painel). */
export function dismissOverlay(): void {
  dismissedSince = currentPhaseSince
  closeOverlay()
}

export function destroyLolOverlay(): void {
  closeOverlay()
  lastState = null
  dismissedSince = null
  currentPhaseSince = 0
}

// ---------------- ponte entre as duas janelas ----------------

/** Janela principal -> sobreposicao. */
export function pushOverlayState(state: OverlayState): void {
  lastState = state
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay:state', state)
  }
}

export function getOverlayState(): OverlayState | null {
  return lastState
}

/** Sobreposicao -> janela principal. */
export function relayOverlayAction(action: OverlayAction): void {
  const win = mainWindow()
  if (!win) return

  if (action.type === 'open-app') {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    return
  }

  win.webContents.send('overlay:action', action)
}

/** Sobreposicao pediu dados frescos; quem tem token e a principal. */
export function requestOverlayState(): void {
  mainWindow()?.webContents.send('overlay:request-state')
}

/**
 * Liga/desliga o clique. Chamado pela propria sobreposicao conforme o ponteiro
 * entra e sai do painel — ver o cabecalho.
 */
export function setOverlayInteractive(interactive: boolean): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.setIgnoreMouseEvents(!interactive, { forward: true })
}
