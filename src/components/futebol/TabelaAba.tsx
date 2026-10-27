import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { useFutebol } from '@/lib/futebol-context'
import { futebol, zonaDe, type Artilheiro, type GrupoTabela, type Liga, type Zona } from '@/lib/api-futebol'
import { cn } from '@/lib/utils'
import { Escudo } from './FutebolGlyphs'
import { Chips, Secao } from './comum'

/**
 * A TABELA da competição escolhida, com as zonas pintadas na borda e, em cada
 * time, a carinha de quem do grupo torce pra ele — a tabela do Brasileirão é
 * a mesma de qualquer site; a de quem secar é só nossa. Embaixo, artilharia e
 * assistências.
 */

const TOM_FAIXA: Record<Zona['tom'], string> = {
  acid: 'bg-acid',
  burn: 'bg-burn',
  destructive: 'bg-destructive',
  muted: 'bg-line-strong'
}

export function TabelaAba({ ligas }: { ligas: Liga[] }) {
  const { token } = useAuth()
  const comTabela = ligas.filter((l) => l.tabela)
  const [liga, setLiga] = React.useState('bra.1')
  const [dados, setDados] = React.useState<{ grupos: GrupoTabela[]; zonas: Zona[] } | null>(null)
  const [destaques, setDestaques] = React.useState<{ gols: Artilheiro[]; assistencias: Artilheiro[] } | null>(null)
  const [erro, setErro] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!token) return
    let vivo = true
    setDados(null)
    setDestaques(null)
    setErro(null)
    futebol
      .tabela(token, liga)
      .then((d) => vivo && setDados(d))
      .catch(() => vivo && setErro('Sem tabela agora.'))
    futebol
      .destaques(token, liga)
      .then((d) => vivo && setDestaques(d))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [token, liga])

  return (
    <div className="flex flex-col gap-5">
      <Chips
        opcoes={comTabela.map((l) => ({ id: l.slug, nome: l.curto }))}
        atual={liga}
        onChange={setLiga}
        rotulo="Competição"
      />

      {!dados && !erro && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {erro && <p className="py-6 text-center text-sm text-muted-foreground">{erro}</p>}
      {dados && dados.grupos.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">Essa competição ainda não tem tabela.</p>
      )}
      {dados?.grupos.map((g, i) => <Tabela key={g.nome ?? i} grupo={g} zonas={dados.zonas} />)}
      {dados && dados.zonas.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {dados.zonas.map((z) => (
            <li key={z.nome} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <span className={cn('h-2.5 w-1 rounded-full', TOM_FAIXA[z.tom])} aria-hidden />
              {z.nome}
            </li>
          ))}
        </ul>
      )}

      {destaques && (destaques.gols.length > 0 || destaques.assistencias.length > 0) && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Destaque titulo="Artilharia" lista={destaques.gols} unidade="gols" />
          <Destaque titulo="Assistências" lista={destaques.assistencias} unidade="assist." />
        </div>
      )}
    </div>
  )
}

