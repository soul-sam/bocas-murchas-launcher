import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import {
  PONTOS,
  dataCurta,
  futebol,
  type LinhaRanking,
  type PalpiteComJogo,
  type Periodo
} from '@/lib/api-futebol'
import { cn } from '@/lib/utils'
import { Escudo } from './FutebolGlyphs'
import { pontosTom } from './JogoLinha'
import { Chips, Secao, Vazio } from './comum'

/**
 * O BOLÃO: quem mais pontua palpitando placar (semana, mês, desde sempre) e o
 * meu histórico. Vale ponto e XP, nunca murcho.
 */

const PERIODOS: Array<{ id: Periodo; nome: string }> = [
  { id: 'semana', nome: 'Semana' },
  { id: 'mes', nome: 'Mês' },
  { id: 'geral', nome: 'Desde sempre' }
]

export function PalpitesAba() {
  const { token, user } = useAuth()
  const { byId } = useMembers()
  const [periodo, setPeriodo] = React.useState<Periodo>('semana')
  const [linhas, setLinhas] = React.useState<LinhaRanking[] | null>(null)
  const [meus, setMeus] = React.useState<PalpiteComJogo[] | null>(null)

  React.useEffect(() => {
    if (!token) return
    let vivo = true
    setLinhas(null)
    futebol
      .ranking(token, periodo)
      .then((l) => vivo && setLinhas(l))
      .catch(() => vivo && setLinhas([]))
    return () => {
      vivo = false
    }
  }, [token, periodo])

  React.useEffect(() => {
    if (!token) return
    futebol
      .meusPalpites(token)
      .then(setMeus)
      .catch(() => setMeus([]))
  }, [token])

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Secao>Ranking do bolão</Secao>
        <Chips opcoes={PERIODOS} atual={periodo} onChange={setPeriodo} rotulo="Período" />
        {!linhas ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : linhas.length === 0 ? (
          <Vazio>Nenhum palpite conferido nesse período. Palpita na aba Jogos.</Vazio>
        ) : (
          <ol className="mt-2 flex flex-col gap-1">
            {linhas.map((l, i) => {
              const m = byId[l.userId]
              const eu = l.userId === user?.id
              return (
                <li
                  key={l.userId}
                  className={cn(
                    'flex items-center gap-3 rounded-brutal border px-3 py-2',
                    eu ? 'border-acid-dark bg-acid/5' : 'border-transparent'
                  )}
                >
                  <span
                    className={cn(
                      'w-5 shrink-0 text-right font-mono text-sm',
                      i === 0 ? 'text-burn' : i < 3 ? 'text-acid-text' : 'text-muted-foreground'
                    )}
                  >
                    {i + 1}
                  </span>
                  <UserAvatar
                    userId={l.userId}
                    src={resolveAssetUrl(m?.avatar)}
                    name={m?.displayName ?? '?'}
                    ringColor={m?.profileColor ?? undefined}
                    frame={m?.avatarFrame}
                    frameColor={m?.profileColor}
                    className="h-8 w-8"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{m?.displayName ?? 'Alguém'}</p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {l.exatos} {l.exatos === 1 ? 'cravada' : 'cravadas'} · acertou {l.acertos} de {l.palpites}
                    </p>
                  </div>
                  <span className="shrink-0 font-display text-2xl leading-none text-foreground">{l.pontos}</span>
                </li>
              )
            })}
          </ol>
        )}
        <p className="mt-3 text-[11.5px] text-muted-foreground">
          Placar exato {PONTOS.exato} pts · vencedor (ou empate) com o saldo certo {PONTOS.saldo} · só o vencedor{' '}
          {PONTOS.resultado}. Desempata quem cravou mais. Cada palpite conferido dá XP.
        </p>
      </section>

      <section>
        <Secao>Meus palpites</Secao>
        {!meus ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : meus.length === 0 ? (
          <Vazio>Você ainda não palpitou.</Vazio>
        ) : (
          <ul className="flex flex-col gap-1">
            {meus.map((p) => (
              <li key={p.jogoId} className="flex items-center gap-2 rounded-brutal border border-line bg-void/60 px-3 py-2">
                <span className="w-16 shrink-0 text-[11.5px] text-muted-foreground">{dataCurta(p.inicio)}</span>
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <Escudo src={p.casa.escudo} sigla={p.casa.sigla} className="h-4 w-4" />
                  <span className="truncate text-sm text-foreground">{p.casa.nome}</span>
                  <span className="shrink-0 font-mono text-sm text-foreground">
                    {p.casa.gols !== null && p.estado !== 'pre' ? `${p.casa.gols} x ${p.fora.gols}` : 'x'}
                  </span>
                  <span className="truncate text-sm text-foreground">{p.fora.nome}</span>
                  <Escudo src={p.fora.escudo} sigla={p.fora.sigla} className="h-4 w-4" />
                </div>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {p.home} x {p.away}
                </span>
                <span
                  className={cn(
                    'w-12 shrink-0 rounded-brutal border px-1 py-0.5 text-center font-mono text-[11.5px]',
                    p.points !== null ? pontosTom(p.points) : 'border-line text-muted-foreground'
                  )}
                >
                  {p.cancelado ? 'anul.' : p.points !== null ? `+${p.points}` : 'aberto'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
