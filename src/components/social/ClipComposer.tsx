import * as React from 'react'
import { Clapperboard, Loader2, Trash2, X } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { formatClipDuration } from '@/lib/api-clips'
import { useClips } from '@/lib/clip-context'
import { useMembers } from '@/lib/members-context'
import { ClipPlayer } from './ClipPlayer'
import { cn } from '@/lib/utils'

/**
 * CONFIRMAR O CLIPE.
 *
 * Abre sozinha quando alguém aperta o atalho. Toca o que foi pego, deixa dar
 * um nome e pergunta se salva.
 *
 * ## Por que existe uma confirmação
 *
 * O atalho é global e o dedo é rápido. Sem esta tela, metade do acervo seriam
 * cliques errados — e um acervo com metade de lixo é um acervo que ninguém
 * abre. Dois cliques é o custo mínimo que separa "quis clipar" de "encostei
 * na tecla", e ainda dá pra OUVIR antes de comprometer a galera.
 *
 * ## Por que ela não fecha sozinha
 *
 * Porque o atalho funciona com o launcher em segundo plano: a pessoa aperta no
 * meio do jogo e só volta pra janela minutos depois. Um temporizador aqui
 * jogaria fora exatamente o clipe que ela foi buscar.
 *
 * Camada própria (não Radix Dialog) — ver lib/interaction-guard.ts.
 */

const TITLE_MAX = 80

export function ClipComposer() {
  const { pending, discard, save, saving, error } = useClips()
  const { byId } = useMembers()

  const [title, setTitle] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  const at = pending?.at ?? 0

  React.useEffect(() => {
    if (!pending) return
    setTitle('')
    const timer = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(timer)
    // `at` como chave: clipar de novo com a tela aberta troca o conteúdo e
    // precisa limpar o nome digitado pro clipe anterior.
  }, [pending, at])

  React.useEffect(() => {
    if (!pending) return
    const handle = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      discard()
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [pending, discard])

  if (!pending) return null

  const handleSave = async (event?: React.FormEvent): Promise<void> => {
    event?.preventDefault()
    if (saving) return
    await save(title).catch(() => {
      // A mensagem já foi pro contexto e aparece embaixo; o pendente CONTINUA
      // aberto de propósito, pra pessoa poder tentar de novo sem perder o
      // áudio — que não existe em lugar nenhum além desta memória.
    })
  }

  const quem = pending.participants
    .map((id) => byId[id])
    .filter((m): m is NonNullable<typeof m> => Boolean(m))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <form
        onSubmit={(e) => void handleSave(e)}
        className="card-acid relative w-full max-w-md rounded-brutal p-6"
      >
        <button
          type="button"
          aria-label="Descartar"
          onClick={discard}
          className="absolute right-3 top-3 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-4 flex items-center gap-3">
          <Clapperboard className="h-7 w-7 text-acid" />
          <div>
            <h2 className="title-brutal text-2xl">Peguei</h2>
            <p className="text-[11.5px] text-muted-foreground">
              últimos {formatClipDuration(pending.durationMs)} da call
            </p>
          </div>
        </div>

        <div className="rounded-brutal border border-line bg-void/60 px-3 py-2.5">
          <ClipPlayer src={pending.previewUrl} durationMs={pending.durationMs} />
        </div>

        {quem.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5">
            <span className="shrink-0 text-[11.5px] text-muted-foreground">na call:</span>
            {quem.slice(0, 8).map((m) => (
              <UserAvatar
                userId={m.id}
                key={m.id}
                src={resolveAssetUrl(m.avatar)}
                name={m.displayName}
                ringColor={m.profileColor}
                className="h-5 w-5"
              />
            ))}
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              {quem.map((m) => m.displayName.split(/\s+/)[0]).join(', ')}
            </span>
          </div>
        )}

        <label className="mt-4 block">
          <span className="mb-1 flex items-center justify-between text-[11.5px] text-muted-foreground">
            <span>Como chama? (opcional)</span>
            <span>
              {title.length}/{TITLE_MAX}
            </span>
          </span>
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX}
            placeholder="o grito do Samu · a desculpa do século"
            className="input-terminal w-full rounded-brutal px-3 py-2 text-sm"
          />
        </label>

        {error && (
          <p className="mt-3 rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <p className="min-w-0 flex-1 text-[11.5px] text-muted-foreground">
            vai virar um card no chat
          </p>
          <button
            type="button"
            onClick={discard}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-brutal px-3 py-2 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            jogar fora
          </button>
          <button
            type="submit"
            disabled={saving}
            className={cn(
              'flex items-center gap-2 rounded-brutal border-2 border-acid bg-acid px-4 py-2 text-xs font-bold uppercase tracking-wider text-void transition-colors',
              'hover:brightness-110',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar
          </button>
        </div>
      </form>
    </div>
  )
}
