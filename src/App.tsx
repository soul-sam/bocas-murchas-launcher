import * as React from 'react'
import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { McAuthProvider } from '@/lib/mc-auth-context'
import { InstallProvider } from '@/lib/install-context'
import { LaunchProvider } from '@/lib/launch-context'
import { UpdaterProvider } from '@/lib/updater-context'
import { SettingsProvider } from '@/lib/settings-context'
import { ServerStatusProvider } from '@/lib/server-status-context'
import { SocketProvider } from '@/lib/socket-context'
import { MembersProvider } from '@/lib/members-context'
import { ChatProvider } from '@/lib/chat-context'
import { VoiceProvider, useVoice } from '@/lib/voice-context'
import { SoundboardProvider } from '@/lib/soundboard-context'
import { NudgeProvider, useNudge } from '@/lib/nudge-context'
import { AfkProvider } from '@/lib/afk-context'
import { HotkeysProvider } from '@/lib/hotkeys-context'
import { OverlayProvider, useOverlays } from '@/lib/overlay-context'
import { LayoutProvider } from '@/lib/layout-context'
import { ActivityProvider } from '@/lib/activity-context'
import { PartyProvider } from '@/lib/party-context'
import { GamificationProvider } from '@/lib/gamification-context'
import { WatchProvider } from '@/lib/watch-context'
import { EmojiProvider } from '@/lib/emoji-context'
import { PrintProvider } from '@/lib/print-context'
import { CargosProvider, useCargos } from '@/lib/cargos-context'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { HomePage } from '@/pages/HomePage'
import { SocialPage } from '@/pages/SocialPage'
import { PrintPage } from '@/pages/PrintPage'
import { TitleBar } from '@/components/TitleBar'
import { AppRail } from '@/components/social/AppRail'
import { NudgeOverlay } from '@/components/social/NudgeOverlay'
import { SettingsModal } from '@/components/SettingsModal'
import { ProfileEditor } from '@/components/social/ProfileEditor'
import { ScreenSharePicker } from '@/components/social/ScreenSharePicker'
import { UserContextMenu } from '@/components/social/UserContextMenu'
import { RichTextProvider } from '@/components/social/RichText'
import { QuickSwitcher } from '@/components/social/QuickSwitcher'
import { ShortcutsHelp } from '@/components/social/ShortcutsHelp'
import { ImageLightbox } from '@/components/social/ImageLightbox'
import { InterfaceGuardNotice } from '@/components/InterfaceGuardNotice'
import { PollComposer } from '@/components/social/PollComposer'
import { SuggestionComposer } from '@/components/social/SuggestionComposer'
import { EventComposer } from '@/components/social/EventComposer'
import { PartyComposer } from '@/components/social/PartyComposer'
import { ShopModal } from '@/components/social/ShopModal'
import { DropHost } from '@/components/social/DropHost'
import { PartyCallPrompt } from '@/components/social/PartyCallPrompt'
import { AdminModal } from '@/components/AdminModal'
import { WhatsNewModal } from '@/components/WhatsNewModal'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

function LoadingSplash() {
  return (
    <div className="flex h-full items-center justify-center">
      {/* Era mono, caixa-alta e espaçado: o "rótulo terminal" que a
          desintoxicação de set/2026 tirou de 182 lugares e que sobreviveu aqui
          por estar num <div>, fora do alcance do lint. Frase é Inter em caixa
          normal; o cursor piscando fica, que é a marca do app. */}
      <p className="text-sm text-muted-foreground">
        Carregando<span className="terminal-cursor" />
      </p>
    </div>
  )
}

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingSplash />
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

/**
 * Rota que exige permissão de cargo.
 *
 * Esconder o link da barra não basta: a rota é `#/impressao` numa HashRouter,
 * fica no histórico da janela e sobrevive a um logout/login com outra conta —
 * quem já entrou uma vez voltaria pra tela da impressora ao abrir o launcher.
 *
 * Enquanto o catálogo de cargos não chegou a resposta é "espera", não "não":
 * mandar pra home quem TEM o cargo, só porque o fetch não voltou ainda, seria
 * um chute pra fora da tela no meio do caminho.
 */
