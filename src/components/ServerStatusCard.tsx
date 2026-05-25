import * as React from 'react'
import { RefreshCw, Server, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useServerStatus } from '@/lib/server-status-context'
import type { PlayerSample } from '../../electron/preload/types'

function PlayerAvatar({ player }: { player: PlayerSample }) {
  // Crafatar accepts uuid with or without dashes. Sample IDs come dashed.
  const [errored, setErrored] = React.useState(false)
  const url = `https://crafatar.com/avatars/${player.id}?size=32&overlay`

  return (
    <div
      className="group relative"
      title={player.name}
      aria-label={`${player.name} online`}
    >
      {errored ? (
        <div className="flex h-8 w-8 items-center justify-center rounded-sm border-2 border-acid-dark bg-void font-mono text-[10px] text-acid">
          {player.name.slice(0, 2).toUpperCase()}
        </div>
      ) : (
        <img
          src={url}
          alt={player.name}
          width={32}
          height={32}
          onError={() => setErrored(true)}
          className="h-8 w-8 rounded-sm border-2 border-acid-dark bg-void shadow-[0_0_8px_rgba(106,255,0,0.3)]"
        />
      )}
      <span className="pointer-events-none absolute -bottom-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-brutal border border-acid-dark bg-void px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-foreground group-hover:block">
        {player.name}
      </span>
    </div>
  )
}

export function ServerStatusCard() {
  const { status, refresh, refreshing } = useServerStatus()

  if (!status) {
    return (
      <div className="card-gradient rounded-brutal p-4">
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Verificando servidor<span className="terminal-cursor" />
        </div>
      </div>
    )
  }

  const online = status.online
  const dotClass = online
    ? 'bg-acid shadow-[0_0_12px_rgba(106,255,0,0.8)] animate-pulse'
    : 'bg-destructive'

  const peopleOnline = status.playersOnline ?? 0
  const peopleMax = status.playersMax ?? 0
  const sample = status.sample ?? []

  return (
    <div className="card-gradient rounded-brutal p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${dotClass}`} aria-hidden />
          <div>
            <div className="flex items-center gap-2">
              <Server className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-display text-sm uppercase tracking-wider text-foreground">
                {online ? 'Servidor Online' : 'Servidor Offline'}
              </span>
            </div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {status.host}:{status.port}
              {online && status.latencyMs !== undefined ? (
                <> · {status.latencyMs}ms</>
              ) : null}
              {!online && status.error ? <> · {status.error}</> : null}
            </div>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void refresh()}
          disabled={refreshing}
          aria-label="Atualizar status"
          title="Atualizar status"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {online && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span className="text-acid">{peopleOnline}</span>
            <span>/ {peopleMax} online</span>
          </div>
          {sample.length > 0 && (
            <div className="flex items-center gap-1.5">
              {sample.slice(0, 8).map((p) => (
                <PlayerAvatar key={p.id || p.name} player={p} />
              ))}
              {sample.length > 8 && (
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                  +{sample.length - 8}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
