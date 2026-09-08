import * as React from 'react'
import { InstallStatusCard } from 'bocas-murchas-launcher'

const noop = () => {}

/** Baixando o Minecraft — barra de progresso com bytes e porcentagem. */
export function Baixando() {
  return (
    <div style={{ maxWidth: 460 }}>
      <InstallStatusCard
        ready
        onRecheck={noop}
        status={{
          stage: 'minecraft',
          subStage: 'client',
          current: 41_943_040,
          total: 96_468_992
        } as any}
      />
    </div>
  )
}

/** Etapa contada (bibliotecas): o progresso vira "N de M", nao bytes. */
export function Contando() {
  return (
    <div style={{ maxWidth: 460 }}>
      <InstallStatusCard
        ready
        onRecheck={noop}
        status={{
          stage: 'minecraft',
          subStage: 'libraries',
          current: 87,
          total: 214
        } as any}
      />
    </div>
  )
}

/** Sincronizando o modpack — outro icone, outro rotulo de sub-etapa. */
export function Modpack() {
  return (
    <div style={{ maxWidth: 460 }}>
      <InstallStatusCard
        ready
        onRecheck={noop}
        status={{
          stage: 'modpack',
          subStage: 'extract',
          current: 3,
          total: 4,
          detail: 'mods/create-1.20.1.jar'
        } as any}
      />
    </div>
  )
}

/** Tudo em dia — a linha compacta com o botao de re-verificar. */
export function Pronto() {
  return (
    <div style={{ maxWidth: 460 }}>
      <InstallStatusCard
        ready
        onRecheck={noop}
        status={{ stage: 'done', current: 1, total: 1 } as any}
      />
    </div>
  )
}

/**
 * Erro: borda e texto destructive, mais o "Tentar de novo".
 * O sotaque vem de `stage: 'error'` — so' preencher `error` nao muda o cartao.
 */
export function ComErro() {
  return (
    <div style={{ maxWidth: 460 }}>
      <InstallStatusCard
        ready
        onRecheck={noop}
        status={{
          stage: 'error',
          current: 0,
          total: 0,
          error: 'Nao deu pra baixar o instalador do Forge (timeout em 30s).'
        } as any}
      />
    </div>
  )
}

/** `ready: false` — o estado apagado de antes da primeira checagem. */
export function AindaNaoChecado() {
  return (
    <div style={{ maxWidth: 460 }}>
      <InstallStatusCard
        ready={false}
        onRecheck={noop}
        status={{ stage: 'starting', current: 0, total: 0 } as any}
      />
    </div>
  )
}
