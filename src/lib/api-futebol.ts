import { request } from './api'

/**
 * FUTEBOL — /api/futebol. Os dados são da ESPN, normalizados pela API
 * (lib/futebol/espn.ts lá): o launcher nunca fala com a ESPN direto (o CSP
 * nem deixa). Os tipos aqui são uma CÓPIA dos de lá.
 *
 *   GET    /ligas                       -> { ligas }
 *   GET    /jogos?dia=AAAAMMDD&liga=    -> { dia, jogos }
 *   GET    /aovivo                      -> { jogos }
 *   GET    /tabela/:liga                -> { liga, grupos, zonas }
 *   GET    /destaques/:liga             -> { gols, assistencias }
 *   GET    /noticias?liga=              -> { noticias }
 *   GET    /jogo/:liga/:id              -> DetalheJogo & { palpites }
 *   GET    /times                       -> { times }
 *   GET    /time/:id                    -> { passados, proximos, posicao }
 *   GET    /torcedores                  -> { torcedores }
 *   PUT    /torcedor { teamId|null }    -> { torcedor }
 *   GET    /palpites?ids=               -> { palpites: Record<jogoId, PalpitesDoJogo> }
 *   GET    /palpites/meus               -> { palpites }
 *   POST   /palpites { liga, jogoId, home, away } -> { palpite }
 *   DELETE /palpites/:jogoId
 *   GET    /ranking?periodo=            -> { periodo, linhas }
 *   GET    /copa/:liga?ano=             -> EdicaoDaCopa
 *   GET    /transmissoes/:liga/:id      -> { jogo, fontes, assistindo }
 *   POST   /transmissoes/:liga/:id { url } -> { fonte, fontes }
 *   DELETE /transmissoes/:jogoId/:videoId
 *   GET    /assistindo                  -> { assistindo: Record<jogoId, userId[]> }
 *   POST   /assistindo { jogoId|null }  (bate ponto a cada minuto com o player aberto)
 *   POST   /chamar { liga, jogoId }     card "vem assistir" no feed de jogos
 *
 * Sockets: `futebol:aovivo` (todo mundo), `futebol:torcedor` (todo mundo),
 * `futebol:gol` / `futebol:apito` / `futebol:lembrete` (sala pessoal, ou todo
 * mundo com `selecao: true` quando é jogo da Seleção), `futebol:transmissao`
 * { jogoId } (alguém colou/tirou link) e `futebol:assistindo`.
 */

export type Estado = 'pre' | 'in' | 'post'

export interface Lado {
  id: string
  nome: string
  curto: string
  sigla: string
  escudo: string | null
  cor: string | null
  gols: number | null
  penaltis: number | null
  vencedor: boolean
  forma: string | null
}

export interface LanceResumo {
  timeId: string | null
  minuto: string
  jogador: string | null
  tipo: 'gol' | 'gol-contra' | 'penalti' | 'vermelho'
}

export interface Jogo {
  id: string
  liga: string
  ligaNome: string
  inicio: string
  estado: Estado
  status: string
  rotulo: string
  casa: Lado
  fora: Lado
  estadio: string | null
  cidade: string | null
  fase: string | null
  transmissao: string | null
  lances: LanceResumo[]
}

export type TimeCurto = Pick<Lado, 'id' | 'nome' | 'curto' | 'sigla' | 'escudo' | 'cor'>

export interface LinhaTabela {
  posicao: number
  time: TimeCurto
  pontos: number
  jogos: number
  vitorias: number
  empates: number
  derrotas: number
  golsPro: number
  golsContra: number
  saldo: number
}

export interface GrupoTabela {
  nome: string | null
  linhas: LinhaTabela[]
}

export interface Zona {
  de: number
  ate: number
  nome: string
  tom: 'acid' | 'burn' | 'destructive' | 'muted'
}

export interface Lance {
  minuto: string
  tipo: string
  categoria: 'gol' | 'amarelo' | 'vermelho' | 'troca' | 'apito' | 'var' | 'outro'
  timeId: string | null
  texto: string
  jogadores: string[]
}

export interface Estatistica {
  chave: string
  nome: string
  casa: string
  fora: string
  fatiaCasa: number | null
}

export interface Jogador {
  nome: string
  curto: string
  numero: string | null
  posicao: string | null
  titular: boolean
  entrou: boolean
  saiu: boolean
}

export interface Escalacao {
  timeId: string
  formacao: string | null
  titulares: Jogador[]
  reservas: Jogador[]
}

export interface UltimoJogo {
  resultado: 'V' | 'E' | 'D' | null
  placar: string
  adversario: string
  mando: 'casa' | 'fora' | null
  data: string | null
}

export interface PalpiteDeAlguem {
  userId: string
  home: number
  away: number
  points: number | null
}

export interface MeuPalpite {
  home: number
  away: number
  points: number | null
}

