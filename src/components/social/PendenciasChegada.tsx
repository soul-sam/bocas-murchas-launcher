import { BellRing, X } from 'lucide-react'
import { NaFila } from '@/components/ui/filas'
import { PendenciaCard } from './PendenciaCard'
import { useLayout } from '@/lib/layout-context'
import { usePendencias } from '@/lib/pendencias-context'

/**
 * "ENQUANTO VOCÊ ESTAVA FORA" — cartão no canto com o que o grupo espera.
 *
 * Abre sozinho (pendencias-context) quando há pendência que a pessoa ainda
 * não viu: ao abrir o launcher, ao voltar do AFK, ou quando o servidor manda
 * lembrar ("é amanhã", "começa em 3h"). Não some com o tempo, de propósito:
 * o problema que ele resolve é justamente a pessoa não ver. Some quando ela
 * responde tudo, fecha, ou abre o painel completo.
 *
 * Mostra as duas mais urgentes já respondíveis; o resto fica a um clique.
 */
const NO_CARTAO = 2

export function PendenciasChegada() {
  const { items, chegadaAberta, fecharChegada, abrirPainel } = usePendencias()
  const { pendenciasOpen } = useLayout()

  // Com o painel aberto o cartão seria a mesma lista duas vezes.
  if (!chegadaAberta || pendenciasOpen || items.length === 0) return null

  const resto = items.length - NO_CARTAO

  return (
    // Ordem alta: é ação (responder), fica perto do canto como os convites.
    <NaFila fila="canto" ordem={29}>
      <section
        role="dialog"
        aria-label="Pendências"
        className="pointer-events-auto w-80 max-w-full overflow-hidden rounded-brutal border-2 border-acid-dark bg-void shadow-[0_0_30px_rgba(0,0,0,0.7)]"
      >
        <header className="flex items-center gap-2 border-b border-line px-3 py-1.5">
          <BellRing className="h-3.5 w-3.5 text-acid" aria-hidden />
          <span className="flex-1 text-[11.5px] text-muted-foreground">
            {items.length === 1 ? 'Uma coisa esperando você' : `${items.length} coisas esperando você`}
          </span>
          <button
            type="button"
            onClick={fecharChegada}
            aria-label="Depois"
            title="Depois (continua no sino da barra)"
            className="rounded-brutal p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </header>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-2">
          {items.slice(0, NO_CARTAO).map((item) => (
            <PendenciaCard key={item.id} item={item} compact />
          ))}
        </div>

        <footer className="flex items-center gap-2 border-t border-line px-3 py-1.5">
          <button
            type="button"
            onClick={abrirPainel}
            className="text-[11.5px] text-acid transition-colors hover:text-foreground"
          >
            {resto > 0 ? `ver todas (+${resto})` : 'abrir pendências'}
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={fecharChegada}
            className="text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            depois
          </button>
        </footer>
      </section>
    </NaFila>
  )
}
