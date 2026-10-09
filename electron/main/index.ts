import { app, BrowserWindow, dialog, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { registerIpcHandlers } from './ipc.js'
import { initUpdater, stopUpdater } from './services/updater.js'
import { startServerStatusPolling } from './services/server-status.js'
import { initScreenShare } from './services/screen-share.js'
import { initEmbedReferer } from './services/embed-referer.js'
import { clearHotkeys } from './services/hotkeys.js'
import {
  initTray,
  isQuitting,
  beginQuit,
  destroyTray,
  shouldCloseToTray,
  setCloseToTray,
  setVoiceState,
  iconPath
} from './services/tray.js'
import {
  getMainWindow,
  setMainWindow,
  setMainWindowFactory,
  showMainWindow
} from './services/main-window.js'
import { loadSettings } from './services/settings.js'
import { startLolWatcher, stopLolWatcher } from './services/lol.js'
import { applyOverlaySettings, destroyOverlay } from './services/overlay.js'
import { destroyPopout } from './services/popout.js'
import { applyAutostart, launchedAtLogin } from './services/autostart.js'
import { closeSplash, showSplash } from './services/splash.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * CAPTURA DE TELA NA GPU.
 *
 * Precisa vir antes do `app.whenReady()`: switches de linha de comando so
 * valem se entrarem antes do Chromium subir.
 *
 * O capturador padrao do WebRTC no Windows (GDI/DXGI via BitBlt) copia o
 * framebuffer pela CPU a cada quadro — 1080p60 sao ~370 MB/s de memcpy em
 * cima do jogo. Windows Graphics Capture (WGC) faz a copia dentro da GPU e
 * entrega uma textura; e o que o Discord e o OBS usam. O Chromium tem o WGC
 * pronto, mas atras de flags:
 *
 * - WebRtcAllowWgcScreenCapturer / WebRtcAllowWgcWindowCapturer: liga o WGC
 *   pra monitor inteiro e pra janela.
 * - AllowWgcZeroHz: com WGC, quadros identicos nao sao reenviados — tela
 *   parada custa zero pro encoder.
 *
 * Se o sistema nao tiver WGC (Windows < 10 1903) o Chromium cai sozinho no
 * capturador antigo. No Linux/macOS as flags sao ignoradas.
 */
if (process.platform === 'win32') {
  app.commandLine.appendSwitch(
    'enable-features',
    'WebRtcAllowWgcScreenCapturer,WebRtcAllowWgcWindowCapturer,AllowWgcZeroHz'
  )
}

/**
 * WEBCAM PELO DIRECTSHOW.
 *
 * O Chromium abre a webcam no Windows pelo Media Foundation. Em notebooks
 * cuja camera passa por um filtro do fabricante (Acer com "GAI Camera" /
 * SecureUSBVideo, medido no Electron 33) o Media Foundation abre o
 * dispositivo e nunca entrega o primeiro quadro: o getUserMedia espera 10 s
 * e falha com NotReadableError "Could not start video source" — que o app
 * mostrava como "camera em uso por outro programa".
 *
 * Com a feature desligada o Chromium usa o DirectShow, que abre a mesma
 * camera normalmente. O deviceId muda junto com o backend; uma camera ja
 * escolhida nas configuracoes deixa de casar e o LiveKit cai sozinho na
 * camera padrao (tenta `exact`, depois repete sem o deviceId).
 */
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-features', 'MediaFoundationVideoCapture')
}

/**
 * Aberto pelo autostart do Windows E com "abrir na bandeja" ligado: a janela
 * nasce escondida. Decidido uma vez, antes da janela existir. Abrir pelo
 * atalho normal sempre mostra a janela.
 */
let startHidden = false

const isDev = !app.isPackaged
const RENDERER_DEV_URL = process.env['ELECTRON_RENDERER_URL']

