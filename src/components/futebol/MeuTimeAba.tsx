import * as React from 'react'
import { Loader2, Search } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { ApiError, resolveAssetUrl } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { useFutebol } from '@/lib/futebol-context'
import {
  futebol,
  type Jogo,
  type Liga,
  type MeuPalpite,
  type PalpitesDoJogo,
  type TimeDetalhe,
  type TimeResumo
} from '@/lib/api-futebol'
import { cn } from '@/lib/utils'
import { Escudo } from './FutebolGlyphs'
import { JogoLinha } from './JogoLinha'
import { Secao, Vazio } from './comum'

/**
 * MEU TIME: escolher o time do coração (vale badge, aviso de gol e o escudo no
 * perfil), e depois a página dele — posição, próximos jogos (com palpite),
 * últimos resultados em todas as competições. Embaixo, quem do grupo torce
 * pra quem.
 */

export function MeuTimeAba({
  ligas,
  onAbrir
}: {
  ligas: Liga[]
  onAbrir: (jogo: Jogo) => void
}) {
  const { meuTime } = useFutebol()
  const [trocando, setTrocando] = React.useState(false)

  return (
    <div className="flex flex-col gap-6">
      {!meuTime || trocando ? (
        <section>
          <Secao>{meuTime ? 'Trocar de time' : 'Escolha o time do coração'}</Secao>
          <p className="mb-3 text-sm text-muted-foreground">
            O escudo aparece no seu perfil e você recebe aviso de gol, começo e fim de jogo, até no meio de uma
            partida.
          </p>
          <SeletorDeTime onEscolhido={() => setTrocando(false)} onCancelar={meuTime ? () => setTrocando(false) : undefined} />
        </section>
      ) : (
        <PaginaDoTime teamId={meuTime.teamId} ligas={ligas} onAbrir={onAbrir} onTrocar={() => setTrocando(true)} />
      )}
      <Torcidas />
    </div>
  )
}