/** `compacta`: só P, J e SG — os 12 grupos da Copa lado a lado não cabem com as 9 colunas. */
export function Tabela({ grupo, zonas, compacta }: { grupo: GrupoTabela; zonas: Zona[]; compacta?: boolean }) {
  const { torcidas, meuTime } = useFutebol()
  const { byId } = useMembers()
  const fas = React.useMemo(() => {
    const por: Record<string, string[]> = {}
    for (const t of Object.values(torcidas)) (por[t.teamId] ??= []).push(t.userId)
    return por
  }, [torcidas])

  return (
    <section>
      {grupo.nome && <Secao>{grupo.nome}</Secao>}
      <div className="overflow-hidden rounded-brutal border border-line">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-void-light/40 text-[11.5px] text-muted-foreground">
              <th className="w-8 py-1.5 pl-2 text-left font-normal">#</th>
              <th className="py-1.5 text-left font-normal">Time</th>
              <th className="w-9 py-1.5 text-center font-normal text-foreground">P</th>
              <th className="w-8 py-1.5 text-center font-normal">J</th>
              {!compacta && (
                <>
                  <th className="hidden w-8 py-1.5 text-center font-normal sm:table-cell">V</th>
                  <th className="hidden w-8 py-1.5 text-center font-normal sm:table-cell">E</th>
                  <th className="hidden w-8 py-1.5 text-center font-normal sm:table-cell">D</th>
                  <th className="hidden w-10 py-1.5 text-center font-normal md:table-cell">GP</th>
                </>
              )}
              <th className="w-10 py-1.5 pr-2 text-center font-normal">SG</th>
            </tr>
          </thead>
          <tbody>
            {grupo.linhas.map((l) => {
              const zona = zonaDe(l.posicao, zonas)
              const meu = meuTime?.teamId === l.time.id
              const deles = fas[l.time.id] ?? []
              return (
                <tr
                  key={l.time.id}
                  className={cn('border-b border-line/60 last:border-0', meu && 'bg-acid/5')}
                >
                  <td className="relative py-1.5 pl-2 font-mono text-[11.5px] text-muted-foreground">
                    {zona && (
                      <span className={cn('absolute inset-y-1 left-0 w-1 rounded-r', TOM_FAIXA[zona.tom])} aria-hidden />
                    )}
                    {l.posicao}
                  </td>
                  <td className="py-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <Escudo src={l.time.escudo} sigla={l.time.sigla} cor={l.time.cor} className="h-5 w-5" />
                      <span className={cn('truncate', meu ? 'text-acid' : 'text-foreground')}>{l.time.curto}</span>
                      {deles.length > 0 && (
                        <span className="flex shrink-0 -space-x-1.5" title={deles.map((u) => byId[u]?.displayName).filter(Boolean).join(', ')}>
                          {deles.slice(0, 3).map((u) => (
                            <UserAvatar
                              key={u}
                              userId={u}
                              src={resolveAssetUrl(byId[u]?.avatar)}
                              name={byId[u]?.displayName ?? '?'}
                              className="h-4 w-4 border border-void"
                            />
                          ))}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 text-center font-mono tabular-nums text-foreground">{l.pontos}</td>
                  <td className="py-1.5 text-center font-mono tabular-nums text-muted-foreground">{l.jogos}</td>
                  {!compacta && (
                    <>
                      <td className="hidden py-1.5 text-center font-mono tabular-nums text-muted-foreground sm:table-cell">{l.vitorias}</td>
                      <td className="hidden py-1.5 text-center font-mono tabular-nums text-muted-foreground sm:table-cell">{l.empates}</td>
                      <td className="hidden py-1.5 text-center font-mono tabular-nums text-muted-foreground sm:table-cell">{l.derrotas}</td>
                      <td className="hidden py-1.5 text-center font-mono tabular-nums text-muted-foreground md:table-cell">{l.golsPro}</td>
                    </>
                  )}
                  <td className="py-1.5 pr-2 text-center font-mono tabular-nums text-muted-foreground">
                    {l.saldo > 0 ? `+${l.saldo}` : l.saldo}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function Destaque({ titulo, lista, unidade }: { titulo: string; lista: Artilheiro[]; unidade: string }) {
  if (lista.length === 0) return null
  return (
    <section>
      <Secao>{titulo}</Secao>
      <ol className="flex flex-col gap-1">
        {lista.slice(0, 10).map((a, i) => (
          <li key={`${a.nome}-${i}`} className="flex items-center gap-2.5 rounded-brutal px-2 py-1">
            <span className="w-5 shrink-0 text-right font-mono text-[11.5px] text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{a.nome}</span>
            {a.time && <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">{a.time}</span>}
            <span className="w-20 shrink-0 whitespace-nowrap text-right font-mono text-sm tabular-nums text-acid-text">
              {a.gols} <span className="text-[11px] text-muted-foreground">{unidade}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
