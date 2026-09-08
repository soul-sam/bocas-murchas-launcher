import * as React from 'react'
import { Input, Label, Switch } from 'bocas-murchas-launcher'

const noop = () => {}

/** O rotulo sozinho: 12px, bold, caixa alta, tracking largo, muted. */
export function Sozinho() {
  return <Label>Endereco do servidor</Label>
}

/** Ligado a um campo por `htmlFor` — o uso normal. */
export function ComCampo() {
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 340 }}>
      <Label htmlFor="preview-label-campo">Memoria dedicada</Label>
      <Input id="preview-label-campo" defaultValue="8 GB" />
    </div>
  )
}

/** Rotulando um controle que nao e' campo de texto. */
export function ComSwitch() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Switch id="preview-label-switch" checked onCheckedChange={noop} />
      <Label htmlFor="preview-label-switch">Supressao de ruido</Label>
    </div>
  )
}

/** Empilhado: e' o rotulo que separa secoes de um formulario. */
export function Secoes() {
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 340 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <Label>Conta</Label>
        <Input defaultValue="guizao@outlook.com" />
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <Label>Pasta do jogo</Label>
        {/* Atributo JSX nao processa escape: uma barra aqui e' uma barra na tela. */}
        <Input defaultValue="C:\Bocas\.minecraft" />
      </div>
    </div>
  )
}
