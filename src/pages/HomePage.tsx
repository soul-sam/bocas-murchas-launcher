import * as React from 'react'
import { LogOut, Settings as SettingsIcon, Shield } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useMcAuth } from '@/lib/mc-auth-context'
import { useInstall } from '@/lib/install-context'
import { useLaunch } from '@/lib/launch-context'
import { useSettings } from '@/lib/settings-context'
import { Button } from '@/components/ui/button'
import { MicrosoftAccountCard } from '@/components/MicrosoftAccountCard'
import { MicrosoftDeviceCodeModal } from '@/components/MicrosoftDeviceCodeModal'
import { InstallStatusCard } from '@/components/InstallStatusCard'
import { PlayCard } from '@/components/PlayCard'
import { UpdateBanner } from '@/components/UpdateBanner'
import { ServerStatusCard } from '@/components/ServerStatusCard'
import { ChangelogModal } from '@/components/ChangelogModal'
import { AdminPanel } from '@/components/AdminPanel'
import { SettingsModal } from '@/components/SettingsModal'

export function HomePage() {
  const { user, logout } = useAuth()
  const mc = useMcAuth()
  const install = useInstall()
  const launch = useLaunch()
  const settings = useSettings()
  const [adminOpen, setAdminOpen] = React.useState(false)

  const readyToPlay = !!mc.profile && install.status.stage === 'done'
  const isAdmin = user?.role === 'admin'

  return (
    <div className="flex flex-1 flex-col p-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="bocas-murchas-transp.png"
            alt=""
            aria-hidden
            className="h-10 w-10 drop-shadow-[0_0_10px_rgba(106,255,0,0.5)]"
          />
          <div>
            <h1 className="title-brutal text-3xl">Bocas Murchas</h1>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Logado como{' '}
              <span className="text-acid">{user?.displayName ?? user?.username}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="ghost" size="sm" onClick={() => setAdminOpen(true)}>
              <Shield className="mr-2 h-4 w-4" />
              Admin
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={settings.open}>
            <SettingsIcon className="mr-2 h-4 w-4" />
            Config
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5">
        <UpdateBanner />
        <ServerStatusCard />
        <MicrosoftAccountCard
          profile={mc.profile}
          onConnect={mc.connect}
          onDisconnect={mc.disconnect}
          busy={mc.loading}
        />
        <MicrosoftDeviceCodeModal />

        <InstallStatusCard
          status={install.status}
          ready={!!mc.profile}
          onRecheck={() => void install.recheck()}
        />

        <PlayCard
          status={launch.status}
          readyToPlay={readyToPlay}
          onLaunch={() => void launch.launch()}
        />
      </main>

      <SettingsModal />
      <ChangelogModal />
      {isAdmin && <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />}
    </div>
  )
}
