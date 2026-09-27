import { app, BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { iconPath } from './tray.js'

/**
 * JANELA DE ABERTURA — logo animada enquanto a janela principal carrega.
 *
 * A principal leva 1 a 3 segundos até o `ready-to-show` (React, fontes,
 * login). Sem isto, clicar no atalho não mostrava nada nesse tempo e a pessoa
 * clicava de novo. A abertura é HTML puro (public/splash.html): aparece em
 * milissegundos e some com fade quando a principal fica pronta.
 *
 * Nada de API do Electron no corpo do módulo: este arquivo é importado pelo
 * index.ts ANTES do `app.whenReady()`, e `BrowserWindow` só existe depois
 * dele (foi assim que a 1.12.0 foi pro ar sem abrir).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Abaixo disso a janela só pisca — pior que não ter. */
const MIN_VISIBLE_MS = 900
/** Se a principal nunca ficar pronta, a abertura não fica pra sempre na tela. */
const GIVE_UP_MS = 20_000
const FADE_MS = 180

let splash: BrowserWindow | null = null
let shownAt = 0
let giveUp: NodeJS.Timeout | null = null

export function showSplash(): void {
  if (splash) return

  splash = new BrowserWindow({
    width: 336,
    height: 376,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    center: true,
    title: 'Bocas Murchas',
    icon: iconPath(),
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  shownAt = Date.now()

  const updated = process.argv.includes('--updated')
  void splash.loadFile(path.join(__dirname, '../renderer/splash.html'), {
    query: { v: app.getVersion(), ...(updated ? { updated: '1' } : {}) }
  })
  splash.once('ready-to-show', () => splash?.show())
  splash.on('closed', () => {
    splash = null
    if (giveUp) clearTimeout(giveUp)
    giveUp = null
  })

  giveUp = setTimeout(() => closeSplash(), GIVE_UP_MS)
}

/**
 * Some com a abertura. `onGone` roda quando ela já saiu da frente (ou na hora,
 * se nunca existiu) — é ali que a principal aparece, pra uma não piscar por
 * cima da outra.
 */
export function closeSplash(onGone?: () => void): void {
  const win = splash
  if (!win || win.isDestroyed()) {
    onGone?.()
    return
  }
  splash = null

  const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt))
  setTimeout(() => {
    if (win.isDestroyed()) {
      onGone?.()
      return
    }
    void win.webContents
      .executeJavaScript("document.body.classList.add('bye')")
      .catch(() => undefined)
    setTimeout(() => {
      onGone?.()
      if (!win.isDestroyed()) win.close()
    }, FADE_MS)
  }, wait)
}
