import * as React from 'react'
import { Flame, Loader2, X } from 'lucide-react'
import { useOverlays } from '@/lib/overlay-context'
import { isDmId, useChat } from '@/lib/chat-context'
import { useSmoke, smokeCountdown } from '@/lib/smoke-context'
import { cn } from '@/lib/utils'

/**
 * ACENDER UM SINAL DE FUMAÇA — "entro em 20 min se alguém topar".
 *
 * Um clique num horário e pronto. Não pergunta jogo, não pergunta vagas: a
 * promessa é só de ESTAR LÁ, e transformar isso em formulário mataria o
 * ponto. Quem já sabe o que vai jogar usa o "Bora?".
 *
 * Modal da casa (camada própria, não Radix Dialog) — ver
 * lib/interaction-guard.ts.
 */

/**
 * Os degraus foram escolhidos pelo que a galera de fato fala: "já já",
 * "depois do jantar", "depois que eu terminar isso". Nada de campo livre —
 * ninguém digita "37 minutos".
 */
const OPTIONS: Array<{ minutes: number; label: string; hint: string }> = [
  { minutes: 15, label: '15 min', hint: 'já já' },
  { minutes: 30, label: '30 min', hint: 'terminando uma coisa' },
  { minutes: 60, label: '1 hora', hint: 'depois do jantar' },
  { minutes: 120, label: '2 horas', hint: 'mais tarde' }
]

const NOTE_MAX = 140

export function SmokeComposer() {
  const { smokeComposerOpen: open, closeSmokeComposer: close } = useOverlays()
  const { activeChannelId, activeChannel } = useChat()
  const { raiseSmoke, mySmoke } = useSmoke()

  const [minutes, setMinutes] = React.useState(30)
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const noteRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!open) return
    setMinutes(30)
    setNote('')
    setBusy(false)
    setError(null)
    const timer = setTimeout(() => noteRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const handle = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [open, close])

  const targetChannel =
    activeChannelId && !isDmId(activeChannelId) && activeChannel && activeChannel.type !== 'voice'
      ? activeChannel
      : null

  // O servidor também barra, mas avisar antes poupa o clique.
  const already = !!mySmoke

  const handleSubmit = async (event?: React.FormEvent): Promise<void> => {
    event?.preventDefault()
    if (busy || already) return

    setBusy(true)
    setError(null)
    const ack = await raiseSmoke({
      minutes,
      note: note.trim() ? note.trim().slice(0, NOTE_MAX) : undefined,
      channelId: targetChannel?.id
    })
    setBusy(false)

    if (!ack.ok) {
      setError(ack.error ?? 'Não deu pra acender')
      return
    }
    close()
  }

  if (!open) return null

  const when = new Date(Date.now() + minutes * 60_000)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={close}
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        onClick={(e) => e.stopPropagation()}
        className="card-acid relative w-full max-w-md rounded-brutal p-6"
      >
        <button
          type="button"
          aria-label="Fechar"
          onClick={close}
          className="absolute right-3 top-3 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-5 flex items-center gap-3">
          <Flame className="h-7 w-7 text-burn" />
          <div>
            <h2 className="title-brutal text-2xl">Sinal de fumaça</h2>
            <p className="text-[11.5px] text-muted-foreground">
              avisa que você entra, e chama quem quiser vir junto
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <span className="mb-1 block text-[11.5px] text-muted-foreground">Eu entro…</span>
            <div className="grid grid-cols-2 gap-1.5">
              {OPTIONS.map((option) => (
                <button
                  key={option.minutes}
                  type="button"
                  onClick={() => setMinutes(option.minutes)}
                  className={cn(
                    'rounded-brutal border-2 px-3 py-2 text-left transition-colors',
                    minutes === option.minutes
                      ? 'border-burn bg-burn/10'
                      : 'border-line hover:border-burn/50'
                  )}
                >
                  <span
                    className={cn(
                      'block text-sm font-semibold',
                      minutes === option.minutes ? 'text-burn' : 'text-foreground'
                    )}
                  >
                    em {option.label}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{option.hint}</span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              ou seja, {when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} —
              e a galera é avisada na hora
            </p>
          </div>

          <label className="block">
            <span className="mb-1 flex items-center justify-between text-[11.5px] text-muted-foreground">
              <span>Uma frase (opcional)</span>
              <span>
                {note.length}/{NOTE_MAX}
              </span>
            </span>
            <input
              ref={noteRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={NOTE_MAX}
              placeholder="tô terminando de jantar · se tiver 3 eu entro"
              className="input-terminal w-full rounded-brutal px-3 py-2 text-sm"
            />
          </label>
        </div>

        {already && mySmoke && (
          <p className="mt-3 rounded-brutal border border-burn/50 bg-burn/10 px-3 py-2 text-xs text-burn">
            Você já está numa fumaça ({smokeCountdown(mySmoke.at)}, {mySmoke.members.length}{' '}
            {mySmoke.members.length === 1 ? 'pessoa' : 'pessoas'}). Sai dela antes de acender outra.
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
            {targetChannel
              ? `o card vai pro #${targetChannel.name}`
              : 'sem canal de texto aberto: só a faixa da barra'}
          </p>
          <button
            type="button"
            onClick={close}
            className="rounded-brutal px-3 py-2 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            cancelar
          </button>
          <button
            type="submit"
            disabled={busy || already}
            className={cn(
              'flex items-center gap-2 rounded-brutal border-2 border-burn bg-burn px-4 py-2 text-xs font-bold uppercase tracking-wider text-void transition-colors',
              'hover:brightness-110',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Acender
          </button>
        </div>
      </form>
    </div>
  )
}
