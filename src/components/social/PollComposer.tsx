import * as React from 'react'
import EmojiPicker, { Theme, EmojiStyle } from 'emoji-picker-react'
import {
  BarChart3,
  X,
  Plus,
  Trash2,
  Smile,
  Loader2,
  EyeOff,
  ListChecks,
  CircleDot,
  Clock,
  Hash
} from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { polls as pollsApi, type PollType } from '@/lib/api-polls'
import { useAuth } from '@/lib/auth-context'
import { useChat, isDmId } from '@/lib/chat-context'
import { useOverlays } from '@/lib/overlay-context'

/**
 * Compositor de enquete.
 *
 * Pergunta, 2 a 10 opções (com emoji opcional), voto único ou múltiplo,
 * anônima ou não, prazo em presets. Vai pro canal ATIVO: o servidor cria a
 * enquete e posta o card no canal — o card chega pelo socket como qualquer
 * mensagem, então aqui não tem nada pra fazer depois do POST além de fechar.
 *
 * Camada própria (sem Radix Dialog): vive em GlobalOverlays e é aberta do
 * compositor de mensagens e do /enquete, que somem ao trocar de aba — ver
 * lib/interaction-guard.ts pro motivo.
 */

const MAX_QUESTION = 200
const MAX_OPTION = 80
const MIN_OPTIONS = 2
const MAX_OPTIONS = 10

const DURATIONS: Array<{ label: string; ms: number | null }> = [
  { label: 'Sem prazo', ms: null },
  { label: '1h', ms: 60 * 60_000 },
  { label: '6h', ms: 6 * 60 * 60_000 },
  { label: '24h', ms: 24 * 60 * 60_000 },
  { label: '3 dias', ms: 3 * 24 * 60 * 60_000 }
]

interface OptionDraft {
  /** Chave estável pro React: o índice muda quando se apaga uma do meio. */
  key: number
  text: string
  emoji: string
}

let nextKey = 0
const blankOption = (): OptionDraft => ({ key: nextKey++, text: '', emoji: '' })
const initialOptions = (): OptionDraft[] => [blankOption(), blankOption()]

