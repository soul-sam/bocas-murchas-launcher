import * as React from 'react'

/**
 * A ALTURA QUE O APARELHO REALMENTE MOSTRA.
 *
 * O app é uma casca de altura fixa com `overflow: hidden` — nada rola no
 * documento, só as listas por dentro. Isso funciona enquanto a altura da
 * janela for a altura visível. No celular ela não é:
 *
 * - `100vh` conta a barra de endereço do Safari como se ela nunca existisse,
 *   então o rodapé do app (o compositor, os botões do diálogo) vive embaixo
 *   dela até a pessoa rolar — e aqui nada rola.
 * - `100dvh` resolve a barra, mas NÃO resolve o teclado: no iOS o teclado
 *   virtual não muda o dvh. Ele só muda o `visualViewport`.
 *
 * Daí esta ponte: uma variável CSS com a altura visível de verdade, que a
 * `.casca-app` usa. Com o teclado aberto o app encolhe em vez de ser empurrado
 * pra fora da tela, e a barra de digitar continua onde o dedo espera.
 *
 * `--teclado` sai junto, para quem precisar saber quanto do rodapé está
 * coberto sem recalcular nada.
 *
 * No Electron e no desktop isto é um no-op de fato: `visualViewport.height`
 * é igual ao `innerHeight` e a variável só repete o que o dvh já dizia.
 */
export function useVisualViewport(): void {
  React.useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const raiz = document.documentElement
    let frame = 0

    const aplicar = (): void => {
      // Abrir o teclado dispara dezenas de `resize` em sequência (a animação
      // de subida do próprio teclado). Sem o rAF, cada quadro dela vira uma
      // escrita de estilo na raiz.
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        raiz.style.setProperty('--altura-visivel', `${Math.round(vv.height)}px`)

        const coberto = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
        raiz.style.setProperty('--teclado', `${Math.round(coberto)}px`)

        // O Safari ROLA a página inteira pra revelar o campo focado, mesmo com
        // `overflow: hidden` — e como a casca tem a altura da janela, isso
        // empurra o topo do app pra fora da tela e ele não volta sozinho.
        // Encolhendo a casca, não há o que revelar: voltar ao zero é o certo.
        if (vv.offsetTop !== 0 || window.scrollY !== 0) window.scrollTo(0, 0)
      })
    }

    aplicar()
    vv.addEventListener('resize', aplicar)
    vv.addEventListener('scroll', aplicar)

    return () => {
      cancelAnimationFrame(frame)
      vv.removeEventListener('resize', aplicar)
      vv.removeEventListener('scroll', aplicar)
      raiz.style.removeProperty('--altura-visivel')
      raiz.style.removeProperty('--teclado')
    }
  }, [])
}
