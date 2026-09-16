/**
 * Onde este renderer está rodando.
 *
 * Arquivo minúsculo e sem dependência de propósito: dá pra importar de
 * qualquer lugar, inclusive do app de desktop, onde o shim do navegador NUNCA
 * é carregado. Se `isWeb()` morasse dentro do `bridge-web.ts`, importá-lo do
 * desktop arrastaria o shim inteiro pro bundle do Electron.
 *
 * Quem levanta a bandeira é o `installWebBridge()`, antes do React montar.
 */

declare global {
  interface Window {
    /** Marcado só pelo shim do navegador. No Electron não existe. */
    __bocasWeb?: boolean
  }
}

/** Roda no navegador (site/PWA/app Android), sem processo principal. */
export function isWeb(): boolean {
  return typeof window !== 'undefined' && window.__bocasWeb === true
}

/** Roda dentro do Electron, com a ponte de verdade. */
export function isDesktop(): boolean {
  return !isWeb()
}
