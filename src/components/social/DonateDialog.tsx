import * as React from 'react'
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
import { MurchosIcon } from '@/lib/bocas-icons'
import { DONATION_MAX } from '@/lib/api-gamification'
import { useGamification } from '@/lib/gamification-context'
import { cn } from '@/lib/utils'

const QUICK = [50, 100, 500, 1000, DONATION_MAX]

const fmt = (n: number): string => n.toLocaleString('pt-BR')

/**
 * Doar murchos pra alguém — aberto pelo "Doar Murchos" do botão direito.
 *
 * O teto é o menor entre DONATION_MAX e o meu saldo: oferecer 5.000 pra quem
 * tem 300 só serviria pra o servidor dizer "faltam murchos" depois do clique.
 */
export function DonateDialog({
  target,
  onClose
}: {
  target: { id: string; displayName: string } | null
  onClose: () => void
}) {
  const { profile, donate, pushToast } = useGamification()
  const [amount, setAmount] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!target) return
    setAmount('')
    setError(null)
  }, [target])

  const coins = profile?.coins ?? 0
  const cap = Math.min(DONATION_MAX, coins)
  const value = Number(amount)
  const valid = Number.isInteger(value) && value >= 1 && value <= cap

  const submit = async (): Promise<void> => {
    if (!target || !valid || sending) return
    setSending(true)
    setError(null)
    try {
      await donate(target.id, value)
      pushToast({ kind: 'gift', title: `🪙 Você doou ${fmt(value)} murchos pra ${target.displayName}` })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra doar')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(next) => !next && !sending && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Doar murchos</DialogTitle>
          <DialogDescription>
            Pra {target?.displayName ?? 'alguém'} — até {fmt(DONATION_MAX)} por vez. Você tem {fmt(coins)}.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="flex flex-col gap-3"
        >
          <div className="relative">
            <MurchosIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              inputMode="numeric"
              placeholder="Quantos murchos?"
              value={amount}
              onChange={(e) => {
                // Só dígitos, e nunca acima do teto: digitar 9999 vira o teto na hora.
                const digits = e.target.value.replace(/\D/g, '').slice(0, 5)
                setAmount(digits === '' ? '' : String(Math.min(Number(digits), Math.max(cap, 1))))
                setError(null)
              }}
              className="pl-9 font-mono"
              aria-label="Quantidade de murchos"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((n) => (
              <button
                key={n}
                type="button"
                disabled={n > cap}
                onClick={() => {
                  setAmount(String(n))
                  setError(null)
                }}
                className={cn(
                  'rounded-brutal border border-border px-2.5 py-1 font-mono text-[11.5px] transition-colors',
                  'hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40',
                  value === n ? 'border-primary text-foreground' : 'text-muted-foreground'
                )}
              >
                {n === DONATION_MAX ? `${fmt(n)} (máx.)` : fmt(n)}
              </button>
            ))}
          </div>

          {coins < 1 && <p className="text-[11.5px] text-destructive">Você está sem murchos pra doar.</p>}
          {error && <p className="text-[11.5px] text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={sending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || sending}>
              <MurchosIcon className="mr-1.5 h-4 w-4" />
              {sending ? 'Doando…' : valid ? `Doar ${fmt(value)}` : 'Doar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
