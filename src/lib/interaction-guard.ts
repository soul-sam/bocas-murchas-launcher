/**
 * Destravador da interface.
 *
 * SINTOMA: depois de um tempo de uso o launcher "para de funcionar" — a tela
 * continua desenhando, mas nada aceita clique, nem os botoes de minimizar e
 * fechar. Como a janela e frameless (frame: false), esses botoes tambem sao
 * React: quando o renderer para de receber clique, o app fica sem saida.
 *
 * CAUSA: o Radix, em toda camada modal (Dialog e DropdownMenu), escreve
 * `pointer-events: none` no <body> e so devolve o valor original na limpeza —
 * e essa limpeza e condicional:
 *
 *   if (disableOutsidePointerEvents && layersWithOutsidePointerEventsDisabled.size === 1)
 *     body.style.pointerEvents = originalBodyPointerEvents
 *
 * (node_modules/@radix-ui/react-dismissable-layer/dist/index.mjs)
 *
 * Se uma camada modal for ARRANCADA da arvore em vez de fechada — o que
 * acontecia aqui quando a call caia com o seletor de tela aberto, ou quando
 * duas camadas se sobrepunham — o `size` nao bate, o restore e pulado e o
 * <body> fica travado pra sempre. Nenhum clique passa mais.
 *
 * As causas estruturais foram corrigidas (as modais globais agora vivem num
 * ponto estavel da arvore, ver overlay-context). Este guarda e a rede embaixo:
 * se o <body> ficar travado com NENHUMA camada do Radix na tela, destrava.
 */

/**
 * Qualquer coisa portalizada do Radix que possa legitimamente estar segurando o
 * <body>. Enquanto um destes existir, nao mexemos em nada — inclusive durante a
 * animacao de saida, que ainda mantem o no no DOM.
 */
const RADIX_LAYER_SELECTOR = [
  '[data-radix-popper-content-wrapper]',
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[data-radix-menu-content]'
].join(',')

/** De quanto em quanto tempo conferimos. */
const CHECK_INTERVAL_MS = 800

/**
 * Quantas checagens seguidas travadas antes de agir.
 *
 * Uma so nao serve: entre o `open=false` e o fim da animacao de saida existe uma
 * janela curta em que o body esta travado e o no ja saiu. Duas checagens dao
 * ~1,6s de folga, muito acima de qualquer animacao daqui (200ms).
 */
const STRIKES_BEFORE_UNSTICK = 2

/** Avisado na tela pra dar pista de que o problema aconteceu de novo. */
export const UNSTUCK_EVENT = 'bocas:ui-unstuck'

function isBodyLocked(): boolean {
  return document.body.style.pointerEvents === 'none'
}

function hasOpenLayer(): boolean {
  return document.querySelector(RADIX_LAYER_SELECTOR) !== null
}

/** Devolve o clique pro app. Seguro de chamar a qualquer momento. */
export function unstickInterface(reason: 'watchdog' | 'manual'): boolean {
  if (!isBodyLocked()) return false

  document.body.style.removeProperty('pointer-events')

  // O aria-hidden do Radix (hideOthers) nao bloqueia clique, mas deixa a arvore
  // invisivel pra leitor de tela; se sobrou, sobrou pelo mesmo motivo.
  for (const el of document.querySelectorAll('[aria-hidden="true"][data-aria-hidden]')) {
    el.removeAttribute('aria-hidden')
    el.removeAttribute('data-aria-hidden')
  }

  console.warn(`[interaction-guard] <body> estava travado (${reason}) — destravado`)
  window.dispatchEvent(new CustomEvent(UNSTUCK_EVENT, { detail: { reason } }))
  return true
}

/**
 * Liga o guarda. Chamado uma vez no bootstrap; devolve o desligador.
 */
export function installInteractionGuard(): () => void {
  let strikes = 0

  const timer = setInterval(() => {
    // Escondida nao tem clique pra travar; volta a vigiar quando aparecer.
    if (document.hidden) return
    if (!isBodyLocked() || hasOpenLayer()) {
      strikes = 0
      return
    }

    strikes += 1
    if (strikes < STRIKES_BEFORE_UNSTICK) return

    strikes = 0
    unstickInterface('watchdog')
  }, CHECK_INTERVAL_MS)

  // Saida de emergencia pelo teclado: o teclado continua funcionando mesmo com
  // o <body> sem pointer-events, entao isso resolve na hora sem esperar o timer
  // — e serve pra qualquer travamento futuro que ninguem previu.
  const handleKey = (event: KeyboardEvent): void => {
    if (!event.ctrlKey || !event.shiftKey) return
    if (event.code !== 'KeyU') return
    event.preventDefault()
    if (!unstickInterface('manual')) {
      window.dispatchEvent(
        new CustomEvent(UNSTUCK_EVENT, { detail: { reason: 'manual', noop: true } })
      )
    }
  }

  window.addEventListener('keydown', handleKey, true)

  return () => {
    clearInterval(timer)
    window.removeEventListener('keydown', handleKey, true)
  }
}