function RequirePermission({
  permission,
  children
}: {
  permission: string
  children: React.ReactNode
}) {
  const { can, ready } = useCargos()
  const { user } = useAuth()

  if (!ready && user?.role !== 'admin') return <LoadingSplash />
  if (!can(permission)) return <Navigate to="/" replace />
  return <>{children}</>
}

/** Casca autenticada: é ela que treme quando chega um nudge. */
function AuthedShell() {
  const { shaking } = useNudge()

  return (
    <div className={cn('flex min-h-0 flex-1', shaking && 'nudge-shake')}>
      <AppRail />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
      <NudgeOverlay />
      <GlobalOverlays />
    </div>
  )
}

/**
 * Todas as camadas que valem pro app inteiro, num lugar que só desmonta no
 * logout.
 *
 * O ponto NÃO é organização: uma modal do Radix arrancada da árvore com ela
 * aberta deixa `pointer-events: none` grudado no <body> e o app inteiro para de
 * aceitar clique — inclusive os botões de fechar a janela, que aqui são React.
 * Enquanto o editor de perfil morava na SocialPage e o seletor de tela dentro
 * do VoiceStage, bastava trocar de aba ou a call cair pra travar tudo. Detalhes
 * em lib/interaction-guard.ts e lib/overlay-context.tsx.
 */
function GlobalOverlays() {
  const { profileEditorOpen, closeProfileEditor } = useOverlays()

  return (
    <>
      <SettingsModal />
      <ProfileEditor open={profileEditorOpen} onClose={closeProfileEditor} />
      <ScreenPickerHost />
      <UserContextMenu />
      {/* Camadas próprias (sem Radix) porque vivem em cima de tudo e não
          podem trancar o <body> — ver lib/interaction-guard.ts. */}
      <QuickSwitcher />
      <ShortcutsHelp />
      <ImageLightbox />
      {/* Compositores de cartão e lojinha: abertos do compositor de mensagens
          e de comandos de barra, que vivem numa tela que some. */}
      <PollComposer />
      <SuggestionComposer />
      <EventComposer />
      <PartyComposer />
      <ShopModal />
      <AdminModal />
      {/* Novidades da versão: camada própria (sem Radix) porque pode abrir
          sozinha no primeiro quadro, antes de qualquer clique. */}
      <WhatsNewModal />
      {/* Banners: drops de admin e "tem gente do grupo no seu lobby". */}
      <DropHost />
      <PartyCallPrompt />
    </>
  )
}

/**
 * Seletor de tela.
 *
 * Fica num componente próprio só pra o `useVoice()` não subir: o contexto de
 * voz muda a cada mudança de quem está falando, e ninguém quer o diálogo de
 * configurações re-renderizando várias vezes por segundo durante uma conversa.
 */
function ScreenPickerHost() {
  const voice = useVoice()
  const { screenPickerOpen, closeScreenPicker } = useOverlays()

  const close = React.useCallback(() => {
    // Fonte marcada e nunca usada é permissão de captura pendurada.
    void window.bocas.screen.cancelSelection()
    closeScreenPicker()
  }, [closeScreenPicker])

  // Sair da call fecha o seletor: sem call não há o que compartilhar, e deixar
  // a modal aberta em cima de um palco vazio só confunde.
  React.useEffect(() => {
    if (!voice.connected && screenPickerOpen) close()
  }, [voice.connected, screenPickerOpen, close])

  return (
    <ScreenSharePicker
      open={screenPickerOpen}
      onClose={close}
      onConfirm={voice.startScreenShare}
    />
  )
}

/**
 * Rota de layout da área logada.
 *
 * Os providers do social ficam AQUI, num layout com <Outlet />, e não dentro de
 * cada rota. Se estivessem por rota, ir do chat pro Minecraft desmontaria o
 * socket e o LiveKit — ou seja, trocar de aba derrubaria a chamada de voz.
 */
