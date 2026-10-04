import { BrowserWindow, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type {
  LauncherSettings,
  LolStatus,
  OverlayAction,
  OverlayCorner,
  OverlayDock,
  OverlayHitArea,
  OverlayMode,
  OverlayState,
  OverlayToast
} from '../../preload/types.js'
import { anyMouseButtonDown } from './mouse-buttons.js'
import { ensureNoActivate } from './no-activate.js'

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
 *   - `dock`  — a aba/logo com o painel: apostas, acoes rapidas do servidor e
 *               as notificacoes. Fica SEMPRE na tela com a sobreposicao
 *               ligada (ver `minimized`); em partida vira a aba fina do
 *               jogo, fora dela a logo meio escondida na direita.
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
 * teclado (abaixo), entao nao haveria Esc pra sair de uma armadilha. Clicar
 * fora fecha a roda (e encolhe o painel) sem tirar o clique do jogo — ver
 * `watchOutsideClick`.
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
let mode: OverlayMode = { dock: false, wheel: false, inGame: false, appFocused: false, reveal: 0 }

/**
 * ===========================================================================
 * SEMPRE DE PE — e o unico jeito de ela sumir e a pessoa pedir.
 * ===========================================================================
 *
 * A sobreposicao ja nasceu so com motivo (partida comecando, atalho) e morria
 * quando o motivo acabava. Hoje, ligada, ela fica na tela o tempo todo: aba
 * fina em partida, a logo meio escondida na direita fora dela. O que tira da
 * tela e MINIMIZAR (o botao do painel ou o atalho), e o mesmo atalho traz de
 * volta.
 *
 * Minimizado a janela e DESTRUIDA, e nao escondida: sem janela nao ha relogio
 * de cursor nem renderer ocupando memoria atras do jogo, e voltar e barato.
 *
 * Nao sobrevive ao reinicio de proposito: "sempre ativo" e o padrao, e quem
 * minimizou ontem e esqueceu acharia que a sobreposicao quebrou.
 */
let minimized = false
/** Partida de League em andamento (fase `in-progress`). */
let inGame = false
/** Alguma janela do launcher esta com o foco. Ver `OverlayMode.appFocused`. */
let appFocused = false
/** Ver `OverlayMode.reveal`. */
let reveal = 0
/** A roda de sons: so por atalho ou pelo botao do painel. */
let wheelOpen = false

let prefs: {
  enabled: boolean
  corner: OverlayCorner
  dock: OverlayDock
  idleOffset: number
  autoOnMatch: boolean
} = {
  enabled: true,
  corner: 'top-right',
  dock: { side: 'right', offset: 0.38 },
  idleOffset: 0.6,
  autoOnMatch: true
}

/**
 * ===========================================================================
 * QUEM DECIDE SE A JANELA CAPTURA O MOUSE — e por que e AQUI.
 * ===========================================================================
 *
 * A sobreposicao nasce com `setIgnoreMouseEvents(true, { forward: true })`, e
 * a ideia do `forward` e que o movimento do mouse continue sendo entregue ao
 * renderer mesmo com o clique atravessando — era assim que a tela percebia que
 * o ponteiro tinha entrado numa peca e pedia pra capturar o mouse.
 *
 * MEDIDO NESTA MAQUINA, no app empacotado, com o cursor de verdade parado em
 * cima da aba:
 *
 *   clique atravessa  -> 0 eventos de mousemove no renderer
 *   janela interativa -> os eventos chegam normalmente, e o painel abre
 *
 * Ou seja, o `forward` nao entrega nada aqui, e o desenho antigo era um
 * impasse circular: a janela so recebe evento de mouse DEPOIS de virar
 * interativa, mas so viraria interativa AO RECEBER um evento de mouse. Nada
 * abria, nada era clicavel — e quando funcionava (as vezes) era por acidente
 * de foco. Era esta a causa de "grande parte das vezes nao da pra apostar", e
 * ela sobreviveu a um redesenho inteiro da tela porque o problema nunca esteve
 * na tela.
 *
 * A saida e nao depender de hit-testing nenhum: `screen.getCursorScreenPoint()`
 * responde sempre, com a janela atravessavel, sem foco, por cima de um jogo em
 * tela cheia sem bordas. O main pergunta a posicao num relogio barato, compara
 * com os retangulos que a tela publicou (`setOverlayHitAreas`) e decide. A tela
 * so DESENHA; ela nao precisa mais adivinhar onde o mouse esta.
 *
 * O relogio so anda enquanto a janela existe, e 50ms e imperceptivel pra quem
 * leva o mouse ate um painel — e barato o suficiente pra rodar durante uma
 * partida (uma leitura de cursor, sem layout, sem IPC quando nada muda).
 */
const CURSOR_POLL_MS = 50

/**
 * Folga em volta das pecas, em px.
 *
 * Capturar o mouse custa uma chamada ao sistema, e quem leva o ponteiro ate um
 * botao e clica nao espera. Armando um pouco antes, a janela ja esta pronta
 * quando o clique chega. Nao custa mira do jogo: e uma faixa estreita em volta
 * de uma aba encostada na borda, e so existe enquanto o ponteiro esta ali.
 */
const HIT_MARGIN = 24

/**
 * ===========================================================================
 * "NAO APARECE": A JANELA PERDE O TOPO E NINGUEM REPARA.
 * ===========================================================================
 *
 * `setAlwaysOnTop(true, 'screen-saver')` e dado UMA vez, na criacao. So que o
 * z-order do Windows nao e uma promessa: um jogo "sem bordas" que abre (ou
 * ganha foco) depois da sobreposicao pode empurrar a nossa pra tras, e com a
 * janela atravessavel e sem foco nao ha sintoma nenhum — ela segue "visivel",
 * desenhando, so que por baixo. Era a causa de "a logo sumiu depois que a
 * partida carregou" que nao e tela cheia exclusiva (essa nao tem conserto).
 *
 * Reafirmar o topo custa um `SetWindowPos` com NOACTIVATE — nao rouba foco,
 * nao pisca — e roda no mesmo relogio do cursor, a cada TOP_REASSERT_MS. Junto
 * vai a conferencia de que a janela continua visivel: se alguma coisa a
 * escondeu (Win+D, troca de sessao), ela volta sozinha.
 */
const TOP_REASSERT_MS = 1500
let lastTopAt = 0
/** A janela ja foi mostrada uma vez (antes disso `isVisible()` e falso por desenho). */
let overlayShown = false

function keepOnTop(win: BrowserWindow): void {
  if (overlayShown && !win.isVisible()) win.showInactive()
  win.setAlwaysOnTop(true, 'screen-saver')
  win.moveTop()
}

/**
 * Encaixa a janela no retangulo do monitor.
 *
 * Duas vezes DE PROPOSITO. Com monitores de escala diferente (um a 100%, outro
 * a 125%) o Electron aplica o `setBounds` com a escala do monitor de ORIGEM da
 * janela: o primeiro chamado move, e o tamanho sai errado — a sobreposicao
 * ficava cobrindo so um pedaco da tela, ou sobrando pra fora, com a logo
 * longe da borda onde devia estar. O segundo chamado, ja no monitor certo,
 * acerta o tamanho. Conferir antes de repetir evita um repaint a toa.
 */
function fitToDisplay(win: BrowserWindow, bounds: Electron.Rectangle): void {
  win.setBounds(bounds)
  const got = win.getBounds()
  if (
    got.x !== bounds.x ||
    got.y !== bounds.y ||
    got.width !== bounds.width ||
    got.height !== bounds.height
  ) {
    win.setBounds(bounds)
  }
}

let hitAreas: OverlayHitArea[] = []
let pointerOn = false
let interactiveNow = false
let forcedInteractive = false
let cursorTimer: NodeJS.Timeout | null = null

function applyInteractive(next: boolean): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  if (next === interactiveNow) return
  interactiveNow = next
  overlayWindow.setIgnoreMouseEvents(!next, { forward: true })
  // O Electron reescreve o GWL_EXSTYLE inteiro aqui — ver no-activate.ts.
  ensureNoActivate(overlayWindow)
}

