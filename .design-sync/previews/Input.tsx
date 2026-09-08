import * as React from 'react'
import { Input, Label } from 'bocas-murchas-launcher'

/** Campo sozinho, com placeholder. */
export function Padrao() {
  return (
    <div style={{ maxWidth: 360 }}>
      <Input placeholder="mc.bocasmurchas.com.br" />
    </div>
  )
}

/** Composicao real: Label em caixa alta espacada acima do campo. */
export function ComLabel() {
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 360 }}>
      <Label htmlFor="preview-servidor">Endereco do servidor</Label>
      <Input id="preview-servidor" defaultValue="mc.bocasmurchas.com.br" />
    </div>
  )
}

/** Formulario de duas linhas — o espacamento que o app usa. */
export function Formulario() {
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 360 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <Label htmlFor="preview-nick">Apelido</Label>
        <Input id="preview-nick" defaultValue="guizao" />
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <Label htmlFor="preview-ram">Memoria (GB)</Label>
        <Input id="preview-ram" type="number" defaultValue={8} />
      </div>
    </div>
  )
}

/** Desabilitado: cursor bloqueado e opacidade 50%. */
export function Desabilitado() {
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 360 }}>
      <Label htmlFor="preview-conta">Conta Microsoft</Label>
      <Input id="preview-conta" defaultValue="guizao@outlook.com" disabled />
    </div>
  )
}
