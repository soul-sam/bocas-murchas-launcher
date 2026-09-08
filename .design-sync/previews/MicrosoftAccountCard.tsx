import * as React from 'react'
import { MicrosoftAccountCard } from 'bocas-murchas-launcher'

const noop = () => {}

// O avatar do estado conectado vem do crafatar.com. No card estatico, offline,
// a imagem nao carrega — o resto do cartao (nome, UUID, acoes) renderiza igual.

/** Sem conta: o convite pra conectar, com a moldura tracejada. */
export function Desconectado() {
  return (
    <div style={{ maxWidth: 460 }}>
      <MicrosoftAccountCard profile={null} onConnect={noop} onDisconnect={noop} />
    </div>
  )
}

/** Conectado: nome do perfil e a acao de sair. */
export function Conectado() {
  return (
    <div style={{ maxWidth: 460 }}>
      <MicrosoftAccountCard
        profile={{ id: '069a79f4-44e9-4726-a5be-fca90e38aaf5', name: 'Guizao' }}
        onConnect={noop}
        onDisconnect={noop}
      />
    </div>
  )
}

/** `busy` — enquanto o fluxo de codigo de dispositivo esta rodando. */
export function Ocupado() {
  return (
    <div style={{ maxWidth: 460 }}>
      <MicrosoftAccountCard profile={null} onConnect={noop} onDisconnect={noop} busy />
    </div>
  )
}
