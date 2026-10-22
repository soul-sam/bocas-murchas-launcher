import * as React from 'react'
import { Check, X, Loader2, ArrowLeft, Square, CheckSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useEmojis } from '@/lib/emoji-context'
import { MAX_PACK_NAME, MAX_SERVER_EMOJIS, nameProblems } from '@/lib/emoji-pack'
import { collectPack, releasePack, type PackItem } from '@/lib/emoji-pack-prep'

/**
 * Importar pack de emojis, no jeito do Discord: escolhe (ou arrasta) um .zip
 * ou um monte de imagens, cada uma vira `:nome_do_arquivo:`, e da pra
 * desmarcar e renomear antes de subir.
 *
 * Sobe um por um pelo mesmo POST /emojis do emoji avulso, todos com o mesmo
 * `pack` — assim cada falha fica no item dela (nome tomado no meio do caminho,
 * servidor cheio) e o resto entra. O que falhou continua na tela pra tentar
 * de novo.
 */

/** Digitou "KEKW!" -> "kekw" (o mesmo do EmojiManager). */
function toEmojiName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 32)
}

type Phase = 'reading' | 'review' | 'uploading' | 'finished'

export function EmojiPackImport({ files, onClose }: { files: File[]; onClose: () => void }) {
  const { emojis, uploadEmoji } = useEmojis()

  const [phase, setPhase] = React.useState<Phase>('reading')
  const [items, setItems] = React.useState<PackItem[]>([])
  const [skipped, setSkipped] = React.useState<{ path: string; reason: string }[]>([])
  const [packName, setPackName] = React.useState('')
  const [readError, setReadError] = React.useState<string | null>(null)
  const stopRef = React.useRef(false)
  const itemsRef = React.useRef<PackItem[]>([])
  itemsRef.current = items

  // Le uma vez, com os nomes do servidor NAQUELE momento; depois disso quem
  // vigia colisao e o `nameProblems`, que acompanha a lista ao vivo.
  const emojisAtOpen = React.useRef(emojis)
  React.useEffect(() => {
    let alive = true
    collectPack(files, new Set(emojisAtOpen.current.map((e) => e.name)))
      .then((res) => {
        if (!alive) return releasePack(res.items)
        setItems(res.items)
        setSkipped(res.skipped)
        setPackName(res.packName)
        setPhase('review')
      })
      .catch((err) => {
        if (!alive) return
        setReadError(err instanceof Error ? err.message : 'Não deu pra ler os arquivos')
        setPhase('review')
      })
    return () => {
      alive = false
    }
  }, [files])

  // Libera as prévias quando o importador fecha.
  React.useEffect(() => () => releasePack(itemsRef.current), [])

  const doneNames = React.useMemo(
    () => new Set(items.filter((i) => i.status === 'done').map((i) => i.name)),
    [items]
  )
  // Os que este importador acabou de subir ja estao em `emojis`; nao podem
  // acusar "ja existe" contra eles mesmos.
  const serverNames = React.useMemo(
    () => new Set(emojis.map((e) => e.name).filter((n) => !doneNames.has(n))),
    [emojis, doneNames]
  )

  const pending = (i: PackItem): boolean => i.include && !i.blocked && i.status !== 'done'

  const problems = React.useMemo(
    () => nameProblems(items.map((i) => ({ name: i.name, include: pending(i) })), serverNames),
    [items, serverNames]
  )

  const queue = items.filter((i, idx) => pending(i) && !problems[idx])
  const withProblem = problems.filter(Boolean).length
  const doneCount = items.filter((i) => i.status === 'done').length
  const failedCount = items.filter((i) => i.status === 'failed').length
  const slotsLeft = Math.max(0, MAX_SERVER_EMOJIS - emojis.length)
  const overflow = queue.length - slotsLeft
  const busy = phase === 'reading' || phase === 'uploading'

  const patch = (key: string, change: Partial<PackItem>): void => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...change } : i)))
  }

  const setAll = (include: boolean): void => {
    setItems((prev) =>
      prev.map((i) => (i.blocked || i.status === 'done' ? i : { ...i, include }))
    )
  }

  const start = async (): Promise<void> => {
    if (queue.length === 0 || overflow > 0) return
    stopRef.current = false
    setPhase('uploading')
    const pack = packName.trim() || undefined
    for (const item of queue) {
      if (stopRef.current) break
      patch(item.key, { status: 'uploading', error: null })
      try {
        await uploadEmoji(item.file!, item.name, pack)
        patch(item.key, { status: 'done' })
      } catch (err) {
        patch(item.key, {
          status: 'failed',
          error: err instanceof Error ? err.message : 'Deu ruim'
        })
      }
    }
    setPhase('finished')
  }

  const allIncluded = items.every((i) => i.include || i.blocked || i.status === 'done')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Cabecalho: voltar, nome do pack, contagem e acao */}
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 rounded-brutal border border-line bg-void-light/30 p-2">
        <button
          type="button"
          title="Voltar pra lista"
          disabled={phase === 'uploading'}
          onClick={onClose}
          className="rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">Pack</span>
          <input
            value={packName}
            disabled={busy}
            onChange={(e) => setPackName(e.target.value.slice(0, MAX_PACK_NAME))}
            placeholder="opcional"
            className="input-terminal min-w-0 flex-1 rounded-brutal px-2 py-1.5 text-sm"
          />
        </label>

        {phase === 'uploading' ? (
          <Button size="sm" variant="outline" onClick={() => (stopRef.current = true)}>
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            Parar ({doneCount}/{doneCount + queue.length})
          </Button>
        ) : phase === 'finished' && queue.length === 0 ? (
          <Button size="sm" onClick={onClose}>
            <Check className="mr-1 h-3.5 w-3.5" />
            Concluir
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => void start()}
            disabled={busy || queue.length === 0 || overflow > 0}
          >
            {failedCount > 0 && phase === 'finished'
              ? `Tentar de novo (${queue.length})`
              : `Importar ${queue.length}`}
          </Button>
        )}
      </div>

      <p className="mb-2 shrink-0 text-[11.5px] text-muted-foreground">
        {phase === 'reading'
          ? 'Lendo o pack...'
          : [
              `${items.length} imagens`,
              doneCount > 0 && `${doneCount} importados`,
              failedCount > 0 && `${failedCount} com erro`,
              withProblem > 0 && `${withProblem} com nome a corrigir`,
              `cabem mais ${slotsLeft} no servidor`
            ]
              .filter(Boolean)
              .join(' · ')}
      </p>

      {overflow > 0 && (
        <p className="mb-2 shrink-0 text-[11px] text-destructive">
          O servidor tem {emojis.length}/{MAX_SERVER_EMOJIS} emojis: desmarque {overflow} pra caber.
        </p>
      )}
      {readError && <p className="mb-2 shrink-0 text-[11px] text-destructive">{readError}</p>}

      {items.length > 1 && phase !== 'reading' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setAll(!allIncluded)}
          className="mb-1 flex shrink-0 items-center gap-1.5 self-start px-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          {allIncluded ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
          {allIncluded ? 'Desmarcar todos' : 'Marcar todos'}
        </button>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {phase === 'reading' ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {items.map((item, idx) => (
              <PackRow
                key={item.key}
                item={item}
                problem={problems[idx]}
                locked={busy || item.status === 'done'}
                onToggle={() => patch(item.key, { include: !item.include })}
                onRename={(name) => patch(item.key, { name, status: item.status === 'failed' ? 'idle' : item.status })}
              />
            ))}
          </div>
        )}

        {items.length === 0 && phase !== 'reading' && !readError && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma imagem aqui. Pack aceita png, gif, webp e jpg — solto ou dentro de um .zip.
          </p>
        )}

        {skipped.length > 0 && (
          <details className="mt-3 text-[11.5px] text-muted-foreground">
            <summary className="cursor-pointer select-none">
              {skipped.length} arquivo{skipped.length === 1 ? '' : 's'} ignorado
              {skipped.length === 1 ? '' : 's'}
            </summary>
            <ul className="mt-1 space-y-0.5 pl-3">
              {skipped.map((s) => (
                <li key={s.path} className="truncate">
                  {s.path} — {s.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}

function PackRow({
  item,
  problem,
  locked,
  onToggle,
  onRename
}: {
  item: PackItem
  problem: string | null
  locked: boolean
  onToggle: () => void
  onRename: (name: string) => void
}) {
  const off = !item.include || !!item.blocked
  const message = item.blocked ?? item.error ?? problem ?? item.note
  const bad = !!(item.blocked || item.error || problem)

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-brutal border bg-void-light/30 px-2 py-1.5',
        item.status === 'done' ? 'border-acid/40' : bad && !off ? 'border-destructive/50' : 'border-line',
        off && 'opacity-50'
      )}
    >
      <button
        type="button"
        title={item.blocked ? item.blocked : item.include ? 'Não importar este' : 'Importar este'}
        disabled={locked || !!item.blocked}
        onClick={onToggle}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default"
      >
        {item.include && !item.blocked ? (
          <CheckSquare className="h-4 w-4 text-acid" />
        ) : (
          <Square className="h-4 w-4" />
        )}
      </button>

      <img
        src={item.previewUrl}
        alt=""
        draggable={false}
        className="h-8 w-8 shrink-0 object-contain"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-0.5">
          <span className="font-mono text-sm text-muted-foreground">:</span>
          <input
            value={item.name}
            disabled={locked || off}
            onChange={(e) => onRename(toEmojiName(e.target.value))}
            title={item.source}
            className="input-terminal min-w-0 flex-1 rounded-brutal px-1.5 py-0.5 font-mono text-sm"
          />
          <span className="font-mono text-sm text-muted-foreground">:</span>
        </div>
        {message && (
          <p
            className={cn(
              'truncate text-[11px]',
              bad && !off ? 'text-destructive' : 'text-muted-foreground'
            )}
            title={message}
          >
            {message}
          </p>
        )}
      </div>

      <span className="w-4 shrink-0">
        {item.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {item.status === 'done' && <Check className="h-4 w-4 text-acid" />}
        {item.status === 'failed' && <X className="h-4 w-4 text-destructive" />}
      </span>
    </div>
  )
}
