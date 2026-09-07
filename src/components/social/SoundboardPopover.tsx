import * as React from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SoundboardPanel } from './SoundboardPanel'

/**
 * O soundboard como DROP-UP, ancorado no botão que o abriu.
 *
 * Era um painel na coluna da direita, e aquela coluna é disputada por seis
 * painéis (busca, fixadas, achados, agenda, ranking, soundboard): abrir o
 * soundboard fechava o que estivesse ali e, numa janela de 1000px, engolia o
 * chat. Pior: o botão fica no rodapé da barra esquerda, e o painel abria do
 * outro lado da tela — o clique e o resultado em cantos opostos.
 *
 * Ancorado no botão, ele abre onde a mão está e não toma espaço de ninguém.
 *
 * `side="top"` porque os dois botões que o abrem vivem em rodapé (o dock da
 * call na barra lateral e a barra de controles do palco); pra baixo abriria
 * fora da janela. `collisionPadding` deixa o Radix empurrar de volta pra
 * dentro quando a janela é baixa demais.
 *
 * NÃO é Dialog de propósito: Popover não modal não escreve `pointer-events:
 * none` no <body>, então não entra na classe de bug que travava a interface
 * inteira do launcher (ver lib/interaction-guard.ts). O soundboard também não
 * quer ser modal — a graça é soltar um som ENQUANTO a galera fala.
 */
export function SoundboardPopover({
  children,
  align = 'start'
}: {
  /** O botão que abre. Recebe o comportamento de trigger. */
  children: React.ReactNode
  align?: 'start' | 'center' | 'end'
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align={align}
        collisionPadding={12}
        // Altura pela viewport, não fixa: numa janela de 640px de altura um
        // painel de 520px ficaria por cima do chat inteiro.
        className="flex h-[min(70vh,32rem)] w-80 flex-col p-3"
      >
        <SoundboardPanel />
      </PopoverContent>
    </Popover>
  )
}