/**
 * Uma volta do relogio: onde esta o cursor, e isso muda alguma coisa?
 *
 * Tudo em DIP: `getCursorScreenPoint` e `getBounds` falam a mesma unidade, e
 * ela e a mesma do px CSS do renderer com zoom 1 — por isso os retangulos que
 * a tela publica podem ser comparados direto, sem converter escala.
 */
function pollCursor(): void {
  const win = overlayWindow
  if (!win || win.isDestroyed()) return

  // Na mesma volta do relogio, e nao por evento de foco: a janela principal
  // nao e a unica do launcher (configuracoes, abertura), e perguntar "quem tem
  // o foco agora" cobre todas sem pendurar ouvinte em cada uma.
  const focused = BrowserWindow.getFocusedWindow()
  const nextFocused = Boolean(focused && focused !== win && !focused.isDestroyed())
  if (nextFocused !== appFocused) {
    appFocused = nextFocused
    applyMode()
    // `applyMode` pode ter mandado a janela embora.
    if (win.isDestroyed()) return
  }

  const tick = Date.now()
  if (tick - lastTopAt >= TOP_REASSERT_MS) {
    lastTopAt = tick
    keepOnTop(win)
  }

  if (forcedInteractive) {
    applyInteractive(true)
    return
  }

  const bounds = win.getBounds()
  const cursor = screen.getCursorScreenPoint()
  const x = cursor.x - bounds.x
  const y = cursor.y - bounds.y

  const on = hitAreas.some(
    (a) =>
      x >= a.x - HIT_MARGIN &&
      x <= a.x + a.w + HIT_MARGIN &&
      y >= a.y - HIT_MARGIN &&
      y <= a.y + a.h + HIT_MARGIN
  )

  applyInteractive(on)
  if (watchOutsideClick(win, on)) return

  // IPC so quando muda: este relogio bate 20x por segundo.
  if (on === pointerOn) return
  pointerOn = on
  win.webContents.send('overlay:pointer', on)
}

