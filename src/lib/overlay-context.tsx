import * as React from 'react'

/**
 * Estado das camadas que valem pro app inteiro: modais globais, o visualizador
 * de imagem, o troca-canal rapido e o menu de botao direito nos usuarios.
 *
 * POR QUE AS MODAIS MORAM AQUI: uma modal do Radix ARRANCADA da arvore com ela
 * aberta (em vez de fechada) deixa `pointer-events: none` grudado no <body> — e
 * o app inteiro para de aceitar clique, incluindo os botoes de fechar a janela.
 * Explicacao completa em lib/interaction-guard.ts.
 *
 * Era exatamente o que acontecia:
 *
 *   - o seletor de tela morava dentro do VoiceStage, que sai da tela assim que
 *     a call cai. Uma queda de conexao com o seletor aberto matava o app.
 *   - o editor de perfil morava na SocialPage, que some ao trocar pra aba do
 *     Minecraft.
 *
 * Com o estado aqui, as duas sao renderizadas num ponto da arvore que so
 * desmonta no logout: quem abre so pede a abertura, e fechar e sempre uma
 * transicao de verdade.
 *
 * POR QUE O MENU DE CONTEXTO MORA AQUI: e um menu so, montado uma vez, igual
 * menu de contexto de programa de verdade. A alternativa — um Radix por linha
 * de usuario — colocaria dezenas de menus montados na lista de membros e traria
 * de volta o mesmo risco de camada arrancada quando alguem fica offline com o
 * menu dele aberto.
 */

export interface UserMenuTarget {
  userId: string
  /** Posicao do cursor na hora do clique, em coordenadas de viewport. */
  x: number
  y: number
}

interface OverlayContextValue {
  profileEditorOpen: boolean
  openProfileEditor: () => void
  closeProfileEditor: () => void

  screenPickerOpen: boolean
  openScreenPicker: () => void
  closeScreenPicker: () => void

  /** Imagem aberta em tela cheia (URL ja resolvida). */
  lightbox: string | null
  openLightbox: (url: string) => void
  closeLightbox: () => void

  /** Troca-canal do Ctrl+K. */
  quickSwitcherOpen: boolean
  openQuickSwitcher: () => void
  closeQuickSwitcher: () => void

  /** Lista de atalhos do Ctrl+/. */
  shortcutsOpen: boolean
  toggleShortcuts: () => void
  closeShortcuts: () => void

  userMenu: UserMenuTarget | null
  /** Abre o menu de contexto de um usuario. Ja cancela o menu nativo. */
  openUserMenu: (event: React.MouseEvent, userId: string) => void
  closeUserMenu: () => void

  /**
   * Compositores de cartao (enquete, evento da agenda, "bora?") e a lojinha.
   *
   * Moram aqui pelo mesmo motivo das outras modais: sao abertos do
   * compositor de mensagens (que some ao trocar de aba) e de comandos /barra,
   * e precisam viver num ponto da arvore que nao desmonta.
   */
  pollComposerOpen: boolean
  openPollComposer: () => void
  closePollComposer: () => void

  eventComposerOpen: boolean
  /** Texto inicial vindo de um comando tipo "/marcar sexta 21h LoL". */
  eventComposerSeed: string | null
  openEventComposer: (seed?: string) => void
  closeEventComposer: () => void

  partyComposerOpen: boolean
  partyComposerSeed: string | null
  openPartyComposer: (seed?: string) => void
  closePartyComposer: () => void

  shopOpen: boolean
  openShop: () => void
  closeShop: () => void

  /** Painel admin (convites, membros, sons, ferramentas) como camada global. */
  adminOpen: boolean
  openAdmin: () => void
  closeAdmin: () => void
}

