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
import { HotkeysProvider } from '@/lib/hotkeys-context'
import { OverlayProvider, useOverlays } from '@/lib/overlay-context'
import { LayoutProvider } from '@/lib/layout-context'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { HomePage } from '@/pages/HomePage'
import { SocialPage } from '@/pages/SocialPage'
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
import { cn } from '@/lib/utils'

function LoadingSplash() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
        Carregando<span className="terminal-cursor" />
      </div>
    </div>
  )
}

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingSplash />
  if (user) return <Navigate to="/" replace />
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
        <ChatProvider>
          <VoiceProvider>
            <SoundboardProvider>
              <NudgeProvider>
                <HotkeysProvider>
                  <OverlayProvider>
                    <LayoutProvider>
                      {/* Índices de @pessoa e #canal montados uma vez, não
                          uma vez por mensagem na tela. */}
                      <RichTextProvider>
                        <AuthedShell />
                      </RichTextProvider>
                    </LayoutProvider>
                  </OverlayProvider>
                </HotkeysProvider>
              </NudgeProvider>
            </SoundboardProvider>
          </VoiceProvider>
        </ChatProvider>
      </MembersProvider>
    </SocketProvider>
  )
}

export function App() {
  return (
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
  )
}
