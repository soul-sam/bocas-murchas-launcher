import React from 'react'
import ReactDOM from 'react-dom/client'
import { OverlayPage } from './pages/OverlayPage'
import './styles/globals.css'

/**
 * Ponto de entrada da JANELA DA SOBREPOSIÇÃO (overlay.html) — a que fica por
 * cima do League durante a partida. É uma árvore React própria, separada da
 * do app: janelas diferentes não compartilham contexto.
 *
 * De propósito, NENHUM provider aqui. Ela não tem login, socket, voz nem
 * roteador — tudo o que mostra chega pronto por IPC da janela principal (ver
 * electron/main/services/lol-overlay.ts). Foi o que permitiu não ter um
 * segundo `AuthProvider` disputando o mesmo token nem um segundo poll de
 * apostas na mesma máquina.
 *
 * Sem `installInteractionGuard()`: o guarda existe pra destravar o `<body>`
 * quando uma camada do Radix é arrancada da árvore, e aqui não há Radix
 * nenhum — o painel é HTML puro justamente porque precisa deixar o clique
 * atravessar pro jogo.
 */

// O tema mora nas configurações, que a janela principal aplica no <html> dela.
// Esta é outra janela: precisa aplicar o dela. Lido uma vez na montagem —
// a sobreposição nasce e morre a cada partida, então nunca fica velho.
void window.bocas.settings
  .get()
  .then((settings) => {
    document.documentElement.dataset.theme = settings.theme
  })
  .catch(() => {
    // Sem tema aplicado os tokens caem no padrão do :root, que é escuro.
    // Feio num tema claro, mas melhor que uma tela vazia.
  })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OverlayPage />
  </React.StrictMode>
)
