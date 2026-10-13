import * as React from 'react'
import { BellRing, Loader2, Smartphone, X } from 'lucide-react'
import { PendenciaCard } from './PendenciaCard'
import { useAuth } from '@/lib/auth-context'
import { useLayout } from '@/lib/layout-context'
import { usePendencias } from '@/lib/pendencias-context'
import { isWeb } from '@/lib/platform'
import { detectPushSupport, getCurrentSubscription, subscribeToPush } from '@/lib/push'

/**
 * PENDÊNCIAS — coluna da direita: tudo que o grupo espera de mim, com o
 * botão de responder em cada um. Ver lib/pendencias-context.
 */
export function PendenciasPanel() {
  const { closePendencias: close } = useLayout()
  const { items, loading } = usePendencias()

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-void xl:w-80">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <BellRing className="h-3.5 w-3.5 shrink-0 text-acid" aria-hidden />
        <h3 className="flex-1 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
          Pendências{items.length > 0 && ` · ${items.length}`}
        </h3>
        <button
          type="button"
          onClick={close}
          aria-label="Fechar"
          className="rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="scroll-stable flex-1 space-y-2 overflow-y-auto p-3">
        {loading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-sm text-muted-foreground">Nada esperando você.</p>
            <p className="text-[11.5px] text-muted-foreground">
              Agenda, enquete e clipe novos aparecem aqui até você responder.
            </p>
          </div>
        ) : (
          items.map((item) => <PendenciaCard key={item.id} item={item} />)
        )}

        <AvisoNoCelular />
      </div>
    </aside>
  )
}

/**
 * Ninguém tinha o push do celular ligado (censo de 13/10: 0 de 11). Com o
 * launcher fechado, é o único jeito de a pendência chegar — então o convite
 * mora aqui, onde a pessoa está justamente olhando o que perdeu.
 *
 * No site: o botão liga o push deste aparelho na hora. No launcher: diz como.
 */
function AvisoNoCelular() {
  const { token } = useAuth()
  const web = isWeb()
  const [estado, setEstado] = React.useState<'checando' | 'oferecer' | 'ligado' | 'sem-suporte'>(
    web ? 'checando' : 'oferecer'
  )
  const [erro, setErro] = React.useState<string | null>(null)
  const [ligando, setLigando] = React.useState(false)

  React.useEffect(() => {
    if (!web) return
    if (detectPushSupport() !== 'ok') {
      setEstado('sem-suporte')
      return
    }
    let vivo = true
    getCurrentSubscription()
      .then((sub) => vivo && setEstado(sub ? 'ligado' : 'oferecer'))
      .catch(() => vivo && setEstado('oferecer'))
    return () => {
      vivo = false
    }
  }, [web])

  if (estado === 'checando' || estado === 'ligado' || estado === 'sem-suporte') return null

  const ligar = async (): Promise<void> => {
    if (!token || ligando) return
    setLigando(true)
    setErro(null)
    try {
      await subscribeToPush(token)
      setEstado('ligado')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não deu pra ligar os avisos')
    } finally {
      setLigando(false)
    }
  }

  return (
    <div className="mt-2 rounded-brutal border border-dashed border-line px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Smartphone className="h-3.5 w-3.5 shrink-0 text-acid" aria-hidden />
        Avisos no celular
      </p>
      {web ? (
        <>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Com o launcher fechado, é o celular que te lembra da agenda e da enquete.
          </p>
          <button
            type="button"
            disabled={ligando}
            onClick={() => void ligar()}
            className="btn-acid mt-2 w-full rounded-brutal px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {ligando ? 'ligando…' : 'ligar avisos neste aparelho'}
          </button>
          {erro && <p className="mt-1.5 text-[11.5px] text-destructive">{erro}</p>}
        </>
      ) : (
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          Com o launcher fechado, quem te lembra é o celular: abre bocasmurchas.com.br nele, entra
          na sua conta e toca em "ligar avisos" neste mesmo painel.
        </p>
      )}
    </div>
  )
}
