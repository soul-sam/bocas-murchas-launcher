import * as React from 'react'
import { Coins, Loader2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Hint } from '@/components/ui/tooltip'
import { messages as messagesApi, type ChatMessage, type MessageTip } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useGamification } from '@/lib/gamification-context'
import { cn } from '@/lib/utils'

/**
 * GORJETA — murchos de quem leu pra quem escreveu.
 *
 * ## Por que isso não é só mais uma reação
 *
 * Reação é grátis, então ela diz "vi". Gorjeta sai do SEU bolso, então ela
 * diz "isso valeu alguma coisa". É a diferença entre aplaudir e pagar
 * ingresso, e é ela que faz o murcho parar de ser um placar pessoal: até
 * hoje a moeda só comprava coisa pra si mesmo, e moeda que não circula entre
 * pessoas nunca vira economia.
 *
 * ## Uma por pessoa por mensagem
 *
 * O servidor barra a segunda. Sem esse limite o chip vira um ranking de quem
 * tem mais murcho, e "três pessoas acharam isso bom" — que é a informação
 * interessante — se perde no meio de um número grande.
 */

/**
 * Os valores foram escolhidos pela FRASE que cada um significa, não por
 * escala: 10 é um "boa", 50 é "essa foi boa mesmo", 200 é evento. Campo livre
 * transformaria um gesto de um clique numa decisão.
 */
const AMOUNTS: Array<{ value: number; label: string }> = [
  { value: 10, label: 'boa' },
  { value: 50, label: 'essa foi boa' },
  { value: 200, label: 'chorei' }
]

/** Cards que o servidor escreveu não recebem gorjeta (o autor é um admin). */
const UNTIPPABLE = new Set(['recap', 'dayrecap', 'memory', 'system'])

export function canTip(message: ChatMessage, myId: string | undefined): boolean {
  if (!myId) return false
  if (message.author.id === myId) return false
  return !UNTIPPABLE.has(message.type)
}

export function TipButton({
  message,
  onTipped,
  className
}: {
  message: ChatMessage
  onTipped: (tips: MessageTip[]) => void
  className?: string
}) {
  const { token, user } = useAuth()
  const { profile } = useGamification()

  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const coins = profile?.coins ?? 0
  const already = (message.tips ?? []).some((t) => t.from.id === user?.id)

  const send = async (amount: number): Promise<void> => {
    if (!token || busy) return
    setBusy(true)
    setError(null)
    try {
      onTipped(await messagesApi.tip(token, message.id, amount))
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu')
    } finally {
      setBusy(false)
    }
  }

  if (already) {
    return (
      <Hint label="Você já deu gorjeta nessa" side="top">
        <span className={cn('flex items-center justify-center p-1.5 text-acid', className)}>
          <Coins className="h-3.5 w-3.5" />
        </span>
      </Hint>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Hint label="Dar gorjeta" description="murchos seus pra quem escreveu" side="top">
          <button type="button" aria-label="Dar gorjeta" className={className}>
            <Coins className="h-3.5 w-3.5" />
          </button>
        </Hint>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <p className="mb-1.5 text-[11.5px] text-muted-foreground">
          Você tem <span className="text-foreground">{coins.toLocaleString('pt-BR')}</span> murchos
        </p>
        <div className="space-y-1">
          {AMOUNTS.map((option) => {
            const broke = coins < option.value
            return (
              <button
                key={option.value}
                type="button"
                disabled={busy || broke}
                onClick={() => void send(option.value)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-brutal border-2 px-2 py-1.5 text-left transition-colors',
                  broke
                    ? 'cursor-not-allowed border-line text-muted-foreground opacity-60'
                    : 'border-line hover:border-acid/60 hover:bg-acid/10'
                )}
              >
                <span className="font-mono text-sm text-acid">{option.value}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {option.label}
                </span>
                {busy && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
              </button>
            )
          })}
        </div>
        {error && <p className="mt-1.5 text-[11.5px] text-destructive">{error}</p>}
      </PopoverContent>
    </Popover>
  )
}

/**
 * O chip embaixo da mensagem.
 *
 * Mostra o TOTAL e quem deu — a lista de nomes é o que faz a gorjeta ser um
 * gesto social e não um número. Some quando ninguém deu nada: um "0 murchos"
 * em toda mensagem seria uma cobrança silenciosa.
 */
export function TipChip({ tips }: { tips: MessageTip[] | undefined }) {
  if (!tips || tips.length === 0) return null

  const total = tips.reduce((sum, tip) => sum + tip.amount, 0)
  const quem = tips.map((t) => `${t.from.displayName} (${t.amount})`).join(', ')

  return (
    <Hint label={tips.length === 1 ? 'Uma gorjeta' : `${tips.length} gorjetas`} description={quem} side="top">
      <span className="flex items-center gap-1 rounded-brutal border border-acid/50 bg-acid/10 px-1.5 py-0.5 text-acid">
        <Coins className="h-3 w-3" />
        <span className="font-mono text-[11.5px]">{total.toLocaleString('pt-BR')}</span>
        {tips.length > 1 && (
          <span className="text-[11px] text-muted-foreground">×{tips.length}</span>
        )}
      </span>
    </Hint>
  )
}
