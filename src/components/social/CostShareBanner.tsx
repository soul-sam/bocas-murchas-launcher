import * as React from 'react'
import { HandCoins, PartyPopper, Server, X } from 'lucide-react'
import { formatBRL, monthName, progressoDaConta } from '@/lib/api-costs'
import { useCosts } from '@/lib/costs-context'
import { useOverlays } from '@/lib/overlay-context'
import { NaFila } from '@/components/ui/filas'

/**
 * A FAIXA DA CONTA — o número na cara de todo mundo, uma vez por sessão.
 *
 * Aparece no topo pra quem ainda não marcou "paguei" no mês. Some ao marcar,
 * e volta sozinha quando o mês vira (o resumo é recarregado de hora em hora —
 * ver lib/costs-context).
 *
 * ## QUANTO FALTA, e não só quanto custa
 *
 * A faixa dizia o total e a cota de cada um — e nenhuma das duas responde à
 * pergunta que faz alguém abrir a carteira: falta muito? Agora ela diz o que
 * falta pra fechar o mês, e quando a conta FECHA ela troca de assunto: vira a
 * boa notícia, verde, e aparece também pra quem já pagou. Foi todo mundo que
 * fechou; todo mundo tem o direito de ver fechado.
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

  const progresso = summary ? progressoDaConta(summary) : null
  const bateu = progresso?.bateu ?? false

  // Virou o mês (ou alguém desmarcou o "paguei"): a faixa volta, mesmo que
  // tenha sido dispensada no mês passado com o launcher aberto desde então.
  // Fechar a conta também traz de volta: quem tirou a cobrança da frente de
  // manhã merece saber, à noite, que não falta mais nada.
  const month = summary?.month
  React.useEffect(() => setDismissed(false), [month, bateu])

  // Com a tela de detalhe aberta a faixa sai de cena: é a mesma informação
  // duas vezes, e a faixa flutua por cima de tudo — ela estava tapando o
  // título e o X da própria tela que ela manda abrir.
  if (!ready || !summary || !progresso || dismissed || costsOpen) return null

  // Quem já marcou não é cobrado de novo. A única faixa que ainda interessa a
  // essa pessoa é a de que a conta do mês fechou.
  if (summary.iPaid && !bateu) return null

  const esconder = (): void => setDismissed(true)

  return (
    // FILA DO TOPO comum — a que fica ABAIXO dos diálogos. Um aviso por cima
    // de uma modal é um aviso que impede de ler o que ele mesmo pediu pra
    // abrir. Ela também desce sozinha quando há drop de admin no ar, em vez
    // de dividir a mesma linha com ele (ver components/ui/filas.tsx).
    <NaFila fila="topo" className="pointer-events-none flex w-full justify-center">
      {bateu ? (
        <div className="pointer-events-auto flex w-full max-w-2xl items-center gap-3 rounded-brutal border border-acid-dark bg-void/95 px-3 py-2 shadow-glow-acid backdrop-blur-sm">
          <PartyPopper className="h-4 w-4 shrink-0 text-acid" />

          <p className="min-w-0 flex-1 text-xs leading-snug text-foreground">
            A conta de {monthName(summary.month)} está paga — {summary.contributors.length}{' '}
            {summary.contributors.length === 1 ? 'pessoa botou' : 'pessoas botaram'} a parte delas e
            fecharam os <span className="font-mono text-acid-text">{formatBRL(summary.totalCents)}</span>.
            O servidor do mês está pago.
          </p>

          <button
            type="button"
            onClick={openCosts}
            className="shrink-0 rounded-brutal border border-acid-dark bg-acid/10 px-2.5 py-1 text-xs text-acid-text transition-colors hover:bg-acid/20"
          >
            Ver quem ajudou
          </button>

          <button
            type="button"
            onClick={esconder}
            title="Esconder até reabrir o launcher"
            aria-label="Esconder até reabrir o launcher"
            className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="pointer-events-auto flex w-full max-w-2xl items-center gap-3 rounded-brutal border border-burn/50 bg-void/95 px-3 py-2 shadow-glow-burn backdrop-blur-sm">
          <Server className="h-4 w-4 shrink-0 text-burn" />

          <p className="min-w-0 flex-1 text-xs leading-snug text-foreground">
            Faltam <span className="font-mono text-burn">{formatBRL(progresso.faltaCents)}</span> pra
            fechar a conta de {monthName(summary.month)} —{' '}
            <span className="font-mono">{formatBRL(progresso.pagoCents)}</span> de{' '}
            <span className="font-mono">{formatBRL(summary.totalCents)}</span> já entraram. A sua
            parte é <span className="font-mono text-burn">{formatBRL(summary.shareCents)}</span>.
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
            onClick={esconder}
            title="Esconder até reabrir o launcher"
            aria-label="Esconder até reabrir o launcher"
            className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </NaFila>
  )
}
