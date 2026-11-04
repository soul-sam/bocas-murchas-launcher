import { createRequire } from 'node:module'
import type { BrowserWindow } from 'electron'

/**
 * "TEM ALGUEM POR CIMA DA SOBREPOSICAO?" — sem mexer na ordem das janelas.
 *
 * A sobreposicao precisa continuar por cima do jogo, e ate nov/2026 garantia
 * isso dando `setAlwaysOnTop` + `moveTop` (um `SetWindowPos`) a cada 1,5 s,
 * a partida inteira, mesmo ja estando no topo. Cada chamada faz o DWM
 * recompor a pilha de janelas — ver overlay-policy.ts para o travamento que
 * motivou isto.
 *
 * Aqui so se OLHA: sobe a pilha a partir da nossa janela (`GetWindow` com
 * GW_HWNDPREV) e procura uma janela visivel, nao minimizada, nao "cloaked"
 * (apps UWP suspensos sao visiveis pro Win32 mas nao desenham) e que cubra
 * pelo menos METADE do nosso retangulo. Achou: alguem esta por cima e vale
 * reafirmar.
 *
 * Por que metade, e nao "encostou": medido nesta maquina, acima de uma janela
 * comum sempre ha a barra de tarefas (TOPMOST, faixa de 48 px no rodape) e
 * widgets pequenos de outros apps. Contando esses, a conferencia diria
 * "coberta" o tempo todo e voltariamos ao SetWindowPos a cada 1,5 s. O caso
 * que a reafirmacao resolve e o jogo sem bordas, que cobre a tela inteira.
 *
 * Coordenadas em pixel fisico dos dois lados (GetWindowRect), entao escala de
 * monitor nao atrapalha.
 *
 * `null` quando nao da pra saber (fora do Windows, koffi sem carregar, erro):
 * quem chama volta ao comportamento antigo.
 */

const GW_HWNDPREV = 3
const DWMWA_CLOAKED = 14
/**
 * Teto de passos. A pilha tem muitas janelas INVISIVEIS (dicas, IME, janelas
 * de mensagem de outros apps): com 64 a volta nunca chegava ao topo nesta
 * maquina. Cada passo e uma chamada barata, e so as visiveis custam mais.
 */
const MAX_STEPS = 2048

interface WinRect {
  left: number
  top: number
  right: number
  bottom: number
}

interface Api {
  getWindow: (hwnd: bigint, cmd: number) => bigint
  isVisible: (hwnd: bigint) => boolean
  isIconic: (hwnd: bigint) => boolean
  getRect: (hwnd: bigint, out: WinRect) => boolean
  cloaked: ((hwnd: bigint) => boolean) | null
}

let api: Api | null | undefined

function load(): Api | null {
  if (api !== undefined) return api
  api = null
  if (process.platform !== 'win32') return null
  try {
    const require = createRequire(import.meta.url)
    const koffi = require('koffi') as typeof import('koffi')
    const user32 = koffi.load('user32.dll')
    koffi.struct('BM_RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' })
    const getWindow = user32.func('intptr_t __stdcall GetWindow(intptr_t hWnd, uint32_t uCmd)')
    const isVisible = user32.func('bool __stdcall IsWindowVisible(intptr_t hWnd)')
    const isIconic = user32.func('bool __stdcall IsIconic(intptr_t hWnd)')
    const getRect = user32.func('bool __stdcall GetWindowRect(intptr_t hWnd, _Out_ BM_RECT *lpRect)')

    let cloaked: Api['cloaked'] = null
    try {
      const dwm = koffi.load('dwmapi.dll')
      const getAttr = dwm.func(
        'long __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32_t attr, _Out_ uint32_t *pv, uint32_t cb)'
      )
      cloaked = (hwnd) => {
        const out = [0]
        const hr = getAttr(hwnd, DWMWA_CLOAKED, out, 4) as number
        return hr === 0 && out[0] !== 0
      }
    } catch {
      cloaked = null
    }

    api = {
      getWindow: (h, c) => BigInt(getWindow(h, c) as number | bigint),
      isVisible: (h) => Boolean(isVisible(h)),
      isIconic: (h) => Boolean(isIconic(h)),
      getRect: (h, out) => Boolean(getRect(h, out)),
      cloaked
    }
  } catch (err) {
    console.warn('[overlay] sem leitura da pilha de janelas:', err)
  }
  return api
}

function hwndOf(win: BrowserWindow): bigint {
  const handle = win.getNativeWindowHandle()
  return handle.length >= 8 ? handle.readBigInt64LE(0) : BigInt(handle.readInt32LE(0))
}

/** Fracao do nosso retangulo que precisa estar tapada pra contar como "por cima". */
const COVER_FRACTION = 0.5

function coversMostOf(mine: WinRect, other: WinRect): boolean {
  const w = Math.min(mine.right, other.right) - Math.max(mine.left, other.left)
  const h = Math.min(mine.bottom, other.bottom) - Math.max(mine.top, other.top)
  if (w <= 0 || h <= 0) return false
  const area = (mine.right - mine.left) * (mine.bottom - mine.top)
  return area > 0 && (w * h) / area >= COVER_FRACTION
}

export function isCovered(win: BrowserWindow): boolean | null {
  const fn = load()
  if (!fn || win.isDestroyed()) return null
  try {
    const self = hwndOf(win)
    const mine: WinRect = { left: 0, top: 0, right: 0, bottom: 0 }
    if (!fn.getRect(self, mine)) return null

    let h = fn.getWindow(self, GW_HWNDPREV)
    for (let i = 0; h !== 0n && i < MAX_STEPS; i++) {
      if (fn.isVisible(h) && !fn.isIconic(h) && !(fn.cloaked && fn.cloaked(h))) {
        const r: WinRect = { left: 0, top: 0, right: 0, bottom: 0 }
        if (fn.getRect(h, r) && coversMostOf(mine, r)) return true
      }
      h = fn.getWindow(h, GW_HWNDPREV)
    }
    // Andou o teto inteiro sem chegar ao topo: nao da pra afirmar nada.
    return h === 0n ? false : null
  } catch (err) {
    console.warn('[overlay] falha ao ler a pilha de janelas:', err)
    return null
  }
}
