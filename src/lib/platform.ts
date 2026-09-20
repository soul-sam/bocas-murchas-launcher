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

/**
 * ESTE APARELHO CONSEGUE COMPARTILHAR A TELA?
 *
 * `getDisplayMedia` simplesmente NÃO EXISTE no Safari do iPhone nem no Chrome
 * do Android — não é permissão negada, é API ausente. O botão estava sempre
 * lá: tocar nele dava erro de console e nada na tela, que é a pior resposta
 * possível ("será que sou eu?").
 *
 * Assistir a tela de outra pessoa continua funcionando nos dois: o que falta é
 * só o lado de PUBLICAR.
 */
export function podeCompartilharTela(): boolean {
  if (isDesktop()) return true
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia
}
