import * as React from 'react'

/**
 * Responsividade da tela social.
 *
 * O layout era de larguras fixas: barra de canais de 240px + lista de membros
 * de 224px, sempre. Numa janela de 1000px (o minimo que a janela aceita) isso
 * come quase metade do espaco e o chat fica numa coluna estreita; com o palco
 * de compartilhamento aberto, sobra um retangulo de video minusculo.
 *
 * A regra e a mesma do Discord: quando aperta, o que sai primeiro e a lista de
 * membros; depois a barra de canais vira gaveta por cima do conteudo. O
 * conteudo do meio nunca some.
 *
 * As preferencias do usuario ganham do automatico, mas so DENTRO do que cabe:
 * quem fecha a lista de membros numa janela grande continua sem ela ao
 * maximizar; quem abre a lista numa janela apertada nao a ganha de volta antes
 * de haver espaco.
 */

export type Density = 'wide' | 'compact' | 'narrow' | 'phone'

/** Abaixo disso a lista de membros sai. */
const COMPACT_AT = 1_180
/** Abaixo disso a barra de canais vira gaveta. */
const NARROW_AT = 900
/**
 * Abaixo disso não é mais janela apertada: é APARELHO.
 *
 * Os dois cortes acima foram desenhados pra janela de desktop espremida, e
 * paravam aí — um celular de 360px caía na mesma densidade de uma janela de
 * 899px e recebia o layout de PC encolhido: barra de ícones de 56px fixa,
 * gaveta de canais de 240px abrindo por cima e deixando 64px de conversa
 * aparecendo por trás do véu, e os painéis da direita (busca, fixadas,
 * membros, agenda, ranking) simplesmente inalcançáveis.
 *
 * Em `phone` a regra muda de natureza: uma coisa por vez na tela, navegação no
 * polegar. A barra de ícones deita no rodapé, os canais abrem em tela cheia e
 * os painéis viram folha de baixo.
 *
 * 640 é o `sm` do Tailwind — o mesmo número que as variantes `max-sm:` usam
 * nos diálogos, pra não haver duas fronteiras de celular no projeto.
 */
const PHONE_AT = 640

/**
 * LARGURA DAS COLUNAS — até onde dá pra arrastar cada uma.
 *
 * As duas colunas tinham largura fixa (240px de canais, 224/288px de painel) e
 * número fixo é sempre errado pra alguém: nome de canal comprido não cabia, e
 * em monitor grande a lista de membros ficava estreita à toa. Agora a
 * divisória entre elas se arrasta (ver components/ui/alca.tsx).
 *
 * O PISO E O TETO SÃO O QUE IMPEDE O ESTRAGO. Sem piso, a coluna vai a zero e
 * não sobra nada pra agarrar de volta; sem teto, o chat — que é o conteúdo —
 * vira uma tira espremida entre duas barras.
 *
 * E o teto ainda encolhe junto com a janela: 40% dela, no máximo. Uma largura
 * escolhida no monitor grande não pode ocupar meia tela quando a mesma conta
 * abre no notebook.
 */
export const CANAIS_MIN = 180
export const CANAIS_MAX = 420
export const PAINEL_MIN = 220
export const PAINEL_MAX = 480

/**
 * A largura fica no localStorage, e não no servidor nem no settings.json:
 * é uma decisão desta TELA, nesta máquina — quem tem um monitor de 34" e um
 * notebook não quer a mesma coluna nos dois. `null` = nunca arrastou, vale a
 * largura padrão do CSS.
 */
const CHAVE_CANAIS = 'bocas:largura-canais'
const CHAVE_PAINEL = 'bocas:largura-painel'

function lerLargura(chave: string): number | null {
  try {
    const bruto = window.localStorage.getItem(chave)
    if (!bruto) return null
    const valor = Number(bruto)
    return Number.isFinite(valor) && valor > 0 ? valor : null
  } catch {
    // Navegador com armazenamento bloqueado: vale o padrão, e o app abre.
    return null
  }
}

function gravarLargura(chave: string, valor: number | null): void {
  try {
    if (valor == null) window.localStorage.removeItem(chave)
    else window.localStorage.setItem(chave, String(valor))
  } catch {
    // Não gravou: a largura vale nesta sessão e volta ao padrão na próxima.
  }
}

/** Prende a largura escolhida dentro do que cabe NESTA janela. */
function caber(valor: number, min: number, max: number, janela: number): number {
  const teto = Math.max(min, Math.min(max, Math.round(janela * 0.4)))
  return Math.round(Math.min(teto, Math.max(min, valor)))
}

/** O que ocupa a coluna do meio: a conversa ou a call. */
export type CenterView = 'chat' | 'voice'

interface LayoutContextValue {
  width: number
  density: Density
  /**
   * Aparelho de dedo, não janela apertada. Quem lê isto muda de LAYOUT, não de
   * tamanho: barra de ícones no rodapé, canais em tela cheia, painéis em folha.
   */
  isPhone: boolean
  /** Janela apertada: a barra de canais flutua por cima em vez de empurrar. */
  sidebarIsDrawer: boolean