/**
 * ===========================================================================
 * CLIQUE FORA FECHA — sem comer o clique do jogo.
 * ===========================================================================
 *
 * Painel aberto ou roda na tela: um clique (qualquer botao) fora das pecas
 * encolhe o painel de volta pra aba e fecha a roda. A sobreposicao NAO some —
 * so volta pro estado de repouso.
 *
 * Fora das pecas a janela e atravessavel, entao o clique vai pro jogo e esta
 * janela nunca o ve. Capturar a tela inteira enquanto algo esta aberto daria o
 * evento, mas engoliria o clique (e a mira) de quem estava jogando. Em vez
 * disso, o mesmo relogio do cursor pergunta ao Windows se algum botao desceu
 * (ver services/mouse-buttons.ts) — o jogo recebe o clique E a sobreposicao
 * fecha.
 *
 * So pergunta com algo aberto: o relogio bate 20x/s a partida inteira.
 */
let panelOpen = false
/** O botao ja estava descido na volta anterior: so a DESCIDA conta como clique. */
let buttonWasDown = false
/**
 * A primeira pergunta depois de abrir so zera o estado: o bit "apertado desde
 * a ultima vez" do Windows pode trazer um clique de antes da abertura, e ele
 * fecharia na hora o que acabou de abrir.
 */
let buttonPrimed = false

/** @returns true se a janela foi embora e o `pollCursor` deve parar. */
function watchOutsideClick(win: BrowserWindow, onPiece: boolean): boolean {
  if (!panelOpen && !wheelOpen) {
    buttonPrimed = false
    return false
  }

  const down = anyMouseButtonDown()
  const pressed = buttonPrimed && down && !buttonWasDown
  buttonWasDown = down
  buttonPrimed = true
  if (!pressed || onPiece) return false

  if (panelOpen) win.webContents.send('overlay:outside-click')
  if (wheelOpen) {
    wheelOpen = false
    applyMode()
    return win.isDestroyed()
  }
  return false
}

/** O renderer avisa quando o painel abre e fecha. */
export function setOverlayPanelOpen(open: boolean): void {
  panelOpen = open
}

function startCursorWatch(): void {
  if (cursorTimer) return
  cursorTimer = setInterval(pollCursor, CURSOR_POLL_MS)
}

function stopCursorWatch(): void {
  if (cursorTimer) clearInterval(cursorTimer)
  cursorTimer = null
  hitAreas = []
  pointerOn = false
  interactiveNow = false
  forcedInteractive = false
  overlayShown = false
  lastTopAt = 0
  panelOpen = false
  buttonPrimed = false
}

/**
 * `phaseSince` da partida em andamento (0 fora de partida).
 *
 * E o que separa "a partida COMECOU" de "o watcher publicou de novo a mesma
 * partida" — ele publica o tempo todo, e so a primeira vez de cada partida
 * pode desminimizar e abrir o painel sozinho. Minimizar no meio de uma
 * partida vale pra ela inteira; a proxima tem outro `phaseSince`.
 */
