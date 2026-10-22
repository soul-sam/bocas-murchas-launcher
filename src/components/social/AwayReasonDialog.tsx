import * as React from 'react'
import { Coffee } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AFK_REASON_MAX, useAfk } from '@/lib/afk-context'
import { useVoice } from '@/lib/voice-context'
import { cn } from '@/lib/utils'

/**
 * "VOLTO LOGO!" COM MOTIVO.
 *
 * O botão do café continua sendo um clique só — o valor dele é esse. Aqui é
 * o caminho de quem quer dizer POR QUE saiu ("almoço", "reunião"), aberto
 * pelo menu de status ou pelo botão direito no café. O motivo aparece pros
 * outros do lado do crachá "ausente" e na recusa da cutucada.
 *
 * Não é o recado: o recado é do dono e fica como está. O motivo vive só
 * enquanto a ausência durar — voltou, sumiu. Ver lib/afk-context.
 */

/** Motivos que a galera repete. Clicar TROCA o campo — é atalho, não carimbo. */
const PRESETS = ['almoço', 'janta', 'banho', 'reunião', 'na rua', 'dormindo', 'já volto'] as const

export function AwayReasonDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { enable } = useAfk()
  const voice = useVoice()
  const [reason, setReason] = React.useState('')

  // Cada saída começa do zero: o motivo de ontem não é o de hoje.
  React.useEffect(() => {
    if (open) setReason('')
  }, [open])

  const submit = (): void => {
    onOpenChange(false)
    enable(reason)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Volto logo!</DialogTitle>
          <DialogDescription>
            {voice.connected
              ? 'Avisa a galera por que você saiu, desliga as cutucadas e muda seu mic e o som até você voltar.'
              : 'Avisa a galera por que você saiu e desliga as cutucadas até você voltar.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
          className="flex flex-col gap-3"
        >
          <Input
            autoFocus
            value={reason}
            maxLength={AFK_REASON_MAX}
            placeholder="Motivo (opcional): almoço, reunião…"
            onChange={(e) => setReason(e.target.value)}
            aria-label="Motivo da ausência"
          />

          <div className="flex flex-wrap gap-1">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setReason(preset)}
                className={cn(
                  'rounded-brutal border border-line px-1.5 py-0.5 text-[11.5px] transition-colors',
                  reason === preset
                    ? 'border-acid/60 bg-acid/10 text-acid'
                    : 'text-muted-foreground hover:border-acid/40 hover:text-foreground'
                )}
              >
                {preset}
              </button>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">
              <Coffee className="mr-1.5 h-4 w-4" />
              Sair
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
