/**
 * PUSH DO CELULAR — o lado do navegador.
 *
 * É o que faz menção, DM e lembrete chegarem quando o app está FECHADO. Sem
 * isto, o `push` do `public/sw.js` fica esperando um aviso que o servidor
 * nunca manda: quem dispara é a API, mas ela só sabe pra onde mandar depois
 * que este arquivo cadastra a inscrição.
 *
 * Vale pros dois mundos móveis, e é a única notificação possível em um deles:
 *
 * - **iPhone** — só funciona com o site adicionado à Tela de Início (iOS
 *   16.4+). Pelo Safari normal o sistema nem deixa pedir permissão. É por
 *   isso que `detectPushSupport` devolve `ios-needs-install` antes de tudo.
 * - **Android** — funciona no APK (que é Chrome por baixo) e no PWA.
 *
 * No launcher de desktop nada disso roda: lá a notificação é nativa, pelo
 * `window.bocas.notify`. A aba que usa este módulo só aparece na web.
 *
 * Fluxo: pede a chave pública pra API → pede permissão → `pushManager.subscribe`
 * → manda a inscrição pra API guardar. Quem dispara os avisos é o servidor
 * (`modules/push.ts` da API); aqui só cadastro.
 */
import { API_ORIGIN } from './api'
import { isIOS, isStandalone } from './pwa-install'

const PUSH_BASE = `${API_ORIGIN}/api/push`

export type PushSupport =
  | 'ok'
  /** Navegador sem Push API (webview de outro app). */
  | 'unsupported'
  /** iPhone/iPad no Safari "normal": só funciona depois de adicionar à tela inicial. */
  | 'ios-needs-install'
  /** Sem HTTPS (ou localhost) o navegador nem expõe o service worker. */
  | 'insecure'

export function detectPushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported'
  if (!window.isSecureContext) return 'insecure'

  // iPhone/iPad fora da tela inicial não recebe push, ponto — tendo ou não a
  // API exposta. Checar o ESTADO DO APARELHO, e não a presença do objeto, é o
  // que evita o dia em que o Safari expuser `PushManager` numa aba comum: a
  // pessoa cairia em 'ok' e levaria um "não deu" genérico no subscribe, em vez
  // do passo a passo de instalação.
  if (isIOS() && !isStandalone()) return 'ios-needs-install'

  const temApi = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!temApi) return 'unsupported'
  return 'ok'
}

/**
 * A chave VAPID vem em base64url; o `subscribe` quer bytes. Conversão padrão
 * de toda documentação de web push.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const saida = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) saida[i] = raw.charCodeAt(i)
  return saida
}

export class PushNotConfiguredError extends Error {
  constructor() {
    super('push não configurado')
    this.name = 'PushNotConfiguredError'
  }
}

async function authFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${PUSH_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
}

export interface PushDevice {
  id: string
  userAgent: string | null
  createdAt: string
}

export async function fetchVapidPublicKey(token: string): Promise<string> {
  const res = await authFetch(token, '/vapid-public-key')
  // 503 e não 404: o recurso existe, o servidor é que não foi configurado.
  if (res.status === 503) throw new PushNotConfiguredError()
  if (!res.ok) throw new Error('Não deu pra buscar a chave do servidor')
  const data = await res.json()
  return data.publicKey as string
}

export async function listDevices(token: string): Promise<{ devices: PushDevice[]; configured: boolean }> {
  const res = await fetch(`${PUSH_BASE}/subscriptions`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return { devices: [], configured: true }
  const data = await res.json()
  return {
    devices: Array.isArray(data.subscriptions) ? data.subscriptions : [],
    configured: data.configured !== false,
  }
}

/** O service worker registrado no main.web.tsx; espera ficar pronto. */
export async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existente = await navigator.serviceWorker.getRegistration('/')
  if (existente) return existente
  // Em dev o main.web.tsx não registra; registrar aqui deixa o fluxo testável.
  await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  return navigator.serviceWorker.ready
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (detectPushSupport() !== 'ok') return null
  const registro = await navigator.serviceWorker.getRegistration('/')
  if (!registro) return null
  return registro.pushManager.getSubscription()
}

export async function subscribeToPush(token: string): Promise<PushSubscription> {
  const publicKey = await fetchVapidPublicKey(token)

  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') throw new Error('permissão negada')

  const registro = await getRegistration()
  let inscricao = await registro.pushManager.getSubscription()

  // Inscrição antiga feita com OUTRA chave do servidor não serve mais; refaz.
  if (inscricao) {
    const atual = inscricao.options.applicationServerKey
    const desejada = urlBase64ToUint8Array(publicKey)
    const igual =
      atual &&
      atual.byteLength === desejada.byteLength &&
      new Uint8Array(atual).every((b, i) => b === desejada[i])
    if (!igual) {
      await inscricao.unsubscribe().catch(() => undefined)
      inscricao = null
    }
  }

  if (!inscricao) {
    inscricao = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    })
  }

  const json = inscricao.toJSON()
  const res = await authFetch(token, '/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      userAgent: navigator.userAgent,
    }),
  })
  if (res.status === 503) throw new PushNotConfiguredError()
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Servidor não aceitou a inscrição')
  }

  return inscricao
}

export async function unsubscribeFromPush(token: string): Promise<void> {
  const inscricao = await getCurrentSubscription()
  if (!inscricao) return
  const endpoint = inscricao.endpoint
  // Primeiro avisa o servidor (enquanto ainda temos o endpoint), depois solta
  // no navegador. Se a API falhar, o módulo de push apaga sozinho no primeiro
  // 410 que receber.
  await authFetch(token, '/subscribe', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  }).catch(() => undefined)
  await inscricao.unsubscribe()
}

export async function sendTestPush(token: string): Promise<void> {
  const res = await authFetch(token, '/test', { method: 'POST' })
  if (res.status === 503) throw new PushNotConfiguredError()
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Não deu pra mandar o teste')
  }
}
