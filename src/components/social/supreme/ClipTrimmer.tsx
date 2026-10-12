import * as React from 'react'
import { Button } from '@/components/ui/button'
import { decodeAudio, renderSupremeClip, waveformPeaks } from '@/lib/supreme-audio-browser'
import { SUPREME_CLIP_SEC } from '@/lib/supreme-audio'
import { playDecodedBuffer } from '@/lib/ui-sounds'
import { useSettings } from '@/lib/settings-context'

/** Forma de onda com uma janela de 2s arrastável (slider) e prévia do recorte. */
export function ClipTrimmer({
  buffer,
  onConfirm,
  onCancel
}: {
  buffer: AudioBuffer
  onConfirm(wav: Blob): Promise<void>
  onCancel(): void
}) {
  const { settings } = useSettings()
  const peaks = React.useMemo(() => waveformPeaks(buffer, 120), [buffer])
  const dur = buffer.duration
  const win = Math.min(SUPREME_CLIP_SEC, dur)
  const [start, setStart] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const [previewError, setPreviewError] = React.useState(false)
  const volume = settings.soundEnabled && settings.voiceCueVolume > 0 ? settings.voiceCueVolume : 0.4

  // Prévia pelo mesmo caminho dos sons da interface (AudioContext), sem <audio> com blob.
  const preview = async (): Promise<void> => {
    try {
      const wav = await renderSupremeClip(buffer, start)
      playDecodedBuffer(await decodeAudio(await wav.arrayBuffer()), volume)
      setPreviewError(false)
    } catch {
      setPreviewError(true)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex h-14 items-center gap-px">
        {peaks.map((p, i) => (
          <span key={i} className="w-full rounded-sm bg-muted-foreground/60" style={{ height: `${Math.max(4, p * 100)}%` }} />
        ))}
        <div
          className="pointer-events-none absolute inset-y-0 rounded border-2 border-acid bg-acid/15"
          style={{ left: `${(start / dur) * 100}%`, width: `${(win / dur) * 100}%` }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, dur - win)}
        step={0.01}
        value={start}
        aria-label="Início do trecho de 2 segundos"
        onChange={(e) => setStart(Number(e.target.value))}
        disabled={dur <= win}
      />
      <p className="text-[11.5px] text-muted-foreground">
        {start.toFixed(2)}s – {(start + win).toFixed(2)}s
      </p>
      {previewError && <p className="text-xs text-destructive">Não deu pra ouvir esse trecho.</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => void preview()}>
          Ouvir
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onConfirm(await renderSupremeClip(buffer, start))
            } finally {
              setBusy(false)
            }
          }}
        >
          Usar este trecho
        </Button>
      </div>
    </div>
  )
}