let currentPhaseSince = 0

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
  const b = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds
  // UM PIXEL A MENOS, de proposito. Interativa, a janela perde o
  // WS_EX_LAYERED/TRANSPARENT e vira, pro Windows, uma janela opaca, por cima
  // de tudo e do tamanho EXATO do monitor — ou seja, "um app em tela cheia".
  // O jogo perde o posto de tela cheia e minimiza: era o "passar o mouse na
  // sobreposicao minimiza o jogo". Uma linha a menos no rodape e invisivel e
  // tira a janela dessa deteccao.
  return { ...b, height: b.height - 1 }
}

/**
 * O ouvinte de troca de monitor, ligado UMA vez e SO DEPOIS do `ready`.
 *
 * Trocar de resolucao (ou desligar um monitor) com a sobreposicao aberta
 * deixaria a janela com o tamanho da tela antiga — sobrando pra fora ou
 * cobrindo um pedaco. Como ela e do tamanho da TELA, isso aparece na hora.
 *
 * O REGISTRO E PREGUICOSO POR OBRIGACAO, nao por elegancia. Isto ja foi um
 * `screen.on(...)` solto no corpo do modulo, e aquilo derrubava o launcher
 * inteiro no boot: "The 'screen' module can't be used before the app 'ready'
 * event". O `screen` do Electron so existe depois do `ready`, e este arquivo e
 * importado pelo ipc.ts no topo — ou seja, roda muito antes disso. Nao e erro
 * que apareca em typecheck nem em build: o processo main morre com um diálogo
 * de "A JavaScript error occurred in the main process", antes de qualquer
 * janela.
 *
 * Pendurar no `createOverlayWindow` resolve pela raiz: se ha janela pra
 * redimensionar, o app esta de pe.
 */
let watchingDisplays = false

function watchDisplayMetrics(): void {
  if (watchingDisplays) return
  watchingDisplays = true

  // Trocar de resolucao, ligar ou desligar um monitor: a janela e do tamanho
  // da TELA, entao o retangulo antigo aparece na hora (sobrando ou faltando).
  const refit = (): void => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      fitToDisplay(overlayWindow, targetBounds())
    }
  }
  screen.on('display-metrics-changed', refit)
  screen.on('display-added', refit)
  screen.on('display-removed', refit)
}

function createOverlayWindow(): BrowserWindow {
  watchDisplayMetrics()

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
  // Nasce atravessavel; quem liga e desliga daqui pra frente e o `pollCursor`.
  win.setIgnoreMouseEvents(true, { forward: true })
  ensureNoActivate(win)
  interactiveNow = false
  overlayShown = false
  lastTopAt = Date.now()
  startCursorWatch()

  // Um link na sobreposicao nao pode virar uma segunda janela sem moldura por
  // cima do jogo. Quem quiser abrir algo pede pra janela principal.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  win.webContents.on('did-finish-load', () => {
    // O modo vai ANTES do retrato: e ele que decide o que desenhar. Sem isso o
    // primeiro quadro seria o painel de canto, mesmo quando quem abriu a
    // janela foi o atalho da roda.
    win.webContents.send('overlay:mode', mode)
    win.webContents.send('overlay:dock', prefs.dock)
    win.webContents.send('overlay:idle-offset', prefs.idleOffset)
    // O ultimo retrato ja empurrado pinta a tela no primeiro quadro; o pedido
    // abaixo busca dados frescos (o poll da principal e de 30s).
    if (lastState) win.webContents.send('overlay:state', lastState)
    requestOverlayState()
  })

  win.on('closed', () => {
    if (overlayWindow === win) {
      overlayWindow = null
      stopCursorWatch()
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) win.loadURL(`${devUrl}/overlay.html`)
  else win.loadFile(path.join(__dirname, '../renderer/overlay.html'))

  return win
}

/**
 * @param rebound refaz o retangulo no monitor do cursor. A janela agora vive
 * o dia inteiro, entao so faz isso nos momentos em que a pessoa esta olhando
 * pra ela de proposito (partida comecando, atalho) — mudar de monitor a cada
 * mexida no foco faria a logo pular de tela enquanto o mouse passa.
 */
function showOverlay(rebound: boolean): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    // A pessoa pode ter mudado de monitor entre uma abertura e outra.
    if (rebound) fitToDisplay(overlayWindow, targetBounds())
    if (!overlayWindow.isVisible()) overlayWindow.showInactive()
    return
  }
  const win = createOverlayWindow()
  overlayWindow = win
  // showInactive e nao show: `show()` tenta ativar a janela e, mesmo com
  // focusable:false, isso pisca por cima do jogo.
  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return
    // O segundo `setBounds` do monitor de escala diferente so pega com a
    // janela ja criada — ver `fitToDisplay`.
    fitToDisplay(win, targetBounds())
    win.showInactive()
    overlayShown = true
    keepOnTop(win)
  })
}

