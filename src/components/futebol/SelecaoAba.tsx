import * as React from 'react'
import { Bell, BellOff, Loader2, Trophy } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useSettings } from '@/lib/settings-context'
import {
  SELECAO_FEMININA_ID,
  SELECAO_ID,
  futebol,
  type EdicaoDaCopa,
  type FaseDaCopa,
  type Jogo,
  type Liga,
  type Zona
} from '@/lib/api-futebol'
import { cn } from '@/lib/utils'
import { Escudo } from './FutebolGlyphs'
import { EstadoDoJogo, JogoLinha } from './JogoLinha'
import { PaginaDoTime } from './MeuTimeAba'
import { Destaque, Tabela } from './TabelaAba'
import { Chips, Secao, Vazio } from './comum'

/**
 * SELEÇÃO E COPA — a Seleção (masculina e feminina: calendário em todas as
 * competições, palpite nos próximos jogos, avisos pra todo mundo) e as copas
 * com edição: Copa do Mundo, Copa América, Copa Feminina e Mundial de Clubes,
 * cada uma navegável por ano (grupos, mata-mata, artilharia, campeão e a
 * campanha do Brasil).
 *
 * Os dados são os mesmos da ESPN (GET /futebol/copa/:liga?ano= na API). O que
 * é fixo aqui — títulos e as próximas Copas — é história, não placar.
 */

/** A bandeira da ESPN serve pras duas seleções. */
const BANDEIRA = 'https://a.espncdn.com/i/teamlogos/countries/500/bra.png'

const SELECOES = {
  [SELECAO_ID]: {
    nome: 'Seleção Brasileira',
    legenda: 'Pentacampeã do mundo: 1958, 1962, 1970, 1994 e 2002'
  },
  [SELECAO_FEMININA_ID]: {
    nome: 'Seleção Feminina',
    legenda: 'Vice-campeã do mundo em 2007 · a Copa de 2027 é no Brasil'
  }
} as const

const PROXIMAS: Array<{ nome: string; onde: string; quando: string }> = [
  { nome: 'Copa do Mundo Feminina 2027', onde: 'no Brasil', quando: 'junho e julho de 2027' },
  {
    nome: 'Copa do Mundo 2030',
    onde: 'Espanha, Portugal e Marrocos, com a abertura na América do Sul',
    quando: 'junho e julho de 2030'
  }
]

type Vista = typeof SELECAO_ID | typeof SELECAO_FEMININA_ID | string

export function SelecaoAba({ ligas, onAbrir }: { ligas: Liga[]; onAbrir: (jogo: Jogo) => void }) {
  const copas = ligas.filter((l) => l.edicoes?.length)
  const [vista, setVista] = React.useState<Vista>(SELECAO_ID)
  const copa = copas.find((l) => l.slug === vista) ?? null

  return (
    <div className="flex flex-col gap-5">
      <Chips
        rotulo="Seleção ou copa"
        atual={vista}
        onChange={setVista}
        opcoes={[
          { id: SELECAO_ID, nome: 'Seleção' },
          { id: SELECAO_FEMININA_ID, nome: 'Feminina' },
          ...copas.map((l) => ({ id: l.slug, nome: l.curto }))
        ]}
      />
      {copa ? (
        <CopaView key={copa.slug} liga={copa} ligas={ligas} onAbrir={onAbrir} />
      ) : (
        <SelecaoView key={vista} teamId={vista} ligas={ligas} onAbrir={onAbrir} />
      )}
    </div>
  )
}

