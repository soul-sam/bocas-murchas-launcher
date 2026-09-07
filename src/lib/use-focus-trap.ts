import * as React from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Prende o foco dentro de um elemento enquanto `active` for true.
 *
 * Feito à mão, e não com o Radix, pelo mesmo motivo que a gaveta de canais
 * não é um Dialog do Radix: ele trancaria o <body>, e o componente que usa
 * isto some sozinho num resize (ver lib/interaction-guard.ts). Aqui é só:
 * Tab circula entre os focáveis de dentro, Escape chama `onEscape`, e o foco
 * volta pra onde estava quando o alvo fecha.
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  onEscape?: () => void
): React.RefObject<T> {
  const ref = React.useRef<T>(null)

  React.useEffect(() => {
    if (!active) return
    const root = ref.current
    if (!root) return

    const previous = document.activeElement as HTMLElement | null
    const first = root.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onEscape?.()
        return
      }
      if (event.key !== 'Tab') return

      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      )
      if (items.length === 0) return
      const head = items[0]
      const tail = items[items.length - 1]
      const current = document.activeElement

      if (event.shiftKey && current === head) {
        event.preventDefault()
        tail.focus()
      } else if (!event.shiftKey && current === tail) {
        event.preventDefault()
        head.focus()
      } else if (!root.contains(current)) {
        event.preventDefault()
        head.focus()
      }
    }

    root.addEventListener('keydown', onKey)
    return () => {
      root.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [active, onEscape])

  return ref
}