  sidebarOpen: boolean
  toggleSidebar: () => void
  closeSidebar: () => void

  /**
   * Largura arrastada da barra de canais, em px — `null` quando ninguém
   * arrastou e vale a do CSS. Já vem limitada ao que cabe na janela de agora.
   */
  sidebarWidth: number | null
  setSidebarWidth: (largura: number | null) => void

  /** Idem pra coluna da direita (membros, busca, fixadas, agenda, ranking…). */
  panelWidth: number | null
  setPanelWidth: (largura: number | null) => void

  membersOpen: boolean
  toggleMembers: () => void

  /**
   * Fecha o que estiver ocupando a coluna da direita, seja qual for.
   *
   * Existe pro celular: lá a coluna vira folha de baixo, e quem fecha é um
   * toque no véu ou o botão Voltar do aparelho — nenhum dos dois sabe QUAL
   * painel está aberto, e nem deveria.
   */
  closeRightColumn: () => void

  /**
   * Chat ou palco da call no meio.
   *
   * Mora aqui, e nao na SocialPage, porque o troca-canal do Ctrl+K vive na
   * casca autenticada (pra funcionar tambem com a aba do Minecraft aberta) e
   * precisa poder mandar a tela pro palco ao escolher um canal de voz.
   */
  view: CenterView
  setView: (view: CenterView) => void

  /**
   * Painel lateral direito do chat.
   *
   * Fixadas, busca e lista de membros disputam a MESMA coluna: numa janela de
   * 1000px, empilhar os tres nao sobraria chat nenhum. Abrir um fecha o outro.
   */
  pinnedOpen: boolean
  togglePinned: () => void
  closePinned: () => void

  searchOpen: boolean
  toggleSearch: () => void
  openSearch: () => void
  closeSearch: () => void

  /** Achados: links compartilhados no canal. Mesma coluna dos outros paineis. */
  linksOpen: boolean
  toggleLinks: () => void
  closeLinks: () => void

  /** Acervo de clipes da call. Mesma coluna dos outros paineis. */
  clipsOpen: boolean
  toggleClips: () => void
  closeClips: () => void

  /** Agenda: proximos eventos marcados. */
  agendaOpen: boolean
  /** O quadro de sugestões, ordenado por voto. */
  suggestionsOpen: boolean
  toggleSuggestions: () => void
  closeSuggestions: () => void
  toggleAgenda: () => void
  closeAgenda: () => void

  /** Ranking / XP / badges. */
  leaderboardOpen: boolean
  toggleLeaderboard: () => void
  closeLeaderboard: () => void
}

const LayoutContext = React.createContext<LayoutContextValue | null>(null)

export function densityFor(width: number): Density {
  if (width < PHONE_AT) return 'phone'
  if (width < NARROW_AT) return 'narrow'
  if (width < COMPACT_AT) return 'compact'
  return 'wide'
}

