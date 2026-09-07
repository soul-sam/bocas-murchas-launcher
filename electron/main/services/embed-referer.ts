import { session } from 'electron'

/**
 * REFERER PARA O PLAYER DO YOUTUBE — o que fazia o "assistir junto" nao
 * funcionar no app instalado.
 *
 * O SINTOMA: no launcher empacotado, o palco do assistir junto ficava preto
 * pra sempre, com o spinner de "carregando" e sem erro nenhum no console. Em
 * desenvolvimento funcionava.
 *
 * A CAUSA: em producao o renderer e carregado por `loadFile`, ou seja
 * `file://`. Requisicao saindo de `file://` nao leva cabecalho `Referer` — nao
 * existe origem http pra citar. O YouTube passou a exigir um Referer valido
 * pra tocar embutido: o player CARREGA, responde o aperto de mao (`onReady`
 * chega), e logo depois manda `onError: 153` e nunca mais manda `infoDelivery`.
 * Como o nosso player depende de `infoDelivery` pra saber tempo e estado (ver
 * components/social/WatchStage.tsx), ele fica esperando eternamente. Em dev o
 * renderer vem do Vite em `http://localhost:5173`, que TEM Referer — e por
 * isso o bug so aparecia na versao instalada.
 *
 * A CORRECAO: preencher o Referer nas requisicoes que vao pro YouTube. Medido
 * num Electron igual ao nosso, com o mesmo CSP e o mesmo `file://`:
 *
 *   sem Referer  -> onReady, depois onError 153, zero infoDelivery
 *   com Referer  -> onReady, infoDelivery com playerState 1, video tocando
 *
 * O valor e o nosso proprio dominio, que e de onde o launcher vem de verdade.
 *
 * ESCOPO: so youtube.com e youtube-nocookie.com. Nao entram ytimg (imagens) e
 * googlevideo (os bytes do video) porque nao precisam — foi testado com e sem,
 * e o erro vinha da pagina do embed. Mexer em cabecalho de requisicao e o tipo
 * de coisa que deve alcancar o menor numero de pedidos possivel.
 */

/** De onde o launcher diz que veio. E o dominio do grupo, nao um disfarce. */
const REFERER = 'https://www.bocasmurchas.com.br/'

const YOUTUBE_URLS = ['https://*.youtube.com/*', 'https://*.youtube-nocookie.com/*']

export function initEmbedReferer(): void {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: YOUTUBE_URLS },
    (details, callback) => {
      /**
       * `Referer` so e preenchido quando esta faltando. Quando o app roda em
       * dev (`http://localhost`) o Chromium ja manda o dele, e sobrescrever
       * trocaria um valor correto por um que nao corresponde a origem real.
       */
      if (details.requestHeaders['Referer'] || details.requestHeaders['referer']) {
        callback({})
        return
      }

      callback({ requestHeaders: { ...details.requestHeaders, Referer: REFERER } })
    }
  )
}
