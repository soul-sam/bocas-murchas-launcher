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
import { VoiceProvider } from '@/lib/voice-context'
import { SoundboardProvider } from '@/lib/soundboard-context'
import { NudgeProvider, useNudge } from '@/lib/nudge-context'
import { HotkeysProvider } from '@/lib/hotkeys-context'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { HomePage } from '@/pages/HomePage'
import { SocialPage } from '@/pages/SocialPage'
import { TitleBar } from '@/components/TitleBar'
import { AppRail } from '@/components/social/AppRail'
import { NudgeOverlay } from '@/components/social/NudgeOverlay'
import { SettingsModal } from '@/components/SettingsModal'
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
      {/* Uma instância só: a barra lateral do social e a tela do jogo abrem a
          mesma modal, e duas montadas ao mesmo tempo abririam dois diálogos. */}
      <SettingsModal />
    </div>
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
                  <AuthedShell />
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
