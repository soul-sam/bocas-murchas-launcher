import * as React from 'react'
import {
  Megaphone,
  AlertTriangle,
  PartyPopper,
  Siren,
  X,
  Loader2,
  Zap,
  SlidersHorizontal,
  Hash,
  Globe
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  drops as dropsApi,
  type DropStyle,
  type DropType,
  type QuickDropType
} from '@/lib/api-polls'
import { useAuth } from '@/lib/auth-context'

/**
 * Compositor de drop (só admin).
 *
 * Duas velocidades: os RÁPIDOS são um clique — título, ícone e animação já
 * vêm prontos pelo tipo, o texto é opcional e o banner some em 5 minutos. O
 * PERSONALIZADO abre o formulário inteiro (tipo, título, texto, estilo,
 * validade). Nos dois dá pra restringir ao canal aberto.
 *
 * Aberto pelo "+" do compositor de mensagens e pelo /drop; o texto depois do
 * comando chega como `seed`. Vive dentro do ChatView, que some ao trocar de
 * aba — por isso camada própria, sem Radix Dialog (lib/interaction-guard.ts).
 */

interface DropComposerProps {
  open: boolean
  /** Texto vindo do "/drop bora pro lol" — preenche a mensagem. */
  seed: string
  /** Canal aberto, ou null numa conversa direta (aí só existe drop global). */
  channelId: string | null
  channelName?: string
  onClose: () => void
}

const QUICK: Array<{ type: QuickDropType; emoji: string; label: string; hint: string }> = [
  { type: 'party', emoji: '🎉', label: 'Festa', hint: 'arco-íris' },
  { type: 'alert', emoji: '⚠️', label: 'Atenção', hint: 'treme' },
  { type: 'hype', emoji: '🔥', label: 'Hype', hint: 'brilha' },
  { type: 'rip', emoji: '💀', label: 'F', hint: 'seco' },
  { type: 'money', emoji: '💰', label: 'Stonks', hint: 'brilha' },
  { type: 'clown', emoji: '🤡', label: 'Palhaçada', hint: 'treme' }
]

const TYPES: Array<{ value: DropType; label: string; icon: React.ReactNode; color: string }> = [
  {
    value: 'announcement',
    label: 'Aviso',
    icon: <Megaphone className="h-3.5 w-3.5" />,
    color: 'border-acid bg-acid/10 text-acid'
  },
  {
    value: 'alert',
    label: 'Atenção',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    color: 'border-burn bg-burn/10 text-burn'
  },
  {
    value: 'celebration',
    label: 'Festa',
    icon: <PartyPopper className="h-3.5 w-3.5" />,
    color: 'border-purple-400 bg-purple-500/10 text-purple-300'
  },
  {
    value: 'warning',
    label: 'Alerta',
    icon: <Siren className="h-3.5 w-3.5" />,
    color: 'border-destructive bg-destructive/10 text-red-400'
  }
]

const STYLES: Array<{ value: DropStyle; label: string }> = [
  { value: 'default', label: 'Normal' },
  { value: 'glow', label: 'Brilho' },
  { value: 'shake', label: 'Tremendo' },
  { value: 'rainbow', label: 'Arco-íris' }
]

const EXPIRIES: Array<{ label: string; ms: number | null }> = [
  { label: '5 min', ms: 5 * 60_000 },
  { label: '1h', ms: 60 * 60_000 },
  { label: '24h', ms: 24 * 60 * 60_000 },
  { label: 'Sem prazo', ms: null }
]

const MAX_TITLE = 80
const MAX_CONTENT = 500

type Mode = 'quick' | 'custom'

