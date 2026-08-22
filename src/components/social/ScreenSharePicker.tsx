import * as React from 'react'
import { Monitor, AppWindow, Volume2, Loader2 } from 'lucide-react'
import type { ScreenSource } from '../../../electron/preload/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SCREEN_QUALITY, type ScreenQuality } from '@/lib/voice-context'

const QUALITY_LABEL: Record<ScreenQuality, string> = {
  '720p30': '720p 30fps — leve',
  '1080p30': '1080p 30fps — equilibrado',
  '1080p60': '1080p 60fps — pesado'
}

interface ScreenSharePickerProps {
  open: boolean
  onClose: () => void
  onConfirm: (
    sourceId: string,
    options: { withAudio: boolean; quality: ScreenQuality }
  ) => Promise<void>
}

export function ScreenSharePicker({ open, onClose, onConfirm }: ScreenSharePickerProps) {
  const [sources, setSources] = React.useState<ScreenSource[]>([])
  const [loading, setLoading] = React.useState(false)
  const [selected, setSelected] = React.useState<string | null>(null)
  const [withAudio, setWithAudio] = React.useState(true)
  const [quality, setQuality] = React.useState<ScreenQuality>('720p30')
  const [starting, setStarting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return

    setLoading(true)
    setError(null)
    setSelected(null)

    window.bocas.screen
      .listSources()
      .then((list) => {
        setSources(list)
        // Pre-seleciona a tela principal: e o caso comum.
        const firstScreen = list.find((s) => s.isScreen)
        if (firstScreen) setSelected(firstScreen.id)
      })
      .catch(() => setError('Não consegui listar as telas'))
      .finally(() => setLoading(false))
  }, [open])

  // Deixar uma fonte marcada no main sem usar seria uma permissao pendurada.
  const handleClose = React.useCallback(() => {
    void window.bocas.screen.cancelSelection()
    onClose()
  }, [onClose])

  const handleConfirm = async (): Promise<void> => {
    if (!selected) return
    setStarting(true)
    setError(null)
    try {
      await onConfirm(selected, { withAudio, quality })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao compartilhar')
    } finally {
      setStarting(false)
    }
  }

  const screens = sources.filter((s) => s.isScreen)
  const windows = sources.filter((s) => !s.isScreen)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Compartilhar tela</DialogTitle>
          <DialogDescription>Escolha o que a galera vai ver</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="font-mono text-xs uppercase tracking-widest">
                Procurando janelas…
              </span>
            </div>
          ) : (
            <>
              {screens.length > 0 && (
                <SourceGroup
                  icon={<Monitor className="h-3.5 w-3.5" />}
                  label="Telas"
                  sources={screens}
                  selected={selected}
                  onSelect={setSelected}
                />
              )}
              {windows.length > 0 && (
                <SourceGroup
                  icon={<AppWindow className="h-3.5 w-3.5" />}
                  label="Janelas"
                  sources={windows}
                  selected={selected}
                  onSelect={setSelected}
                />
              )}
              {sources.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma janela disponível.
                </p>
              )}
            </>
          )}
        </div>

        <div className="mt-4 flex shrink-0 flex-wrap items-center gap-4 border-t border-[#1a1a1a] pt-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={withAudio}
              onChange={(e) => setWithAudio(e.target.checked)}
              className="h-4 w-4 accent-[#6AFF00]"
            />
            <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Levar o som do sistema</span>
          </label>

          <label className="ml-auto flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Qualidade
            </span>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as ScreenQuality)}
              className="input-terminal h-8 rounded-brutal px-2 text-xs"
            >
              {(Object.keys(SCREEN_QUALITY) as ScreenQuality[]).map((key) => (
                <option key={key} value={key}>
                  {QUALITY_LABEL[key]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <p className="mt-2 shrink-0 text-xs text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={starting}>
            Cancelar
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={!selected || starting}>
            {starting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Iniciando…
              </>
            ) : (
              'Compartilhar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SourceGroup({
  icon,
  label,
  sources,
  selected,
  onSelect
}: {
  icon: React.ReactNode
  label: string
  sources: ScreenSource[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </h3>

      <div className="grid grid-cols-3 gap-2">
        {sources.map((source) => (
          <button
            key={source.id}
            type="button"
            onClick={() => onSelect(source.id)}
            className={cn(
              'group overflow-hidden rounded-brutal border-2 text-left transition-all',
              selected === source.id
                ? 'border-acid shadow-[0_0_18px_rgba(106,255,0,0.25)]'
                : 'border-[#1a1a1a] hover:border-acid/50'
            )}
          >
            <img
              src={source.thumbnailDataUrl}
              alt=""
              className="aspect-video w-full bg-black object-contain"
            />
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              {source.appIconDataUrl && (
                <img src={source.appIconDataUrl} alt="" className="h-3.5 w-3.5 shrink-0" />
              )}
              <span
                title={source.name}
                className={cn(
                  'truncate text-[11px]',
                  selected === source.id ? 'text-acid' : 'text-muted-foreground'
                )}
              >
                {source.name}
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