// Duas instancias brigariam pelos atalhos globais e apareceriam duplicadas na
// lista de quem esta online. A segunda so traz a primeira pra frente.
const gotTheLock = app.requestSingleInstanceLock()

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#0B0B0B',
    autoHideMenuBar: true,
    title: 'Bocas Murchas',
    // Empacotado o exe ja carrega o icone; em dev, sem isso a barra de tarefas
    // mostra o do Electron.
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      // Sem isso o audio do soundboard e da call so toca depois de um clique.
      autoplayPolicy: 'no-user-gesture-required'
    }
  })
  setMainWindow(win)

  win.once('ready-to-show', () => {
    // Na bandeja o app continua conectando: presenca, call e notificacoes
    // funcionam igual — so a janela fica guardada ate alguem clicar no icone.
    // A janela de abertura sai primeiro, pra uma nao piscar por cima da outra.
    if (!startHidden) closeSplash(() => win.show())
  })

  win.on('maximize', () => win.webContents.send('window:state', { maximized: true }))
  win.on('unmaximize', () => win.webContents.send('window:state', { maximized: false }))

  // Fechar a janela nao pode derrubar a chamada de voz: esconde na bandeja.
  win.on('close', (event) => {
    if (isQuitting()) return
    // Sem bandeja, fechar e SAIR. So deixar a janela fechar nao encerrava
    // nada: o `window-all-closed` so sai com `isQuitting()`, e com a
    // sobreposicao de pe ele nem dispara — sobrava um processo sem janela,
    // dono da trava de instancia unica, e o launcher nao abria mais.
    if (!shouldCloseToTray()) {
      beginQuit()
      setImmediate(() => app.quit())
      return
    }
    event.preventDefault()
    win.hide()
  })

  // Recarregou (botao, bandeja, renderer que caiu): a call ficou na pagina
  // velha. Sem isto a bandeja seguia "na call" e o updater nunca instalava
  // sozinho, achando que derrubaria uma chamada que ja nao existe.
  win.webContents.on('did-navigate', () => {
    setVoiceState({ inVoice: false, micMuted: false })
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // A janela nao tem moldura do Windows: minimizar, maximizar e fechar sao
  // botoes React. Se o renderer travar, o app fica sem NENHUMA saida — nem o X
  // funciona. Aqui o processo principal percebe e oferece o caminho de volta.
  let hangDialogOpen = false
  win.webContents.on('unresponsive', () => {
    // Uma trava longa dispara 'unresponsive' mais de uma vez; sem esta guarda
    // a pessoa acaba com uma pilha de caixas de dialogo.
    if (hangDialogOpen) return
    hangDialogOpen = true

    void dialog
      .showMessageBox(win, {
        type: 'warning',
        title: 'Bocas Murchas travou',
        message: 'A janela parou de responder.',
        detail:
          'Recarregar recupera o app sem derrubar a sessao. A chamada de voz cai e precisa ser refeita.',
        buttons: ['Recarregar', 'Esperar mais um pouco', 'Fechar o launcher'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      })
      .then(({ response }) => {
        hangDialogOpen = false
        if (response === 0) win.webContents.reloadIgnoringCache()
        if (response === 2) {
          beginQuit()
          app.quit()
        }
      })
  })

  // Renderer morto (falta de memoria, crash do GPU process) deixa uma janela
  // desenhada e morta. Recarregar e sempre melhor que ficar assim.
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[main] renderer caiu:', details.reason)
    if (details.reason === 'clean-exit') return
    if (!win.isDestroyed()) win.webContents.reload()
  })

  if (isDev && RENDERER_DEV_URL) {
    win.loadURL(RENDERER_DEV_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', showMainWindow)

  app.whenReady().then(async () => {
    setMainWindowFactory(createWindow)
    registerIpcHandlers()
    initScreenShare()
    // Antes da janela existir: mexe na sessao default, que e a que a janela vai
    // usar. Depois do primeiro carregamento ja seria tarde pro embed do YouTube.
    initEmbedReferer()

    // Preenche o cache antes da janela existir, senao o primeiro 'close'
    // decidiria com o padrao em vez da preferencia salva.
    const settings = await loadSettings()
    setCloseToTray(settings.closeToTray)
    startHidden = launchedAtLogin() && settings.startMinimized

    // A principal nasce PRIMEIRO; bandeja, ipc e nudge a acham pela referencia
    // de services/main-window.ts. Como o `ready-to-show` e assincrono, a
    // abertura sempre existe antes dele.
    createWindow()
    if (!startHidden) showSplash()
    initTray()
    initUpdater()
    startServerStatusPolling()

    // Alinha o registro do Windows com a preferencia (inclusive na primeira
    // vez, quando o padrao e "ligado" e ninguem mexeu em nada ainda).
    void applyAutostart()

    // Antes do watcher: o primeiro status pode sair no mesmo tick, e sem as
    // preferencias carregadas a sobreposicao decidiria com o padrao.
    applyOverlaySettings(settings)
    if (settings.lol.enabled) startLolWatcher()

    app.on('activate', () => {
      if (!getMainWindow()) createWindow()
      else showMainWindow()
    })
  })
}

// Com bandeja, fechar a ultima janela nao encerra o app em lugar nenhum.
app.on('window-all-closed', () => {
  if (isQuitting() && process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  beginQuit()
})

app.on('will-quit', () => {
  // Atalho global que sobrevive ao processo trava a tecla pro sistema inteiro.
  clearHotkeys()
  destroyTray()
  stopUpdater()
  stopLolWatcher()
  destroyOverlay()
  destroyPopout()
})
