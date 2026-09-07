import * as React from 'react'
import { useSettings } from '@/lib/settings-context'
import { ApiError } from '@/lib/api'
import { playUiSound, type UiSound } from '@/lib/ui-sounds'
import { cn } from '@/lib/utils'

/**
 * Peças compartilhadas das abas do painel admin.
 *
 * Moraram dentro de AdminPanel.tsx enquanto eram quatro abas num arquivo. Ao
 * ganhar Cargos e Impressora — que trazem formulário e são as maiores —
 * continuar no mesmo arquivo passaria de 1.800 linhas, então as abas novas
 * viraram arquivo próprio e o que elas dividem com as antigas veio pra cá.
 *
 * O CONTRATO que estas peças carregam, e que é o motivo de existirem em vez de
 * cada aba desenhar o seu: **toda ação destrutiva confirma INLINE**, no
 * próprio botão. O painel já é uma camada em cima de tudo, e camada em cima de
 * camada é o caminho conhecido pro app travar sem clique (ver
 * lib/interaction-guard.ts).
 */

/** Avisos da interface no volume que a pessoa escolheu (0 quando desligado). */
export function useCue(): (name: UiSound) => void {
  const { settings } = useSettings()
  const volume = settings.soundEnabled ? settings.soundVolume : 0
  return React.useCallback((name: UiSound) => playUiSound(name, volume), [volume])
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  })
}

/** "agora", "há 5 min", "há 3 h", "há 2 d" — depois disso a data mesmo. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'nunca'
  const diff = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(diff)) return '—'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `há ${days} d`
  return formatDate(iso)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 rounded-brutal border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-destructive">
      {children}
    </div>
  )
}

export function IconButton({
  title,
  danger,
  onClick,
  disabled,
  children
}: {
  title: string
  danger?: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        'rounded-brutal p-1.5 text-muted-foreground transition-colors disabled:opacity-40',
        danger ? 'hover:bg-destructive/15 hover:text-destructive' : 'hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

/** Confirmação no lugar: "Fazer X? [Sim] [Não]". */
export function InlineConfirm({
  question,
  tone = 'warn',
  busy,
  onYes,
  onNo
}: {
  question: string
  tone?: 'warn' | 'danger'
  busy?: boolean
  onYes: () => void
  onNo: () => void
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-2 rounded-brutal border px-2 py-1 font-mono text-[11.5px] uppercase tracking-wider',
        tone === 'danger'
          ? 'border-destructive/60 bg-destructive/10 text-destructive'
          : 'border-burn/60 bg-burn/10 text-burn'
      )}
    >
      <span>{question}</span>
      <button
        type="button"
        onClick={onYes}
        disabled={busy}
        className="font-bold underline-offset-2 hover:underline disabled:opacity-50"
      >
        {busy ? '…' : 'Sim'}
      </button>
      <button type="button" onClick={onNo} disabled={busy} className="hover:underline">
        Não
      </button>
    </span>
  )
}

