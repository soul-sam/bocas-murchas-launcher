import * as React from 'react'
import { HandCoins, Server, X } from 'lucide-react'
import { formatBRL } from '@/lib/api-costs'
import { useCosts } from '@/lib/costs-context'
import { useOverlays } from '@/lib/overlay-context'

/**
 * A FAIXA DA CONTA — o número na cara de todo mundo, uma vez por sessão.
 *
 * Aparece no topo pra quem ainda não marcou "paguei" no mês. Some ao marcar,
 * e volta sozinha quando o mês vira (o resumo é recarregado de hora em hora —
 * ver lib/costs-context).
 *
 * ## Por que ela pode ser dispensada, e por que só até fechar o launcher
 *
 * Um aviso que não fecha vira paisagem: em dois dias ninguém mais lê, e o
 * espaço fica ocupado à toa. Um aviso que fecha PRA SEMPRE com um clique some
 * no primeiro dia e nunca mais cobra nada. O meio termo é dispensar pela
 * sessão: quem está no meio de uma call tira da frente agora, e na próxima vez
 * que abrir o launcher a conta está lá de novo. O estado é de memória de
 * propósito — nada em disco.
 *
 * O botão "já paguei" está AQUI, e não só dentro da tela de detalhe, porque
 * quem já pagou não deveria precisar abrir nada pra tirar a cobrança da
 * frente.
 *
 * Mora em GlobalOverlays pelo mesmo motivo do DropHost: precisa estar acima de
 * tudo e sobreviver à troca de aba. Camada própria, sem Radix — ver
 * lib/interaction-guard.ts.
 */
export function CostShareBanner() {
  const { summary, ready } = useCosts()
  const { openCosts, costsOpen } = useOverlays()
  const [dismissed, setDismissed] = React.useState(false)

  // Virou o mês (ou alguém desmarcou o "paguei"): a faixa volta, mesmo que
  // tenha sido dispensada no mês passado com o launcher aberto desde então.
  const month = summary?.month
  React.useEffect(() => setDismissed(false), [month])

  // Com a tela de detalhe aberta a faixa sai de cena: é a mesma informação
  // duas vezes, e a faixa flutua por cima de tudo — ela estava tapando o
  // título e o X da própria tela que ela manda abrir.
  if (!ready || !summary || summary.iPaid || dismissed || costsOpen) return null

  return (
    // z-40: ABAIXO das camadas modais (z-50). Um aviso que fica por cima de
    // uma modal é um aviso que impede de ler o que ele mesmo pediu pra abrir.
    <div className="pointer-events-none fixed inset-x-0 top-12 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-2xl items-center gap-3 rounded-brutal border border-burn/50 bg-void/95 px-3 py-2 shadow-glow-burn backdrop-blur-sm">
        <Server className="h-4 w-4 shrink-0 text-burn" />

        <p className="min-w-0 flex-1 text-xs leading-snug text-foreground">
          Manter o Bocas Murchas no ar custa{' '}
          <span className="font-mono text-burn">{formatBRL(summary.totalCents)}</span> por mês.
          Somos {summary.activeUsers} usando — dá{' '}
          <span className="font-mono text-burn">{formatBRL(summary.shareCents)}</span> pra cada.
        </p>

        <button
          type="button"
          onClick={openCosts}
          className="shrink-0 rounded-brutal border border-burn/60 bg-burn/15 px-2.5 py-1 text-xs text-burn transition-colors hover:bg-burn/25"
        >
          Como ajudar
        </button>

        <button
          type="button"
          onClick={openCosts}
          title="Marcar que já paguei"
          aria-label="Marcar que já paguei"
          className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <HandCoins className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          title="Esconder até reabrir o launcher"
          aria-label="Esconder até reabrir o launcher"
          className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
