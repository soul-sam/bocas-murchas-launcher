import * as React from 'react'

/**
 * O fio entre quem ACHA um ovo e quem o DESENHA.
 *
 * Quem acha está espalhado: a TitleBar (que vive FORA da casca logada, acima
 * de todos os providers), o compositor de mensagens (comando de barra) e a
 * própria camada (teclado, relógio). Quem desenha é uma camada só,
 * `components/easter-eggs/EggLayer.tsx`, montada nos GlobalOverlays. Um
 * provider não alcançaria a TitleBar — daí um barramento de módulo, sem
 * React no meio.
 *
 * O caminho de volta (camada → TitleBar) é o `TitleDecor`: o enfeite do dia
 * (morcego, presente, 1337…) que a barra desenha e que, clicado, avisa a
 * camada de novo pelo barramento.
 */

/** Efeitos que a camada sabe tocar. Os nomes são os mesmos ids de ovo da API. */
export type EggEffect =
  | 'konami'
  | 'murcho'
  | 'iddqd'
  | 'murchar'
  | 'f'
  | 'sudo'
  | 'matrix'
  | 'xyzzy'
  | 'girar'
  | 'virada'

/**
 * Comandos de barra escondidos que só respondem com um recado (out/2026). O
 * id é o mesmo do ovo na API; quem decide o recado (e se paga, no /sorte) é a
 * camada.
 */
export type EggCommandId =
  | 'ff'
  | 'ping'
  | 'socorro'
  | 'dado'
  | 'moeda'
  | 'quarenta-e-dois'
  | 'cafe'
  | 'rickroll'
  | 'beijo'
  | 'hello'
  | 'colher'
  | 'sorte'

export type EggEvent =
  /** Tocar um efeito e registrar o ovo de mesmo nome. */
  | { type: 'run'; effect: EggEffect; seed?: string }
  /** Registrar um ovo sem efeito próprio (quem chamou já fez a graça). */
  | { type: 'found'; id: string }
  /** Comando de barra escondido que responde com um recado. */
  | { type: 'command'; id: EggCommandId }
  /** Abrir o caderninho de ovos. */
  | { type: 'notebook' }
  /** Recado passageiro — pra quem vive fora da casca e não alcança os toasts. */
  | { type: 'toast'; title: string; body?: string }

type Listener = (event: EggEvent) => void

const listeners = new Set<Listener>()

export function emitEgg(event: EggEvent): void {
  for (const listener of listeners) listener(event)
}

export function onEgg(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// ---------------------------------------------------------------------------
// Enfeite da barra de título
// ---------------------------------------------------------------------------

/**
 * O que a barra de título mostra além do de sempre. `null` = barra normal.
 * Quem decide é o relógio da camada (ver `clock.ts`); a barra só desenha.
 */
export type TitleDecor = 'leet' | 'halloween' | 'natal' | 'sexta-13' | 'primeiro-de-abril' | null

let decor: TitleDecor = null
const decorListeners = new Set<() => void>()

export function setTitleDecor(next: TitleDecor): void {
  if (next === decor) return
  decor = next
  for (const listener of decorListeners) listener()
}

function subscribeDecor(listener: () => void): () => void {
  decorListeners.add(listener)
  return () => {
    decorListeners.delete(listener)
  }
}

export function useTitleDecor(): TitleDecor {
  return React.useSyncExternalStore(subscribeDecor, () => decor)
}