/** Grade de escudos com busca. Usada aqui e no editor de perfil. */
export function SeletorDeTime({
  onEscolhido,
  onCancelar
}: {
  onEscolhido?: (time: TimeResumo | null) => void
  onCancelar?: () => void
}) {
  const { token } = useAuth()
  const { meuTime, definirTime } = useFutebol()
  const [times, setTimes] = React.useState<TimeResumo[] | null>(null)
  const [busca, setBusca] = React.useState('')
  const [salvando, setSalvando] = React.useState<string | null>(null)
  const [erro, setErro] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!token) return
    futebol
      .times(token)
      .then(setTimes)
      .catch(() => setErro('Não consegui carregar os times agora.'))
  }, [token])

  const filtro = busca
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
  const visiveis = (times ?? []).filter(
    (t) =>
      !filtro ||
      `${t.nome} ${t.curto} ${t.sigla}`
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .includes(filtro)
  )

  const escolher = async (time: TimeResumo | null) => {
    setSalvando(time?.id ?? 'nenhum')
    setErro(null)
    try {
      await definirTime(time?.id ?? null)
      onEscolhido?.(time)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não deu pra salvar.')
    } finally {
      setSalvando(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-brutal border border-line bg-void px-2.5 py-1.5 focus-within:border-acid">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar time"
            aria-label="Buscar time"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </label>
        {onCancelar && (
          <button
            type="button"
            onClick={onCancelar}
            className="shrink-0 rounded-brutal px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-void-light hover:text-foreground"
          >
            Cancelar
          </button>
        )}
      </div>
      {erro && <p className="text-[11.5px] text-destructive">{erro}</p>}
      {!times ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
          {visiveis.map((t) => {
            const atual = meuTime?.teamId === t.id
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => void escolher(t)}
                  disabled={!!salvando}
                  aria-pressed={atual}
                  className={cn(
                    'flex w-full flex-col items-center gap-1.5 rounded-brutal border px-1 py-2.5 transition-colors disabled:opacity-60',
                    atual ? 'border-acid bg-acid/10' : 'border-line hover:border-acid-dark hover:bg-void-light'
                  )}
                >
                  {salvando === t.id ? (
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  ) : (
                    <Escudo src={t.escudo} sigla={t.sigla} cor={t.cor} className="h-8 w-8" />
                  )}
                  <span className="w-full truncate text-center text-xs text-foreground">{t.curto}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {meuTime && (
        <button
          type="button"
          onClick={() => void escolher(null)}
          disabled={!!salvando}
          className="self-start text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
        >
          Não torcer pra ninguém
        </button>
      )}
    </div>
  )
}

/** O time no topo da página. Sem ele, é o meu time do coração. */
export interface CabecalhoDoTime {
  nome: string
  escudo: string | null
  sigla: string
  cor: string | null
  /** Linha embaixo do nome quando o time não tem posição na Série A/B. */
  legenda?: string
}

/** Calendário de um time (o do coração ou a Seleção) com palpite nos próximos. */
export function PaginaDoTime({
  teamId,
  ligas,
  onAbrir,
  onTrocar,
  cabecalho,
  acoes
}: {
  teamId: string
  ligas: Liga[]
  onAbrir: (jogo: Jogo) => void
  onTrocar?: () => void
  cabecalho?: CabecalhoDoTime
  /** Botões no lado direito do cabeçalho (no lugar do "Trocar"). */
  acoes?: React.ReactNode
}) {
  const { token } = useAuth()
  const { meuTime } = useFutebol()
  const [dados, setDados] = React.useState<TimeDetalhe | null>(null)
  const [palpites, setPalpites] = React.useState<Record<string, PalpitesDoJogo>>({})
  const [erro, setErro] = React.useState(false)
  const conhecidas = React.useMemo(() => new Set(ligas.map((l) => l.slug)), [ligas])

  React.useEffect(() => {
    if (!token) return
    let vivo = true
    setDados(null)
    futebol
      .time(token, teamId)
      .then(async (d) => {
        if (!vivo) return
        setDados(d)
        const p = await futebol.palpites(token, d.proximos.map((j) => j.id)).catch(() => ({}))
        if (vivo) setPalpites(p)
      })
      .catch(() => vivo && setErro(true))
    return () => {
      vivo = false
    }
  }, [token, teamId])

  const mudouPalpite = (jogoId: string, p: MeuPalpite | null) =>
    setPalpites((prev) => ({
      ...prev,
      [jogoId]: { meu: p, total: (prev[jogoId]?.total ?? 0) + (p && !prev[jogoId]?.meu ? 1 : !p && prev[jogoId]?.meu ? -1 : 0), todos: null }
    }))

  const pos = dados?.posicao
  const ligaNome = pos ? ligas.find((l) => l.slug === pos.liga)?.nome ?? pos.liga : null

  return (
    <>
      <section className="flex items-center gap-4 rounded-brutal border border-line bg-void/60 p-4">
        <Escudo
          src={cabecalho ? cabecalho.escudo : meuTime?.teamLogo}
          sigla={cabecalho ? cabecalho.sigla : meuTime?.teamAbbr ?? ''}
          cor={cabecalho ? cabecalho.cor : meuTime?.teamColor}
          className="h-16 w-16"
        />
        <div className="min-w-0 flex-1">
          <h2 className="title-brutal truncate text-2xl leading-none text-foreground">{cabecalho?.nome ?? meuTime?.teamName}</h2>
          {pos ? (
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-mono text-acid-text">{pos.linha.posicao}º</span> na {ligaNome} · {pos.linha.pontos}{' '}
              pts em {pos.linha.jogos} jogos · {pos.linha.vitorias}V {pos.linha.empates}E {pos.linha.derrotas}D
            </p>
          ) : cabecalho?.legenda ? (
            <p className="mt-1 text-sm text-muted-foreground">{cabecalho.legenda}</p>
          ) : (
            dados && !cabecalho && <p className="mt-1 text-sm text-muted-foreground">Fora da Série A e B agora.</p>
          )}
        </div>
        {acoes}
        {onTrocar && (
          <button
            type="button"
            onClick={onTrocar}
            className="shrink-0 rounded-brutal border border-line px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground"
          >
            Trocar
          </button>
        )}
      </section>

      {erro && <Vazio>Sem dados do time agora.</Vazio>}
      {!dados && !erro && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {dados && (
        <>
          <section>
            <Secao>Próximos jogos</Secao>
            {dados.proximos.length === 0 ? (
              <Vazio>Nenhum jogo marcado.</Vazio>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {dados.proximos.map((j) => (
                  <JogoLinha
                    key={j.id}
                    jogo={j}
                    comData
                    palpites={palpites[j.id]}
                    onAbrir={conhecidas.has(j.liga) ? onAbrir : undefined}
                    onPalpite={conhecidas.has(j.liga) ? mudouPalpite : undefined}
                  />
                ))}
              </ul>
            )}
          </section>
          <section>
            <Secao>Últimos resultados</Secao>
            {dados.passados.length === 0 ? (
              <Vazio>Sem resultados recentes.</Vazio>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {dados.passados.map((j) => (
                  <JogoLinha
                    key={j.id}
                    jogo={j}
                    comData
                    palpites={undefined}
                    onAbrir={conhecidas.has(j.liga) ? onAbrir : undefined}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  )
}

/** Quem do grupo torce pra quem, agrupado por time. */
function Torcidas() {
  const { torcidas } = useFutebol()
  const { byId } = useMembers()
  const grupos = React.useMemo(() => {
    const por = new Map<string, { time: (typeof torcidas)[string]; quem: string[] }>()
    for (const t of Object.values(torcidas)) {
      const g = por.get(t.teamId) ?? { time: t, quem: [] }
      g.quem.push(t.userId)
      por.set(t.teamId, g)
    }
    return [...por.values()].sort((a, b) => b.quem.length - a.quem.length || a.time.teamName.localeCompare(b.time.teamName))
  }, [torcidas])

  if (grupos.length === 0) return null
  return (
    <section>
      <Secao>Torcidas do grupo</Secao>
      <ul className="flex flex-col gap-1.5">
        {grupos.map(({ time, quem }) => (
          <li key={time.teamId} className="flex items-center gap-3 rounded-brutal px-2 py-1.5">
            <Escudo src={time.teamLogo} sigla={time.teamAbbr} cor={time.teamColor} className="h-6 w-6" />
            <span className="w-28 shrink-0 truncate text-sm text-foreground">{time.teamName}</span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {quem.map((u) => {
                const m = byId[u]
                return (
                  <span key={u} className="flex items-center gap-1.5 rounded-brutal bg-void-light/60 py-0.5 pl-0.5 pr-2">
                    <UserAvatar
                      userId={u}
                      src={resolveAssetUrl(m?.avatar)}
                      name={m?.displayName ?? '?'}
                      ringColor={m?.profileColor ?? undefined}
                      className="h-5 w-5"
                    />
                    <span className="text-xs text-dirty-white">{m?.displayName ?? 'Alguém'}</span>
                  </span>
                )
              })}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
