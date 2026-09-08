import * as React from 'react'
import { SystemCard } from 'bocas-murchas-launcher'

// SystemCard recebe a mensagem inteira e o metadata ja parseado. Aqui a
// mensagem e' so' a casca minima que o cartao le (`content` como corpo de
// reserva) — o cartao nao toca em rede nem em contexto.
const msg = (content: string) =>
  ({
    id: 'preview',
    type: 'system',
    content,
    author: { id: 'sistema', displayName: 'Sistema' }
  }) as any

/** Subiu de nivel — sotaque acid, o caso mais comum. */
export function SubiuDeNivel() {
  return (
    <div style={{ maxWidth: 420 }}>
      <SystemCard
        message={msg('Guizao chegou ao nivel 12.')}
        metadata={{
          kind: 'levelup',
          title: 'Guizao chegou ao nivel 12',
          body: '2.400 XP nesta temporada — 3o lugar no ranking do mes.'
        }}
      />
    </div>
  )
}

/** Badge nova — sotaque burn (ambar). */
export function BadgeNova() {
  return (
    <div style={{ maxWidth: 420 }}>
      <SystemCard
        message={msg('Rafa ganhou a badge Madrugador.')}
        metadata={{
          kind: 'badge',
          title: 'Madrugador',
          body: 'Entrou em call depois das 3h da manha em cinco dias diferentes.',
          icon: '🌙'
        }}
      />
    </div>
  )
}

/** Compra na lojinha — mesmo sotaque burn, outro icone. */
export function Compra() {
  return (
    <div style={{ maxWidth: 420 }}>
      <SystemCard
        message={msg('Bia comprou a moldura dourada.')}
        metadata={{
          kind: 'purchase',
          title: 'Moldura dourada',
          body: '800 moedas · vale por 30 dias.'
        }}
      />
    </div>
  )
}

/** Recado generico — sotaque muted, sem cor. */
export function Recado() {
  return (
    <div style={{ maxWidth: 420 }}>
      <SystemCard
        message={msg('Servidor reiniciado pra aplicar a atualizacao 1.2.3.')}
        metadata={{
          kind: 'info',
          title: 'Servidor reiniciado',
          body: 'Atualizacao 1.2.3 aplicada. Nenhum mundo foi afetado.'
        }}
      />
    </div>
  )
}
