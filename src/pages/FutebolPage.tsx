import * as React from 'react'
import { Bell, BellOff, Loader2, RefreshCw } from 'lucide-react'
import { FutebolIcon } from '@/components/futebol/FutebolGlyphs'
import { JogoLinha } from '@/components/futebol/JogoLinha'
import { DetalheJogoDialog } from '@/components/futebol/DetalheJogo'
import { TabelaAba } from '@/components/futebol/TabelaAba'
import { PalpitesAba } from '@/components/futebol/PalpitesAba'
import { MeuTimeAba } from '@/components/futebol/MeuTimeAba'
import { NoticiasAba } from '@/components/futebol/NoticiasAba'
import { SelecaoAba } from '@/components/futebol/SelecaoAba'
import { Chips, Secao, Vazio } from '@/components/futebol/comum'
import { useAuth } from '@/lib/auth-context'
import { useSettings } from '@/lib/settings-context'
import { useFutebol } from '@/lib/futebol-context'
import {
  diaDe,
  futebol,
  rotuloDoDia,
  somarDias,
  type Jogo,
  type Liga,
  type MeuPalpite,
  type PalpitesDoJogo
} from '@/lib/api-futebol'
import { cn } from '@/lib/utils'

/**
 * FUTEBOL — a tela. Seis abas: Jogos (o dia, com placar ao vivo, o palpite na
 * própria linha e o botão de assistir), Tabela (zonas, quem do grupo torce
 * pra quem, artilharia), Seleção e Copa (a Seleção e as copas por edição),
 * Bolão (ranking dos palpites), Meu time e Notícias.
 *
 * Os dados vêm da ESPN pela API (lib/futebol na API). O placar ao vivo chega
 * de dois jeitos: o `futebol:aovivo` do socket (via futebol-context) troca o
 * jogo na lista na hora, e a lista do dia se relê a cada 60 s enquanto houver
 * jogo rolando ou pra começar — é o que pega o "Encerrado", que sai da lista
 * de ao vivo.
 */

type Aba = 'jogos' | 'tabela' | 'selecao' | 'bolao' | 'time' | 'noticias'

const ABAS: Array<{ id: Aba; nome: string }> = [
  { id: 'jogos', nome: 'Jogos' },
  { id: 'tabela', nome: 'Tabela' },
  { id: 'selecao', nome: 'Seleção e Copa' },
  { id: 'bolao', nome: 'Bolão' },
  { id: 'time', nome: 'Meu time' },
  { id: 'noticias', nome: 'Notícias' }
]

const ABA_SALVA = 'bocas:futebol:aba'

function abaInicial(): Aba {
  try {
    const salva = localStorage.getItem(ABA_SALVA)
    if (ABAS.some((a) => a.id === salva)) return salva as Aba
  } catch {
    // Sem storage (aba anônima): começa nos jogos.
  }
  return 'jogos'
}

