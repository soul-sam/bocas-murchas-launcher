/**
 * ENTRADA DO NAVEGADOR — o mesmo app, sem Electron embaixo.
 *
 * Existe só pra garantir uma ordem: a ponte de mentira tem que estar em
 * `window.bocas` ANTES do primeiro módulo do app ser avaliado, porque vários
 * contextos leem a ponte no próprio import.
 *
 * Daí o `import()` dinâmico no lugar de um `import` normal: import estático é
 * içado pro topo do módulo e rodaria ANTES do `installWebBridge()` — a ordem
 * que este arquivo inteiro existe pra garantir se perderia, e o erro seria o
 * mesmo "Cannot read properties of undefined" de sempre, só que intermitente.
 *
 * Quem abre o app no Electron passa pelo `main.tsx`, que não sabe que este
 * arquivo existe.
 */
import { installWebBridge } from './lib/bridge-web'

installWebBridge()

/**
 * Service worker: é ele que faz o app instalado abrir sem rede, e é ele que
 * recebe o push do servidor quando ninguém está com o app aberto — no iPhone
 * não existe outro caminho pra notificação.
 *
 * Só em produção: em dev o Vite serve módulo a módulo e um SW interceptando
 * navegação atrapalha o hot reload. Registrado depois do `load` pra não
 * disputar banda com o bundle, que é o que a pessoa está esperando.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((erro) => console.warn('Service worker não registrou:', erro))
  })
}

void import('./main')
