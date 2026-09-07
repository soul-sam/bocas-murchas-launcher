import * as React from 'react'
import { Monitor, AppWindow, Volume2, VolumeX, Info, Loader2, RefreshCw, Search } from 'lucide-react'
import type { ScreenSource } from '../../../electron/preload/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SCREEN_QUALITY, type ScreenQuality } from '@/lib/voice-context'
import { useSettings } from '@/lib/settings-context'
import { Hint } from '@/components/ui/tooltip'

const QUALITY_LABEL: Record<ScreenQuality, string> = {
  '720p30': '720p 30fps — leve',
  '1080p30': '1080p 30fps — equilibrado',
  '1080p60': '1080p 60fps — pesado'
}

const QUALITY_HINT: Record<ScreenQuality, string> = {
  '720p30': 'Conversa e navegação. Aguenta internet ruim.',
  '1080p30': 'Padrão pra jogo e pra ler código na tela dos outros.',
  '1080p60': 'Jogo rápido. Só com upload sobrando dos dois lados.'
}

interface ScreenSharePickerProps {
  open: boolean
  onClose: () => void
  onConfirm: (
    sourceId: string,
    options: {
      withAudio: boolean
      quality: ScreenQuality
      sourceName: string
      muteLauncher: boolean
    }
  ) => Promise<void>
}

