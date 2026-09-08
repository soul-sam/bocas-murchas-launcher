import * as React from 'react'
import { UserAvatar } from 'bocas-murchas-launcher'

/** Os quatro estados de presenca, com a bolinha no canto. */
export function Status() {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <UserAvatar name="Guizao" status="online" />
      <UserAvatar name="Rafa" status="away" />
      <UserAvatar name="Bia" status="dnd" />
      <UserAvatar name="Léo" status="offline" />
    </div>
  )
}

/** `speaking` poe o anel acid — e o que marca quem esta falando na call. */
export function Falando() {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <UserAvatar name="Guizao" status="online" speaking />
      <UserAvatar name="Rafa" status="online" />
    </div>
  )
}

/** Molduras da lojinha: rara (azul), epica (roxa) e a lendaria animada. */
export function Molduras() {
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
      <UserAvatar name="Guizao" frame="frame:ice" />
      <UserAvatar name="Rafa" frame="frame:arcane" />
      <UserAvatar name="Bia" frame="frame:fire" />
    </div>
  )
}

/** `ringColor` — a cor de nome comprada, quando nao ha moldura por cima. */
export function CorDeNome() {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <UserAvatar name="Guizao" ringColor="#f2b705" status="online" />
      <UserAvatar name="Rafa" ringColor="#8b5cf6" status="online" />
    </div>
  )
}

/** Tamanho por medicao (`style`), como o palco da call faz. */
export function TamanhoMedido() {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <UserAvatar name="Guizao" style={{ height: 32, width: 32 }} />
      <UserAvatar name="Guizao" style={{ height: 56, width: 56 }} />
      <UserAvatar name="Guizao" style={{ height: 80, width: 80 }} />
    </div>
  )
}
