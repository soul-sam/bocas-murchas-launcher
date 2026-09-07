import { LogOut, Settings as SettingsIcon, Shield } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useMcAuth } from '@/lib/mc-auth-context'
import { useInstall } from '@/lib/install-context'
import { useLaunch } from '@/lib/launch-context'
import { useSettings } from '@/lib/settings-context'
import { useOverlays } from '@/lib/overlay-context'
import { Button } from '@/components/ui/button'
import { MicrosoftAccountCard } from '@/components/MicrosoftAccountCard'
import { MicrosoftDeviceCodeModal } from '@/components/MicrosoftDeviceCodeModal'
import { InstallStatusCard } from '@/components/InstallStatusCard'
import { PlayCard } from '@/components/PlayCard'
import { UpdateBanner } from '@/components/UpdateBanner'
import { ServerStatusCard } from '@/components/ServerStatusCard'
import { ChangelogModal } from '@/components/ChangelogModal'

export function HomePage() {
  const { user, logout } = useAuth()
  const mc = useMcAuth()
  const install = useInstall()
  const launch = useLaunch()
  const settings = useSettings()
  // O painel admin vive em GlobalOverlays; aqui só o botão que pede pra abrir.
  const { openAdmin } = useOverlays()

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
            className="h-10 w-10"
          />
          <div>
            <h1 className="title-brutal brand-wordmark text-3xl">Bocas Murchas</h1>
            <p className="text-xs text-muted-foreground">
              Logado como{' '}
              <span className="font-medium text-foreground">{user?.displayName ?? user?.username}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="ghost" size="sm" onClick={openAdmin}>
              <Shield className="mr-2 h-4 w-4" />
              Painel admin
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

      {/* A tela existe pra apertar JOGAR: ele vem primeiro, e o que o
          bloqueia (conta Microsoft, instalacao) vem embaixo como pre-requisito
          — antes ficava no fim de uma pilha de quatro cards iguais. O status
          do servidor e informacao, nao acao, e fecha a coluna. */}
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4">
        <UpdateBanner />

        <PlayCard
          status={launch.status}
          readyToPlay={readyToPlay}
          onLaunch={() => void launch.launch()}
        />

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

        <ServerStatusCard />
      </main>

      <ChangelogModal />
    </div>
  )
}
