import * as React from 'react'
import { CalendarPlus, Loader2, X } from 'lucide-react'
import { useOverlays } from '@/lib/overlay-context'
import { useAuth } from '@/lib/auth-context'
import { isDmId, useChat } from '@/lib/chat-context'
import { events as eventsApi, guessGame, type KnownGame } from '@/lib/api-events'
import {
  formatDayLabel,
  formatRelative,
  formatTime,
  parseNaturalDate
} from '@/lib/natural-date'
import { cn } from '@/lib/utils'

/**
 * COMPOSITOR DE EVENTO — "marcar sexta 21h LoL".
 *
 * O campo de data aceita texto do jeito que a pessoa fala ("amanhã 20:30",
 * "dia 12 21h") e mostra embaixo o que entendeu; o calendário do lado é o
 * plano B pra quem prefere clicar. Os dois escrevem no mesmo lugar: mexer num
 * apaga o outro, senão ficaria a dúvida de qual dos dois vale.
 *
 * O seed ("/marcar sexta 21h LoL") passa pelo mesmo parser: a parte de data
 * vai pro campo de data, o resto vira o título.
 *
 * Modal da casa (camada própria, não Radix Dialog): vive no GlobalOverlays,
 * mas a regra vale pra qualquer modal — ver lib/interaction-guard.ts.
 */

const GAMES: Array<{ id: KnownGame; label: string }> = [
  { id: 'lol', label: 'LoL' },
  { id: 'minecraft', label: 'Minecraft' },
  { id: 'outro', label: 'Outro' }
]

const TITLE_MAX = 80
const NOTE_MAX = 300
const MAX_DAYS_AHEAD = 60
const DAY_MS = 24 * 60 * 60 * 1000