export function FutebolPage() {
  const { token } = useAuth()
  const { settings, update } = useSettings()
  const { meuJogo, meuTime } = useFutebol()
  const [aba, setAbaState] = React.useState<Aba>(abaInicial)
  const [ligas, setLigas] = React.useState<Liga[]>([])
  const [aberto, setAberto] = React.useState<Jogo | null>(null)
  const [mudou, setMudou] = React.useState(0)

  const setAba = (a: Aba) => {
    setAbaState(a)
    try {
      localStorage.setItem(ABA_SALVA, a)
    } catch {
      // Lembrar a aba é conveniência.
    }
  }

  React.useEffect(() => {
    if (!token) return
    futebol.ligas(token).then(setLigas).catch(() => undefined)
  }, [token])

  const avisos = settings.futebol?.avisos !== false

  const subtitulo = meuJogo
    ? `${meuJogo.casa.curto} ${meuJogo.casa.gols ?? 0} x ${meuJogo.fora.gols ?? 0} ${meuJogo.fora.curto} · ${meuJogo.rotulo}`
    : meuTime
      ? `Torcendo pro ${meuTime.teamName}`
      : 'Brasileirão, Seleção, Copa, Libertadores e estaduais ao vivo'

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-line/70 px-4 py-3 sm:px-6">
        <FutebolIcon className="h-8 w-8 shrink-0 text-acid" />
        <div className="min-w-0 flex-1">
          <h1 className="title-brutal text-2xl leading-none">Futebol</h1>
          <p className={cn('mt-0.5 truncate text-[11.5px]', meuJogo ? 'text-destructive' : 'text-muted-foreground')}>
            {subtitulo}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void update({ futebol: { ...settings.futebol, avisos: !avisos } })}
          aria-pressed={avisos}
          title={
            avisos
              ? 'Avisos ligados: gol, começo e fim do jogo do seu time, da Seleção e dos jogos em que palpitou'
              : 'Avisos desligados'
          }
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-brutal border px-2.5 py-1.5 text-xs transition-colors',
            avisos
              ? 'border-acid-dark bg-acid/10 text-acid hover:bg-acid/20'
              : 'border-line text-muted-foreground hover:bg-void-light hover:text-foreground'
          )}
        >
          {avisos ? <Bell className="h-3.5 w-3.5" aria-hidden /> : <BellOff className="h-3.5 w-3.5" aria-hidden />}
          <span className="hidden sm:inline">{avisos ? 'Avisos' : 'Sem avisos'}</span>
        </button>
      </header>

      <div role="tablist" aria-label="Futebol" className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-3 py-2 [scrollbar-width:none] sm:px-5 [&::-webkit-scrollbar]:hidden">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={cn(
              'shrink-0 rounded-brutal border px-3 py-1.5 text-sm transition-colors',
              aba === a.id
                ? 'border-acid/60 bg-acid/10 text-acid'
                : 'border-transparent text-muted-foreground hover:bg-void-light hover:text-foreground'
            )}
          >
            {a.nome}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {aba === 'jogos' && <JogosAba ligas={ligas} onAbrir={setAberto} mudou={mudou} />}
          {aba === 'tabela' && <TabelaAba ligas={ligas} />}
          {aba === 'selecao' && <SelecaoAba ligas={ligas} onAbrir={setAberto} />}
          {aba === 'bolao' && <PalpitesAba />}
          {aba === 'time' && <MeuTimeAba ligas={ligas} onAbrir={setAberto} />}
          {aba === 'noticias' && <NoticiasAba ligas={ligas} />}
        </div>
      </div>

      <DetalheJogoDialog
        jogo={aberto}
        onClose={() => setAberto(null)}
        onPalpite={() => setMudou((n) => n + 1)}
      />
    </div>
  )
}

const TODAS = 'todas'