export function PollComposer() {
  const { pollComposerOpen: open, closePollComposer } = useOverlays()
  const { token } = useAuth()
  const { activeChannelId, activeChannel } = useChat()

  const [question, setQuestion] = React.useState('')
  const [options, setOptions] = React.useState<OptionDraft[]>(initialOptions)
  const [type, setType] = React.useState<PollType>('single')
  const [anonymous, setAnonymous] = React.useState(false)
  const [durationIndex, setDurationIndex] = React.useState(0)
  /** Índice da opção com o seletor de emoji aberto. */
  const [emojiFor, setEmojiFor] = React.useState<number | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const questionRef = React.useRef<HTMLInputElement>(null)
  const optionRefs = React.useRef<Array<HTMLInputElement | null>>([])

  const reset = React.useCallback(() => {
    setQuestion('')
    setOptions(initialOptions())
    setType('single')
    setAnonymous(false)
    setDurationIndex(0)
    setEmojiFor(null)
    setBusy(false)
    setError(null)
  }, [])

  const close = React.useCallback(() => {
    closePollComposer()
    reset()
  }, [closePollComposer, reset])

  // Abrir sempre começa do zero, com o cursor na pergunta.
  React.useEffect(() => {
    if (!open) return
    reset()
    // O autoFocus do React não pega: o elemento acabou de entrar no DOM.
    requestAnimationFrame(() => questionRef.current?.focus())
  }, [open, reset])

  // Esc fecha — a não ser que o seletor de emoji esteja aberto: aí o Esc é
  // dele (o Radix fecha o popover), e fechar tudo junto perderia a enquete.
  React.useEffect(() => {
    if (!open) return
    const handle = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || emojiFor !== null) return
      event.preventDefault()
      close()
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [open, emojiFor, close])

  if (!open) return null

  const blocked = !activeChannelId
    ? 'Abre um canal de texto primeiro.'
    : isDmId(activeChannelId)
      ? 'Enquete é coisa de canal — numa conversa a dois não rola.'
      : null

  const filled = options.filter((option) => option.text.trim())
  const canSubmit = !blocked && !busy && question.trim().length > 0 && filled.length >= MIN_OPTIONS

  const updateOption = (index: number, patch: Partial<OptionDraft>): void => {
    setOptions((prev) => prev.map((option, i) => (i === index ? { ...option, ...patch } : option)))
  }

  const addOption = (): void => {
    if (options.length >= MAX_OPTIONS) return
    setOptions((prev) => [...prev, blankOption()])
    requestAnimationFrame(() => optionRefs.current[options.length]?.focus())
  }

  const removeOption = (index: number): void => {
    if (options.length <= MIN_OPTIONS) return
    setOptions((prev) => prev.filter((_, i) => i !== index))
  }

  /** Enter numa opção pula pra próxima — ou cria uma, se era a última. */
  const handleOptionKey = (event: React.KeyboardEvent<HTMLInputElement>, index: number): void => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (index < options.length - 1) {
      optionRefs.current[index + 1]?.focus()
    } else if (options.length < MAX_OPTIONS) {
      addOption()
    } else {
      void submit()
    }
  }

  const submit = async (): Promise<void> => {
    if (!token || !activeChannelId || !canSubmit) return

    setBusy(true)
    setError(null)
    try {
      const ms = DURATIONS[durationIndex]?.ms ?? null
      await pollsApi.create(token, {
        question: question.trim(),
        options: filled.map((option) => ({
          text: option.text.trim(),
          emoji: option.emoji || null
        })),
        type,
        isAnonymous: anonymous,
        endsAt: ms ? new Date(Date.now() + ms).toISOString() : null,
        channelId: activeChannelId
      })
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra criar a enquete')
      setBusy(false)
    }
  }

  return (
    <div
      // Só fecha no clique DIRETO no fundo: o seletor de emoji é portalizado e
      // o React propaga o clique dele até aqui pela árvore de componentes.
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
    >
      <div className="card-acid relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-brutal scanlines">
        <button
          type="button"
          aria-label="Fechar"
          onClick={close}
          className="absolute right-3 top-3 z-10 rounded-brutal p-1 text-muted-foreground transition-colors hover:text-acid"
        >
          <X className="h-4 w-4" />
        </button>

        <header className="flex items-center gap-3 px-6 pt-6">
          <BarChart3 className="h-7 w-7 shrink-0 text-acid drop-shadow-[0_0_8px_rgba(106,255,0,0.6)]" />
          <div className="min-w-0">
            <h2 className="title-brutal text-2xl">Enquete</h2>
            <p className="flex items-center gap-1 truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {activeChannel && !blocked ? (
                <>
                  vai pra <Hash className="h-3 w-3" />
                  {activeChannel.name}
                </>
              ) : (
                'a galera decide'
              )}
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {blocked && (
            <p className="rounded-brutal border border-burn/50 bg-burn/10 px-3 py-2 text-xs text-burn">
              {blocked}
            </p>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="poll-question"
              className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
            >
              Pergunta
            </label>
            <input
              id="poll-question"
              ref={questionRef}
              value={question}
              maxLength={MAX_QUESTION}
              disabled={!!blocked}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  optionRefs.current[0]?.focus()
                }
              }}
              placeholder="Qual vai ser o jogo de sexta?"
              className="input-terminal w-full rounded-brutal px-3 py-2 text-sm disabled:opacity-50"
            />
            <p className="text-right font-mono text-[9px] text-muted-foreground">
              {question.length}/{MAX_QUESTION}
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Opções · {options.length}/{MAX_OPTIONS}
            </p>

            <ul className="space-y-1.5">
              {options.map((option, index) => (
                <li key={option.key} className="flex items-center gap-1.5">
                  <Popover
                    open={emojiFor === index}
                    onOpenChange={(next) => setEmojiFor(next ? index : null)}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        disabled={!!blocked}
                        title={option.emoji ? 'Trocar emoji' : 'Emoji (opcional)'}
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-brutal border-2 transition-colors',
                          option.emoji
                            ? 'border-acid-dark text-lg'
                            : 'border-[#1a1a1a] text-muted-foreground hover:border-acid/50 hover:text-acid',
                          'disabled:opacity-50'
                        )}
                      >
                        {option.emoji || <Smile className="h-4 w-4" />}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto border-0 p-0">
                      {option.emoji && (
                        <button
                          type="button"
                          onClick={() => {
                            updateOption(index, { emoji: '' })
                            setEmojiFor(null)
                          }}
                          className="w-full border-b border-[#1a1a1a] bg-void px-3 py-1.5 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-destructive"
                        >
                          tirar o emoji
                        </button>
                      )}
                      <EmojiPicker
                        theme={Theme.DARK}
                        emojiStyle={EmojiStyle.NATIVE}
                        lazyLoadEmojis
                        width={300}
                        height={340}
                        searchPlaceholder="Procurar emoji"
                        onEmojiClick={(emoji) => {
                          updateOption(index, { emoji: emoji.emoji })
                          setEmojiFor(null)
                          requestAnimationFrame(() => optionRefs.current[index]?.focus())
                        }}
                      />
                    </PopoverContent>
                  </Popover>

                  <input
                    ref={(el) => {
                      optionRefs.current[index] = el
                    }}
                    value={option.text}
                    maxLength={MAX_OPTION}
                    disabled={!!blocked}
                    onChange={(event) => updateOption(index, { text: event.target.value })}
                    onKeyDown={(event) => handleOptionKey(event, index)}
                    placeholder={`Opção ${index + 1}`}
                    className="input-terminal h-9 min-w-0 flex-1 rounded-brutal px-3 text-sm disabled:opacity-50"
                  />

                  <button
                    type="button"
                    onClick={() => removeOption(index)}
                    disabled={options.length <= MIN_OPTIONS || !!blocked}
                    title={
                      options.length <= MIN_OPTIONS ? 'Precisa de pelo menos 2' : 'Tirar esta opção'
                    }
                    className="shrink-0 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>

            {options.length < MAX_OPTIONS && (
              <button
                type="button"
                onClick={addOption}
                disabled={!!blocked}
                className="flex items-center gap-1.5 rounded-brutal px-1 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-acid disabled:opacity-50"
              >
                <Plus className="h-3 w-3" /> mais uma opção
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Tipo de voto
              </p>
              <div className="grid grid-cols-2 gap-1">
                <Choice
                  active={type === 'single'}
                  disabled={!!blocked}
                  onClick={() => setType('single')}
                  icon={<CircleDot className="h-3.5 w-3.5" />}
                  label="Uma"
                  hint="só uma resposta"
                />
                <Choice
                  active={type === 'multiple'}
                  disabled={!!blocked}
                  onClick={() => setType('multiple')}
                  icon={<ListChecks className="h-3.5 w-3.5" />}
                  label="Várias"
                  hint="marca quantas quiser"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Quem votou
              </p>
              <label
                className={cn(
                  'flex h-full min-h-[3rem] cursor-pointer items-center justify-between gap-3 rounded-brutal border-2 border-[#1a1a1a] px-3 py-2 transition-colors',
                  anonymous && 'border-acid-dark',
                  blocked && 'cursor-not-allowed opacity-50'
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <EyeOff
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      anonymous ? 'text-acid' : 'text-muted-foreground'
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs text-foreground">Anônima</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {anonymous ? 'ninguém vê quem votou' : 'aparece quem votou em quê'}
                    </span>
                  </span>
                </span>
                <Switch checked={anonymous} onCheckedChange={setAnonymous} disabled={!!blocked} />
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <Clock className="h-3 w-3" /> Prazo
            </p>
            <div className="flex flex-wrap gap-1">
              {DURATIONS.map((preset, index) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={!!blocked}
                  onClick={() => setDurationIndex(index)}
                  className={cn(
                    'rounded-brutal border-2 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors disabled:opacity-50',
                    durationIndex === index
                      ? 'border-acid bg-acid/15 text-acid'
                      : 'border-[#1a1a1a] text-muted-foreground hover:border-acid/50 hover:text-foreground'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[#1a1a1a] px-6 py-3">
          <Button variant="ghost" size="sm" onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button size="sm" className="btn-acid" onClick={() => void submit()} disabled={!canSubmit}>
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Lançar enquete
          </Button>
        </footer>
      </div>
    </div>
  )
}

function Choice({
  active,
  disabled,
  onClick,
  icon,
  label,
  hint
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-start gap-0.5 rounded-brutal border-2 px-2.5 py-2 text-left transition-colors disabled:opacity-50',
        active
          ? 'border-acid bg-acid/10 text-acid'
          : 'border-[#1a1a1a] text-muted-foreground hover:border-acid/50 hover:text-foreground'
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {label}
      </span>
      <span className="text-[10px] opacity-80">{hint}</span>
    </button>
  )
}
