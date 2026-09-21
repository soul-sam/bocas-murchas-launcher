import * as React from 'react'
import { PAINEL_MAX, PAINEL_MIN, useLayout } from '@/lib/layout-context'
import { useCamadaVoltar } from '@/lib/use-camada-voltar'
import { AlcaDeLargura } from '@/components/ui/alca'
import { cn } from '@/lib/utils'

/**
 * A COLUNA DA DIREITA, NO CELULAR, É UMA FOLHA DE BAIXO.
 *
 * Busca, fixadas, achados, clipes, agenda, sugestões, ranking e lista de
 * membros disputam uma coluna de 288px que só existe a partir de 1180px de
 * largura. Num aparelho elas não estavam escondidas — estavam INALCANÇÁVEIS:
 * o layout simplesmente não montava nenhuma delas.
 *
 * Aqui a mesma coluna sobe do rodapé, com a altura de uma folha (o suficiente
 * pra ler, pouco pro contexto da conversa sumir por completo). No desktop este
 * componente é transparente: devolve o painel como sempre foi.
 *
 * Sem Radix, de propósito — pelo mesmo motivo do QuickSwitcher e da jukebox:
 * estas camadas somem sozinhas ao virar a tela ou ao redimensionar, e uma
 * modal do Radix arrancada da árvore deixa `pointer-events: none` grudado no
 * <body>, travando o app inteiro (ver lib/interaction-guard.ts).
 */
export function FolhaDePainel({ children }: { children: React.ReactNode }) {
  const { isPhone, closeRightColumn, panelWidth, setPanelWidth } = useLayout()

  // O Voltar do aparelho fecha a folha antes de pensar em sair do app.
  useCamadaVoltar(isPhone, closeRightColumn)

  // NO PC A COLUNA SE ARRASTA. Este componente já é o único lugar por onde os
  // oito painéis passam, então a divisória mora aqui — nenhum deles precisa
  // saber que pode mudar de largura.
  //
  // `[&>aside]:w-full` só entra quando ALGUÉM arrastou: sem largura escolhida,
  // cada painel mantém a sua (a lista de membros é mais estreita que a busca,
  // e isso é de propósito).
  if (!isPhone) {
    return (
      <div
        className={cn('relative flex shrink-0', panelWidth != null && '[&>aside]:w-full')}
        style={panelWidth != null ? { width: panelWidth } : undefined}
      >
        {children}
        <AlcaDeLargura
          lado="esquerda"
          largura={panelWidth}
          aoMudar={setPanelWidth}
          min={PAINEL_MIN}
          max={PAINEL_MAX}
          rotulo="Largura do painel da direita"
        />
      </div>
    )
  }

  return (
    <>
      <div onClick={closeRightColumn} className="absolute inset-0 z-gaveta bg-black/60" aria-hidden />

      {/* `[&>*]` acerta o painel de dentro sem que cada um dos oito precise
          saber que virou folha: eles nasceram como coluna (`w-72 border-l`) e
          continuam assim no PC. */}
      <div
        className={
          'folha-sobe absolute inset-x-0 bottom-0 z-veu flex max-h-[72dvh] flex-col ' +
          'overflow-hidden rounded-t-brutal border-t-2 border-acid-dark shadow-[0_-10px_40px_rgba(0,0,0,0.6)] ' +
          '[&>*]:w-full [&>*]:max-w-full [&>*]:flex-1 [&>*]:border-l-0'
        }
      >
        <button
          type="button"
          onClick={closeRightColumn}
          aria-label="Fechar painel"
          className="flex h-6 shrink-0 items-center justify-center bg-depth-2"
        >
          <span aria-hidden className="h-1 w-10 rounded-full bg-line-strong" />
        </button>

        {children}
      </div>
    </>
  )
}
