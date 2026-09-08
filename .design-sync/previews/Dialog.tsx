import * as React from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from 'bocas-murchas-launcher'

// `open` fixo: o modal so' existe depois de um clique, e o card e' estatico.
// O conteudo vai pra um portal, por isso este componente roda em cardMode
// "single" com viewport proprio (ver overrides no config).

/** Modal de confirmacao — header, corpo e rodape com as duas acoes. */
export function Confirmacao() {
  return (
    <Dialog open>
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Reinstalar o modpack</DialogTitle>
          <DialogDescription>1,4 GB · 20 minutos</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Apaga a pasta de mods e baixa tudo de novo. Teus mundos e configuracoes
          ficam onde estao.
        </p>
        <DialogFooter>
          <Button variant="ghost">Cancelar</Button>
          <Button variant="destructive" className="bg-destructive text-destructive-foreground">
            Reinstalar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Modal de formulario — o rodape carrega a acao primaria. */
export function ComFormulario() {
  return (
    <Dialog open>
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Novo canal</DialogTitle>
          <DialogDescription>Visivel pra todo mundo do grupo</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Nome
          </span>
          <input
            className="input-terminal h-11 w-full rounded-brutal px-3 text-sm"
            defaultValue="off-topic"
            readOnly
          />
        </div>
        <DialogFooter>
          <Button variant="ghost">Cancelar</Button>
          <Button>Criar canal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
