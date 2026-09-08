import * as React from 'react'
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger
} from 'bocas-murchas-launcher'

// `open` fixo (conteudo em portal) -> cardMode "single", ver overrides.

/** Popover de aposta — o uso real: um mini formulario ancorado no botao. */
export function Aposta() {
  return (
    <div style={{ padding: 24 }}>
      <Popover open>
        <PopoverTrigger asChild>
          <Button variant="secondary">Apostar</Button>
        </PopoverTrigger>
        <PopoverContent onOpenAutoFocus={(e) => e.preventDefault()} align="start" className="w-64">
          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Quanto vai
            </span>
            <input
              className="input-terminal h-10 w-full rounded-brutal px-3 font-mono text-sm"
              defaultValue="250"
              readOnly
            />
            <Button size="sm">Confirmar aposta</Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** Popover so' de texto — explicacao curta ancorada num link. */
export function Explicacao() {
  return (
    <div style={{ padding: 24 }}>
      <Popover open>
        <PopoverTrigger asChild>
          <Button variant="link">Como ganho XP?</Button>
        </PopoverTrigger>
        <PopoverContent onOpenAutoFocus={(e) => e.preventDefault()} align="start" className="w-72">
          <p className="text-sm text-muted-foreground">
            Mensagem no chat, tempo em call e partida registrada valem XP. O ganho
            por mensagem tem teto por hora — spam nao sobe nivel.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  )
}