function closeOverlay(): void {
  const win = overlayWindow
  overlayWindow = null
  // O ouvinte de 'closed' so desliga o relogio quando a janela ainda e a
  // `overlayWindow` — e aqui ela ja foi zerada. Sem isto o relogio de cursor
  // seguia batendo 20x/s depois de minimizar, com os retangulos da janela
  // morta valendo pra proxima.
  stopCursorWatch()
  if (win && !win.isDestroyed()) win.destroy()
}

// ---------------- modo ----------------

/**
 * Recalcula o modo a partir do estado e acerta a janela.
 *
 * Um lugar so decide "existe janela?", e a resposta e sempre a mesma pergunta:
 * sobrou algum motivo? Com a sobreposicao ligada o motivo quase sempre existe
 * — so nao existe com ela minimizada e a roda fechada.
 *
 * @param rebound ver `showOverlay`.
 */
function applyMode(rebound = false): void {
  const next: OverlayMode = {
    dock: prefs.enabled && !minimized,
    wheel: prefs.enabled && wheelOpen,
    inGame,
    appFocused,
    reveal
  }

  const same =
    next.dock === mode.dock &&
    next.wheel === mode.wheel &&
    next.inGame === mode.inGame &&
    next.appFocused === mode.appFocused &&
    next.reveal === mode.reveal
  const exists = Boolean(overlayWindow && !overlayWindow.isDestroyed())
  const wanted = next.dock || next.wheel

  // Nada mudou e a janela esta como devia: o relogio chama isto 20x/s.
  if (same && exists === wanted && !rebound) return
  mode = next

  if (!wanted) {
    closeOverlay()
    return
  }

  showOverlay(rebound)
  // A janela recem-criada recebe o modo no `did-finish-load`; esta linha e
  // pros casos em que ela JA estava aberta.
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay:mode', mode)
  }
}

export function getOverlayMode(): OverlayMode {
  return mode
}

/**
 * Pedido da propria sobreposicao: o botao "sons" do painel e o gomo escolhido
 * (`wheel`). `dock: false` e o mesmo que minimizar.
 */
export function setOverlayMode(patch: Partial<OverlayMode>): void {
  if (typeof patch.wheel === 'boolean') wheelOpen = patch.wheel
  if (typeof patch.dock === 'boolean') minimized = !patch.dock
  applyMode()
}

/**
 * Atalho global. Alterna UMA peca.
 *
 * O do painel e o MINIMIZAR/TRAZER DE VOLTA. Voltando, o painel abre sozinho
 * por uns segundos (`reveal`): quem apertou a tecla apertou pra ver alguma
 * coisa, e uma logo meio escondida na borda nao e "alguma coisa".
 */
export function toggleOverlayPart(part: 'dock' | 'wheel'): void {
  if (!prefs.enabled) return
  if (part === 'wheel') {
    wheelOpen = !wheelOpen
    applyMode()
    return
  }
  minimized = !minimized
  if (!minimized) reveal = Date.now()
  applyMode(!minimized)
}

// ---------------- ciclo de vida ----------------

