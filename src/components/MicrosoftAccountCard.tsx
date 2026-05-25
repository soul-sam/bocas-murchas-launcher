import { LogOut, UserCheck, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface McProfile {
  id: string
  name: string
}

interface Props {
  profile: McProfile | null
  onConnect: () => void | Promise<void>
  onDisconnect: () => void | Promise<void>
  busy?: boolean
}

function avatarUrl(uuid: string): string {
  return `https://crafatar.com/avatars/${uuid}?size=64&overlay`
}

export function MicrosoftAccountCard({ profile, onConnect, onDisconnect, busy }: Props) {
  if (!profile) {
    return (
      <div className="card-gradient rounded-brutal p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-brutal border-2 border-dashed border-border bg-muted/30">
            <UserPlus className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="font-display text-base uppercase tracking-wider text-foreground">
              Conta Microsoft
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Conecte sua conta pra jogar com seu nick do Minecraft Java.
            </p>
          </div>
        </div>

        <Button onClick={() => void onConnect()} disabled={busy} className="w-full" size="lg">
          <UserPlus className="mr-2 h-4 w-4" />
          Conectar Microsoft
        </Button>
      </div>
    )
  }

  return (
    <div className="card-acid rounded-brutal p-5">
      <div className="flex items-center gap-4">
        <img
          src={avatarUrl(profile.id)}
          alt={profile.name}
          width={56}
          height={56}
          className="rounded-brutal border-2 border-acid bg-void shadow-glow-acid"
        />
        <div className="flex-1">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Conectado como
          </p>
          <p className="font-display text-xl uppercase tracking-wider text-foreground">
            {profile.name}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-acid">
            <UserCheck className="h-3 w-3" />
            Conta Microsoft validada
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void onDisconnect()} disabled={busy}>
          <LogOut className="mr-1 h-3 w-3" />
          Sair
        </Button>
      </div>
    </div>
  )
}
