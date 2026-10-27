import * as React from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LEVELS, type Lang, type Level } from '@/lib/api-lingua'
import { LANG_NAME, LEVEL_LABEL } from '@/lib/lingua-ui'
import { cn } from '@/lib/utils'
import { Flag } from './Flag'

/** Primeira vez numa língua: escolhe o nível de partida (uma vez só). */
export function LevelPicker({
  lang,
  busy,
  onPick,
  onClose
}: {
  lang: Lang
  busy: boolean
  onPick: (level: Level) => void
  onClose: () => void
}) {
  const [level, setLevel] = React.useState<Level | null>(null)

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag lang={lang} size={18} /> {LANG_NAME[lang]}: de onde você parte?
          </DialogTitle>
          <DialogDescription>Escolha o nível. Depois ele sobe sozinho a cada 60 lições.</DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-2">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(l)}
              aria-pressed={level === l}
              className={cn(
                'flex items-center gap-3 rounded-brutal border px-3 py-2 text-left transition-colors',
                level === l
                  ? 'border-acid/60 bg-acid/10 text-acid'
                  : 'border-line text-foreground hover:border-acid/40 hover:bg-void-light'
              )}
            >
              <span className="w-8 font-mono text-sm font-bold">{l}</span>
              <span className="text-sm">{LEVEL_LABEL[l]}</span>
            </button>
          ))}
        </div>

        <p className="mt-4 flex items-start gap-2 text-xs text-burn">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Não dá para trocar depois.
        </p>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => level && onPick(level)} disabled={!level || busy}>
            Começar no {level ?? '…'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