function JogosAba({ ligas, onAbrir, mudou }: { ligas: Liga[]; onAbrir: (j: Jogo) => void; mudou: number }) {
  const { token } = useAuth()
  const { aoVivo, meuTime } = useFutebol()
  const hoje = diaDe(new Date())
  const [dia, setDia] = React.useState(hoje)
  const [liga, setLiga] = React.useState<string>(TODAS)
  const [jogos, setJogos] = React.useState<Jogo[] | null>(null)
  const [tv, setTv] = React.useState<Record<string, number>>({})
  const [palpites, setPalpites] = React.useState<Record<string, PalpitesDoJogo>>({})
  const [erro, setErro] = React.useState<string | null>(null)
  const [recarregando, setRecarregando] = React.useState(false)

  const dias = React.useMemo(() => Array.from({ length: 11 }, (_, i) => somarDias(hoje, i - 3)), [hoje])

  const carregar = React.useCallback(
    async (silencioso = false) => {
      if (!token) return
      if (!silencioso) setJogos(null)
      setRecarregando(true)
      try {
        const { jogos: lista, tv: comVideo } = await futebol.jogos(token, dia)
        setJogos(lista)
        setTv(comVideo)
        setErro(null)
        setPalpites(await futebol.palpites(token, lista.map((j) => j.id)).catch(() => ({})))
      } catch {
        setErro('Sem dados de futebol agora. Tenta de novo em instantes.')
        if (!silencioso) setJogos([])
      } finally {
        setRecarregando(false)
      }
    },
    [token, dia]
  )

  React.useEffect(() => {
    void carregar()
  }, [carregar, mudou])

  // Relê o dia enquanto tiver jogo rolando ou começando (pega o "Encerrado").
  const vivo = (jogos ?? []).some(
    (j) => j.estado === 'in' || (j.estado === 'pre' && new Date(j.inicio).getTime() - Date.now() < 15 * 60_000)
  )
  React.useEffect(() => {
    if (!vivo) return
    const t = setInterval(() => void carregar(true), 60_000)
    return () => clearInterval(t)
  }, [vivo, carregar])

  // Placar do socket por cima da lista.
  const lista = React.useMemo(() => {
    if (!jogos) return null
    const porId = new Map(aoVivo.map((j) => [j.id, j]))
    return jogos.map((j) => porId.get(j.id) ?? j)
  }, [jogos, aoVivo])

  const ordemDaLiga = React.useMemo(() => new Map(ligas.map((l, i) => [l.slug, i])), [ligas])
  const ligasDoDia = React.useMemo(() => {
    const slugs = [...new Set((lista ?? []).map((j) => j.liga))]
    return slugs.sort((a, b) => (ordemDaLiga.get(a) ?? 99) - (ordemDaLiga.get(b) ?? 99))
  }, [lista, ordemDaLiga])

  React.useEffect(() => {
    if (liga !== TODAS && lista && !ligasDoDia.includes(liga)) setLiga(TODAS)
  }, [liga, lista, ligasDoDia])

  const filtrados = (lista ?? []).filter((j) => liga === TODAS || j.liga === liga)
  const doMeuTime = meuTime ? filtrados.filter((j) => j.casa.id === meuTime.teamId || j.fora.id === meuTime.teamId) : []
  const grupos = ligasDoDia
    .filter((s) => liga === TODAS || s === liga)
    .map((slug) => ({
      slug,
      nome: ligas.find((l) => l.slug === slug)?.nome ?? filtrados.find((j) => j.liga === slug)?.ligaNome ?? slug,
      jogos: filtrados.filter((j) => j.liga === slug && !doMeuTime.includes(j))
    }))
    .filter((g) => g.jogos.length > 0)

  const mudouPalpite = (jogoId: string, p: MeuPalpite | null) =>
    setPalpites((prev) => {
      const antes = prev[jogoId]
      const total = (antes?.total ?? 0) + (p && !antes?.meu ? 1 : !p && antes?.meu ? -1 : 0)
      return { ...prev, [jogoId]: { meu: p, total, todos: antes?.todos ?? null } }
    })

  const linha = (j: Jogo, destaque = false) => (
    <JogoLinha
      key={j.id}
      jogo={j}
      palpites={palpites[j.id]}
      destaque={destaque}
      onAbrir={onAbrir}
      onPalpite={mudouPalpite}
      tv={tv[j.id]}
    />
  )

  return (
    <>
      <div className="flex items-center gap-2">
        <div role="radiogroup" aria-label="Dia" className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {dias.map((d) => {
            const r = rotuloDoDia(d, hoje)
            const ativo = d === dia
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => setDia(d)}
                className={cn(
                  'flex w-14 shrink-0 flex-col items-center rounded-brutal border py-1 transition-colors',
                  ativo
                    ? 'border-acid/60 bg-acid/10 text-acid'
                    : 'border-line text-muted-foreground hover:bg-void-light hover:text-foreground'
                )}
              >
                <span className="text-[11px] leading-tight">{r.curto}</span>
                <span className="font-mono text-sm leading-tight">{r.numero}</span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => void carregar(true)}
          disabled={recarregando}
          aria-label="Atualizar"
          title="Atualizar"
          className="shrink-0 rounded-brutal p-2 text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground"
        >
          <RefreshCw className={cn('h-4 w-4', recarregando && 'animate-spin')} />
        </button>
      </div>

      {ligasDoDia.length > 1 && (
        <Chips
          rotulo="Competição"
          atual={liga}
          onChange={setLiga}
          opcoes={[
            { id: TODAS, nome: 'Todas' },
            ...ligasDoDia.map((s) => ({ id: s, nome: ligas.find((l) => l.slug === s)?.curto ?? s }))
          ]}
        />
      )}

      {erro && <p className="text-[11.5px] text-destructive">{erro}</p>}

      {!lista ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtrados.length === 0 ? (
        <Vazio>Nenhum jogo nas competições acompanhadas nesse dia.</Vazio>
      ) : (
        <>
          {doMeuTime.length > 0 && (
            <section>
              <Secao>Jogo do {meuTime?.teamName}</Secao>
              <ul className="flex flex-col gap-1.5">{doMeuTime.map((j) => linha(j, true))}</ul>
            </section>
          )}
          {grupos.map((g) => (
            <section key={g.slug}>
              <Secao>{g.nome}</Secao>
              <ul className="flex flex-col gap-1.5">{g.jogos.map((j) => linha(j))}</ul>
            </section>
          ))}
        </>
      )}
    </>
  )
}
