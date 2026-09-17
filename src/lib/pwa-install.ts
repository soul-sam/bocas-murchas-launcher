/**
 * INSTALAR NA TELA INICIAL — só faz sentido no navegador.
 *
 * No Android a pessoa instala o APK e acabou. No **iPhone não existe APK**: a
 * Apple não deixa instalar nada fora da App Store, então o caminho é o site
 * virar app pela tela inicial. E isso não é só estética — **no iOS a
 * notificação SÓ funciona com o site instalado**. Pelo Safari normal o sistema
 * nem deixa pedir permissão.
 *
 * Cada plataforma joga um jogo diferente:
 *
 * - **Android/Chrome** dispara `beforeinstallprompt`. Segurando o evento
 *   (`preventDefault`), ganhamos o direito de chamar `prompt()` depois — é o
 *   botão de um toque, útil pra quem abriu pelo navegador em vez do APK.
 * - **iPhone/iPad** não tem nada disso e nunca vai ter: só Compartilhar →
 *   Adicionar à Tela de Início, na mão. Só dá pra ensinar.
 * - **Desktop** instala pelo ícone da barra de endereço; e no Electron isso
 *   tudo é irrelevante — quem abre o launcher já está "instalado".
 */

/**
 * `beforeinstallprompt` é do Chromium e não está no lib.dom do TypeScript.
 * Só o que a gente usa.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallState =
  /** Abriu pelo ícone (ou é o APK): já é app, não tem o que oferecer. */
  | 'installed'
  /** Chromium liberou o convite — dá pra instalar com um toque. */
  | 'prompt-ready'
  /** iPhone/iPad: só pelo menu Compartilhar, com o passo a passo na tela. */
  | 'ios-manual'
  /** Instalável, mas só pelo menu do navegador. */
  | 'manual'
  /** Navegador sem PWA (webview de outro app, navegador de dentro do Instagram). */
  | 'unsupported'

// ============================================
// DETECÇÃO
// ============================================

/**
 * iPad moderno mente no user agent: diz que é Mac. O desempate é
 * `maxTouchPoints`, porque Mac de verdade não tem tela sensível ao toque.
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iP(hone|ad|od)/.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/**
 * Abriu pelo ícone da tela inicial (ou é o APK, que roda em modo standalone)?
 *
 * `display-mode: standalone` é o padrão e vale em todo mundo; o
 * `navigator.standalone` é a gambiarra só do Safari iOS, que durante muito
 * tempo foi o único jeito lá. Os dois, porque nenhum cobre tudo sozinho.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const legacyIOS = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return legacyIOS || window.matchMedia('(display-mode: standalone)').matches
}

// ============================================
// O CONVITE DO CHROMIUM
// ============================================

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function notify(): void {
  listeners.forEach((fn) => fn())
}

// No escopo do módulo, e não dentro de um componente: o `beforeinstallprompt`
// costuma chegar antes do React montar, e evento perdido não volta — o
// navegador só dispara uma vez por carregamento.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Sem o preventDefault o Chrome mostra a barrinha dele embaixo E descarta
    // o evento; segurando, o convite passa a ser nosso.
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    notify()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

/** Avisa quando o estado muda; devolve a função de cancelar. */
export function subscribeInstallChange(callback: () => void): () => void {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

export function getInstallState(): InstallState {
  if (typeof window === 'undefined') return 'unsupported'
  if (isStandalone()) return 'installed'
  if (deferredPrompt) return 'prompt-ready'
  if (isIOS()) {
    // Safari é o único navegador do iOS que instala na tela inicial. Chrome e
    // Firefox lá são a mesma engine com outra casca, e o item do menu não
    // existe — mandar a pessoa procurar seria enviar pra um beco sem saída.
    const outroNavegador = /CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent)
    return outroNavegador ? 'unsupported' : 'ios-manual'
  }
  if (!('serviceWorker' in navigator)) return 'unsupported'
  return 'manual'
}

/**
 * Abre o diálogo do navegador. Só funciona com o convite guardado, e só uma
 * vez: depois do `prompt()` o evento queima e o Chrome só manda outro no
 * próximo carregamento.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const evento = deferredPrompt
  if (!evento) return 'unavailable'

  deferredPrompt = null
  notify()

  try {
    await evento.prompt()
    const { outcome } = await evento.userChoice
    return outcome
  } catch {
    // Chrome recusa o prompt se já instalou por fora ou se a aba perdeu o
    // gesto do usuário. Não é erro que valha assustar ninguém.
    return 'unavailable'
  }
}