/** Chamado no boot e a cada salvamento das configuracoes. */
export function applyOverlaySettings(settings: LauncherSettings): void {
  const cornerChanged = prefs.corner !== settings.overlay.corner
  const dockChanged =
    prefs.dock.side !== settings.overlay.dock.side ||
    prefs.dock.offset !== settings.overlay.dock.offset
  const idleChanged = prefs.idleOffset !== settings.overlay.idleOffset

  prefs = {
    enabled: settings.overlay.enabled,
    corner: settings.overlay.corner,
    dock: settings.overlay.dock,
    idleOffset: settings.overlay.idleOffset,
    autoOnMatch: settings.lol.enabled && settings.lol.overlay
  }

  if (!prefs.enabled) {
    wheelOpen = false
    applyMode()
    return
  }

  // Ligou (ou e o boot): a sobreposicao aparece. Sem isto ela so nasceria na
  // proxima mudanca de estado.
  applyMode()

  const win = overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow : null
  if (!win) return

  // O canto decide de que lado o CONTEUDO se ancora dentro da janela, e o
  // renderer le essa preferencia na montagem. Com a janela aberta, avisar e
  // mais barato que refazer — a janela cobre a tela toda, entao mudar de canto
  // nao mexe em nada dela, so no CSS de dentro.
  if (cornerChanged) win.webContents.send('overlay:corner', prefs.corner)

  // A propria janela e quem manda o arrasto, entao na maioria das vezes ela ja
  // esta desenhada no lugar certo quando este aviso volta. Mandar mesmo assim
  // e o que faz a posicao valer quando quem mexeu foram as CONFIGURACOES.
  if (dockChanged) win.webContents.send('overlay:dock', prefs.dock)
  if (idleChanged) win.webContents.send('overlay:idle-offset', prefs.idleOffset)
}

/**
 * Liga a sobreposicao a fase do cliente do LoL. Chamado de dentro do watcher a
 * cada publicacao de status — idempotente de proposito, porque o status sai
 * varias vezes durante a mesma partida.
 *
 * A partida so troca o DESENHO (aba do jogo em vez da logo). O que ela ainda
 * decide sozinha, com `lol.overlay` ligado, e o comeco: desminimiza e abre o
 * painel por uns segundos, que e o aviso de que da pra apostar.
 */
export function syncOverlayWithLol(status: LolStatus): void {
  const playing = status.clientRunning && status.phase === 'in-progress'

  if (!playing) {
    currentPhaseSince = 0
    if (inGame) {
      inGame = false
      applyMode()
    }
    return
  }

  const started = status.phaseSince !== currentPhaseSince
  currentPhaseSince = status.phaseSince

  if (!started) return
  inGame = true
  if (prefs.autoOnMatch) {
    minimized = false
    reveal = Date.now()
  }
  // Rebound: e o monitor do jogo que importa, e o cursor esta preso nele.
  applyMode(true)
}

/** Botao de minimizar do painel. O atalho traz de volta. */
export function dismissOverlay(): void {
  minimized = true
  applyMode()
}

export function destroyOverlay(): void {
  closeOverlay()
  mode = { dock: false, wheel: false, inGame: false, appFocused: false, reveal: 0 }
  lastState = null
  minimized = false
  wheelOpen = false
  inGame = false
  currentPhaseSince = 0
}

/**
 * Uma notificacao pra janela da sobreposicao.
 *
 * Devolve se ela vai APARECER — quem chama usa isso pra nao repetir a mesma
 * coisa na notificacao do Windows. So aparece com a logo/aba na tela e sem o
 * launcher em primeiro plano fora de partida (ai quem mostra e o proprio app).
 */
export function pushOverlayToast(toast: OverlayToast): boolean {
  const win = overlayWindow
  if (!win || win.isDestroyed()) return false
  if (!mode.dock) return false
  if (mode.appFocused && !mode.inGame) return false
  win.webContents.send('overlay:toast', toast)
  return true
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
 * PRENDE o clique ligado, independente de onde o ponteiro esteja.
 *
 * Existe por causa do ARRASTO: enquanto a pessoa segura a aba e a arrasta, a
 * janela nao pode se soltar do mouse por um instante em que o cursor saia dos
 * retangulos. A tela liga ao comecar a arrastar e desliga ao soltar; no resto
 * do tempo quem manda e o `tick` aqui de baixo.
 */
export function setOverlayInteractive(interactive: boolean): void {
  forcedInteractive = interactive
  if (interactive) applyInteractive(true)
  else pollCursor()
}

/**
 * ONDE ESTAO OS PEDACOS CLICAVEIS, em px CSS relativos a janela.
 *
 * A tela manda isto a cada mudanca de layout, e e contra estes retangulos que
 * o `pollCursor` mede o cursor. Sem nenhum retangulo nao ha o que clicar, e a
 * janela fica atravessavel — que e o estado certo pra uma sobreposicao vazia.
 */
export function setOverlayHitAreas(areas: OverlayHitArea[]): void {
  hitAreas = areas.filter(
    (a) =>
      Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.w) && Number.isFinite(a.h)
  )
  pollCursor()
}
