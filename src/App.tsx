import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { McAuthProvider } from '@/lib/mc-auth-context'
import { InstallProvider } from '@/lib/install-context'
import { LaunchProvider } from '@/lib/launch-context'
import { UpdaterProvider } from '@/lib/updater-context'
import { SettingsProvider } from '@/lib/settings-context'
import { ServerStatusProvider } from '@/lib/server-status-context'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { HomePage } from '@/pages/HomePage'
import { TitleBar } from '@/components/TitleBar'

function LoadingSplash() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
        Carregando<span className="terminal-cursor" />
      </div>
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingSplash />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingSplash />
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

export function App() {
  return (
    <AuthProvider>
      <McAuthProvider>
        <InstallProvider>
          <LaunchProvider>
            <UpdaterProvider>
              <SettingsProvider>
               <ServerStatusProvider>
                <HashRouter>
                  <div className="flex h-screen flex-col overflow-hidden bg-background">
                    <TitleBar />
                    <main className="flex min-h-0 flex-1 flex-col overflow-auto">
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
                        <Route
                          path="/"
                          element={
                            <RequireAuth>
                              <HomePage />
                            </RequireAuth>
                          }
                        />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </main>
                  </div>
                </HashRouter>
               </ServerStatusProvider>
              </SettingsProvider>
            </UpdaterProvider>
          </LaunchProvider>
        </InstallProvider>
      </McAuthProvider>
    </AuthProvider>
  )
}