export interface PalpitesDoJogo {
  meu: MeuPalpite | null
  total: number
  /** Só depois do apito inicial. */
  todos: PalpiteDeAlguem[] | null
}

export interface DetalheJogo {
  jogo: Jogo
  lances: Lance[]
  estatisticas: Estatistica[]
  escalacoes: Escalacao[]
  narracao: Array<{ minuto: string; texto: string }>
  publico: number | null
  arbitro: string | null
  ultimos: Record<string, UltimoJogo[]>
  palpites: PalpitesDoJogo
}

export interface Artilheiro {
  nome: string
  time: string | null
  timeId: string | null
  gols: number
  jogos: number | null
}

export interface Noticia {
  titulo: string
  resumo: string | null
  imagem: string | null
  link: string | null
  publicadaEm: string | null
}

export interface TimeResumo extends TimeCurto {
  liga: string
}

export interface Torcedor {
  userId: string
  teamId: string
  teamName: string
  teamAbbr: string
  teamLogo: string | null
  teamColor: string | null
}

export type LigaTipo = 'liga' | 'copa' | 'continental' | 'estadual' | 'selecao'

export interface Liga {
  slug: string
  nome: string
  curto: string
  tipo: LigaTipo
  tabela: boolean
  aoVivo: boolean
  zonas?: Zona[]
  soSelecao?: boolean
  /** Copa com edições navegáveis (Copa do Mundo, Copa América…), mais nova primeiro. */
  edicoes?: number[]
}

export type FaseCopa = 'grupos' | '32avos' | 'oitavas' | 'quartas' | 'semi' | 'terceiro' | 'final'

export interface FaseDaCopa {
  fase: FaseCopa
  nome: string
  jogos: Jogo[]
}

export interface EdicaoDaCopa {
  liga: string
  ano: number
  grupos: GrupoTabela[]
  fases: FaseDaCopa[]
  destaques: { gols: Artilheiro[]; assistencias: Artilheiro[] }
  campeao: Lado | null
  vice: Lado | null
  /** Campanha da Seleção nessa edição, em ordem. */
  selecao: Jogo[]
}

export type TipoFonte = 'aovivo' | 'melhores' | 'completo'

/** Um vídeo pra assistir o jogo (só YouTube, só fonte oficial ou colada pela galera). */
export interface Fonte {
  videoId: string
  titulo: string
  canal: string | null
  tipo: TipoFonte
  origem: 'radar' | 'galera'
  por: string | null
  /** false = o dono do vídeo não deixa tocar fora do YouTube. */
  embed: boolean
  publicado: string | null
}

export interface Transmissoes {
  jogo: Jogo
  fontes: Fonte[]
  assistindo: string[]
}

export interface PalpiteComJogo extends MeuPalpite {
  jogoId: string
  liga: string
  inicio: string
  estado: string
  cancelado: boolean
  casa: { id: string; nome: string; sigla: string; escudo: string | null; gols: number | null }
  fora: { id: string; nome: string; sigla: string; escudo: string | null; gols: number | null }
}

export type Periodo = 'semana' | 'mes' | 'geral'

export interface LinhaRanking {
  userId: string
  pontos: number
  palpites: number
  exatos: number
  acertos: number
}

export interface TimeDetalhe {
  passados: Jogo[]
  proximos: Jogo[]
  posicao: { liga: string; linha: LinhaTabela } | null
}

/** Metadata do card `futebol`: fim de jogo com os palpites, ou convite pra assistir. */
export type FutebolCardMeta =
  | {
      kind: 'resultado'
      jogo: Jogo
      palpites: Array<{ userId: string; home: number; away: number; pontos: number }>
    }
  | { kind: 'convite'; jogo: Jogo; fonte: Fonte | null }

/** Eventos da sala pessoal. */
export interface GolEvento {
  jogo: Jogo
  timeId: string
  jogador: string | null
  minuto: string
  /** Jogo da Seleção: veio pra todo mundo, não pela sala pessoal. */
  selecao?: boolean
}

export interface ApitoEvento {
  tipo: 'inicio' | 'fim'
  jogo: Jogo
  selecao?: boolean
}

export interface LembreteEvento {
  jogo: Jogo
  selecao?: boolean
  /** Só na da Seleção: quem já palpitou (o aviso foi pra todo mundo). */
  palpitaram?: string[]
}

