/* global self, caches, clients */
/**
 * NOTA DE ROTA: a API ainda manda `/chat?channel=...` no push (ver
 * `targetUrl` em bocas-murchas-api/src/modules/push.ts), heranca do site
 * antigo, onde o chat morava em /chat. Aqui a tela do chat e a raiz. O
 * `notificationclick` abre a URL que vier; enquanto a rota /chat nao existir
 * como apelido, o router cai no `path="*"` e manda pra / — abre o chat certo,
 * perde o canal. Resolver dos dois lados: apelido de rota aqui, ou trocar o
 * targetUrl la.
 *
 * Service worker do PWA — de propósito sem plugin/Workbox: são três coisas e
 * cabem num arquivo que dá pra ler inteiro.
 *
 *   1. push: mostra a notificação que a API mandou (menção, DM, lembrete);
 *   2. notificationclick: foca a aba já aberta (ou abre uma) na conversa certa;
 *   3. fetch: só pra NAVEGAÇÃO, rede primeiro; sem rede, serve o index.html
 *      guardado pra tela não virar o dinossauro do Chrome. Asset (js/css/img)
 *      não passa por aqui — o Vite já põe hash no nome e o nginx cacheia.
 *
 * O nome do cache muda quando o shell muda de forma; bump aqui limpa o antigo
 * no activate.
 */
const SHELL_CACHE = 'bocas-shell-v1'
const SHELL_URL = '/index.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(SHELL_URL))
      .catch(() => undefined)
      // skipWaiting: versão nova assume na hora, sem esperar todas as abas
      // fecharem. É um grupo de amigos, não um banco; melhor atualizar logo.
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

// ============================================
// NAVEGAÇÃO: rede primeiro, shell do cache se cair
// ============================================
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.mode !== 'navigate') return
  if (request.method !== 'GET') return

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request)
        // Toda rota do SPA devolve o mesmo index.html (fallback do nginx);
        // guardar a resposta boa mais recente mantém o shell atualizado.
        if (response.ok) {
          const cache = await caches.open(SHELL_CACHE)
          cache.put(SHELL_URL, response.clone()).catch(() => undefined)
        }
        return response
      } catch (_offline) {
        const cached = await caches.match(SHELL_URL)
        if (cached) return cached
        return new Response('Sem conexão.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        })
      }
    })()
  )
})

// ============================================
// PUSH
// ============================================
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (_notJson) {
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Bocas Murchas'
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    // Sem badge monocromático: o Android mostraria o logo colorido como um
    // borrão branco na barra de status. Melhor o ícone padrão do navegador.
    data: { url: data.url || '/' },
    // Mesma tag = substitui a anterior em vez de empilhar dez avisos do
    // mesmo canal; renotify pra ainda vibrar quando substituir.
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    lang: 'pt-BR'
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  const target = new URL(url, self.location.origin).href

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

      // Já tem o site aberto: foca e pede pro app trocar de conversa por
      // dentro (postMessage), sem recarregar. Se o app não responder (aba
      // antiga sem o listener), o navigate faz o serviço.
      for (const client of windows) {
        if (!client.url.startsWith(self.location.origin)) continue
        try {
          await client.focus()
          client.postMessage({ type: 'navigate', url: target })
          return
        } catch (_cantFocus) {
          // tenta o próximo, e no fim abre uma janela nova
        }
      }

      await self.clients.openWindow(target)
    })()
  )
})
