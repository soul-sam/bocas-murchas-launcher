import * as React from 'react'
import { CardFrame } from 'bocas-murchas-launcher'

/** Os quatro sotaques — e a borda que diz de que familia o cartao e'. */
export function Sotaques() {
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
      <CardFrame accent="acid" title="Enquete">
        <p className="text-sm text-foreground">Qual mapa na sexta?</p>
      </CardFrame>
      <CardFrame accent="burn" title="Lojinha">
        <p className="text-sm text-foreground">Moldura dourada por 800 moedas</p>
      </CardFrame>
      <CardFrame accent="destructive" title="Aposta encerrada">
        <p className="text-sm text-foreground">O time perdeu por 2 a 1</p>
      </CardFrame>
      <CardFrame accent="muted" title="Sistema">
        <p className="text-sm text-foreground">Servidor reiniciado</p>
      </CardFrame>
    </div>
  )
}

/** Com rodape: a linha mono embaixo, que carrega o dado seco. */
export function ComRodape() {
  return (
    <div style={{ maxWidth: 420 }}>
      <CardFrame accent="acid" title="Partida registrada" footer="ha 12 minutos · 4 jogadores">
        <p className="text-sm text-foreground">Vitoria no ranked — 18/4/9 de KDA</p>
      </CardFrame>
    </div>
  )
}

/** Sem cabecalho: so' o corpo, quando o cartao dispensa rotulo. */
export function SoCorpo() {
  return (
    <div style={{ maxWidth: 420 }}>
      <CardFrame accent="muted">
        <p className="text-sm text-foreground">
          Ninguem entrou na call ainda. O primeiro que entrar aparece aqui.
        </p>
      </CardFrame>
    </div>
  )
}
