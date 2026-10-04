import { createRequire } from 'node:module'
import type { BrowserWindow } from 'electron'

/**
 * GARANTE `WS_EX_NOACTIVATE` na janela — de novo, toda vez que o estilo mexe.
 *
 * `focusable: false` liga esse bit na criacao, e e ele que impede a
 * sobreposicao de tirar o foco do jogo (jogo sem foco = jogo minimizado).
 * So que o `setIgnoreMouseEvents` do Electron reescreve o GWL_EXSTYLE inteiro
 * a cada troca, e o bit nao e algo que da pra conferir de fora — se ele cair
 * uma vez, o primeiro contato com a janela ativa ela e o jogo some. Reafirmar
 * custa duas chamadas ao sistema e so roda quando a janela troca de modo.
 *
 * `GetWindowLongPtrW`/`SetWindowLongPtrW` via koffi, como em mouse-buttons.ts.
 * Fora do Windows, ou se o koffi nao carregar, nao faz nada.
 */

const GWL_EXSTYLE = -20
const WS_EX_NOACTIVATE = 0x08000000

type GetLong = (hwnd: bigint, index: number) => bigint
type SetLong = (hwnd: bigint, index: number, value: bigint) => bigint

let api: { get: GetLong; set: SetLong } | null | undefined

function load(): { get: GetLong; set: SetLong } | null {
  if (api !== undefined) return api
  api = null
  if (process.platform !== 'win32') return null
  try {
    const require = createRequire(import.meta.url)
    const koffi = require('koffi') as typeof import('koffi')
    const user32 = koffi.load('user32.dll')
    api = {
      get: user32.func(
        'intptr_t __stdcall GetWindowLongPtrW(intptr_t hWnd, int nIndex)'
      ) as GetLong,
      set: user32.func(
        'intptr_t __stdcall SetWindowLongPtrW(intptr_t hWnd, int nIndex, intptr_t dwNewLong)'
      ) as SetLong
    }
  } catch (err) {
    console.warn('[overlay] sem WS_EX_NOACTIVATE manual:', err)
  }
  return api
}

export function ensureNoActivate(win: BrowserWindow): void {
  const fn = load()
  if (!fn || win.isDestroyed()) return
  try {
    const handle = win.getNativeWindowHandle()
    const hwnd = handle.length >= 8 ? handle.readBigInt64LE(0) : BigInt(handle.readInt32LE(0))
    const style = BigInt(fn.get(hwnd, GWL_EXSTYLE))
    if ((style & BigInt(WS_EX_NOACTIVATE)) !== 0n) return
    fn.set(hwnd, GWL_EXSTYLE, style | BigInt(WS_EX_NOACTIVATE))
  } catch (err) {
    console.warn('[overlay] falha ao reafirmar WS_EX_NOACTIVATE:', err)
  }
}
