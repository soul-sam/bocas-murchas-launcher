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

export type Density = 'wide' | 'compact' | 'narrow'

/** Abaixo disso a lista de membros sai. */
const COMPACT_AT = 1_180
/** Abaixo disso a barra de canais vira gaveta. */
const NARROW_AT = 900

/** O que ocupa a coluna do meio: a conversa ou a call. */
export type CenterView = 'chat' | 'voice'

interface LayoutContextValue {
  width: number
  density: Density
  /** Janela apertada: a barra de canais flutua por cima em vez de empurrar. */
  sidebarIsDrawer: boolean

  sidebarOpen: boolean
  toggleSidebar: () => void
  closeSidebar: () => void

  membersOpen: boolean
  toggleMembers: () => void

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
}

const LayoutContext = React.createContext<LayoutContextValue | null>(null)

function densityFor(width: number): Density {
  if (width < NARROW_AT) return 'narrow'
  if (width < COMPACT_AT) return 'compact'
  return 'wide'
}

export function LayoutProvider({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = React.useState(() => window.innerWidth)

  /** `null` = deixa o automatico decidir. */
  const [sidebarPref, setSidebarPref] = React.useState<boolean | null>(null)
  const [membersPref, setMembersPref] = React.useState<boolean | null>(null)
  const [pinnedOpen, setPinnedOpen] = React.useState(false)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [view, setView] = React.useState<CenterView>('chat')

  // Ctrl+F abre a busca do chat. O Chromium nao tem busca nativa de pagina no
  // Electron, entao a tecla estava sobrando — e e a que todo mundo aperta.
  React.useEffect(() => {
    const handle = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.code !== 'KeyF') return
      event.preventDefault()
      setSearchOpen(true)
      setPinnedOpen(false)
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
  const sidebarIsDrawer = density === 'narrow'

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
  const membersOpen = density === 'narrow' ? false : (membersPref ?? membersAuto)

  const value = React.useMemo<LayoutContextValue>(
    () => ({
      width,
      density,
      sidebarIsDrawer,
      sidebarOpen,
      toggleSidebar: () => setSidebarPref((prev) => !(prev ?? !sidebarIsDrawer)),
      closeSidebar: () => setSidebarPref(false),
      view,
      setView,
      membersOpen,
      toggleMembers: () => {
        setMembersPref((prev) => !(prev ?? membersAuto))
        setPinnedOpen(false)
        setSearchOpen(false)
      },
      pinnedOpen,
      togglePinned: () => {
        setPinnedOpen((prev) => !prev)
        setSearchOpen(false)
      },
      closePinned: () => setPinnedOpen(false),
      searchOpen,
      toggleSearch: () => {
        setSearchOpen((prev) => !prev)
        setPinnedOpen(false)
      },
      openSearch: () => {
        setSearchOpen(true)
        setPinnedOpen(false)
      },
      closeSearch: () => setSearchOpen(false)
    }),
    [
      width,
      density,
      sidebarIsDrawer,
      sidebarOpen,
      membersOpen,
      membersAuto,
      pinnedOpen,
      searchOpen,
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
