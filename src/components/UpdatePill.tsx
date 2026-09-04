import * as React from 'react'
import { RefreshCw, Loader2, TriangleAlert, Check } from 'lucide-react'
import { useUpdater } from '@/lib/updater-context'
import { cn } from '@/lib/utils'

/**
 * Aviso de atualizacao no cabecalho, no estilo do Discord.
 *
 * O download acontece sozinho em segundo plano (autoDownload em
 * electron/main/services/updater.ts): aqui a pessoa so ACOMPANHA e, quando
 * termina, clica pra reiniciar. Enquanto nao ha nada pra mostrar, o componente
 * nao ocupa espaco nenhum.
 */
export function UpdatePill() {
  const { status, check, applyUpdate } = useUpdater()
  const [busy, setBusy] = React.useState(false)

  /**
   * "Tudo certo" so aparece quando a pessoa PEDIU pra procurar — a checagem de
   * meia em meia hora nao pode ficar piscando aviso sozinha.
   */
  const [showUpToDate, setShowUpToDate] = React.useState(false)

  React.useEffect(() => {
    if (status.stage !== 'not-available' || !status.manualCheck) return
    setShowUpToDate(true)
    const timer = setTimeout(() => setShowUpToDate(false), 4_000)
    return () => clearTimeout(timer)
  }, [status.stage, status.manualCheck, status.checkedAt])

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  if (status.stage === 'checking') {
    if (!status.manualCheck) return null
    return (
      <Pill tone="muted" title="Procurando atualização">
        <Loader2 className="h-3 w-3 animate-spin" />
        procurando
      </Pill>
    )
  }

  if (showUpToDate) {
    return (
      <Pill tone="muted" title={`Você está na v${status.currentVersion ?? '?'}`}>
        <Check className="h-3 w-3" />
        atualizado
      </Pill>
    )
  }

  // 'available' e 'downloading' sao a mesma coisa pra quem olha: o download ja
  // comecou. Separar so faria o aviso piscar de um texto pro outro.
  if (status.stage === 'available' || status.stage === 'downloading') {
    const percent = Math.round(status.percent ?? 0)
    return (
      <Pill tone="burn" title={`Baixando a versão ${status.newVersion ?? 'nova'}`}>
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="tabular-nums">{percent}%</span>
        <span className="ml-1 h-1 w-12 overflow-hidden rounded-full bg-burn/20">
          <span
            className="block h-full bg-burn transition-all duration-150"
            style={{ width: `${percent}%` }}
          />
        </span>
      </Pill>
    )
  }

  if (status.stage === 'downloaded') {
    return (
      <Pill
        tone="acid"
        disabled={busy}
        onClick={() => void run(applyUpdate)}
        title={`Reiniciar e aplicar a versão ${status.newVersion ?? 'nova'}`}
      >
        <RefreshCw className={cn('h-3 w-3', busy && 'animate-spin')} />
        reiniciar p/ atualizar
      </Pill>
    )
  }

  if (status.stage === 'error') {
    return (
      <Pill
        tone="danger"
        disabled={busy}
        onClick={() => void run(check)}
        title={status.error ? `Falhou: ${status.error}` : 'Falha ao atualizar'}
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <TriangleAlert className="h-3 w-3" />
        )}
        tentar de novo
      </Pill>
    )
  }

  return null
}

const TONES = {
  burn: 'border-burn/70 text-burn hover:bg-burn/15',
  acid: 'border-acid/70 text-acid hover:bg-acid/15 shadow-[0_0_12px_rgba(106,255,0,0.2)]',
  danger: 'border-destructive/70 text-destructive hover:bg-destructive/15',
  muted: 'border-[#1a1a1a] text-muted-foreground'
} as const

function Pill({
  children,
  tone,
  title,
  onClick,
  disabled
}: {
  children: React.ReactNode
  tone: keyof typeof TONES
  title: string
  onClick?: () => void
  disabled?: boolean
}) {
  const className = cn(
    'app-no-drag flex items-center gap-1.5 rounded-brutal border px-2 py-0.5',
    'font-mono text-[10px] uppercase tracking-widest transition-colors',
    TONES[tone],
    onClick ? 'cursor-pointer' : 'cursor-default',
    disabled && 'pointer-events-none opacity-60'
  )

  if (!onClick) {
    return (
      <span className={className} title={title}>
        {children}
      </span>
    )
  }

  return (
    <button type="button" className={className} title={title} onClick={onClick}>
      {children}
    </button>
  )
}
