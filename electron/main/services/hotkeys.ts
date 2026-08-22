import { BrowserWindow, globalShortcut } from 'electron'

/**
 * Atalhos globais (funcionam com o launcher em segundo plano, ex.: jogando).
 *
 * LIMITACAO CONHECIDA: o globalShortcut do Electron so avisa no key DOWN, nunca
 * no key UP. Entao push-to-talk "segurando a tecla" so existe com a janela em
 * foco (o renderer escuta keydown/keyup direto). Globalmente, o PTT vira
 * alternancia: aperta pra abrir o mic, aperta de novo pra fechar.
 */

export type HotkeyAction =
  | { kind: 'sound'; soundId: string }
  | { kind: 'mute' }
  | { kind: 'deafen' }
  | { kind: 'ptt-toggle' }
  | { kind: 'nudge-channel' }

export interface HotkeyBinding {
  /** Identificador estavel, ex.: "sound:abc-123" ou "mute". */
  id: string
  /** Accelerator do Electron, ex.: "Control+Shift+1". */
  accelerator: string
  action: HotkeyAction
}

export interface HotkeyRegistration {
  id: string
  accelerator: string
  ok: boolean
  error?: string
}

let registered: HotkeyBinding[] = []

function broadcast(binding: HotkeyBinding): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('hotkey:triggered', {
      id: binding.id,
      action: binding.action,
      at: Date.now()
    })
  }
}

/**
 * Um accelerator invalido faz o Electron lancar excecao em vez de retornar
 * false, entao tudo aqui e dentro de try/catch.
 */
function tryRegister(binding: HotkeyBinding): HotkeyRegistration {
  const base = { id: binding.id, accelerator: binding.accelerator }

  if (!binding.accelerator) {
    return { ...base, ok: false, error: 'Atalho vazio' }
  }

  try {
    if (globalShortcut.isRegistered(binding.accelerator)) {
      return { ...base, ok: false, error: 'Atalho ja usado em outro lugar' }
    }

    const ok = globalShortcut.register(binding.accelerator, () => broadcast(binding))

    if (!ok) {
      // Quase sempre e outro programa (Discord, OBS, Steam) segurando a tecla.
      return { ...base, ok: false, error: 'Outro programa ja usa esse atalho' }
    }

    return { ...base, ok: true }
  } catch (err) {
    return {
      ...base,
      ok: false,
      error: err instanceof Error ? err.message : 'Atalho invalido'
    }
  }
}

/**
 * Troca TODOS os atalhos de uma vez. Registro parcial e esperado: se um atalho
 * conflita, os outros continuam valendo e o renderer mostra qual falhou.
 */
export function setHotkeys(bindings: HotkeyBinding[]): HotkeyRegistration[] {
  globalShortcut.unregisterAll()
  registered = []

  const results: HotkeyRegistration[] = []
  const seen = new Set<string>()

  for (const binding of bindings) {
    // Dois atalhos iguais no mesmo perfil: o segundo perde.
    if (seen.has(binding.accelerator)) {
      results.push({
        id: binding.id,
        accelerator: binding.accelerator,
        ok: false,
        error: 'Atalho repetido'
      })
      continue
    }
    seen.add(binding.accelerator)

    const result = tryRegister(binding)
    results.push(result)
    if (result.ok) registered.push(binding)
  }

  return results
}

export function getHotkeys(): HotkeyBinding[] {
  return registered
}

/**
 * Testa se um atalho da pra registrar, sem manter. Usado pela tela de config
 * enquanto a pessoa esta gravando a combinacao.
 */
export function probeAccelerator(accelerator: string): { ok: boolean; error?: string } {
  if (!accelerator) return { ok: false, error: 'Atalho vazio' }

  // Ja e nosso: valido, mas o chamador decide se e conflito interno.
  if (registered.some((b) => b.accelerator === accelerator)) {
    return { ok: true }
  }

  try {
    if (globalShortcut.isRegistered(accelerator)) {
      return { ok: false, error: 'Atalho ja usado em outro lugar' }
    }

    const ok = globalShortcut.register(accelerator, () => {})
    if (!ok) return { ok: false, error: 'Outro programa ja usa esse atalho' }

    globalShortcut.unregister(accelerator)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Atalho invalido' }
  }
}

export function clearHotkeys(): void {
  globalShortcut.unregisterAll()
  registered = []
}
