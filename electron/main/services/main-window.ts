import type { BrowserWindow } from 'electron'

/**
 * A JANELA PRINCIPAL, por referencia — e nao `BrowserWindow.getAllWindows()[0]`.
 *
 * "A primeira da lista" so era a principal enquanto ela era a unica janela que
 * vivia o dia inteiro. Hoje a sobreposicao tambem vive (ver overlay.ts), e
 * bastava a principal sumir uma vez para a bandeja, a segunda instancia e a
 * notificacao passarem a "mostrar" a sobreposicao — que nao aceita foco — e o
 * launcher nunca mais voltar.
 *
 * So `import type` daqui: este arquivo e importado no topo de varios modulos,
 * antes do `ready`, e nao pode tocar API do Electron no corpo.
 */

let mainWindow: BrowserWindow | null = null
let create: (() => BrowserWindow) | null = null

/** Quem sabe criar a principal (index.ts). Usado se alguem precisar dela e ela nao existir. */
export function setMainWindowFactory(factory: () => BrowserWindow): void {
  create = factory
}

/** Chamado por quem acabou de criar a principal. */
export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
}

/** A principal viva, ou null. Pra quem so quer MANDAR algo pra ela. */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

/**
 * Traz a principal pra frente — recriando, se ela tiver sido fechada. E o
 * caminho de "abrir o launcher": bandeja, segunda instancia, clique na
 * notificacao, "abrir o app" da sobreposicao.
 */
export function showMainWindow(): void {
  const win = getMainWindow() ?? create?.()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}
