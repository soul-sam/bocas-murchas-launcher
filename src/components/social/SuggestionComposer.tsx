import * as React from 'react'
import { Bug, Hash, Lightbulb, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { suggestions as suggestionsApi, type SuggestionKind } from '@/lib/api-suggestions'
import { useAuth } from '@/lib/auth-context'
import { useChat, isDmId } from '@/lib/chat-context'
import { useOverlays } from '@/lib/overlay-context'

/**
 * COMPOSITOR DE SUGESTÃO.
 *
 * Duas perguntas e um botão. A tentação aqui era pedir categoria, prioridade,
 * passos de reprodução, versão — e o resultado seria um formulário que ninguém
 * preenche às onze da noite, que é exatamente quando as ideias aparecem.
 *
 * Então: o TIPO (ideia ou problema, porque são duas filas diferentes na cabeça
 * de quem vai resolver), o TÍTULO em uma linha, e um detalhe opcional. A
 * versão do launcher vai sozinha — é o dado que mais falta num relato de bug e
 * o que ninguém lembra de escrever.
 *
 * Camada própria (sem Radix Dialog) pelo mesmo motivo dos outros compositores:
 * vive em GlobalOverlays e é aberta de lugares que somem ao trocar de aba.
 * Ver lib/interaction-guard.ts.
 */

const MAX_TITLE = 120
const MAX_DETAIL = 2_000

const KINDS: Array<{
  id: SuggestionKind
  label: string
  hint: string
  icon: React.ReactNode
}> = [
  {
    id: 'ideia',
    label: 'Ideia',
    hint: 'Uma coisa que você queria que existisse.',
    icon: <Lightbulb className="h-4 w-4" />
  },
  {
    id: 'bug',
    label: 'Problema',
    hint: 'Uma coisa que está quebrada ou esquisita.',
    icon: <Bug className="h-4 w-4" />
  }
]

/** O que escrever no título, por tipo — placeholder que ensina o formato. */
const TITLE_PLACEHOLDER: Record<SuggestionKind, string> = {
  ideia: 'Ex.: poder fixar uma conversa no topo da lista',
  bug: 'Ex.: o soundboard para de tocar depois de sair da call'
}

const DETAIL_PLACEHOLDER: Record<SuggestionKind, string> = {
  ideia: 'Pra que serviria, e quando você sentiu falta. Opcional.',
  bug: 'O que você fez antes de acontecer, e o que esperava. Opcional.'
}

export function SuggestionComposer() {
  const { suggestionComposerOpen: open, closeSuggestionComposer } = useOverlays()
  const { token } = useAuth()
  const { activeChannelId, textChannels, setActiveChannel } = useChat()

  const [kind, setKind] = React.useState<SuggestionKind>('ideia')
  const [title, setTitle] = React.useState('')
  const [detail, setDetail] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [version, setVersion] = React.useState<string | null>(null)

  const titleRef = React.useRef<HTMLInputElement>(null)

  /**
   * O canal de sugestões é onde o card vai cair — e ele NÃO é o canal aberto.
   * Alguém que teve uma ideia no meio do #geral não deve ter que trocar de
   * canal antes de escrever: a sugestão vai pro lugar dela sozinha.
   */
  const target = React.useMemo(
    () => textChannels.find((channel) => channel.type === 'suggestions'),
    [textChannels]
  )

  const reset = React.useCallback(() => {
    setKind('ideia')
    setTitle('')
    setDetail('')
    setBusy(false)
    setError(null)
  }, [])

  const close = React.useCallback(() => {
    closeSuggestionComposer()
    reset()
  }, [closeSuggestionComposer, reset])

  React.useEffect(() => {
    if (!open) return
    reset()
    // A versão vai junto no relato. Buscada ao abrir e não no submit: se o IPC
    // falhar, é melhor mandar sem versão do que travar o envio.
    void window.bocas.app
      .version()
      .then(setVersion)
      .catch(() => setVersion(null))
    requestAnimationFrame(() => titleRef.current?.focus())
  }, [open, reset])

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

  if (!open) return null

  const canSubmit = !busy && title.trim().length > 2

  const submit = async (): Promise<void> => {
    if (!token || !canSubmit) return

    setBusy(true)
    setError(null)
    try {
      await suggestionsApi.create(token, {
        kind,
        title: title.trim(),
        detail: detail.trim() || undefined,
        // Sem canal de sugestões no servidor, a sugestão continua valendo — ela
        // só não ganha card no chat, e aparece no quadro do mesmo jeito.
        channelId: target?.id ?? null,
        appVersion: version
      })

      // Levar a pessoa pro canal é o que fecha o ciclo: ela vê o próprio card
      // aparecer, com o voto dela já contado, em vez de um formulário que
      // some e não devolve nada.
      if (target && activeChannelId !== target.id && !isDmId(activeChannelId ?? '')) {
        setActiveChannel(target.id)
      }
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra mandar a sugestão')
      setBusy(false)
    }
  }

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
    >
      <div className="card-acid relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-brutal">
        <button
          type="button"
          aria-label="Fechar"
          onClick={close}
          className="absolute right-3 top-3 z-10 rounded-brutal p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <header className="flex items-center gap-3 px-6 pt-6">
          <Lightbulb className="h-7 w-7 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="title-brutal text-2xl">Sugestão</h2>
            <p className="flex items-center gap-1 truncate text-[11.5px] text-muted-foreground">
              {target ? (
                <>
                  vai pra <Hash className="h-3 w-3" />
                  {target.name}
                </>
              ) : (
                'vai pro quadro'
              )}
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 gap-2">
            {KINDS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setKind(option.id)}
                className={cn(
                  'flex flex-col items-start gap-0.5 rounded-brutal border p-2.5 text-left transition-colors',
                  kind === option.id
                    ? 'border-acid bg-acid/10 text-foreground'
                    : 'border-line text-muted-foreground hover:border-line-strong hover:text-foreground'
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {option.icon}
                  {option.label}
                </span>
                <span className="text-[11px] leading-snug text-muted-foreground">
                  {option.hint}
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="sugestao-titulo" className="block text-sm font-medium">
              Em uma linha
            </label>
            <input
              id="sugestao-titulo"
              ref={titleRef}
              value={title}
              maxLength={MAX_TITLE}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSubmit) {
                  event.preventDefault()
                  void submit()
                }
              }}
              placeholder={TITLE_PLACEHOLDER[kind]}
              className="input-terminal w-full rounded-brutal px-3 py-2 text-sm"
            />
            <p className="text-right text-[11px] tabular-nums text-muted-foreground">
              {title.length}/{MAX_TITLE}
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="sugestao-detalhe" className="block text-sm font-medium">
              Detalhe
            </label>
            <textarea
              id="sugestao-detalhe"
              value={detail}
              maxLength={MAX_DETAIL}
              onChange={(event) => setDetail(event.target.value)}
              rows={4}
              placeholder={DETAIL_PLACEHOLDER[kind]}
              className="input-terminal w-full resize-none rounded-brutal px-3 py-2 text-sm"
            />
          </div>

          {kind === 'bug' && version && (
            <p className="rounded-brutal border border-line bg-surface-raised/60 px-3 py-2 text-[11.5px] text-muted-foreground">
              Vai junto: você está na versão{' '}
              <span className="font-mono tabular-nums text-foreground">{version}</span>. É a
              primeira coisa que se pergunta num relato de problema.
            </p>
          )}

          {error && (
            <p className="rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Mandando…
              </>
            ) : (
              'Mandar'
            )}
          </Button>
        </footer>
      </div>
    </div>
  )
}
