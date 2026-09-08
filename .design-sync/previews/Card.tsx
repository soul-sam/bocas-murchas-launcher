import * as React from 'react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from 'bocas-murchas-launcher'

/** Composicao canonica: header + conteudo + rodape com a acao. */
export function Completo() {
  return (
    <Card style={{ maxWidth: 420 }}>
      <CardHeader>
        <CardTitle>Servidor Bocas</CardTitle>
        <CardDescription>mc.bocasmurchas.com.br — modpack 1.20.1</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          4 de 20 jogadores online. Ultimo backup ha 2 horas, sem perda de chunk desde
          a migracao de setembro.
        </p>
      </CardContent>
      <CardFooter style={{ gap: 12 }}>
        <Button>Entrar</Button>
        <Button variant="ghost">Copiar IP</Button>
      </CardFooter>
    </Card>
  )
}

/** So header e conteudo — o rodape e opcional. */
export function SemRodape() {
  return (
    <Card style={{ maxWidth: 420 }}>
      <CardHeader>
        <CardTitle>Saldo</CardTitle>
        <CardDescription>Moedas acumuladas nesta temporada</CardDescription>
      </CardHeader>
      <CardContent>
        <span className="font-mono text-3xl text-acid">12.480</span>
      </CardContent>
    </Card>
  )
}

/** O titulo usa Anton (font-display), em caixa alta — e o unico lugar que usa. */
export function Titulo() {
  return (
    <Card style={{ maxWidth: 420 }}>
      <CardHeader>
        <CardTitle>Atualizacao 1.2.3</CardTitle>
        <CardDescription>Baixada, reinicie pra aplicar</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button size="sm">Reiniciar agora</Button>
      </CardFooter>
    </Card>
  )
}
