/**
 * REGRAS PURAS DA SOBREPOSICAO — o que pode mexer na janela, e quando.
 *
 * Separado de overlay.ts pra ser testavel sem Electron (`npm run test:policy`).
 *
 * POR QUE EXISTE (nov/2026): um notebook com duas GPUs (Intel + NVIDIA, cada
 * monitor numa) congelava a tela inteira — o DWM parava, so voltava no botao
 * de energia. Cruzando os 23 travamentos com o banco, quase todos cairam
 * no COMECO ou no FIM de uma partida de League: o momento em que o Windows
 * troca o jogo de modo de apresentacao. A sobreposicao mexia na janela
 * justamente ali (setBounds duas vezes no comeco da partida) e, o tempo todo,
 * dava `SetWindowPos(HWND_TOPMOST)` a cada 1,5 s, precisando ou nao.
 *
 * Duas regras saem disso:
 *   1. Em volta de uma troca de fase da partida existe um SILENCIO: nada de
 *      criar a janela, mudar tamanho ou reafirmar o topo. O que foi pedido
 *      nesse tempo espera o silencio acabar.
 *   2. Reafirmar o topo so quando alguem esta de fato POR CIMA (ou a janela
 *      sumiu). Sem como saber (sem koffi), cai no comportamento antigo.
 */

/** Quanto dura o silencio depois de uma partida comecar ou acabar. */
export const TRANSITION_QUIET_MS = 45_000

/** De quanto em quanto tempo o topo e CONFERIDO (nao reafirmado). */
export const TOP_CHECK_MS = 1500

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Folga em px (DIP). Num monitor a 125% o Windows arredonda o tamanho: pedido
 * 1536x960, a janela fica 1536x963 (medido). Sem folga, "ja esta no lugar"
 * nunca seria verdade ali, e todo encaixe viraria dois `setBounds`.
 */
export const RECT_SLACK = 4

export function sameRect(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) <= RECT_SLACK &&
    Math.abs(a.y - b.y) <= RECT_SLACK &&
    Math.abs(a.width - b.width) <= RECT_SLACK &&
    Math.abs(a.height - b.height) <= RECT_SLACK
  )
}

/** Fim do silencio, se esta mudanca de `inGame` abre um. */
export function quietAfterPhaseChange(
  wasInGame: boolean,
  isInGame: boolean,
  now: number,
  currentQuietUntil: number
): number {
  if (wasInGame === isInGame) return currentQuietUntil
  return Math.max(currentQuietUntil, now + TRANSITION_QUIET_MS)
}

export function inQuiet(now: number, quietUntil: number): boolean {
  return now < quietUntil
}

export type TopDecision = 'wait' | 'quiet' | 'ok' | 'reassert'

/**
 * @param covered `true` = outra janela visivel por cima; `false` = ninguem;
 *   `null` = nao deu pra saber.
 */
export function decideTop(input: {
  now: number
  lastCheckAt: number
  quietUntil: number
  visible: boolean
  covered: boolean | null
}): TopDecision {
  if (input.now - input.lastCheckAt < TOP_CHECK_MS) return 'wait'
  if (inQuiet(input.now, input.quietUntil)) return 'quiet'
  if (!input.visible) return 'reassert'
  if (input.covered === false) return 'ok'
  return 'reassert'
}
