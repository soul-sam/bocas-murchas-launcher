import * as React from 'react'
import { Check, Copy, ExternalLink, Loader2, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { useMcAuth } from '@/lib/mc-auth-context'
import { Button } from '@/components/ui/button'

function useCountdown(expiresInSec: number, startedAt: number): string {
  const [now, setNow] = React.useState(Date.now())
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const remaining = Math.max(0, expiresInSec * 1000 - (now - startedAt))
  const m = Math.floor(remaining / 60_000)
  const s = Math.floor((remaining % 60_000) / 1000)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function MicrosoftDeviceCodeModal() {
  const { modal, cancel, connect, closeModal } = useMcAuth()
  const [copied, setCopied] = React.useState(false)

  if (modal.kind === 'closed') return null

  async function copyCode(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard might be blocked */
    }
  }

  function openVerification(url: string) {
    void window.bocas.shell.openExternal(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/85 p-6 backdrop-blur-sm">
      <div className="card-acid w-full max-w-md rounded-brutal p-6 scanlines">
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/bocas-murchas-transp.png"
              alt=""
              aria-hidden
              className="h-9 w-9 drop-shadow-[0_0_8px_rgba(106,255,0,0.5)]"
            />
            <div>
              <p className="font-display text-base uppercase tracking-widest text-foreground">
                Conectar Microsoft
              </p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Device Code Flow
              </p>
            </div>
          </div>
          <button
            onClick={() => (modal.kind === 'awaiting' ? void cancel() : closeModal())}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-brutal border-2 border-border text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {modal.kind === 'awaiting' && (
          <AwaitingBody
            code={modal.code.userCode}
            url={modal.code.verificationUri}
            expiresIn={modal.code.expiresIn}
            startedAt={modal.startedAt}
            copied={copied}
            onCopy={() => void copyCode(modal.code.userCode)}
            onOpen={() => openVerification(modal.code.verificationUri)}
          />
        )}

        {modal.kind === 'expired' && (
          <FailureBody
            icon={<TriangleAlert className="h-5 w-5 text-burn" />}
            title="Código expirou"
            body="O código de login expirou antes de você completar. Gera um novo pra tentar de novo."
            actionLabel="Gerar novo código"
            onAction={() => void connect()}
          />
        )}

        {modal.kind === 'error' && (
          <FailureBody
            icon={<TriangleAlert className="h-5 w-5 text-destructive" />}
            title="Falha ao conectar"
            body={modal.message}
            actionLabel="Tentar de novo"
            onAction={() => void connect()}
            errorCode={modal.code}
          />
        )}
      </div>
    </div>
  )
}

interface AwaitingProps {
  code: string
  url: string
  expiresIn: number
  startedAt: number
  copied: boolean
  onCopy: () => void
  onOpen: () => void
}

function AwaitingBody({ code, url, expiresIn, startedAt, copied, onCopy, onOpen }: AwaitingProps) {
  const remaining = useCountdown(expiresIn, startedAt)

  return (
    <div className="space-y-5">
      <ol className="space-y-3 text-sm text-foreground">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-brutal border-2 border-acid bg-acid/10 font-mono text-xs font-bold text-acid">
            1
          </span>
          <div className="flex-1">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Abre a página de login da Microsoft
            </p>
            <Button onClick={onOpen} variant="secondary" size="sm" className="mt-1.5 w-full">
              <ExternalLink className="mr-2 h-3 w-3" />
              {url}
            </Button>
          </div>
        </li>

        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-brutal border-2 border-acid bg-acid/10 font-mono text-xs font-bold text-acid">
            2
          </span>
          <div className="flex-1">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Cola esse código
            </p>
            <div className="mt-1.5 flex items-stretch gap-2">
              <div className="flex-1 rounded-brutal border-2 border-acid bg-void px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.3em] text-acid shadow-glow-acid">
                {code}
              </div>
              <Button onClick={onCopy} variant="outline" size="icon" aria-label="Copiar código" className="h-auto w-12">
                {copied ? <Check className="h-4 w-4 text-acid" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </li>
      </ol>

      <div className="flex items-center justify-between rounded-brutal border-2 border-border bg-muted/20 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-acid">
          <Loader2 className="h-3 w-3 animate-spin" />
          Aguardando login…
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          Expira em <span className="text-burn">{remaining}</span>
        </span>
      </div>
    </div>
  )
}

interface FailureBodyProps {
  icon: React.ReactNode
  title: string
  body: string
  actionLabel: string
  onAction: () => void
  errorCode?: string
}

function FailureBody({ icon, title, body, actionLabel, onAction, errorCode }: FailureBodyProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        {icon}
        <div className="flex-1">
          <p className="font-display text-base uppercase tracking-widest text-foreground">{title}</p>
          <p className="mt-1 break-words text-sm text-muted-foreground">{body}</p>
          {errorCode && (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              code: {errorCode}
            </p>
          )}
        </div>
      </div>
      <Button onClick={onAction} className="w-full" size="lg">
        <RefreshCw className="mr-2 h-4 w-4" />
        {actionLabel}
      </Button>
    </div>
  )
}
