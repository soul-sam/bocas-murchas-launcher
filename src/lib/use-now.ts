import * as React from 'react'

/**
 * "Agora", atualizado de tanto em tanto tempo — UM relogio por intervalo.
 *
 * Textos como "em 45 min" e "expira em 12 min" ficam errados parados na tela.
 * Antes cada card tinha o proprio setInterval: com o canal cheio de enquetes,
 * apostas e drops eram dezenas de timers de 1 s acordando o thread principal
 * fora de fase, cada um com o proprio render — e continuavam acordando com o
 * launcher minimizado atras de um jogo, pra desenhar um relogio que ninguem
 * via.
 *
 * Agora todo mundo que pede o mesmo intervalo pendura no mesmo timer (um
 * despertar, um lote de renders no mesmo tick) e o relogio PARA enquanto a
 * janela esta escondida (`document.hidden`). Ao voltar, dispara na hora: o
 * texto ja aparece certo no primeiro quadro, sem esperar o proximo tick.
 */

type Listener = (now: number) => void

interface Group {
  listeners: Set<Listener>
  timer: ReturnType<typeof setInterval> | null
}

const groups = new Map<number, Group>()

function start(intervalMs: number, group: Group): void {
  if (group.timer !== null || document.hidden || group.listeners.size === 0) return
  group.timer = setInterval(() => {
    // Escondeu entre um tick e outro: para aqui mesmo, sem esperar o evento.
    if (document.hidden) {
      stop(group)
      return
    }
    const now = Date.now()
    for (const listener of group.listeners) listener(now)
  }, intervalMs)
}

function stop(group: Group): void {
  if (group.timer === null) return
  clearInterval(group.timer)
  group.timer = null
}

let visibilityHooked = false

function hookVisibility(): void {
  if (visibilityHooked) return
  visibilityHooked = true
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      for (const group of groups.values()) stop(group)
      return
    }
    const now = Date.now()
    for (const [intervalMs, group] of groups) {
      for (const listener of group.listeners) listener(now)
      start(intervalMs, group)
    }
  })
}

/** Pendura no relogio de `intervalMs`. Devolve a funcao que solta. */
export function subscribeTicker(intervalMs: number, listener: Listener): () => void {
  hookVisibility()
  let group = groups.get(intervalMs)
  if (!group) {
    group = { listeners: new Set(), timer: null }
    groups.set(intervalMs, group)
  }
  group.listeners.add(listener)
  start(intervalMs, group)

  return () => {
    group.listeners.delete(listener)
    if (group.listeners.size === 0) {
      stop(group)
      groups.delete(intervalMs)
    }
  }
}

/**
 * `Date.now()` que anda a cada `intervalMs` (e para com a janela escondida).
 * `enabled = false` desliga sem desmontar: o valor congela no ultimo tick.
 */
export function useTicker(intervalMs: number, enabled = true): number {
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    if (!enabled) return
    // Pode ter ficado parado enquanto `enabled` era falso.
    setNow(Date.now())
    return subscribeTicker(intervalMs, setNow)
  }, [intervalMs, enabled])

  return now
}

/** Mesmo relogio, como `Date`. */
export function useNow(intervalMs = 60_000): Date {
  const now = useTicker(intervalMs)
  return React.useMemo(() => new Date(now), [now])
}