function AuthedLayout() {
  const { user, loading } = useAuth()

  if (loading) return <LoadingSplash />
  if (!user) return <Navigate to="/login" replace />

  return (
    <SocketProvider>
      <MembersProvider>
        {/* Cargos ANTES do chat: é o cargo que decide se `@impressora-murcha`
            fala com você, e a decisão acontece no instante em que a mensagem
            chega — antes de qualquer tela montar. Só precisa de auth e socket,
            que já estão de pé aqui. */}
        <CargosProvider>
        <ChatProvider>
          <VoiceProvider>
            {/* Presença de jogo depende de chat (canais de voz), voz (entrar
                na call do 5-stack) e membros (Riot ID -> pessoa). */}
            <ActivityProvider>
              {/* AFK antes de soundboard/nudge: e o nudge que precisa saber
                  que voce esta fora pra nao te sacudir, e o AFK precisa da
                  voz (falar conta como estar presente). */}
              <AfkProvider>
              <SoundboardProvider>
                <NudgeProvider>
                  <HotkeysProvider>
                    <OverlayProvider>
                      <LayoutProvider>
                        {/* Emojis do servidor vêm ANTES do RichText, que os
                            desenha. Os outros só precisam de socket/overlays. */}
                        <EmojiProvider>
                          <GamificationProvider>
                            <PartyProvider>
                              <WatchProvider>
                                {/* Índices de @pessoa e #canal montados uma
                                    vez, não uma vez por mensagem na tela. */}
                                <RichTextProvider>
                                  {/* Impressora 3D: só precisa de socket e
                                      token, mas fica aqui pra a fila e a cota
                                      não remontarem ao trocar de aba. */}
                                  <PrintProvider>
                                    <AuthedShell />
                                  </PrintProvider>
                                </RichTextProvider>
                              </WatchProvider>
                            </PartyProvider>
                          </GamificationProvider>
                        </EmojiProvider>
                      </LayoutProvider>
                    </OverlayProvider>
                  </HotkeysProvider>
                </NudgeProvider>
              </SoundboardProvider>
              </AfkProvider>
            </ActivityProvider>
          </VoiceProvider>
        </ChatProvider>
        </CargosProvider>
      </MembersProvider>
    </SocketProvider>
  )
}

export function App() {
  return (
    /**
     * `delayDuration` 350ms: rápido o bastante pra quem foi ler a dica, lento
     * o bastante pra não piscar no caminho do mouse até o botão que a pessoa
     * já sabia qual era. `skipDelayDuration` 300ms faz a fileira de ícones do
     * cabeçalho se comportar como uma barra só — a segunda dica aparece na
     * hora, sem esperar de novo.
     *
     * `disableHoverableContent`: dica não é lugar de pôr o mouse. Sem isso ela
     * fica viva enquanto o ponteiro estiver em cima dela e atrapalha o clique
     * no botão de baixo.
     */
    <TooltipProvider delayDuration={350} skipDelayDuration={300} disableHoverableContent>
    <AuthProvider>
      <SettingsProvider>
        <McAuthProvider>
          <InstallProvider>
            <LaunchProvider>
              <UpdaterProvider>
                <ServerStatusProvider>
                  <HashRouter>
                    <div className="flex h-screen flex-col overflow-hidden bg-background">
                      <TitleBar />
                      <InterfaceGuardNotice />
                      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <Routes>
                          <Route
                            path="/login"
                            element={
                              <RedirectIfAuthed>
                                <LoginPage />
                              </RedirectIfAuthed>
                            }
                          />
                          <Route
                            path="/register"
                            element={
                              <RedirectIfAuthed>
                                <RegisterPage />
                              </RedirectIfAuthed>
                            }
                          />

                          <Route element={<AuthedLayout />}>
                            <Route path="/" element={<SocialPage />} />
                            <Route
                              path="/impressao"
                              element={
                                <RequirePermission permission="print">
                                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                                    <PrintPage />
                                  </div>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="/jogo"
                              element={
                                <div className="flex-1 overflow-auto">
                                  <HomePage />
                                </div>
                              }
                            />
                          </Route>

                          <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                      </main>
                    </div>
                  </HashRouter>
                </ServerStatusProvider>
              </UpdaterProvider>
            </LaunchProvider>
          </InstallProvider>
        </McAuthProvider>
      </SettingsProvider>
    </AuthProvider>
    </TooltipProvider>
  )
}
