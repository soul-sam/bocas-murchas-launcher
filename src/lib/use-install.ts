import { useSyncExternalStore } from 'react'
import { getInstallState, subscribeInstallChange, type InstallState } from './pwa-install'

/**
 * Estado de instalação do PWA, reativo.
 *
 * `useSyncExternalStore` e não `useState` + `useEffect` porque o
 * `beforeinstallprompt` chega fora do React, a qualquer momento — inclusive
 * ANTES do componente montar. O `getInstallState` é lido na renderização,
 * então quem monta depois do evento já nasce com o estado certo, sem um frame
 * mostrando "não dá pra instalar" antes de se corrigir.
 *
 * Devolve string literal, então a igualdade referencial que o React compara
 * funciona sozinha — sem objeto novo a cada leitura, sem laço infinito.
 */
export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribeInstallChange, getInstallState, () => 'unsupported' as const)
}
