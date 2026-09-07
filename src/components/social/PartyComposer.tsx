import * as React from 'react'
import { Loader2, Swords, X } from 'lucide-react'
import { useOverlays } from '@/lib/overlay-context'
import { useAuth } from '@/lib/auth-context'
import { isDmId, useChat } from '@/lib/chat-context'
import { useParty } from '@/lib/party-context'
import { gameLabel, guessGame, type KnownGame } from '@/lib/api-events'
import { cn } from '@/lib/utils'

/**
 * COMPOSITOR "BORA?" — jogo, vagas, uma frase. Três cliques no máximo: a
 * pessoa quer jogar AGORA, não preencher formulário.
 *
 * O seed ("/bora lol 3 só ranked") é lido de forma folgada: palavra de jogo
 * vira o jogo, um número de 2 a 10 vira as vagas, o que sobra vira a nota.
 *
 * Modal da casa (camada própria, não Radix Dialog) — ver lib/interaction-guard.ts.
 */

const GAMES: Array<{ id: KnownGame; label: string }> = [
  { id: 'lol', label: 'LoL' },
  { id: 'minecraft', label: 'Minecraft' },
  { id: 'outro', label: 'Outro' }
]

const SLOT_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10]
const DEFAULT_SLOTS = 5
const NOTE_MAX = 140

function readSeed(raw: string): { game: KnownGame; slots: number; note: string } {
  const game = guessGame(raw) ?? 'lol'

  const slotsMatch = /\b([2-9]|10)\b/.exec(raw)
  const slots = slotsMatch ? Number(slotsMatch[1]) : DEFAULT_SLOTS

  const note = raw
    .replace(/\b(lol|league|aram|ranked|flex|arena|minecraft|mine|mc)\b/gi, ' ')
    .replace(slotsMatch ? slotsMatch[0] : '', ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return { game, slots, note }
}

export function PartyComposer() {
  const { partyComposerOpen: open, partyComposerSeed: seed, closePartyComposer: close } = useOverlays()
  const { user } = useAuth()
  const { activeChannelId, activeChannel } = useChat()
  const { createParty, myParty } = useParty()

  const [game, setGame] = React.useState<KnownGame>('lol')
  const [gameOther, setGameOther] = React.useState('')
  const [slots, setSlots] = React.useState(DEFAULT_SLOTS)
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const noteRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!open) return
    const parsed = readSeed((seed ?? '').trim())
    setGame(parsed.game)
    setGameOther('')
    setSlots(parsed.slots)
    setNote(parsed.note)
    setBusy(false)
    setError(null)
    const timer = setTimeout(() => noteRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [open, seed])

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
  const alreadyHosting = !!myParty && myParty.createdBy.id === user?.id

  const canSubmit = !busy && !alreadyHosting

  const handleSubmit = async (event?: React.FormEvent): Promise<void> => {
    event?.preventDefault()
    if (!canSubmit) return

    setBusy(true)
    setError(null)
    const ack = await createParty({
      game: game === 'outro' ? gameOther.trim().toLowerCase() || 'outro' : game,
      slots,
      note: note.trim() ? note.trim().slice(0, NOTE_MAX) : undefined,
      channelId: targetChannel?.id
    })
    setBusy(false)

    if (!ack.ok) {
      setError(ack.error ?? 'Não deu pra abrir o bora')
      return
    }
    close()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={close}
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        onClick={(e) => e.stopPropagation()}
        className="card-acid  relative w-full max-w-md rounded-brutal p-6"
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
          <Swords className="h-7 w-7 text-burn drop-shadow-[0_0_8px_rgba(242,183,5,0.6)]" />
          <div>
            <h2 className="title-brutal text-2xl">Bora?</h2>
            <p className="text-[11.5px] text-muted-foreground">
              chamar pra jogar agora
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Jogo */}
          <div>
            <span className="mb-1 block text-[11.5px] text-muted-foreground">
              Jogo
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {GAMES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setGame(option.id)}
                  className={cn(
                    'rounded-brutal border-2 px-2.5 py-1 font-mono text-[11.5px] uppercase tracking-widest transition-colors',
                    game === option.id
                      ? 'border-burn bg-burn/10 text-burn'
                      : 'border-line text-muted-foreground hover:border-burn/50 hover:text-foreground'
                  )}
                >
                  {option.label}
                </button>
              ))}
              {game === 'outro' && (
                <input
                  value={gameOther}
                  onChange={(e) => setGameOther(e.target.value)}
                  maxLength={32}
                  placeholder="qual?"
                  className="input-terminal min-w-0 flex-1 rounded-brutal px-2 py-1 text-xs"
                />
              )}
            </div>
          </div>

          {/* Vagas */}
          <div>
            <span className="mb-1 flex items-center justify-between text-[11.5px] text-muted-foreground">
              <span>Vagas</span>
              <span className="text-burn">{slots} no total, contando você</span>
            </span>
            <div className="grid grid-cols-9 gap-1">
              {SLOT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSlots(n)}
                  className={cn(
                    'rounded-brutal border-2 py-1.5 font-mono text-xs transition-colors',
                    slots === n
                      ? 'border-burn bg-burn text-void'
                      : 'border-line text-muted-foreground hover:border-burn/50 hover:text-foreground'
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Nota */}
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-[11.5px] text-muted-foreground">
              <span>Uma frase (opcional)</span>
              <span>{note.length}/{NOTE_MAX}</span>
            </span>
            <input
              ref={noteRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={NOTE_MAX}
              placeholder="só ranked, sem tilt · server novo, traz comida"
              className="input-terminal w-full rounded-brutal px-3 py-2 text-sm"
            />
          </label>
        </div>

        {alreadyHosting && myParty && (
          <p className="mt-3 rounded-brutal border border-burn/50 bg-burn/10 px-3 py-2 text-xs text-burn">
            Você já tem um bora aberto ({gameLabel(myParty.game)} {myParty.members.length}/
            {myParty.slots}). Cancela ele antes de abrir outro.
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
            disabled={!canSubmit}
            className={cn(
              'flex items-center gap-2 rounded-brutal border-2 border-burn bg-burn px-4 py-2 font-bold uppercase tracking-wider text-void',
              'text-xs transition-colors',
              'hover:brightness-110',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-x-0 disabled:hover:translate-y-0'
            )}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Bora!
          </button>
        </div>
      </form>
    </div>
  )
}
