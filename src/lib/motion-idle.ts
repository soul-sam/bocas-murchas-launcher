/**
 * ANIMAÇÕES DECORATIVAS SÓ COM ALGUÉM OLHANDO → `<html class="motion-idle">`.
 *
 * Moldura suprema, nome fluindo, fogo, faíscas e a luz da aurora são
 * animações infinitas que repintam a janela a cada frame. Medido em out/2026
 * (docs/memory-audit-2026-10.md, medições 4 e 8): com a janela visível e
 * parada, só elas custavam ~60% de um núcleo no processo da GPU — e caíam pra
 * ~10% com o "Efeitos de animação" do Windows desligado.
 *
 * A classe entra quando a janela perde o foco (launcher no segundo monitor,
 * jogo ou navegador na frente) ou depois de um minuto sem mouse/teclado nela,
 * e sai no primeiro movimento. O CSS (styles/effects.css) PAUSA as animações
 * em vez de tirá-las: a moldura congela onde estava, sem pulo ao voltar.
 *
 * Fica fora da janela da sobreposição de propósito: ela nunca tem foco, e o
 * que anima lá é aviso (halo de quem fala), não enfeite.
 */

const IDLE_MS = 60_000

/** Eventos que contam como "alguém está mexendo aqui". */
const INPUT_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const

export function installMotionIdle(): () => void {
  const root = document.documentElement
  let focused = document.hasFocus()
  let idle = false
  let timer: number | null = null

  const apply = (): void => {
    root.classList.toggle('motion-idle', !focused || idle)
  }

  const armIdle = (): void => {
    if (timer !== null) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      timer = null
      idle = true
      apply()
    }, IDLE_MS)
  }

  // pointermove dispara dezenas de vezes por segundo: só rearma o relógio
  // quando já passou um tempo desde a última vez, pra não virar o próprio custo.
  let lastInput = 0
  const onInput = (): void => {
    const now = performance.now()
    if (!idle && now - lastInput < 1_000) return
    lastInput = now
    if (idle) {
      idle = false
      apply()
    }
    armIdle()
  }

  const onFocus = (): void => {
    focused = true
    apply()
    onInput()
  }

  const onBlur = (): void => {
    focused = false
    apply()
  }

  for (const name of INPUT_EVENTS) window.addEventListener(name, onInput, { passive: true })
  window.addEventListener('focus', onFocus)
  window.addEventListener('blur', onBlur)

  apply()
  armIdle()

  return () => {
    for (const name of INPUT_EVENTS) window.removeEventListener(name, onInput)
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('blur', onBlur)
    if (timer !== null) window.clearTimeout(timer)
    root.classList.remove('motion-idle')
  }
}
