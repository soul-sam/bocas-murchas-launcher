import * as React from 'react'
import { ScrollText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/lib/settings-context'
import type { ModpackChangelog } from '../../electron/preload/types'

function renderBody(body: string): React.ReactNode {
  // GitHub release notes come as Markdown. Without pulling in a md renderer,
  // we just strip the heaviest formatting (#, *, _, [text](url)) and present
  // the lines as a vertical list, keeping basic bullets visible.
  const lines = body.split('\n').map((l) => l.trimEnd())
  return (
    <div className="space-y-2 font-mono text-[12px] leading-relaxed text-foreground">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />
        if (/^#+\s/.test(line)) {
          return (
            <div
              key={i}
              className="mt-3 font-display text-sm uppercase tracking-wider text-acid"
            >
              {line.replace(/^#+\s/, '')}
            </div>
          )
        }
        const isBullet = /^\s*[-*]\s/.test(line)
        const cleaned = line
          .replace(/^\s*[-*]\s/, '')
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/`(.*?)`/g, '$1')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        return (
          <div key={i} className="flex gap-2">
            {isBullet && <span className="text-acid">›</span>}
            <span>{cleaned}</span>
          </div>
        )
      })}
    </div>
  )
}

export function ChangelogModal() {
  const { settings, update } = useSettings()
  const [changelog, setChangelog] = React.useState<ModpackChangelog | null>(null)
  const [open, setOpen] = React.useState(false)
  const [dismissed, setDismissed] = React.useState(false)

  React.useEffect(() => {
    if (dismissed || !settings) return

    void (async () => {
      const [installedTag, cl] = await Promise.all([
        window.bocas.modpack.installedTag(),
        window.bocas.modpack.changelog()
      ])

      // Only surface notes once a modpack version is actually installed and the
      // installed tag matches the latest published release the user hasn't seen.
      if (!installedTag || !cl) return
      if (cl.tag !== installedTag) return
      if (settings.lastSeenModpackTag === installedTag) return

      setChangelog(cl)
      setOpen(true)
    })()
  }, [settings, dismissed])

  const close = React.useCallback(async () => {
    setOpen(false)
    setDismissed(true)
    if (changelog) {
      await update({ lastSeenModpackTag: changelog.tag })
    }
  }, [changelog, update])

  if (!open || !changelog) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={close}
    >
      <div
        className="card-acid relative w-full max-w-lg rounded-brutal p-6 scanlines"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Fechar"
          onClick={() => void close()}
          className="absolute right-3 top-3 text-muted-foreground hover:text-acid"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-4 flex items-center gap-3">
          <ScrollText className="h-7 w-7 text-acid drop-shadow-[0_0_8px_rgba(106,255,0,0.6)]" />
          <div>
            <h2 className="title-brutal text-2xl">Modpack atualizado</h2>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {changelog.name ?? changelog.tag} ·{' '}
              {new Date(changelog.publishedAt).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto rounded-brutal border border-acid-dark bg-void p-4">
          {changelog.body ? (
            renderBody(changelog.body)
          ) : (
            <p className="font-mono text-xs text-muted-foreground">
              Sem notas de versão.
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={() => void close()} className="btn-acid">
            Entendi
          </Button>
        </div>
      </div>
    </div>
  )
}
