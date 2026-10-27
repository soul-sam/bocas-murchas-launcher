import * as React from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { futebol, type Liga, type Noticia } from '@/lib/api-futebol'
import { Chips, Vazio } from './comum'

/** Manchetes da ESPN Brasil por competição. O link abre no navegador. */

const DE_NOTICIA = ['bra.1', 'bra.2', 'bra.copa_do_brazil', 'conmebol.libertadores', 'conmebol.sudamericana']

function quando(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d)
}

export function NoticiasAba({ ligas }: { ligas: Liga[] }) {
  const { token } = useAuth()
  const opcoes = ligas.filter((l) => DE_NOTICIA.includes(l.slug)).map((l) => ({ id: l.slug, nome: l.curto }))
  const [liga, setLiga] = React.useState('bra.1')
  const [noticias, setNoticias] = React.useState<Noticia[] | null>(null)

  React.useEffect(() => {
    if (!token) return
    let vivo = true
    setNoticias(null)
    futebol
      .noticias(token, liga)
      .then((n) => vivo && setNoticias(n))
      .catch(() => vivo && setNoticias([]))
    return () => {
      vivo = false
    }
  }, [token, liga])

  return (
    <div className="flex flex-col gap-4">
      <Chips opcoes={opcoes} atual={liga} onChange={setLiga} rotulo="Competição" />
      {!noticias ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : noticias.length === 0 ? (
        <Vazio>Sem notícias agora.</Vazio>
      ) : (
        <ul className="flex flex-col gap-2">
          {noticias.map((n, i) => (
            <li key={`${n.titulo}-${i}`}>
              <button
                type="button"
                disabled={!n.link}
                onClick={() => n.link && void window.bocas.shell.openExternal(n.link)}
                className="group flex w-full gap-3 rounded-brutal border border-line bg-void/60 p-2.5 text-left transition-colors hover:border-acid-dark disabled:cursor-default"
              >
                {n.imagem && (
                  <img
                    src={n.imagem}
                    alt=""
                    loading="lazy"
                    className="h-16 w-24 shrink-0 rounded-brutal object-cover sm:h-20 sm:w-32"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm text-foreground group-hover:text-acid">{n.titulo}</p>
                  {n.resumo && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.resumo}</p>}
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                    ESPN · {quando(n.publicadaEm)}
                    {n.link && <ExternalLink className="h-3 w-3" aria-hidden />}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
