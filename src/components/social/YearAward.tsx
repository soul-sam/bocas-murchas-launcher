import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { CrownIcon } from '@/lib/bocas-icons'
import { bankApi, type YearAwardView } from '@/lib/api-bank'
import { formatCompact } from '@/lib/api-gamification'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { cn } from '@/lib/utils'

/**
 * PRÊMIO DO ANO — os principais do recap, pagos do Fundo do Ano.
 *
 * Cada prêmio semanal do recap vale um ponto; feeder e falido são piada e
 * não pontuam (viram o "Murcho do Ano", que leva só badge). Os três primeiros
 * levam 50/30/20 do que o Fundo do Ano tiver quando o ano fechar — nada é
 * impresso, por isso a prévia anda junto com o fundo.
 *
 * Mora no painel de Recap, abaixo da semana: é a mesma conta em escala maior.
 */

const fmt = (n: number): string => n.toLocaleString('pt-BR')

export function YearAward() {
  const { token } = useAuth()
  const { byId } = useMembers()
  // undefined = buscando · null = falhou (servidor antigo também cai aqui)
  const [award, setAward] = React.useState<YearAwardView | null | undefined>(undefined)

  React.useEffect(() => {
    if (!token) return
    let cancelled = false
    void bankApi
      .yearAward(token)
      .then((view) => {
        if (!cancelled) setAward(view)
      })
      .catch(() => {
        if (!cancelled) setAward(null)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (award === null) return null
  if (award === undefined) {
    return (
      <p className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> buscando o prêmio do ano
      </p>
    )
  }

  const nameOf = (userId: string, fallback: string): string => byId[userId]?.displayName ?? fallback
  const scorers = award.standings.filter((s) => s.points > 0)
  const top = scorers.slice(0, 5)
  const murcho = [...award.standings].filter((s) => s.joke > 0).sort((a, b) => b.joke - a.joke)[0]
  const closes = new Date(award.closesAt)
  const closesLabel = closes.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

  return (
    <section className="rounded-brutal border border-burn/40 bg-burn/[0.05] p-3">
      <h4 className="flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        <CrownIcon className="h-3.5 w-3.5 text-burn" aria-hidden />
        Prêmio do Ano {award.year}
      </h4>

      {award.result ? (
        <>
          <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">
            Pago: <span className="font-mono text-foreground">{fmt(award.result.paid)}</span> murchos do Fundo do Ano.
          </p>
          <ol className="mt-2 space-y-1">
            {award.result.winners.map((w) => (
              <li key={w.userId} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-foreground">
                  <span className="font-mono text-muted-foreground">{w.place}º</span> {nameOf(w.userId, w.displayName)}
                </span>
                <span className="shrink-0 font-mono text-burn">+{formatCompact(w.prize)}</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <p className="font-mono text-2xl leading-none tabular-nums text-burn">{fmt(award.fund)}</p>
            <span className="text-xs text-muted-foreground">no fundo agora</span>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">
            Os três que mais ganharam prêmio no recap levam 50/30/20 do fundo. Sai em {closesLabel}, com o recap da última
            semana do ano.
          </p>

          {top.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">Ninguém pontuou ainda neste ano.</p>
          ) : (
            <ol className="mt-2 divide-y divide-line rounded-brutal border border-line bg-void/60">
              {top.map((s, i) => (
                <li key={s.userId} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
                  <span className="min-w-0 truncate text-foreground">
                    <span className="font-mono text-muted-foreground">{i + 1}º</span> {nameOf(s.userId, s.displayName)}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 font-mono">
                    <span className="text-muted-foreground" title="Prêmios semanais no recap">
                      {s.points} pts
                    </span>
                    {award.preview[i] != null && (
                      <span className={cn(i === 0 ? 'text-burn' : 'text-foreground/80')} title="Se o ano fechasse hoje">
                        {formatCompact(award.preview[i])}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {murcho && !award.result && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Murcho do Ano até agora: <span className="text-foreground">{nameOf(murcho.userId, murcho.displayName)}</span>{' '}
          ({murcho.joke} feeder/falido) — leva só a badge.
        </p>
      )}
      {award.result?.murcho && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Murcho do Ano: <span className="text-foreground">{nameOf(award.result.murcho.userId, award.result.murcho.displayName)}</span>.
        </p>
      )}
    </section>
  )
}
