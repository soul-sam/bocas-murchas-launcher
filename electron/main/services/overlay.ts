import { BrowserWindow, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type {
  LauncherSettings,
  LolStatus,
  OverlayAction,
  OverlayCorner,
  OverlayMode,
  OverlayState
} from '../../preload/types.js'

/**
 * A SOBREPOSICAO — a janela que aparece por cima do jogo.
 *
 * O QUE ELA E: uma BrowserWindow transparente, sem moldura, sempre por cima e
 * fora da barra de tarefas, que cobre a tela inteira e carrega `overlay.html`,
 * um segundo ponto de entrada do mesmo renderer. Ela nasce quando ha MOTIVO
 * (ver OverlayMode) e morre quando o ultimo motivo acaba.
 *
 * O QUE ELA NAO E: um segundo app. Ela nao tem token, nao abre socket e nao
 * fala com a API. Quem faz isso e a janela principal, que ja tem tudo de pe e
 * empurra o retrato pronto por IPC (`overlay:push`); os cliques voltam por
 * `overlay:action` e sao executados la. Este arquivo e so o encanamento entre
 * as duas janelas — por isso ele nao sabe o que e uma aposta nem o que e um
 * som.
 *
 * ## Dois motivos pra estar aberta, e eles convivem
 *
 *   - `dock`  — o painel de canto: apostas da partida e as acoes rapidas do
 *               servidor. Abre sozinho quando a partida comeca (se
 *               `lol.overlay`) e tambem pelo atalho global.
 *   - `wheel` — a roda de sons, no centro da tela. So por atalho ou pelo botao
 *               do painel.
 *
 * O MODO E DAQUI, nao do retrato. Quem recebe o atalho global e o processo
 * main, e ele decide se a janela existe; o retrato e um retrato, que chega
 * atrasado por natureza. Se o modo viajasse dentro do `OverlayState`, um
 * retrato de 2s atras fecharia a roda que o atalho acabou de abrir.
 *
 * ## Por que a janela cobre a TELA INTEIRA
 *
 * Ela ja foi 360x520 encostada num canto, quando so existia o painel de
 * apostas. A roda de sons e centrada, e um painel de canto mais uma roda
 * centrada nao cabem num retangulo pequeno. As alternativas eram redimensionar
 * a janela a cada modo (uma janela transparente que muda de tamanho PISCA por
 * cima do jogo) ou abrir uma segunda janela (dois ciclos de vida, dois
 * click-through, duas vezes o mesmo bug). Cobrindo tudo, a posicao de cada
 * peca vira CSS, e o processo main para de ter opiniao sobre layout.
 *
 * Cobrir a tela NAO significa comer o clique: ver abaixo.
 *
 * ## CLIQUE QUE ATRAVESSA
 *
 * A janela nasce com `setIgnoreMouseEvents(true, { forward: true })`. O mouse
 * passa direto pro jogo, mas o `forward` continua entregando o MOVIMENTO pro
 * renderer — e assim que a tela percebe que o ponteiro entrou numa peca e pede
 * `setInteractive(true)`. Sem isso uma janela do tamanho da tela roubaria a
 * mira do jogo inteiro, o tempo todo.
 *
 * Isso vale inclusive com a roda aberta: o fundo dela nao captura clique, so
 * os gomos. Quem abriu a roda no meio de uma luta continua podendo clicar no
 * jogo — a roda nao e modal, e nao tem como ela ser: a janela nunca recebe
 * teclado (abaixo), entao nao haveria Esc pra sair de uma armadilha.
 *
 * `focusable: false` (WS_EX_NOACTIVATE no Windows): clicar na sobreposicao NAO
 * tira o foco do jogo. E o que permite apostar e tocar som sem que o jogo
 * minimize. Em troca, a janela nunca recebe teclado — por isso o formulario de
 * aposta e so botao, sem campo de digitar, e por isso fechar a roda e o mesmo
 * atalho que abriu.
 *
 * LIMITE CONHECIDO: nada disso aparece com o jogo em tela cheia EXCLUSIVA. O
 * League usa "sem bordas" por padrao, onde funciona; quem trocou pra exclusiva
 * nao ve a sobreposicao (nem a da Riot, nem a do Discord).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let overlayWindow: BrowserWindow | null = null
let lastState: OverlayState | null = null

/** Nenhum motivo pra estar aberta = nao existe janela. */
let mode: OverlayMode = { dock: false, wheel: false }

let prefs: { enabled: boolean; corner: OverlayCorner; autoOnMatch: boolean } = {
  enabled: true,
  corner: 'top-right',
  autoOnMatch: true
}

/** `phaseSince` da partida em andamento (0 fora de partida). */
let currentPhaseSince = 0
/**
 * `phaseSince` da partida que a pessoa mandou embora. Guardar o inicio da
 * partida — e nao um booleano — e o que faz o "fechar" valer so pra ELA: a
 * proxima tem outro `phaseSince` e a sobreposicao volta sozinha.
 */
let dismissedSince: number | null = null

/**
 * O painel de canto foi aberto PELA PARTIDA, e nao pelo atalho.
 *
 * Sem esta distincao o atalho nao funcionaria pra ninguem com o LoL ligado —
 * que e o padrao. O watcher publica status o tempo todo, inclusive "nao esta
 * em partida", e cada publicacao chama `syncOverlayWithLol`: o painel aberto
 * na tecla seria fechado na fracao de segundo seguinte, o que pareceria
 * exatamente uma tecla quebrada.
 *
 * Fim de partida fecha o que a PARTIDA abriu. O que a pessoa abriu e dela.
 */
let dockFromMatch = false

/** Todas as janelas menos a propria sobreposicao. Na pratica, a principal. */
function mainWindow(): BrowserWindow | null {
  return (
    BrowserWindow.getAllWindows().find((win) => win !== overlayWindow && !win.isDestroyed()) ?? null
  )
}

/**
 * Em qual monitor a sobreposicao nasce.
 *
 * Pelo CURSOR, e nao pelo display primario: com o jogo em "sem bordas" o
 * ponteiro esta preso dentro dele, entao o monitor do cursor E o monitor em
 * que a pessoa esta jogando. A janela principal nao serve de referencia — ela
 * costuma estar minimizada na bandeja durante a partida, e a posicao de uma
 * janela escondida nao diz nada.
 */
function targetBounds(): Electron.Rectangle {
  // `bounds` e nao `workArea`: um jogo sem bordas cobre a barra de tarefas, e
  // a sobreposicao precisa alcancar o mesmo retangulo que ele.
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds
}

function createOverlayWindow(): BrowserWindow {
  const bounds = targetBounds()

  const win = new BrowserWindow({
    ...bounds,
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
    // Ver o cabecalho: e o que impede o clique na sobreposicao de minimizar o
    // jogo.
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

  // Um link na sobreposicao nao pode virar uma segunda janela sem moldura por
  // cima do jogo. Quem quiser abrir algo pede pra janela principal.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  win.webContents.on('did-finish-load', () => {
    // O modo vai ANTES do retrato: e ele que decide o que desenhar. Sem isso o
    // primeiro quadro seria o painel de canto, mesmo quando quem abriu a
    // janela foi o atalho da roda.
    win.webContents.send('overlay:mode', mode)
    // O ultimo retrato ja empurrado pinta a tela no primeiro quadro; o pedido
    // abaixo busca dados frescos (o poll da principal e de 30s).
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
    // A pessoa pode ter mudado de monitor entre uma abertura e outra.
    overlayWindow.setBounds(targetBounds())
    if (!overlayWindow.isVisible()) overlayWindow.showInactive()
    return
  }
  const win = createOverlayWindow()
  overlayWindow = win
  // showInactive e nao show: `show()` tenta ativar a janela e, mesmo com
  // focusable:false, isso pisca por cima do jogo.
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.showInactive()
  })
}