const OverlayContext = React.createContext<OverlayContextValue | null>(null)

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [profileEditorOpen, setProfileEditorOpen] = React.useState(false)
  const [screenPickerOpen, setScreenPickerOpen] = React.useState(false)
  const [lightbox, setLightbox] = React.useState<string | null>(null)
  const [quickSwitcherOpen, setQuickSwitcherOpen] = React.useState(false)
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false)
  const [userMenu, setUserMenu] = React.useState<UserMenuTarget | null>(null)
  const [pollComposerOpen, setPollComposerOpen] = React.useState(false)
  const [eventComposerOpen, setEventComposerOpen] = React.useState(false)
  const [eventComposerSeed, setEventComposerSeed] = React.useState<string | null>(null)
  const [partyComposerOpen, setPartyComposerOpen] = React.useState(false)
  const [partyComposerSeed, setPartyComposerSeed] = React.useState<string | null>(null)
  const [shopOpen, setShopOpen] = React.useState(false)
  const [adminOpen, setAdminOpen] = React.useState(false)

  const openUserMenu = React.useCallback((event: React.MouseEvent, userId: string) => {
    event.preventDefault()
    // Sem isso o clique sobe pra uma linha de fora (um canal de voz, por
    // exemplo) e abre o menu da pessoa errada.
    event.stopPropagation()
    setUserMenu({ userId, x: event.clientX, y: event.clientY })
  }, [])

  /**
   * Atalhos de teclado das camadas.
   *
   * Ficam aqui e nao no hotkeys-context porque nao passam pelo processo main:
   * so valem com a janela em foco e nao devem roubar a tecla do sistema.
   */
  React.useEffect(() => {
    const handle = (event: KeyboardEvent): void => {
      const ctrl = event.ctrlKey || event.metaKey

      if (ctrl && event.code === 'KeyK') {
        event.preventDefault()
        setQuickSwitcherOpen((prev) => !prev)
        return
      }

      // Slash exige Shift em teclado ABNT2; comparar por `key` cobre os dois.
      if (ctrl && (event.key === '/' || event.key === '?')) {
        event.preventDefault()
        setShortcutsOpen((prev) => !prev)
        return
      }

      if (event.key === 'Escape' && lightbox) {
        event.preventDefault()
        setLightbox(null)
      }
    }

    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [lightbox])

  const value = React.useMemo<OverlayContextValue>(
    () => ({
      profileEditorOpen,
      openProfileEditor: () => setProfileEditorOpen(true),
      closeProfileEditor: () => setProfileEditorOpen(false),
      screenPickerOpen,
      openScreenPicker: () => setScreenPickerOpen(true),
      closeScreenPicker: () => setScreenPickerOpen(false),
      lightbox,
      openLightbox: (url: string) => setLightbox(url),
      closeLightbox: () => setLightbox(null),
      quickSwitcherOpen,
      openQuickSwitcher: () => setQuickSwitcherOpen(true),
      closeQuickSwitcher: () => setQuickSwitcherOpen(false),
      shortcutsOpen,
      toggleShortcuts: () => setShortcutsOpen((prev) => !prev),
      closeShortcuts: () => setShortcutsOpen(false),
      userMenu,
      openUserMenu,
      closeUserMenu: () => setUserMenu(null),

      pollComposerOpen,
      openPollComposer: () => setPollComposerOpen(true),
      closePollComposer: () => setPollComposerOpen(false),

      eventComposerOpen,
      eventComposerSeed,
      openEventComposer: (seed?: string) => {
        setEventComposerSeed(seed ?? null)
        setEventComposerOpen(true)
      },
      closeEventComposer: () => setEventComposerOpen(false),

      partyComposerOpen,
      partyComposerSeed,
      openPartyComposer: (seed?: string) => {
        setPartyComposerSeed(seed ?? null)
        setPartyComposerOpen(true)
      },
      closePartyComposer: () => setPartyComposerOpen(false),

      shopOpen,
      openShop: () => setShopOpen(true),
      closeShop: () => setShopOpen(false),

      adminOpen,
      openAdmin: () => setAdminOpen(true),
      closeAdmin: () => setAdminOpen(false)
    }),
    [
      profileEditorOpen,
      screenPickerOpen,
      lightbox,
      quickSwitcherOpen,
      shortcutsOpen,
      userMenu,
      openUserMenu,
      pollComposerOpen,
      eventComposerOpen,
      eventComposerSeed,
      partyComposerOpen,
      partyComposerSeed,
      shopOpen,
      adminOpen
    ]
  )

  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>
}

export function useOverlays(): OverlayContextValue {
  const ctx = React.useContext(OverlayContext)
  if (!ctx) throw new Error('useOverlays must be used within an OverlayProvider')
  return ctx
}
