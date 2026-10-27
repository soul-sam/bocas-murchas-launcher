import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { Secao, Vazio } from '@/components/futebol/comum'
import { LANGS, lingua, type LinguaPodium } from '@/lib/api-lingua'
import { useAuth } from '@/lib/auth-context'
import { errorCode, errorMessage, fmtMurchos, LANG_NAME } from '@/lib/lingua-ui'
import { Flag } from './Flag'
import { RankLine } from './RankingPanel'

/**
 * Pódio da semana anterior. Só o geral paga murchos (1.000/600/300, do
 * Banco); o de cada língua é só pra mostrar.
 */
export function PodiumPanel() {
  const { token, user } = useAuth()
  const [data, setData] = React.useState<LinguaPodium | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!token) return
    let cancelled = false
    lingua
      .podium(token)
      .then((p) => !cancelled && setData(p))
      .catch((e) => !cancelled && setError(errorMessage(errorCode(e))))
    return () => {
      cancelled = true
    }
  }, [token])

  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    )
  if (!data) return <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" aria-hidden />

  const week = new Date(data.weekStart).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const langs = LANGS.filter((l) => data.byLang[l]?.length)

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">Semana de {week}.</p>

      <section>
        <Secao>Geral</Secao>
        {data.general.length === 0 ? (
          <Vazio>Ninguém pontuou na semana passada.</Vazio>
        ) : (
          <ol className="space-y-0.5">
            {data.general.map((r) => (
              <RankLine key={r.userId} row={r} me={r.userId === user?.id}>
                <span className="font-mono text-xs text-burn">+{fmtMurchos(r.coins)} murchos</span>
              </RankLine>
            ))}
          </ol>
        )}
      </section>

      {langs.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2">
          {langs.map((l) => (
            <section key={l}>
              <Secao className="flex items-center gap-1.5">
                <Flag lang={l} size={10} /> {LANG_NAME[l]}
              </Secao>
              <ol className="space-y-0.5">
                {data.byLang[l].map((r) => (
                  <RankLine key={r.userId} row={r} me={r.userId === user?.id} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
