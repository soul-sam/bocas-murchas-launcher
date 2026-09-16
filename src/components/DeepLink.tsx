import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { dmChannelId, useChat } from '@/lib/chat-context'

/**
 * TOQUE NA NOTIFICAÇÃO → A CONVERSA CERTA.
 *
 * Componente sem tela nenhuma; só liga duas pontas que existiam soltas.
 *
 * **1. A query do push.** A API manda `/chat?channel=<id>` ou
 * `/chat?dm=<conversationId>` (`targetUrl` em `bocas-murchas-api/src/modules/
 * push.ts`). Isso é herança do site antigo, onde o chat morava em `/chat`;
 * aqui a rota do chat é a raiz, e `/chat` existe como apelido no `App.tsx` só
 * pra esses links não caírem no `path="*"`. Sem o que está aqui, o apelido
 * levaria a pessoa pro chat — mas pro canal errado, o último que ela tinha
 * aberto.
 *
 * **2. A mensagem do service worker.** Quando o app JÁ está aberto, o
 * `notificationclick` do `sw.js` foca a janela e manda
 * `{type:'navigate', url}` em vez de recarregar — trocar de rota por dentro
 * preserva socket, call e estado, e no celular é muito mais rápido. Só que
 * ninguém estava ouvindo essa mensagem: o launcher nasceu no Electron, onde
 * notificação é nativa. Resultado: o toque focava a janela e não saía do
 * lugar.
 *
 * A query é apagada depois de usada (`replace: true`): sem isso ela gruda no
 * histórico e voltar pra tela mandaria a pessoa de novo pro canal do push,
 * mesmo que ela já tivesse trocado.
 */
export function DeepLink() {
  const { setActiveChannel } = useChat()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  // --- 1. veio com ?channel= / ?dm= na URL ---
  React.useEffect(() => {
    const canal = params.get('channel')
    const conversa = params.get('dm')
    if (!canal && !conversa) return

    setActiveChannel(conversa ? dmChannelId(conversa) : canal!)

    const limpo = new URLSearchParams(params)
    limpo.delete('channel')
    limpo.delete('dm')
    setParams(limpo, { replace: true })
  }, [params, setParams, setActiveChannel])

  // --- 2. o service worker pediu pra navegar ---
  React.useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const aoReceber = (evento: MessageEvent) => {
      const dado = evento.data
      if (!dado || dado.type !== 'navigate' || typeof dado.url !== 'string') return
      try {
        const url = new URL(dado.url, window.location.origin)
        // Só navega pra dentro de casa: uma mensagem de outra origem virando
        // rota seria um jeito barato de levar alguém pra qualquer lugar.
        if (url.origin !== window.location.origin) return
        navigate(url.pathname + url.search + url.hash)
      } catch {
        // URL estranha vinda do SW: ignorar é melhor que derrubar a página.
      }
    }

    navigator.serviceWorker.addEventListener('message', aoReceber)
    return () => navigator.serviceWorker.removeEventListener('message', aoReceber)
  }, [navigate])

  return null
}
