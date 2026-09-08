import * as React from 'react'
import { Button, Tooltip, TooltipContent, TooltipTrigger } from 'bocas-murchas-launcher'

// `open` fixo: sem isso a dica so' aparece no hover e o card sai vazio.
// O Radix leva o conteudo pra um portal, por isso este componente roda em
// cardMode "single" com viewport proprio (ver overrides no config).

/** A dica aberta, na superficie de popover com seta. */
export function Aberta() {
  return (
    <div style={{ padding: 64, display: 'flex', justifyContent: 'center' }}>
      <Tooltip open>
        <TooltipTrigger asChild>
          <Button variant="secondary">Reverificar arquivos</Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Compara o modpack local com o do servidor
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

/** Sem seta (`arrow={false}`) — usado quando a dica nao aponta pra um alvo unico. */
export function SemSeta() {
  return (
    <div style={{ padding: 64, display: 'flex', justifyContent: 'center' }}>
      <Tooltip open>
        <TooltipTrigger asChild>
          <Button variant="ghost">Sair</Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" arrow={false}>
          Encerra a sessao neste computador
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
