import { FileText, Gamepad2, Loader2, Server, TriangleAlert, Wifi } from 'lucide-react'
import type { LaunchStatus } from '../../electron/preload/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSettings } from '@/lib/settings-context'
import { playUiSound } from '@/lib/ui-sounds'

interface Props {
  status: LaunchStatus
  readyToPlay: boolean
  onLaunch: () => void
  serverTarget?: string
}

export function PlayCard({ status, readyToPlay, onLaunch, serverTarget }: Props) {
  const { settings } = useSettings()
  const isPreparing = status.stage === 'preparing'
  const isRunning = status.stage === 'running'
  const isError = status.stage === 'error'

  const handleLaunch = () => {
    // O mesmo aviso de "entrei" da call: subir = algo começou.
    playUiSound('self-join', settings.soundEnabled ? settings.soundVolume : 0)
    onLaunch()
  }

  const target = serverTarget ?? status.serverTarget ?? '187.77.205.239:25565'

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <Gamepad2 className="mb-2 h-10 w-10 text-muted-foreground" />
        <CardTitle className="title-acid text-2xl">Servidor de Minecraft</CardTitle>
        <CardDescription className="mt-1 flex items-center justify-center gap-2">
          <Server className="h-3 w-3" />
          <span className="font-mono">{target}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!readyToPlay && status.stage === 'idle' && (
          <div className="rounded-brutal border border-dashed border-line-strong bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
            Conecte Microsoft + complete a instalação pra liberar
          </div>
        )}

        {isError && (
          <div className="rounded-brutal border-l-[3px] border-destructive bg-destructive/10 p-3">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-destructive">
              <TriangleAlert className="h-3 w-3" />
              Falha no launch
            </div>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-[11.5px] text-destructive">
              {status.error}
            </pre>
            {status.logPath && (
              <p className="mt-2 flex items-center gap-1 font-mono text-[11.5px] text-muted-foreground">
                <FileText className="h-3 w-3" />
                Log completo: {status.logPath}
              </p>
            )}
          </div>
        )}

        {isRunning && (
          <div className="rounded-brutal border-l-[3px] border-acid bg-acid/10 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-acid-text">
              <Wifi className="h-3 w-3 animate-pulse" />
              Em jogo — PID {status.pid}
            </div>
          </div>
        )}

        <Button
          size="lg"
          className="w-full"
          disabled={!readyToPlay || isPreparing || isRunning}
          onClick={handleLaunch}
        >
          {isPreparing ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Iniciando JVM…
            </>
          ) : isRunning ? (
            <>
              <Gamepad2 className="mr-2 h-5 w-5" />
              Jogando
            </>
          ) : (
            <>
              <Gamepad2 className="mr-2 h-5 w-5" />
              Jogar
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
