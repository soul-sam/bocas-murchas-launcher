import { createRequire } from 'node:module'

/**
 * "ALGUM BOTAO DO MOUSE ESTA APERTADO?" — do sistema inteiro, nao so desta janela.
 *
 * Existe pro CLIQUE FORA da sobreposicao. A janela dela e atravessavel fora
 * das pecas (ver services/overlay.ts): o clique vai pro jogo e o renderer nao
 * ve nada. Pra saber que a pessoa clicou fora sem COMER o clique do jogo, o
 * main pergunta ao Windows o estado dos botoes, no mesmo relogio que ja mede
 * o cursor.
 *
 * `GetAsyncKeyState` via koffi (FFI, binario pronto, sem compilar). O bit alto
 * e "apertado agora"; o bit baixo e "apertado desde a ultima pergunta" — e o
 * que pega o clique rapido que comeca e termina entre duas voltas de 50ms.
 *
 * Fora do Windows, ou se o koffi nao carregar, devolve sempre falso: a
 * sobreposicao so perde o fechar-ao-clicar-fora, nada quebra.
 */

const VK_LBUTTON = 0x01
const VK_RBUTTON = 0x02
const VK_MBUTTON = 0x04

type KeyStateFn = (vKey: number) => number

let getKeyState: KeyStateFn | null | undefined

function load(): KeyStateFn | null {
  if (getKeyState !== undefined) return getKeyState
  getKeyState = null
  if (process.platform !== 'win32') return null
  try {
    // `require` e nao `import`: o modulo nativo so carrega quando for usado,
    // e uma falha aqui vira "sem clique fora", nao um main que nao sobe.
    const require = createRequire(import.meta.url)
    const koffi = require('koffi') as typeof import('koffi')
    const user32 = koffi.load('user32.dll')
    getKeyState = user32.func('short __stdcall GetAsyncKeyState(int vKey)') as KeyStateFn
  } catch (err) {
    console.warn('[overlay] sem leitura de botoes do mouse:', err)
  }
  return getKeyState
}

export function anyMouseButtonDown(): boolean {
  const fn = load()
  if (!fn) return false
  // Os tres sempre: `||` pararia no primeiro e deixaria o bit baixo dos outros
  // acumulado pra proxima pergunta.
  const states = [fn(VK_LBUTTON), fn(VK_RBUTTON), fn(VK_MBUTTON)]
  return states.some((s) => (s & 0x8001) !== 0)
}
