import * as React from 'react'
import { Coins, Loader2, Paperclip, ReceiptText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parseChannelFeeds } from '@/lib/api'
import { printApi } from '@/lib/api-print'
import { useAuth } from '@/lib/auth-context'
import { useChat, isDmId } from '@/lib/chat-context'
import { useOverlays } from '@/lib/overlay-context'

/**
 * COMPOSITOR DE ENCOMENDA — "alguém imprime isso pra mim?".
 *
 * Aberto a TODO MUNDO (`/encomendar` ou o "+" do compositor), inclusive quem
 * não tem o cargo da impressora — é justamente pra essa pessoa. A aba da
 * impressora continua só de quem rachou; a encomenda vira um card no chat e
 * quem tem o cargo aceita por lá.
 *
 * O arquivo fatiado é opcional: quem sabe fatiar manda o .gcode, quem não sabe
 * manda o link do modelo (MakerWorld, Printables) e quem aceitar fatia.
 *
 * Camada própria (sem Radix Dialog) pelo mesmo motivo dos outros compositores:
 * vive em GlobalOverlays e é aberta de lugares que somem ao trocar de aba.
 */

const MAX_TITLE = 80
const MAX_DETAIL = 500

export function PrintRequestComposer() {
  const { printRequestComposerOpen: open, closePrintRequestComposer } = useOverlays()
  const { token } = useAuth()
  const { activeChannelId, textChannels, setActiveChannel } = useChat()

  const [title, setTitle] = React.useState('')
  const [detail, setDetail] = React.useState('')
  const [link, setLink] = React.useState('')
  const [offer, setOffer] = React.useState('0')
  const [file, setFile] = React.useState<File | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const titleRef = React.useRef<HTMLInputElement>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const target = React.useMemo(
    () => textChannels.find((channel) => parseChannelFeeds(channel.feeds).includes('impressora')),
    [textChannels]
  )

  const reset = React.useCallback(() => {
    setTitle('')
    setDetail('')
    setLink('')
    setOffer('0')
    setFile(null)
    setBusy(false)
    setError(null)
  }, [])

  const close = React.useCallback(() => {
    closePrintRequestComposer()
    reset()
  }, [closePrintRequestComposer, reset])

  React.useEffect(() => {
    if (!open) return
    reset()
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

  const offerCoins = Math.max(0, Math.round(Number(offer) || 0))
  const hasSomething = !!file || !!link.trim() || !!detail.trim()
  const canSubmit = !busy && title.trim().length > 1 && hasSomething

  const submit = async (): Promise<void> => {
    if (!token || !canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await printApi.createRequest(token, {
        title: title.trim(),
        detail: detail.trim() || undefined,
        link: link.trim() || undefined,
        offerCoins,
        file
      })
      // Leva a pessoa até o card, com a encomenda dela já no mural.
      if (target && activeChannelId !== target.id && !isDmId(activeChannelId ?? '')) {
        setActiveChannel(target.id)
      }
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra mandar a encomenda')
      setBusy(false)
    }
  }

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
      className="fixed inset-0 z-dialogo flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
    >
      <div className="card-acid relative flex max-h-[90dvh] w-full max-w-lg flex-col rounded-brutal">
        <button
          type="button"
          aria-label="Fechar"
          onClick={close}
          className="absolute right-3 top-3 z-conteudo rounded-brutal p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <header className="flex items-center gap-3 px-6 pt-6">
          <ReceiptText className="h-7 w-7 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="title-brutal text-2xl">Encomendar peça</h2>
            <p className="truncate text-[11.5px] text-muted-foreground">
              alguém com a impressora topa e imprime pra você
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-1.5">
            <label htmlFor="encomenda-titulo" className="block text-sm font-medium">
              O que é a peça
            </label>
            <input
              id="encomenda-titulo"
              ref={titleRef}
              value={title}
              maxLength={MAX_TITLE}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex.: suporte de headset pra mesa"
              className="input-terminal w-full rounded-brutal px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="encomenda-link" className="block text-sm font-medium">
              Link do modelo
            </label>
            <input
              id="encomenda-link"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://makerworld.com/… ou printables.com/…"
              className="input-terminal w-full rounded-brutal px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <span className="block text-sm font-medium">Arquivo fatiado (opcional)</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                <Paperclip className="mr-2 h-4 w-4" />
                {file ? 'trocar arquivo' : 'anexar .gcode'}
              </Button>
              {file && <span className="min-w-0 truncate font-mono text-xs text-foreground">{file.name}</span>}
              <input
                ref={fileRef}
                type="file"
                accept=".gcode,.3mf"
                className="hidden"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Se você não sabe fatiar, deixa sem — quem aceitar fatia a partir do link.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="encomenda-detalhe" className="block text-sm font-medium">
              Detalhes
            </label>
            <textarea
              id="encomenda-detalhe"
              value={detail}
              maxLength={MAX_DETAIL}
              onChange={(event) => setDetail(event.target.value)}
              rows={3}
              placeholder="Cor, tamanho, pra quando precisa. Opcional."
              className="input-terminal w-full resize-none rounded-brutal px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="encomenda-oferta" className="flex items-center gap-1.5 text-sm font-medium">
              <Coins className="h-4 w-4 text-burn" />
              Oferta em murchos
            </label>
            <input
              id="encomenda-oferta"
              type="number"
              min={0}
              max={5000}
              step={10}
              value={offer}
              onChange={(event) => setOffer(event.target.value)}
              className="input-terminal w-32 rounded-brutal px-3 py-2 text-sm tabular-nums"
            />
            <p className="text-[11px] text-muted-foreground">
              Sai da sua conta agora e só vai pra quem imprimir quando a peça ficar pronta. Cancelou antes: volta
              tudo.
            </p>
          </div>

          {error && (
            <p className="rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
          {!hasSomething && title.trim().length > 1 && (
            <span className="mr-auto text-[11px] text-muted-foreground">manda um link, arquivo ou detalhe</span>
          )}
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Mandando…
              </>
            ) : offerCoins > 0 ? (
              `Encomendar por ${offerCoins}`
            ) : (
              'Encomendar'
            )}
          </Button>
        </footer>
      </div>
    </div>
  )
}