export function LayoutProvider({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = React.useState(() => window.innerWidth)

  /** `null` = deixa o automatico decidir. */
  const [sidebarPref, setSidebarPref] = React.useState<boolean | null>(null)
  const [membersPref, setMembersPref] = React.useState<boolean | null>(null)
  const [view, setView] = React.useState<CenterView>('chat')

  // Larguras arrastadas. Lidas uma vez, na montagem — depois quem manda é o
  // estado, e o localStorage só recebe cópia.
  const [canaisPref, setCanaisPref] = React.useState<number | null>(() => lerLargura(CHAVE_CANAIS))
  const [painelPref, setPainelPref] = React.useState<number | null>(() => lerLargura(CHAVE_PAINEL))

  const setSidebarWidth = React.useCallback((largura: number | null) => {
    setCanaisPref(largura)
    gravarLargura(CHAVE_CANAIS, largura)
  }, [])

  const setPanelWidth = React.useCallback((largura: number | null) => {
    setPainelPref(largura)
    gravarLargura(CHAVE_PAINEL, largura)
  }, [])

  /**
   * Um painel por vez na coluna da direita.
   *
   * Eram dois booleans (fixadas/busca) que se fechavam mutuamente; com
   * achados, agenda e ranking entrando na mesma coluna, virou UM estado com o
   * nome do painel aberto — impossivel dois ficarem abertos ao mesmo tempo.
   */
  type RightPanel =
    | 'pinned'
    | 'search'
    | 'links'
    | 'agenda'
    | 'leaderboard'
    | 'suggestions'
    | 'clips'
    | null
  const [panel, setPanel] = React.useState<RightPanel>(null)
  const togglePanel = React.useCallback(
    (name: Exclude<RightPanel, null>) => setPanel((prev) => (prev === name ? null : name)),
    []
  )
  const closePanel = React.useCallback(
    (name: Exclude<RightPanel, null>) => setPanel((prev) => (prev === name ? null : prev)),
    []
  )

  const pinnedOpen = panel === 'pinned'
  const searchOpen = panel === 'search'
  const linksOpen = panel === 'links'
  const agendaOpen = panel === 'agenda'
  const leaderboardOpen = panel === 'leaderboard'
  const suggestionsOpen = panel === 'suggestions'
  const clipsOpen = panel === 'clips'

  // Ctrl+F abre a busca do chat. O Chromium nao tem busca nativa de pagina no
  // Electron, entao a tecla estava sobrando — e e a que todo mundo aperta.
  React.useEffect(() => {
    const handle = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.code !== 'KeyF') return
      event.preventDefault()
      setPanel('search')
    }

    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [])

  React.useEffect(() => {
    // rAF em vez do evento cru: arrastar a borda da janela dispara resize
    // dezenas de vezes por segundo, e cada um re-renderiza a arvore inteira.
    let frame = 0

    const handle = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setWidth(window.innerWidth))
    }

    window.addEventListener('resize', handle)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', handle)
    }
  }, [])

  const density = densityFor(width)
  const isPhone = density === 'phone'
  // No celular a gaveta também flutua — só que em tela cheia, não como uma
  // coluna de 240px colada ao lado de 64px de conversa.
  const sidebarIsDrawer = density === 'narrow' || isPhone

  // Ao apertar a janela a gaveta comeca fechada — se a preferencia de "aberta"
  // sobrevivesse, a barra apareceria por cima do chat sem ninguem ter pedido.
  const previousDrawerRef = React.useRef(sidebarIsDrawer)
  React.useEffect(() => {
    if (previousDrawerRef.current === sidebarIsDrawer) return
    previousDrawerRef.current = sidebarIsDrawer
    setSidebarPref(null)
  }, [sidebarIsDrawer])

  const sidebarOpen = sidebarPref ?? !sidebarIsDrawer
  const membersAuto = density === 'wide'
  // Numa janela estreita nao ha onde colocar a lista de membros, entao a
  // preferencia do usuario nem entra na conta.
  // No celular a lista de membros deixa de ser coluna e vira folha: não abre
  // sozinha (não há espaço que a justifique), mas passa a ser ALCANÇÁVEL —
  // antes ela era a única coisa que a janela estreita apagava de vez.
  const membersOpen = isPhone
    ? (membersPref ?? false)
    : density === 'narrow'
      ? false
      : (membersPref ?? membersAuto)

  // A janela encolheu: a largura escolhida continua guardada, mas o que vai
  // pra tela é o que cabe agora.
  const sidebarWidth = canaisPref == null ? null : caber(canaisPref, CANAIS_MIN, CANAIS_MAX, width)
  const panelWidth = painelPref == null ? null : caber(painelPref, PAINEL_MIN, PAINEL_MAX, width)

  const value = React.useMemo<LayoutContextValue>(
    () => ({
      width,
      density,
      isPhone,
      sidebarIsDrawer,
      sidebarOpen,
      toggleSidebar: () => setSidebarPref((prev) => !(prev ?? !sidebarIsDrawer)),
      closeSidebar: () => setSidebarPref(false),
      sidebarWidth,
      setSidebarWidth,
      panelWidth,
      setPanelWidth,
      view,
      setView,
      membersOpen,
      toggleMembers: () => {
        setMembersPref((prev) => !(prev ?? (isPhone ? false : membersAuto)))
        setPanel(null)
      },
      closeRightColumn: () => {
        setPanel(null)
        setMembersPref(false)
      },
      pinnedOpen,
      togglePinned: () => togglePanel('pinned'),
      closePinned: () => closePanel('pinned'),
      searchOpen,
      toggleSearch: () => togglePanel('search'),
      openSearch: () => setPanel('search'),
      closeSearch: () => closePanel('search'),
      linksOpen,
      toggleLinks: () => togglePanel('links'),
      closeLinks: () => closePanel('links'),
      clipsOpen,
      toggleClips: () => togglePanel('clips'),
      closeClips: () => closePanel('clips'),
      agendaOpen,
      suggestionsOpen,
      toggleSuggestions: () => togglePanel('suggestions'),
      closeSuggestions: () => closePanel('suggestions'),
      toggleAgenda: () => togglePanel('agenda'),
      closeAgenda: () => closePanel('agenda'),
      leaderboardOpen,
      toggleLeaderboard: () => togglePanel('leaderboard'),
      closeLeaderboard: () => closePanel('leaderboard')
    }),
    [
      width,
      density,
      isPhone,
      sidebarIsDrawer,
      sidebarOpen,
      sidebarWidth,
      setSidebarWidth,
      panelWidth,
      setPanelWidth,
      membersOpen,
      membersAuto,
      pinnedOpen,
      searchOpen,
      linksOpen,
      clipsOpen,
      agendaOpen,
      suggestionsOpen,
      leaderboardOpen,
      togglePanel,
      closePanel,
      view
    ]
  )

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
}

export function useLayout(): LayoutContextValue {
  const ctx = React.useContext(LayoutContext)
  if (!ctx) throw new Error('useLayout must be used within a LayoutProvider')
  return ctx
}