export function DropComposer({ open, seed, channelId, channelName, onClose }: DropComposerProps) {
  const { token, user } = useAuth()

  const [mode, setMode] = React.useState<Mode>('quick')
  const [onlyHere, setOnlyHere] = React.useState(false)
  const [quickMessage, setQuickMessage] = React.useState('')
  const [type, setType] = React.useState<DropType>('announcement')
  const [title, setTitle] = React.useState('')
  const [content, setContent] = React.useState('')
  const [style, setStyle] = React.useState<DropStyle>('default')
  const [expiryIndex, setExpiryIndex] = React.useState(1)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const quickRef = React.useRef<HTMLInputElement>(null)

  // Abrir sempre começa limpo, com o seed onde faz sentido.
  React.useEffect(() => {
    if (!open) return
    setMode('quick')
    setOnlyHere(false)
    setQuickMessage(seed)
    setType('announcement')
    setTitle('')
    setContent(seed)
    setStyle('default')
    setExpiryIndex(1)
    setBusy(null)
    setError(null)
    requestAnimationFrame(() => quickRef.current?.focus())
  }, [open, seed])

  React.useEffect(() => {
    if (!open) return
    const handle = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [open, onClose])

  if (!open || user?.role !== 'admin') return null

  const targetChannel = onlyHere && channelId ? channelId : null

  const sendQuick = async (quick: QuickDropType): Promise<void> => {
    if (!token || busy) return
    setBusy(quick)
    setError(null)
    try {
      await dropsApi.quick(token, quick, quickMessage.trim(), targetChannel)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra mandar o drop')
    } finally {
      setBusy(null)
    }
  }

  const canSendCustom = !busy && title.trim().length > 0 && content.trim().length > 0

  const sendCustom = async (): Promise<void> => {
    if (!token || !canSendCustom) return
    setBusy('custom')
    setError(null)
    try {
      const ms = EXPIRIES[expiryIndex]?.ms ?? null
      await dropsApi.create(token, {
        type,
        title: title.trim(),
        content: content.trim(),
        style,
        channelId: targetChannel,
        expiresAt: ms ? new Date(Date.now() + ms).toISOString() : null
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra criar o drop')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
    >
      <div className="card-acid relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-brutal">
        <button
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-brutal p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <header className="flex items-center gap-3 px-6 pt-6">
          <Megaphone className="h-7 w-7 shrink-0 text-burn drop-shadow-[0_0_8px_rgba(242,183,5,0.6)]" />
          <div className="min-w-0">
            <h2 className="title-brutal text-2xl">Drop</h2>
            <p className="text-[11.5px] text-muted-foreground">
              anúncio animado · cai na tela de todo mundo
            </p>
          </div>
        </header>

        <div className="mx-6 mt-4 grid grid-cols-2 gap-1 rounded-brutal border-2 border-line p-1">
          <ModeTab
            active={mode === 'quick'}
            onClick={() => setMode('quick')}
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Rápido"
          />
          <ModeTab
            active={mode === 'custom'}
            onClick={() => setMode('custom')}
            icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
            label="Personalizado"
          />
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {mode === 'quick' ? (
            <>
              <div className="space-y-1.5">
                <label
                  htmlFor="drop-quick-message"
                  className="font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground"
                >
                  Mensagem (opcional)
                </label>
                <input
                  id="drop-quick-message"
                  ref={quickRef}
                  value={quickMessage}
                  maxLength={MAX_CONTENT}
                  onChange={(event) => setQuickMessage(event.target.value)}
                  placeholder="O admin mandou um drop!"
                  className="input-terminal w-full rounded-brutal px-3 py-2 text-sm"
                />
                <p className="font-mono text-[11px] text-muted-foreground">
                  clica num botão e já vai · some em 5 minutos
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {QUICK.map((quick) => (
                  <button
                    key={quick.type}
                    type="button"
                    disabled={!!busy}
                    onClick={() => void sendQuick(quick.type)}
                    className={cn(
                      'group flex flex-col items-center gap-1 rounded-brutal border-2 border-line px-2 py-3 transition-all',
                      'hover:-translate-y-0.5 hover:border-acid/60 hover:shadow-[0_0_20px_rgb(var(--neon-rgb)/0.15)]',
                      'disabled:cursor-not-allowed disabled:opacity-50'
                    )}
                  >
                    {busy === quick.type ? (
                      <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                    ) : (
                      <span className="text-2xl leading-none transition-transform group-hover:scale-110">
                        {quick.emoji}
                      </span>
                    )}
                    <span className="font-display text-xs uppercase tracking-wide text-dirty-white">
                      {quick.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {quick.hint}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <p className="text-[11.5px] text-muted-foreground">
                  Tipo
                </p>
                <div className="grid grid-cols-4 gap-1">
                  {TYPES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setType(option.value)}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-brutal border-2 px-2 py-2 text-[11.5px] font-medium uppercase tracking-wider transition-colors',
                        type === option.value
                          ? option.color
                          : 'border-line text-muted-foreground hover:border-line-strong hover:text-foreground'
                      )}
                    >
                      {option.icon}
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="drop-title"
                  className="font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground"
                >
                  Título
                </label>
                <input
                  id="drop-title"
                  value={title}
                  maxLength={MAX_TITLE}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="SERVIDOR VOLTOU"
                  className="input-terminal w-full rounded-brutal px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="drop-content"
                  className="font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground"
                >
                  Texto
                </label>
                <textarea
                  id="drop-content"
                  value={content}
                  rows={3}
                  maxLength={MAX_CONTENT}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="Modpack atualizado, bora testar."
                  className="input-terminal w-full resize-none rounded-brutal px-3 py-2 text-sm"
                />
                <p className="text-right font-mono text-[11px] text-muted-foreground">
                  {content.length}/{MAX_CONTENT}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="text-[11.5px] text-muted-foreground">
                    Estilo
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {STYLES.map((option) => (
                      <Chip
                        key={option.value}
                        active={style === option.value}
                        onClick={() => setStyle(option.value)}
                        label={option.label}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11.5px] text-muted-foreground">
                    Some em
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {EXPIRIES.map((option, index) => (
                      <Chip
                        key={option.label}
                        active={expiryIndex === index}
                        onClick={() => setExpiryIndex(index)}
                        label={option.label}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          <label
            className={cn(
              'flex cursor-pointer items-center justify-between gap-3 rounded-brutal border-2 border-line px-3 py-2 transition-colors',
              onlyHere && channelId && 'border-acid-dark',
              !channelId && 'cursor-not-allowed opacity-50'
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              {onlyHere && channelId ? (
                <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0">
                <span className="block text-xs text-foreground">Só neste canal</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">
                  {!channelId
                    ? 'numa conversa direta o drop é sempre pra todo mundo'
                    : onlyHere
                      ? `só quem estiver em #${channelName ?? 'canal'} vê`
                      : 'aparece pra todo mundo, em qualquer tela'}
                </span>
              </span>
            </span>
            <Switch
              checked={onlyHere && !!channelId}
              onCheckedChange={setOnlyHere}
              disabled={!channelId}
            />
          </label>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={!!busy}>
            Cancelar
          </Button>
          {mode === 'custom' && (
            <Button
              size="sm"
              className="btn-acid"
              onClick={() => void sendCustom()}
              disabled={!canSendCustom}
            >
              {busy === 'custom' ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Megaphone className="mr-1.5 h-3.5 w-3.5" />
              )}
              Soltar drop
            </Button>
          )}
        </footer>
      </div>
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-brutal px-3 py-1.5 font-mono text-[11.5px] uppercase tracking-widest transition-colors',
        active ? 'bg-acid/15 text-acid' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-brutal border-2 px-2 py-1 font-mono text-[11.5px] uppercase tracking-widest transition-colors',
        active
          ? 'border-acid bg-acid/15 text-acid'
          : 'border-line text-muted-foreground hover:border-acid/50 hover:text-foreground'
      )}
    >
      {label}
    </button>
  )
}