export function ScreenSharePicker({ open, onClose, onConfirm }: ScreenSharePickerProps) {
  const { settings, update } = useSettings()

  const [sources, setSources] = React.useState<ScreenSource[]>([])
  const [loading, setLoading] = React.useState(false)
  const [selected, setSelected] = React.useState<string | null>(null)
  // Semeados com o que ficou salvo da ultima vez — e regravados no confirmar.
  const [withAudio, setWithAudio] = React.useState(settings.screenShare.withAudio)
  const [muteLauncher, setMuteLauncher] = React.useState(settings.screenShare.muteLauncher)
  const [quality, setQuality] = React.useState<ScreenQuality>(settings.screenShare.quality)
  const [filter, setFilter] = React.useState('')
  const [starting, setStarting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback((keepSelection: boolean) => {
    setLoading(true)
    setError(null)

    window.bocas.screen
      .listSources()
      .then((list) => {
        setSources(list)
        setSelected((prev) => {
          // Atualizar a lista nao pode perder o que a pessoa ja tinha marcado
          // — a nao ser que aquela janela tenha sido fechada nesse meio tempo.
          if (keepSelection && prev && list.some((s) => s.id === prev)) return prev
          return list.find((s) => s.isScreen)?.id ?? list[0]?.id ?? null
        })
      })
      .catch(() => setError('Não consegui listar as telas'))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    if (!open) return
    setFilter('')
    // Reabrir volta ao que esta salvo: o arquivo pode ter mudado (outra
    // janela, outra sessao) desde que este componente montou.
    setWithAudio(settings.screenShare.withAudio)
    setMuteLauncher(settings.screenShare.muteLauncher)
    setQuality(settings.screenShare.quality)
    load(false)
    // As preferencias entram de proposito fora da lista: relê-las a cada
    // mudanca de `settings` sobrescreveria o que a pessoa acabou de marcar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, load])

  // Deixar uma fonte marcada no main sem usar seria uma permissao pendurada.
  const handleClose = React.useCallback(() => {
    void window.bocas.screen.cancelSelection()
    onClose()
  }, [onClose])

  const handleConfirm = async (): Promise<void> => {
    const source = sources.find((s) => s.id === selected)
    if (!source) return

    setStarting(true)
    setError(null)
    try {
      // O nome vai junto pro palco poder dizer O QUE esta no ar. Sem ele,
      // quem compartilha só sabia que "algo" estava sendo transmitido.
      await onConfirm(source.id, {
        withAudio,
        quality,
        sourceName: source.name,
        muteLauncher
      })
      // Salvo só quando deu certo: erro na captura não é escolha nova.
      void update({ screenShare: { withAudio, muteLauncher, quality } })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao compartilhar')
    } finally {
      setStarting(false)
    }
  }

  const needle = filter.trim().toLowerCase()
  const visible = needle
    ? sources.filter((s) => s.name.toLowerCase().includes(needle))
    : sources

  const screens = visible.filter((s) => s.isScreen)
  const windows = visible.filter((s) => !s.isScreen)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Compartilhar tela</DialogTitle>
          <DialogDescription>Escolha o que a galera vai ver</DialogDescription>
        </DialogHeader>

        <div className="mb-3 flex shrink-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-brutal border-2 border-line bg-void px-2 transition-colors focus-within:border-acid/60">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filtrar janelas…"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading}
            title="Atualizar a lista"
            aria-label="Atualizar a lista"
            className="shrink-0 rounded-brutal border-2 border-line p-2 text-muted-foreground transition-colors hover:border-acid/50 hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {loading && sources.length === 0 ? (
            <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">
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
                  onConfirm={() => void handleConfirm()}
                />
              )}
              {windows.length > 0 && (
                <SourceGroup
                  icon={<AppWindow className="h-3.5 w-3.5" />}
                  label="Janelas"
                  sources={windows}
                  selected={selected}
                  onSelect={setSelected}
                  onConfirm={() => void handleConfirm()}
                />
              )}
              {visible.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {needle ? 'Nada com esse nome.' : 'Nenhuma janela disponível.'}
                </p>
              )}
            </>
          )}
        </div>

        <div className="mt-4 shrink-0 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={withAudio}
              onChange={(e) => setWithAudio(e.target.checked)}
              className="h-4 w-4 accent-acid"
            />
            <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Levar o som do sistema</span>
          </label>

          <label className="ml-auto flex items-center gap-2">
            <span className="text-[11.5px] text-muted-foreground">
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

          {/* Observação é frase, não dado: Inter em caixa normal. */}
          <p className="w-full text-[11.5px] text-muted-foreground">
            {QUALITY_HINT[quality]}
          </p>
          </div>

          {/*
            O SOM DO PRÓPRIO LAUNCHER.

            Sem isto, quem compartilha com som devolve pra call os avisos da
            interface e uma segunda cópia (atrasada) de cada som do soundboard:
            o loopback do Windows entrega a mistura final da placa de som, com
            o launcher dentro — medido em −28 dB, 69 acima do piso de ruído.
            Não dá pra filtrar depois. Dá pra não tocar.

            A parte que não tem jeito (as vozes) fica escrita aqui embaixo em
            vez de virar surpresa no meio da transmissão.
          */}
          {withAudio && (
            <div className="mt-3 rounded-brutal border border-line bg-surface-raised/60 p-2.5">
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={muteLauncher}
                  onChange={(e) => setMuteLauncher(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-acid"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <VolumeX className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    Deixar o Launcher mudo enquanto transmite
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
                    Os avisos daqui e o soundboard param de tocar no SEU fone —
                    e é por isso que não entram na transmissão. A galera
                    continua ouvindo tudo no launcher dela.
                  </span>
                </span>
              </label>

              <p className="mt-2 flex items-start gap-1.5 border-t border-line pt-2 text-[11.5px] leading-snug text-muted-foreground">
                <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>
                  As vozes da call vão junto de qualquer jeito — você precisa
                  continuar ouvindo a conversa, e ela sai pelo mesmo fone que a
                  captura pega.{' '}
                  <Hint
                    label="Por que as vozes não saem"
                    description="O Windows entrega o áudio já misturado, sem separar por programa. Tirar só o launcher exigiria captura por processo, que o Electron ainda não expõe."
                  >
                    <span className="cursor-help underline decoration-dotted underline-offset-2">
                      por quê?
                    </span>
                  </Hint>
                </span>
              </p>
            </div>
          )}
        </div>

        {error && <p className="mt-2 shrink-0 text-xs text-destructive">{error}</p>}

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
  onSelect,
  onConfirm
}: {
  icon: React.ReactNode
  label: string
  sources: ScreenSource[]
  selected: string | null
  onSelect: (id: string) => void
  onConfirm: () => void
}) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
        <span className="text-[11px] opacity-60">— {sources.length}</span>
      </h3>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {sources.map((source) => (
          <button
            key={source.id}
            type="button"
            onClick={() => onSelect(source.id)}
            // Duplo clique compartilha direto: é o gesto que todo mundo tenta.
            onDoubleClick={onConfirm}
            className={cn(
              'group overflow-hidden rounded-brutal border-2 text-left transition-all',
              selected === source.id
                ? 'border-acid shadow-[0_0_18px_rgb(var(--neon-rgb)/0.25)]'
                : 'border-line hover:border-acid/50'
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
