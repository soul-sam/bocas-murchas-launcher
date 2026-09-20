import * as React from 'react'
import { Unlock } from 'lucide-react'
import { UNSTUCK_EVENT } from '@/lib/interaction-guard'
import { NaFila } from '@/components/ui/filas'

/**
 * Aviso de que a interface travou e foi destravada sozinha.
 *
 * Nao e enfeite: sem ele o conserto e invisivel e ninguem consegue dizer se o
 * problema ainda acontece. Se este aviso aparecer, e sinal de que uma camada
 * modal vazou de novo e vale investigar o que estava aberto na hora.
 */
export function InterfaceGuardNotice() {
  const [message, setMessage] = React.useState<string | null>(null)

  React.useEffect(() => {
    const handle = (event: Event): void => {
      const detail = (event as CustomEvent<{ reason: string; noop?: boolean }>).detail
      setMessage(
        detail?.noop
          ? 'A interface já estava respondendo'
          : 'A interface travou e foi destravada'
      )
    }

    window.addEventListener(UNSTUCK_EVENT, handle)
    return () => window.removeEventListener(UNSTUCK_EVENT, handle)
  }, [])

  React.useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 5_000)
    return () => clearTimeout(timer)
  }, [message])

  if (!message) return null

  return (
    // SUBIU PRO TOPO, E PRA DENTRO DA FILA. Ficava em `bottom-4 left-1/2`, a
    // 8px do botão de voltar do nudge (`bottom-6 left-1/2`) — dois avisos no
    // mesmo ponto, e os dois aparecem justamente quando algo deu errado.
    // Na fila urgente ele fica por cima de diálogo (que é quando a interface
    // trava) e empilha com os drops em vez de cobri-los. `ordem` 0: primeiro
    // da coluna, porque é o único que fala do app em si.
    <NaFila fila="topo-urgente" ordem={0} className="pointer-events-none">
      <div className="flex items-center gap-2 rounded-brutal border-2 border-acid-dark bg-void px-3 py-1.5 shadow-[0_0_24px_rgb(var(--neon-rgb)/0.2)]">
        <Unlock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[11.5px] text-dirty-white">
          {message}
        </span>
      </div>
    </NaFila>
  )
}
