import * as React from 'react'
import { MessageCard } from 'bocas-murchas-launcher'

// MessageCard escolhe o cartao pelo `message.type` num registro interno. Aqui
// so' o tipo `system` aparece: os outros (poll, event, party, wager, watch,
// game, chess, recap, suggestion) leem contexto do app — Auth, Chat, Socket,
// Members — e nao renderizam fora do launcher. Ver NOTES.md.
const systemMessage = {
  id: 'preview-system',
  type: 'system',
  content: 'Guizao chegou ao nivel 12.',
  metadata: JSON.stringify({
    kind: 'levelup',
    title: 'Guizao chegou ao nivel 12',
    body: '2.400 XP nesta temporada — 3o lugar no ranking do mes.'
  }),
  author: { id: 'sistema', displayName: 'Sistema' }
} as any

/** Despacho por tipo: `system` cai no SystemCard, dentro da largura do chat. */
export function PorTipo() {
  return <MessageCard message={systemMessage} />
}

// `compact` nao ganhou card proprio: o SystemCard, que e' o unico tipo que
// renderiza fora do app, ignora a prop — o cartao sairia identico ao de cima.

/** Tipo sem cartao registrado devolve `null` — a mensagem vira texto puro. */
export function SemCartao() {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <MessageCard message={{ ...systemMessage, type: 'text' } as any} />
      <p className="text-xs text-muted-foreground">
        (nada acima: `type: "text"` nao tem cartao, entao MessageCard devolve null)
      </p>
    </div>
  )
}
