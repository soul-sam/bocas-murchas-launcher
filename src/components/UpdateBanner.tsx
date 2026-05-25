import { Download, RefreshCw, Sparkles } from 'lucide-react'
import { useUpdater } from '@/lib/updater-context'
import { Button } from '@/components/ui/button'

export function UpdateBanner() {
  const { status, applyUpdate } = useUpdater()

  if (status.stage === 'idle' || status.stage === 'checking' || status.stage === 'not-available' || status.stage === 'error') {
    return null
  }

  if (status.stage === 'available' || status.stage === 'downloading') {
    const percent = Math.round(status.percent ?? 0)
    return (
      <div className="mb-4 rounded-brutal border-2 border-burn bg-burn/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <Download className="h-4 w-4 animate-pulse text-burn" />
          <div className="flex-1">
            <p className="font-display text-sm uppercase tracking-wider text-burn">
              Atualização v{status.newVersion} disponível
            </p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Baixando em background — {percent}%
            </p>
          </div>
          <div className="h-1.5 w-32 overflow-hidden rounded-full border border-burn/50 bg-void">
            <div className="h-full bg-burn transition-all duration-150" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>
    )
  }

  // status.stage === 'downloaded'
  return (
    <div className="mb-4 rounded-brutal border-2 border-acid bg-acid/10 px-4 py-3 shadow-glow-acid">
      <div className="flex items-center gap-3">
        <Sparkles className="h-4 w-4 text-acid" />
        <div className="flex-1">
          <p className="font-display text-sm uppercase tracking-wider text-acid">
            Atualização v{status.newVersion} pronta
          </p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Reinicie pra aplicar
          </p>
        </div>
        <Button size="sm" onClick={() => void applyUpdate()}>
          <RefreshCw className="mr-2 h-3 w-3" />
          Reiniciar agora
        </Button>
      </div>
    </div>
  )
}
