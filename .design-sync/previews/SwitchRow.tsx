import * as React from 'react'
import { SwitchRow } from 'bocas-murchas-launcher'

const noop = () => {}

/** A linha de configuracao completa: rotulo, dica e o switch a direita. */
export function ComDica() {
  return (
    <div style={{ maxWidth: 460 }}>
      <SwitchRow
        label="Abrir junto com o Windows"
        hint="O launcher sobe minimizado na bandeja quando a maquina liga."
        checked
        onCheckedChange={noop}
      />
    </div>
  )
}

/** Bloco de configuracoes — como as linhas se empilham nas Settings. */
export function Bloco() {
  return (
    <div style={{ maxWidth: 460 }}>
      <SwitchRow
        label="Abrir junto com o Windows"
        hint="O launcher sobe minimizado na bandeja quando a maquina liga."
        checked
        onCheckedChange={noop}
      />
      <SwitchRow
        label="Sons da interface"
        hint="Clique, entrada em call e chegada de mensagem."
        checked={false}
        onCheckedChange={noop}
      />
      <SwitchRow
        label="Modo overlay no jogo"
        hint="Precisa reiniciar o Minecraft pra valer."
        checked
        onCheckedChange={noop}
      />
    </div>
  )
}

/** Sem `hint`: uma linha so, mais compacta. */
export function SemDica() {
  return (
    <div style={{ maxWidth: 460 }}>
      <SwitchRow label="Silenciar notificacoes" checked={false} onCheckedChange={noop} />
    </div>
  )
}

/** Desabilitado — a linha inteira apaga, nao so o switch. */
export function Desabilitado() {
  return (
    <div style={{ maxWidth: 460 }}>
      <SwitchRow
        label="Compartilhar tela em 1080p"
        hint="Disponivel so em call de voz ativa."
        checked={false}
        onCheckedChange={noop}
        disabled
      />
    </div>
  )
}