function SelecaoView({ teamId, ligas, onAbrir }: { teamId: string; ligas: Liga[]; onAbrir: (jogo: Jogo) => void }) {
  const { settings, update } = useSettings()
  const info = SELECOES[teamId as keyof typeof SELECOES] ?? SELECOES[SELECAO_ID]
  const avisos = settings.futebol?.selecao !== false
  const geral = settings.futebol?.avisos !== false

  return (
    <>
      <PaginaDoTime
        teamId={teamId}
        ligas={ligas}
        onAbrir={onAbrir}
        cabecalho={{ nome: info.nome, escudo: BANDEIRA, sigla: 'BRA', cor: null, legenda: info.legenda }}
        acoes={
          <button
            type="button"
            onClick={() => void update({ futebol: { ...settings.futebol, selecao: !avisos } })}
            aria-pressed={avisos}
            title={
              !geral
                ? 'Os avisos de futebol estão desligados (sino no topo da tela)'
                : avisos
                  ? 'Gol, começo e fim de todo jogo da Seleção, masculina e feminina'
                  : 'Sem avisos dos jogos da Seleção'
            }
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-brutal border px-2.5 py-1.5 text-xs transition-colors',
              avisos && geral
                ? 'border-acid-dark bg-acid/10 text-acid hover:bg-acid/20'
                : 'border-line text-muted-foreground hover:bg-void-light hover:text-foreground'
            )}
          >
            {avisos ? <Bell className="h-3.5 w-3.5" aria-hidden /> : <BellOff className="h-3.5 w-3.5" aria-hidden />}
            <span className="hidden sm:inline">{avisos ? 'Avisos' : 'Sem avisos'}</span>
          </button>
        }
      />
      <section>
        <Secao>Próximas Copas</Secao>
        <ul className="grid gap-2 sm:grid-cols-2">
          {PROXIMAS.map((p) => (
            <li key={p.nome} className="flex gap-3 rounded-brutal border border-line bg-void/60 p-3">
              <Trophy className="mt-0.5 h-5 w-5 shrink-0 text-burn" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm text-foreground">{p.nome}</p>
                <p className="text-[11.5px] text-muted-foreground">
                  {p.onde} · {p.quando}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

/**
 * Quem passa da fase de grupos em cada formato. Em geral os 2 primeiros; com
 * grupo de 5 (Copa América 2021) os 4; e onde os melhores terceiros também
 * passam (Copa de 48 seleções, Copa Feminina de 24, Copa América de 12), o
 * 3º fica na zona do "talvez".
 */
function zonasDoGrupo(liga: string, ano: number): Zona[] {
  if (liga === 'conmebol.america' && ano === 2021) return [{ de: 1, ate: 4, nome: 'Mata-mata', tom: 'acid' }]
  const zonas: Zona[] = [{ de: 1, ate: 2, nome: 'Mata-mata', tom: 'acid' }]
  const terceiros =
    (liga === 'fifa.world' && ano >= 2026) ||
    (liga === 'fifa.wwc' && (ano === 2015 || ano === 2019)) ||
    (liga === 'conmebol.america' && ano === 2019)
  if (terceiros) zonas.push({ de: 3, ate: 3, nome: 'Melhores 3º colocados', tom: 'burn' })
  return zonas
}

function CopaView({ liga, ligas, onAbrir }: { liga: Liga; ligas: Liga[]; onAbrir: (jogo: Jogo) => void }) {
  const { token } = useAuth()
  const edicoes = liga.edicoes ?? []
  const [ano, setAno] = React.useState(String(edicoes[0] ?? ''))
  const [dados, setDados] = React.useState<EdicaoDaCopa | null>(null)
  const [erro, setErro] = React.useState(false)
  const conhecidas = React.useMemo(() => new Set(ligas.map((l) => l.slug)), [ligas])

  React.useEffect(() => {
    if (!token) return
    let vivo = true
    setDados(null)
    setErro(false)
    futebol
      .copa(token, liga.slug, Number(ano) || undefined)
      .then((d) => vivo && setDados(d))
      .catch(() => vivo && setErro(true))
    return () => {
      vivo = false
    }
  }, [token, liga.slug, ano])

  const zonas = zonasDoGrupo(liga.slug, Number(ano))
  const abrir = conhecidas.has(liga.slug) ? onAbrir : undefined
  const final = dados?.fases.find((f) => f.fase === 'final')?.jogos[0] ?? null

  return (
    <>
      {edicoes.length > 1 && (
        <Chips rotulo="Edição" atual={ano} onChange={setAno} opcoes={edicoes.map((a) => ({ id: String(a), nome: String(a) }))} />
      )}

      {erro && <Vazio>Sem dados dessa edição agora.</Vazio>}
      {!dados && !erro && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {dados && (
        <>
          {dados.campeao && (
            <section className="flex items-center gap-4 rounded-brutal border border-burn/50 bg-burn/5 p-4">
              <Trophy className="h-10 w-10 shrink-0 text-burn" aria-hidden />
              <Escudo src={dados.campeao.escudo} sigla={dados.campeao.sigla} cor={dados.campeao.cor} className="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] text-muted-foreground">
                  Campeão · {liga.nome} {dados.ano}
                </p>
                <h2 className="title-brutal truncate text-2xl leading-none text-foreground">{dados.campeao.nome}</h2>
                {final && dados.vice && (
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    Final: {final.casa.curto} {final.casa.gols} x {final.fora.gols} {final.fora.curto}
                    {final.casa.penaltis !== null && final.fora.penaltis !== null
                      ? ` (pênaltis ${final.casa.penaltis} x ${final.fora.penaltis})`
                      : final.status === 'STATUS_FINAL_AET'
                        ? ' na prorrogação'
                        : ''}
                  </p>
                )}
              </div>
            </section>
          )}

          {dados.selecao.length > 0 && (
            <section>
              <Secao>Campanha do Brasil</Secao>
              <ul className="flex flex-col gap-1.5">
                {dados.selecao.map((j) => (
                  <JogoLinha key={j.id} jogo={j} comData palpites={undefined} onAbrir={abrir} />
                ))}
              </ul>
            </section>
          )}

          {dados.fases.length > 0 && (
            <section>
              <Secao>Mata-mata</Secao>
              {/* Final e 3º lugar dividem a última coluna: são um jogo cada, e
                  seis colunas não cabem na largura da tela sem rolar de lado. */}
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
                {colunasDaChave(dados.fases).map((coluna) => (
                  <div key={coluna[0]!.fase} className="flex w-36 shrink-0 flex-col gap-1.5">
                    {coluna.map((f) => (
                      <React.Fragment key={f.fase}>
                        <h3 className={cn('text-xs', f.fase === 'final' ? 'text-burn' : 'text-muted-foreground', f.fase === 'terceiro' && 'mt-2')}>
                          {f.nome}
                        </h3>
                        <ul className="flex flex-col gap-1.5">
                          {f.jogos.map((j) => (
                            <JogoDaChave key={j.id} jogo={j} onAbrir={abrir} final={f.fase === 'final'} />
                          ))}
                        </ul>
                      </React.Fragment>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}

          {dados.grupos.length > 0 && (
            <section>
              <div className="grid gap-4 md:grid-cols-2">
                {dados.grupos.map((g, i) => (
                  <Tabela key={g.nome ?? i} grupo={g} zonas={zonas} compacta />
                ))}
              </div>
            </section>
          )}

          {(dados.destaques.gols.length > 0 || dados.destaques.assistencias.length > 0) && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Destaque titulo="Artilharia" lista={dados.destaques.gols} unidade="gols" />
              <Destaque titulo="Assistências" lista={dados.destaques.assistencias} unidade="assist." />
            </div>
          )}

          {!dados.campeao && dados.fases.length === 0 && dados.grupos.length === 0 && (
            <Vazio>A ESPN ainda não tem os jogos dessa edição.</Vazio>
          )}
        </>
      )}
    </>
  )
}

function colunasDaChave(fases: FaseDaCopa[]): FaseDaCopa[][] {
  const final = fases.filter((f) => f.fase === 'final' || f.fase === 'terceiro').sort((a, b) => (a.fase === 'final' ? -1 : b.fase === 'final' ? 1 : 0))
  const resto = fases.filter((f) => f.fase !== 'final' && f.fase !== 'terceiro').map((f) => [f])
  return final.length ? [...resto, final] : resto
}

/** Um confronto do mata-mata: dois times empilhados, o vencedor aceso. */
function JogoDaChave({ jogo, onAbrir, final }: { jogo: Jogo; onAbrir?: (jogo: Jogo) => void; final?: boolean }) {
  const placar = jogo.estado !== 'pre' && jogo.casa.gols !== null
  const lado = (l: Jogo['casa']) => (
    <div className="flex items-center gap-1.5">
      <Escudo src={l.escudo} sigla={l.sigla} cor={l.cor} className="h-4 w-4" />
      <span className={cn('min-w-0 flex-1 truncate text-xs', l.vencedor ? 'text-foreground' : 'text-muted-foreground')}>
        {l.curto}
      </span>
      {placar && (
        <span className={cn('shrink-0 font-mono text-xs tabular-nums', l.vencedor ? 'text-acid' : 'text-muted-foreground')}>
          {l.gols}
          {l.penaltis !== null && <span className="text-[11px]"> ({l.penaltis})</span>}
        </span>
      )}
    </div>
  )
  return (
    <li>
      <button
        type="button"
        onClick={() => onAbrir?.(jogo)}
        disabled={!onAbrir}
        aria-label={`${jogo.casa.nome} x ${jogo.fora.nome}`}
        className={cn(
          'flex w-full flex-col gap-1 rounded-brutal border bg-void/60 px-2 py-1.5 text-left transition-colors hover:bg-void-light disabled:hover:bg-void/60',
          final ? 'border-burn/60' : 'border-line'
        )}
      >
        {lado(jogo.casa)}
        {lado(jogo.fora)}
        {jogo.estado !== 'post' && <EstadoDoJogo jogo={jogo} curto className="self-end" />}
      </button>
    </li>
  )
}
