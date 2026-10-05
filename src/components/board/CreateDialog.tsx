import * as React from 'react'
import { Loader2, X } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { resolveAssetUrl } from '@/lib/api'
import { BOARD_CLOCKS, boardGameLabel, type BoardGame, type ClockId, type DraughtsVariant } from '@/lib/api-board'
import { useAuth } from '@/lib/auth-context'
import { useBoard } from '@/lib/board-context'
import { useGamification } from '@/lib/gamification-context'
import { useMembers } from '@/lib/members-context'
import { useCamadaVoltar } from '@/lib/use-camada-voltar'
import { cn } from '@/lib/utils'

/**
 * CRIAR MESA / CONVIDAR — o diálogo do saguão.
 *
 * Camada própria (sem Radix), como o ShortcutsHelp: o Radix tranca o <body>
 * com `pointer-events: none` e uma camada arrancada da árvore deixava o app
 * sem clique (ver lib/interaction-guard.ts). Fecha com Esc, clicando no
 * fundo ou no X; no celular o Voltar do aparelho também fecha.
 *
 * Em modo `invite` a mesa nasce já endereçada a uma pessoa online; em `open`
 * qualquer um senta. O erro do ack fica aqui dentro; no sucesso o contexto já
 * abriu a mesa e o diálogo só fecha.
 */

const VARIANTS: { id: DraughtsVariant; label: string }[] = [
  { id: 'br', label: 'Brasileira' },
  { id: 'us', label: 'Americana' }
]

export function CreateDialog({
  game,
  mode,
  onClose
}: {
  game: BoardGame
  mode: 'open' | 'invite'
  onClose: () => void
}) {
  const { create } = useBoard()
  const { user } = useAuth()
  const { online } = useMembers()
  const { profile } = useGamification()

  const [variant, setVariant] = React.useState<DraughtsVariant>('br')
  const [clock, setClock] = React.useState<ClockId>('5+0')
  const [stakeText, setStakeText] = React.useState('0')
  const [inviteId, setInviteId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  useCamadaVoltar(true, onClose)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Só gente online que dá pra convidar: sem mim e sem bots.
  const candidates = React.useMemo(
    () => online.filter((m) => m.id !== user?.id && m.role !== 'bot'),
    [online, user?.id]
  )

  const balance = profile?.coins ?? null
  const stake = stakeText === '' ? 0 : Number(stakeText)
  const overBalance = balance !== null && stake > balance
  const needsPerson = mode === 'invite' && !inviteId

  const onStakeChange = (raw: string): void => {
    // Só dígitos (inteiro), sem zero à esquerda, e nunca acima do saldo.
    let digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 9)
    if (balance !== null && digits !== '' && Number(digits) > balance) digits = String(balance)
    setStakeText(digits)
  }

  const submit = async (): Promise<void> => {
    if (busy || needsPerson || overBalance) return
    setBusy(true)
    setError(null)
    const ack = await create({
      game,
      variant: game === 'draughts' ? variant : undefined,
      clock,
      stake,
      inviteUserId: mode === 'invite' ? inviteId ?? undefined : undefined
    })
    setBusy(false)
    if (ack.ok) onClose()
    else setError(ack.error ?? 'Não deu pra criar a mesa.')
  }

  const title = mode === 'invite' ? `Convidar para ${boardGameLabel(game, null).split(' ')[0].toLowerCase()}` : 'Criar mesa'

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-sobretela flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="card-gradient relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-brutal border-2 border-acid-dark p-5 shadow-[0_0_50px_rgba(0,0,0,0.8)]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-3 top-3 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <h2 className="title-brutal mb-4 text-xl">{title}</h2>

        <div className="space-y-4">
          {game === 'draughts' && (
            <Field label="Variante">
              <div className="grid grid-cols-2 gap-1.5">
                {VARIANTS.map((v) => (
                  <Choice key={v.id} active={variant === v.id} onClick={() => setVariant(v.id)}>
                    {v.label}
                  </Choice>
                ))}
              </div>
            </Field>
          )}

          <Field label="Relógio" hint="minutos + incremento em segundos">
            <div className="grid grid-cols-3 gap-1.5">
              {BOARD_CLOCKS.map((c) => (
                <Choice key={c} active={clock === c} onClick={() => setClock(c)} mono>
                  {c}
                </Choice>
              ))}
            </div>
          </Field>

          <Field
            label="Valor"
            hint={
              balance === null
                ? '0 = amistosa'
                : `0 = amistosa · você tem ${balance.toLocaleString('pt-BR')} murchos`
            }
          >
            <input
              type="text"
              inputMode="numeric"
              value={stakeText}
              onChange={(e) => onStakeChange(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Valor em murchos"
              className="h-9 w-full rounded-brutal border border-line bg-void px-3 font-mono text-sm text-foreground focus:border-acid focus:outline-none"
            />
          </Field>

          {mode === 'invite' && (
            <Field label="Quem convidar">
              {candidates.length === 0 ? (
                <p className="rounded-brutal border border-line bg-void/60 px-3 py-3 text-xs text-muted-foreground">
                  Ninguém online agora.
                </p>
              ) : (
                <ul className="max-h-44 space-y-1 overflow-y-auto">
                  {candidates.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => setInviteId(m.id)}
                        aria-pressed={inviteId === m.id}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-brutal border px-2 py-1.5 text-left text-sm transition-colors',
                          inviteId === m.id
                            ? 'border-acid/60 bg-acid/10 text-foreground'
                            : 'border-line bg-void/60 text-muted-foreground hover:border-acid/40 hover:text-foreground'
                        )}
                      >
                        <UserAvatar
                          userId={m.id}
                          src={resolveAssetUrl(m.avatar)}
                          name={m.displayName}
                          ringColor={m.profileColor ?? undefined}
                          className="h-6 w-6"
                        />
                        <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Field>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => void submit()} disabled={busy || needsPerson || overBalance}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
              {mode === 'invite' ? 'Convidar' : 'Criar mesa'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        {hint && <span className="text-[11.5px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Choice({
  active,
  onClick,
  mono,
  children
}: {
  active: boolean
  onClick: () => void
  mono?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-brutal border px-2 py-1.5 text-xs transition-colors',
        mono && 'font-mono',
        active
          ? 'border-acid/60 bg-acid/10 text-acid'
          : 'border-line text-muted-foreground hover:border-acid/40 hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}
