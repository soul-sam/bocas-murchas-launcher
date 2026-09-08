import * as React from 'react'
import { Button } from 'bocas-murchas-launcher'

/** O botao primario. Regra do design system: UM por tela. */
export function Primario() {
  return <Button>Jogar agora</Button>
}

/** Os quatro pesos, do mais forte ao mais discreto. */
export function Pesos() {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <Button variant="default">Jogar agora</Button>
      <Button variant="secondary">Reverificar</Button>
      <Button variant="ghost">Configuracoes</Button>
      <Button variant="destructive">Remover conta</Button>
      <Button variant="link">Ver changelog</Button>
    </div>
  )
}

/** Tres alturas. `icon` e quadrado, pra botao de barra de titulo. */
export function Tamanhos() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Button size="sm">Pequeno</Button>
      <Button size="default">Padrao</Button>
      <Button size="lg">Grande</Button>
      <Button size="icon" aria-label="Fechar">
        x
      </Button>
    </div>
  )
}

/** Desabilitado em cada peso — opacidade 50% e sem ponteiro. */
export function Desabilitado() {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <Button disabled>Jogar agora</Button>
      <Button variant="secondary" disabled>
        Reverificar
      </Button>
      <Button variant="ghost" disabled>
        Configuracoes
      </Button>
    </div>
  )
}
