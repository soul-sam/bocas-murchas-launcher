import { BrowserWindow, globalShortcut } from 'electron'
import type { HotkeyAction, HotkeyBinding, HotkeyRegistration } from '../../preload/types.js'

/**
 * Atalhos globais (funcionam com o launcher em segundo plano, ex.: jogando).
 *
 * LIMITACAO CONHECIDA: o globalShortcut do Electron so avisa no key DOWN, nunca
 * no key UP. Entao push-to-talk "segurando a tecla" so existe com a janela em
 * foco (o renderer escuta keydown/keyup direto). Globalmente, o PTT vira
 * alternancia: aperta pra abrir o mic, aperta de novo pra fechar. E o mesmo
 * motivo pelo qual a roda de sons fecha com o atalho que a abriu.
 *
 * OS TIPOS VEM DE preload/types.ts, e nao daqui. Eles ja moraram nos dois
 * lugares, e as duas copias divergiram: `clip` existia so na do preload, entao
 * o main recebia um atalho de um tipo que ele jurava nao existir e repassava
 * sem saber. Como o preload nao importa nada, trazer o tipo de la nao arrasta
 * dependencia nenhuma pro processo main.
 */

export type { HotkeyAction, HotkeyBinding, HotkeyRegistration }

let registered: HotkeyBinding[] = []

/**
 * Atalho que o PROPRIO main resolve, sem passar pelo renderer.
 *
 * A sobreposicao e uma JANELA: quem abre e fecha janela e o processo main. Se
 * o atalho fosse tratado no renderer, abrir a roda de sons com o launcher
 * fechado na bandeja dependeria de mandar um recado pra janela principal pra
 * ela mandar um recado de volta pro main — com o detalhe de que a janela
 * principal pode estar destruida.
 *
 * Os outros atalhos (mic, clipe, som) continuam indo pro renderer: eles mexem
 * em socket, em LiveKit e em gravacao, coisas que so existem la.
 */
let localHandler: ((action: HotkeyAction) => void) | null = null

export function onHotkeyInMain(handler: (action: HotkeyAction) => void): void {
  localHandler = handler
}

function broadcast(binding: HotkeyBinding): void {
  localHandler?.(binding.action)

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