export const futebol = {
  ligas: (token: string) => request<{ ligas: Liga[] }>('/futebol/ligas', { token }).then((r) => r.ligas),
  /** `tv`: jogoId -> quantas fontes pra assistir (sem chave = nenhuma). */
  jogos: (token: string, dia: string, liga?: string) =>
    request<{ dia: string; jogos: Jogo[]; tv?: Record<string, number> }>(
      `/futebol/jogos?dia=${dia}${liga ? `&liga=${encodeURIComponent(liga)}` : ''}`,
      { token }
    ).then((r) => ({ jogos: r.jogos, tv: r.tv ?? {} })),
  aoVivo: (token: string) => request<{ jogos: Jogo[] }>('/futebol/aovivo', { token }).then((r) => r.jogos),
  tabela: (token: string, liga: string, ano?: number) =>
    request<{ liga: string; grupos: GrupoTabela[]; zonas: Zona[] }>(
      `/futebol/tabela/${encodeURIComponent(liga)}${ano ? `?ano=${ano}` : ''}`,
      { token }
    ),
  copa: (token: string, liga: string, ano?: number) =>
    request<EdicaoDaCopa>(`/futebol/copa/${encodeURIComponent(liga)}${ano ? `?ano=${ano}` : ''}`, { token }),
  transmissoes: (token: string, liga: string, id: string) =>
    request<Transmissoes>(`/futebol/transmissoes/${encodeURIComponent(liga)}/${encodeURIComponent(id)}`, { token }),
  colarTransmissao: (token: string, liga: string, id: string, url: string) =>
    request<{ fonte: Fonte; fontes: Fonte[] }>(
      `/futebol/transmissoes/${encodeURIComponent(liga)}/${encodeURIComponent(id)}`,
      { token, method: 'POST', body: JSON.stringify({ url }) }
    ),
  tirarTransmissao: (token: string, jogoId: string, videoId: string) =>
    request<{ ok: true }>(`/futebol/transmissoes/${encodeURIComponent(jogoId)}/${encodeURIComponent(videoId)}`, {
      token,
      method: 'DELETE'
    }),
  assistindo: (token: string) =>
    request<{ assistindo: Record<string, string[]> }>('/futebol/assistindo', { token }).then((r) => r.assistindo),
  marcarAssistindo: (token: string, jogoId: string | null) =>
    request<{ ok: true }>('/futebol/assistindo', { token, method: 'POST', body: JSON.stringify({ jogoId }) }),
  chamar: (token: string, liga: string, jogoId: string) =>
    request<{ ok: true }>('/futebol/chamar', { token, method: 'POST', body: JSON.stringify({ liga, jogoId }) }),
  destaques: (token: string, liga: string) =>
    request<{ gols: Artilheiro[]; assistencias: Artilheiro[] }>(`/futebol/destaques/${encodeURIComponent(liga)}`, {
      token
    }),
  noticias: (token: string, liga: string) =>
    request<{ noticias: Noticia[] }>(`/futebol/noticias?liga=${encodeURIComponent(liga)}`, { token }).then(
      (r) => r.noticias
    ),
  jogo: (token: string, liga: string, id: string) =>
    request<DetalheJogo>(`/futebol/jogo/${encodeURIComponent(liga)}/${encodeURIComponent(id)}`, { token }),
  times: (token: string) => request<{ times: TimeResumo[] }>('/futebol/times', { token }).then((r) => r.times),
  time: (token: string, id: string) => request<TimeDetalhe>(`/futebol/time/${encodeURIComponent(id)}`, { token }),
  torcedores: (token: string) =>
    request<{ torcedores: Torcedor[] }>('/futebol/torcedores', { token }).then((r) => r.torcedores),
  definirTime: (token: string, teamId: string | null) =>
    request<{ torcedor: Torcedor | null }>('/futebol/torcedor', { token, method: 'PUT', body: JSON.stringify({ teamId }) }).then(
      (r) => r.torcedor
    ),
  palpites: (token: string, ids: string[]) =>
    ids.length === 0
      ? Promise.resolve({} as Record<string, PalpitesDoJogo>)
      : request<{ palpites: Record<string, PalpitesDoJogo> }>(
          `/futebol/palpites?ids=${ids.map(encodeURIComponent).join(',')}`,
          { token }
        ).then((r) => r.palpites),
  meusPalpites: (token: string) =>
    request<{ palpites: PalpiteComJogo[] }>('/futebol/palpites/meus', { token }).then((r) => r.palpites),
  palpitar: (token: string, body: { liga: string; jogoId: string; home: number; away: number }) =>
    request<{ palpite: MeuPalpite }>('/futebol/palpites', { token, method: 'POST', body: JSON.stringify(body) }).then((r) => r.palpite),
  desistir: (token: string, jogoId: string) =>
    request<{ ok: true }>(`/futebol/palpites/${encodeURIComponent(jogoId)}`, { token, method: 'DELETE' }),
  ranking: (token: string, periodo: Periodo) =>
    request<{ periodo: Periodo; linhas: LinhaRanking[] }>(`/futebol/ranking?periodo=${periodo}`, { token }).then(
      (r) => r.linhas
    )
}

// Contas puras (dia, pontos, zona) moram em futebol-calc.ts, testadas sem rede.
export * from './futebol-calc'
