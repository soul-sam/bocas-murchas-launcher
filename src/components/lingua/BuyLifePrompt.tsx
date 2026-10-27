import { Heart, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { LivesView } from '@/lib/api-lingua'
import { fmtMurchos, heartSlots } from '@/lib/lingua-ui'
import { cn } from '@/lib/utils'

/** Corações das vidas do dia (3 + compradas), cheios os que sobram. */
export function Hearts({ lives, className }: { lives: LivesView; className?: string }) {
  return (
    <span
      className={cn('flex items-center gap-0.5', className)}
      role="img"
      aria-label={`${lives.left} ${lives.left === 1 ? 'vida' : 'vidas'}`}
      title={lives.bought > 0 ? `${lives.left} vidas (${lives.bought} compradas hoje)` : `${lives.left} vidas`}
    >
      {heartSlots(lives).map((full, i) => (
        <Heart
          key={i}
          aria-hidden
          className={cn('h-4 w-4', full ? 'fill-current text-destructive' : 'text-muted-foreground/50')}
        />
      ))}
    </span>
  )
}

/**
 * Compra de vida. Dentro da lição (`inLesson`): vidas zeradas, compra e segue
 * ou desiste (a lição falha pagando os acertos). Fora: compra avulsa no topo.
 * `price` null = acabaram as compras do dia; na lição só sobra encerrar.
 */
export function BuyLifePrompt({
  price,
  inLesson,
  busy,
  error,
  onBuy,
  onDecline
}: {
  price: number | null
  inLesson: boolean
  busy: boolean
  error: string | null
  onBuy: () => void
  onDecline: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && !inLesson && onDecline()}>
      <DialogContent hideClose={inLesson}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 fill-current text-destructive" aria-hidden />
            {inLesson ? 'Acabaram as vidas' : 'Comprar vida'}
          </DialogTitle>
          <DialogDescription>
            {price === null
              ? 'Sem mais vidas pra comprar hoje.'
              : inLesson
                ? `Comprar vida por ${fmtMurchos(price)} murchos e continuar?`
                : `Comprar 1 vida por ${fmtMurchos(price)} murchos? Vale pra qualquer língua, só hoje.`}
          </DialogDescription>
        </DialogHeader>

        {inLesson && (
          <p className="mt-3 text-xs text-muted-foreground">
            Desistindo, a lição falha e você leva o XP dos acertos até aqui.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="mt-5">
          <Button variant={inLesson ? 'destructive' : 'ghost'} onClick={onDecline} disabled={busy}>
            {inLesson ? (price === null ? 'Encerrar lição' : 'Desistir') : 'Agora não'}
          </Button>
          {price !== null && (
            <Button onClick={onBuy} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
              Comprar ({fmtMurchos(price)})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