function closeOverlay(): void {
  const win = overlayWindow
  overlayWindow = null
  if (win && !win.isDestroyed()) win.destroy()
}

// ---------------- modo ----------------

/**
 * Aplica o modo pedido e acerta a janela.
 *
 * Um lugar so decide "existe janela?", e a resposta e sempre a mesma pergunta:
 * sobrou algum motivo? Enquanto isso estava espalhado (uma funcao que abria na
 * partida, outra que fechava no fim) dava pra chegar num estado em que a
 * janela estava fechada com um motivo de pe.
 */
function applyMode(next: OverlayMode): void {
  const wanted = prefs.enabled ? next : { dock: false, wheel: false }

  if (wanted.dock === mode.dock && wanted.wheel === mode.wheel) return
  mode = wanted

  if (!mode.dock && !mode.wheel) {
    closeOverlay()
    return
  }

  showOverlay()
  // A janela recem-criada recebe o modo no `did-finish-load`; esta linha e
  // pros casos em que ela JA estava aberta (abrir a roda com o painel na tela).
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay:mode', mode)
  }
}

export function getOverlayMode(): OverlayMode {
  return mode
}

/** Pedido da propria sobreposicao (botao "sons", X de cada peca). */
export function setOverlayMode(patch: Partial<OverlayMode>): void {
  applyMode({ ...mode, ...patch })
}