/** Date -> valor de <input type="datetime-local"> (hora local, sem fuso). */
function toInputValue(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function EventComposer() {
  const { eventComposerOpen: open, eventComposerSeed: seed, closeEventComposer: close } = useOverlays()
  const { token } = useAuth()
  const { activeChannelId, activeChannel } = useChat()

  const [title, setTitle] = React.useState('')
  const [game, setGame] = React.useState<KnownGame>('lol')
  const [gameOther, setGameOther] = React.useState('')
  const [whenText, setWhenText] = React.useState('')
  const [whenManual, setWhenManual] = React.useState('')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const titleRef = React.useRef<HTMLInputElement>(null)
  const whenRef = React.useRef<HTMLInputElement>(null)

  // Abriu: zera tudo e aplica o seed. Fechar não precisa limpar — a próxima
  // abertura limpa; e assim um fechamento acidental não perde o que foi digitado
  // até o modal ser aberto de novo.
  React.useEffect(() => {
    if (!open) return

    const raw = (seed ?? '').trim()
    const parsed = raw ? parseNaturalDate(raw) : null

    setTitle(parsed ? parsed.rest : raw)
    setWhenText(parsed ? parsed.matched : '')
    setWhenManual('')
    setGame(guessGame(raw) ?? 'lol')
    setGameOther('')
    setNote('')
    setBusy(false)
    setError(null)

    // Foco no que falta preencher: veio texto sem data, falta a data; senão, o título.
    const target = raw && !parsed ? whenRef : titleRef
    const timer = setTimeout(() => target.current?.focus(), 0)
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

  const parsed = React.useMemo(
    () => (whenText.trim() ? parseNaturalDate(whenText) : null),
    [whenText]
  )

  const manualDate = React.useMemo(() => {
    if (!whenManual) return null
    const d = new Date(whenManual)
    return Number.isNaN(d.getTime()) ? null : d
  }, [whenManual])

  const resolved = parsed?.date ?? manualDate

  const now = Date.now()
  const dateProblem = !resolved
    ? null
    : resolved.getTime() <= now
      ? 'Isso já passou. Marca pra frente.'
      : resolved.getTime() > now + MAX_DAYS_AHEAD * DAY_MS
        ? `Calma: no máximo ${MAX_DAYS_AHEAD} dias pra frente.`
        : null

  /**
   * Onde o card cai. Só canal de texto de verdade: em conversa direta o
   * evento fica só na agenda (a agenda é do grupo, a DM não), e canal de voz
   * não tem chat.
   */
  const targetChannel =
    activeChannelId && !isDmId(activeChannelId) && activeChannel && activeChannel.type !== 'voice'
      ? activeChannel
      : null

  const canSubmit = title.trim().length > 0 && !!resolved && !dateProblem && !busy

  const handleSubmit = async (event?: React.FormEvent): Promise<void> => {
    event?.preventDefault()
    if (!token || !resolved || !canSubmit) return

    setBusy(true)
    setError(null)
    try {
      await eventsApi.create(token, {
        title: title.trim().slice(0, TITLE_MAX),
        game: game === 'outro' ? gameOther.trim().toLowerCase() || 'outro' : game,
        note: note.trim() ? note.trim().slice(0, NOTE_MAX) : undefined,
        startsAt: resolved.toISOString(),
        channelId: targetChannel?.id
      })
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra marcar')
    } finally {
      setBusy(false)
    }
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
          <CalendarPlus className="h-7 w-7 text-muted-foreground drop-shadow-[0_0_8px_rgb(var(--neon-rgb)/0.3)]" />
          <div>
            <h2 className="title-brutal text-2xl">Marcar</h2>
            <p className="text-[11.5px] text-muted-foreground">
              agenda do grupo
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Título */}
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-muted-foreground">
              O quê
            </span>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TITLE_MAX}
              placeholder="Ranked flex, server novo, noite de ARAM…"
              className="input-terminal w-full rounded-brutal px-3 py-2 text-sm"
            />
          </label>

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
                      ? 'border-acid bg-acid/10 text-acid'
                      : 'border-line text-muted-foreground hover:border-acid/50 hover:text-foreground'
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

          {/* Quando */}
          <div>
            <span className="mb-1 block text-[11.5px] text-muted-foreground">
              Quando
            </span>
            <div className="flex gap-2">
              <input
                ref={whenRef}
                value={whenText}
                onChange={(e) => {
                  setWhenText(e.target.value)
                  if (e.target.value.trim()) setWhenManual('')
                }}
                placeholder="sexta 21h · amanhã 20:30 · dia 12 21h"
                className="input-terminal min-w-0 flex-1 rounded-brutal px-3 py-2 text-sm"
              />
              <input
                type="datetime-local"
                aria-label="Escolher no calendário"
                value={resolved ? toInputValue(resolved) : whenManual}
                min={toInputValue(new Date())}
                onChange={(e) => {
                  setWhenManual(e.target.value)
                  setWhenText('')
                }}
                className="input-terminal w-10 shrink-0 cursor-pointer rounded-brutal px-2 py-2 text-[0px] text-transparent [color-scheme:dark] focus:w-48 focus:text-xs focus:text-foreground"
                title="Escolher no calendário"
              />
            </div>
            <p
              className={cn(
                'mt-1 min-h-[14px] text-[11.5px]',
                dateProblem
                  ? 'text-destructive'
                  : resolved
                    ? 'text-acid'
                    : whenText.trim()
                      ? 'text-burn'
                      : 'text-muted-foreground'
              )}
            >
              {dateProblem
                ? dateProblem
                : resolved
                  ? `→ ${formatDayLabel(resolved)} às ${formatTime(resolved)} · ${formatRelative(resolved)}`
                  : whenText.trim()
                    ? 'não entendi — tenta "sexta 21h" ou usa o calendário'
                    : 'escreve como falaria no chat'}
            </p>
          </div>

          {/* Nota */}
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-[11.5px] text-muted-foreground">
              <span>Nota (opcional)</span>
              <span>{note.length}/{NOTE_MAX}</span>
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={NOTE_MAX}
              rows={2}
              placeholder="Traz o mod novo, quem chegar atrasado fica de fora…"
              className="input-terminal w-full resize-none rounded-brutal px-3 py-2 text-sm"
            />
          </label>
        </div>

        {error && (
          <p className="mt-3 rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
            {targetChannel
              ? `o card vai pro #${targetChannel.name}`
              : 'sem canal de texto aberto: fica só na agenda'}
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
            className="btn-acid flex items-center gap-2 rounded-brutal px-4 py-2 text-xs"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Marcar
          </button>
        </div>
      </form>
    </div>
  )
}
