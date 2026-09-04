import { app } from 'electron'
import { loadSettings } from './settings.js'

/**
 * Iniciar com o Windows.
 *
 * Usa o registro de login do proprio Electron (`setLoginItemSettings`), que
 * escreve em HKCU\...\Run — nao precisa de admin e o usuario ve/desliga no
 * Gerenciador de Tarefas > Inicializar. O argumento `--hidden` e como o
 * processo sabe que foi aberto pelo Windows e nao pela pessoa: nesse caso
 * (e so nesse) ele pode nascer direto na bandeja.
 *
 * Em desenvolvimento (app nao empacotado) nao mexemos no registro: o
 * executavel seria o electron.exe do node_modules e o Windows abriria o
 * Electron pelado no proximo login.
 */

export const HIDDEN_FLAG = '--hidden'

export function launchedAtLogin(): boolean {
  return process.argv.includes(HIDDEN_FLAG)
}

export function autostartSupported(): boolean {
  return process.platform === 'win32' && app.isPackaged
}

/** Alinha o registro do Windows com a preferencia salva. Idempotente. */
export async function applyAutostart(): Promise<{ enabled: boolean; supported: boolean }> {
  if (!autostartSupported()) return { enabled: false, supported: false }

  const settings = await loadSettings()

  try {
    app.setLoginItemSettings({
      openAtLogin: settings.autostart,
      // O exe do NSIS e o proprio app; o path padrao (process.execPath) serve.
      args: settings.autostart ? [HIDDEN_FLAG] : []
    })
  } catch (error) {
    console.error('[autostart] falhou ao gravar no registro:', error)
    return { enabled: false, supported: true }
  }

  const current = app.getLoginItemSettings({ args: [HIDDEN_FLAG] })
  return { enabled: current.openAtLogin, supported: true }
}