/**
 * Atalho global. Alterna UMA peca.
 *
 * Abrir o painel pelo atalho tambem desfaz o "fechei esta partida": quem pediu
 * pra ver de novo esta dizendo exatamente isso, e sem esta linha o atalho nao
 * faria nada pelo resto da partida — parecendo tecla quebrada.
 */
export function toggleOverlayPart(part: keyof OverlayMode): void {
  if (!prefs.enabled) return
  if (part === 'dock') {
    if (!mode.dock) dismissedSince = null
    // Mexeu na tecla: abrindo ou fechando, o painel passa a ser da pessoa e
    // para de ser fechado pelo fim da partida.
    dockFromMatch = false
  }
  applyMode({ ...mode, [part]: !mode[part] })
}

// ---------------- ciclo de vida ----------------

/** Chamado no boot e a cada salvamento das configuracoes. */
export function applyOverlaySettings(settings: LauncherSettings): void {
  const cornerChanged = prefs.corner !== settings.overlay.corner
  prefs = {
    enabled: settings.overlay.enabled,
    corner: settings.overlay.corner,
    autoOnMatch: settings.lol.enabled && settings.lol.overlay
  }

  if (!prefs.enabled) {
    dockFromMatch = false
    applyMode({ dock: false, wheel: false })
    return
  }

  // O canto decide de que lado o CONTEUDO se ancora dentro da janela, e o
  // renderer le essa preferencia na montagem. Com a janela aberta, avisar e
  // mais barato que refazer — a janela cobre a tela toda, entao mudar de canto
  // nao mexe em nada dela, so no CSS de dentro.
  if (cornerChanged && overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay:corner', prefs.corner)
  }

  // Desligar "abrir sozinho" no meio de uma partida NAO fecha o que ja esta na
  // tela: a pessoa mexeu numa preferencia sobre o FUTURO, e ver o painel sumir
  // pareceria que ela desligou a sobreposicao inteira. O X fecha.
}

/**
 * Liga a sobreposicao a fase do cliente do LoL. Chamado de dentro do watcher a
 * cada publicacao de status — idempotente de proposito, porque o status sai
 * varias vezes durante a mesma partida.
 *
 * So mexe no `dock`: a roda de sons nao tem nada a ver com estar em partida, e
 * fechar ela no fim do jogo tiraria a roda da mao de quem acabou de abrir.
 */
export function syncOverlayWithLol(status: LolStatus): void {
  const inGame = status.clientRunning && status.phase === 'in-progress'

  if (!inGame) {
    // Partida acabou: a proxima merece painel de novo, mesmo que este tenha
    // sido fechado na mao.
    currentPhaseSince = 0
    dismissedSince = null
    // Fecha SO o painel que a partida abriu — ver `dockFromMatch`. Esta funcao
    // roda a cada publicacao de status, e a maioria delas e "fora de partida".
    if (dockFromMatch) {
      dockFromMatch = false
      applyMode({ ...mode, dock: false })
    }
    return
  }

  currentPhaseSince = status.phaseSince
  if (!prefs.autoOnMatch) return
  if (dismissedSince === status.phaseSince) return

  if (!mode.dock) dockFromMatch = true
  applyMode({ ...mode, dock: true })
}

/** Fecha o painel de canto ate a proxima partida (botao X). */
export function dismissOverlay(): void {
  dismissedSince = currentPhaseSince
  dockFromMatch = false
  applyMode({ ...mode, dock: false })
}

export function destroyOverlay(): void {
  closeOverlay()
  mode = { dock: false, wheel: false }
  lastState = null
  dismissedSince = null
  dockFromMatch = false
  currentPhaseSince = 0
}

/**
 * Trocar de resolucao (ou desligar um monitor) com a sobreposicao aberta
 * deixaria a janela com o tamanho da tela antiga — sobrando pra fora ou
 * cobrindo um pedaco. Como ela e do tamanho da TELA, isso e visivel na hora.
 */
screen.on('display-metrics-changed', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setBounds(targetBounds())
  }
})

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
 * entra e sai das pecas — ver o cabecalho.
 */
export function setOverlayInteractive(interactive: boolean): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.setIgnoreMouseEvents(!interactive, { forward: true })
}
