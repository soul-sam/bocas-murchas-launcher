import * as React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'bocas-murchas-launcher'

/** Composicao canonica: lista com sublinhado acid na aba ativa. */
export function Padrao() {
  return (
    <Tabs defaultValue="geral" style={{ maxWidth: 520 }}>
      <TabsList>
        <TabsTrigger value="geral">Geral</TabsTrigger>
        <TabsTrigger value="voz">Voz</TabsTrigger>
        <TabsTrigger value="atalhos">Atalhos</TabsTrigger>
      </TabsList>
      <TabsContent value="geral">
        <p className="text-sm text-muted-foreground">
          Pasta do jogo, memoria dedicada e comportamento na inicializacao.
        </p>
      </TabsContent>
      <TabsContent value="voz">
        <p className="text-sm text-muted-foreground">Microfone, saida e supressao de ruido.</p>
      </TabsContent>
    </Tabs>
  )
}

/** Aba do meio ativa — mostra que o indicador segue a selecao. */
export function OutraAtiva() {
  return (
    <Tabs defaultValue="voz" style={{ maxWidth: 520 }}>
      <TabsList>
        <TabsTrigger value="geral">Geral</TabsTrigger>
        <TabsTrigger value="voz">Voz</TabsTrigger>
        <TabsTrigger value="atalhos">Atalhos</TabsTrigger>
      </TabsList>
      <TabsContent value="voz">
        <p className="text-sm text-muted-foreground">
          Entrada: Microfone (Realtek). Supressao de ruido ligada.
        </p>
      </TabsContent>
    </Tabs>
  )
}

/** Muitas abas — os rotulos sao mono, caixa alta, espacados. */
export function Muitas() {
  return (
    <Tabs defaultValue="cargos" style={{ maxWidth: 640 }}>
      <TabsList>
        <TabsTrigger value="cargos">Cargos</TabsTrigger>
        <TabsTrigger value="emojis">Emojis</TabsTrigger>
        <TabsTrigger value="canais">Canais</TabsTrigger>
        <TabsTrigger value="impressora">Impressora</TabsTrigger>
      </TabsList>
      <TabsContent value="cargos">
        <p className="text-sm text-muted-foreground">4 cargos, 12 membros com cargo.</p>
      </TabsContent>
    </Tabs>
  )
}
