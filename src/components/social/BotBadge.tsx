import { Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Selo do Bocas Bot ao lado do nome.
 *
 * Existe pelo mesmo motivo da conta do bot: o recap das 23h e o anúncio de
 * manutenção saíam com a cara do Samu, e ninguém sabia se era ele falando.
 * Com o selo, "quem fala aqui é o robô" fica óbvio antes de ler.
 */
export function BotBadge({ className }: { className?: string }) {
  return (
    <span
      title="Bot do servidor — chame com @bocasbot"
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-sm bg-acid/15 px-1 text-[11px] font-semibold leading-4 text-acid-text',
        className
      )}
    >
      <Bot className="h-3 w-3" aria-hidden />
      BOT
    </span>
  )
}
