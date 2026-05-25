import { Boxes, CheckCircle2, Coffee, Cog, FileBox, Loader2, Pickaxe, RefreshCw, TriangleAlert } from 'lucide-react'
import type { InstallStatus, McInstallSubStage, ModpackSubStage } from '../../electron/preload/types'
import { Button } from '@/components/ui/button'

interface Props {
  status: InstallStatus
  ready: boolean
  onRecheck: () => void
}

const MC_SUBSTAGE_LABELS: Record<McInstallSubStage, string> = {
  manifest: 'Buscando manifest Mojang',
  client: 'Baixando client.jar',
  libraries: 'Baixando bibliotecas',
  assetIndex: 'Index de assets',
  assets: 'Baixando assets',
  done: 'Finalizando'
}

const MODPACK_SUBSTAGE_LABELS: Record<ModpackSubStage, string> = {
  check: 'Checando atualização do modpack',
  download: 'Baixando modpack.zip',
  extract: 'Descomprimindo',
  apply: 'Aplicando mods + configs',
  done: 'Modpack atualizado',
  skipped: 'Sem release publicada ainda'
}

const STAGE_TITLES: Record<string, string> = {
  starting: 'Inicializando',
  java: 'Verificando Java 17',
  minecraft: 'Verificando Minecraft',
  forge: 'Verificando Forge',
  modpack: 'Sincronizando modpack'
}

function formatBytes(n: number): string {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function pct(current: number, total: number): number {
  if (!total) return 0
  return Math.min(100, Math.round((current / total) * 100))
}

function StageIcon({ stage }: { stage: string }) {
  const className = 'h-5 w-5 animate-pulse text-acid'
  switch (stage) {
    case 'java':
      return <Coffee className={className} />
    case 'minecraft':
      return <Pickaxe className={className} />
    case 'forge':
      return <Cog className={className} />
    case 'modpack':
      return <Boxes className={className} />
    default:
      return <Loader2 className={className} />
  }
}

function subStageLabel(stage: string, sub: string | undefined): string | undefined {
  if (!sub) return undefined
  if (stage === 'minecraft') return MC_SUBSTAGE_LABELS[sub as McInstallSubStage]
  if (stage === 'modpack') return MODPACK_SUBSTAGE_LABELS[sub as ModpackSubStage]
  return undefined
}

function isCountStage(stage: string, sub: string | undefined): boolean {
  return stage === 'minecraft' && (sub === 'libraries' || sub === 'assets')
}

export function InstallStatusCard({ status, ready, onRecheck }: Props) {
  if (!ready) {
    return (
      <div className="card-gradient rounded-brutal p-5 opacity-60">
        <div className="flex items-center gap-3">
          <FileBox className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-display text-base uppercase tracking-wider text-foreground">
              Minecraft + modpack
            </p>
            <p className="text-xs text-muted-foreground">
              Conecte sua conta Microsoft pra liberar a verificação.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (status.stage === 'idle' || status.stage === 'starting') {
    return (
      <div className="card-gradient rounded-brutal px-5 py-3">
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-acid" />
          <p className="flex-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Verificando instalação<span className="terminal-cursor" />
          </p>
        </div>
      </div>
    )
  }

  if (status.stage === 'done') {
    return (
      <div className="card-gradient rounded-brutal px-5 py-3">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-4 w-4 text-acid" />
          <p className="flex-1 font-mono text-xs uppercase tracking-widest text-foreground">
            Tudo atualizado <span className="text-muted-foreground">— Java + Minecraft + Forge + modpack</span>
          </p>
          <Button variant="ghost" size="sm" onClick={onRecheck} title="Re-verificar SHA-1 de todos os arquivos">
            <RefreshCw className="mr-1 h-3 w-3" />
            Re-verificar
          </Button>
        </div>
      </div>
    )
  }

  if (status.stage === 'error') {
    return (
      <div className="rounded-brutal border-2 border-destructive bg-destructive/10 p-5">
        <div className="mb-3 flex items-start gap-3">
          <TriangleAlert className="mt-0.5 h-5 w-5 text-destructive" />
          <div>
            <p className="font-display text-base uppercase tracking-wider text-destructive">
              Falha na verificação
            </p>
            <p className="mt-1 break-all font-mono text-xs text-destructive">{status.error}</p>
          </div>
        </div>
        <Button variant="outline" onClick={onRecheck} className="w-full" size="sm">
          Tentar de novo
        </Button>
      </div>
    )
  }

  const title = STAGE_TITLES[status.stage] ?? 'Verificando…'
  const sub = subStageLabel(status.stage, status.subStage)
  const percent = pct(status.current, status.total)
  const counts = isCountStage(status.stage, status.subStage)

  return (
    <div className="card-acid rounded-brutal p-5">
      <div className="mb-3 flex items-center gap-3">
        <StageIcon stage={status.stage} />
        <div className="flex-1">
          <p className="font-display text-base uppercase tracking-wider text-foreground">
            {title}
          </p>
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {sub ?? status.detail ?? 'Preparando…'}
          </p>
        </div>
        <Loader2 className="h-4 w-4 animate-spin text-acid" />
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full border border-acid-dark bg-void">
        <div
          className="h-full bg-gradient-to-r from-slime-dark to-acid transition-all duration-150"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span className="truncate">{status.detail ?? ''}</span>
        <span className="ml-2 shrink-0 text-acid">
          {counts
            ? `${status.current}/${status.total}`
            : status.total
              ? `${formatBytes(status.current)} / ${formatBytes(status.total)}`
              : `${percent}%`}
        </span>
      </div>
    </div>
  )
}
