import * as React from 'react'

/**
 * O BOTÃO VOLTAR DO APARELHO FECHA A CAMADA, NÃO O APP.
 *
 * No Android (e no app instalado pela tela de início) o Voltar é o gesto que
 * todo mundo usa pra sair de onde entrou. Sem isto, abrir a lista de canais em
 * tela cheia e apertar Voltar fecha o Bocas inteiro — com a call junto.
 *
 * O truque é o de sempre: enquanto a camada está aberta, existe uma entrada a
 * mais no histórico que não leva a lugar nenhum. O Voltar consome essa entrada
 * e nós fechamos a camada; fechar pelo X consome a entrada de volta, pra não
 * sobrar um Voltar que não faz nada visível.
 *
 * `marca` é o que separa a NOSSA entrada de uma navegação de rota que tenha
 * acontecido por cima: sem ela, fechar uma folha depois de trocar de tela
 * desfaria a troca de tela.
 */
export function useCamadaVoltar(ativo: boolean, fechar: () => void): void {
  const fecharRef = React.useRef(fechar)
  fecharRef.current = fechar

  React.useEffect(() => {
    if (!ativo) return

    const marca = `camada:${Date.now()}:${Math.random().toString(36).slice(2)}`
    window.history.pushState({ camada: marca }, '')

    let fechadoPeloVoltar = false
    const handle = (): void => {
      fechadoPeloVoltar = true
      fecharRef.current()
    }

    window.addEventListener('popstate', handle)
    return () => {
      window.removeEventListener('popstate', handle)
      if (fechadoPeloVoltar) return

      // Só desfaz o que ainda é nosso: se uma rota entrou por cima, a entrada
      // do topo não é mais esta camada e voltar seria desfazer a navegação da
      // pessoa.
      const estado = window.history.state as { camada?: string } | null
      if (estado?.camada === marca) window.history.back()
    }
  }, [ativo])
}
