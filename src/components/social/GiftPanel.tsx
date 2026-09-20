import * as React from 'react'
import { ArrowLeft, Coins, Gift, Loader2, Search } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { ApiError, resolveAssetUrl } from '@/lib/api'
import { DEFAULT_NAME_COLOR, type ShopItem } from '@/lib/api-gamification'
import { useAuth } from '@/lib/auth-context'
import { useGamification } from '@/lib/gamification-context'
import { useMembers, type Member } from '@/lib/members-context'
import { cn } from '@/lib/utils'

/**
 * PRESENTEAR — painel que cobre a prateleira da lojinha enquanto a pessoa
 * escolhe pra quem vai o item. Mesmo preço da compra; sai do MEU saldo.
 *
 * Lista de membros vem do MembersProvider (todo mundo do grupo, online
 * primeiro). Quem já tem o item não some da lista: o servidor devolve 409 e
 * a mensagem explica — esconder deixaria a pessoa achando que o amigo saiu
 * do grupo.
 */

const MESSAGE_MAX = 140

export function GiftPanel({
  item,
  coins,
  onClose,
  onSent
}: {
  item: ShopItem
  coins: number
  onClose: () => void
  /** Chamado depois do presente ir: o pai mostra o aviso e fecha o painel. */
  onSent: (toName: string) => void
}) {
  const { user } = useAuth()
  const { members } = useMembers()
  const { gift } = useGamification()

  const [query, setQuery] = React.useState('')
  const [picked, setPicked] = React.useState<Member | null>(null)
  const [message, setMessage] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const affordable = coins >= item.price
  const needle = query.trim().toLowerCase()
  const candidates = members
    .filter((m) => m.id !== user?.id)
    .filter((m) => !needle || m.displayName.toLowerCase().includes(needle))

  const send = async (): Promise<void> => {
    if (!picked) return
    setBusy(true)
    setError(null)
    try {
      const result = await gift(item.id, picked.id, message.trim() || undefined)
      onSent(result.to.displayName)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 402
            ? 'Murchos insuficientes pra esse presente.'
            : err.message
          : 'Não deu pra presentear agora.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          voltar
        </button>
        <p className="ml-auto flex items-center gap-1.5 text-sm font-semibold">
          <Gift className="h-4 w-4 text-acid" />
          Presentear <span className="text-acid">{item.name}</span>
          <span className="font-mono text-xs text-muted-foreground">
            · {item.price.toLocaleString('pt-BR')} murchos
          </span>
        </p>
      </div>

      {!affordable && (
        <p className="rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          Faltam {(item.price - coins).toLocaleString('pt-BR')} murchos pra esse presente.
        </p>
      )}

      <label className="flex items-center gap-2 rounded-brutal border border-line bg-void px-2 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="pra quem?"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {candidates.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Ninguém com esse nome.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {candidates.map((m) => {
              const selected = picked?.id === m.id
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(m)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-brutal border px-2 py-1.5 text-left transition-colors',
                      selected ? 'border-acid bg-acid/10' : 'border-transparent hover:border-line'
                    )}
                  >
                    <UserAvatar
                      src={resolveAssetUrl(m.avatar)}
                      name={m.displayName}
                      ringColor={m.profileColor ?? DEFAULT_NAME_COLOR}
                      className="h-7 w-7 border"
                    />
                    <span className="truncate text-sm" style={{ color: m.profileColor ?? undefined }}>
                      {m.displayName}
                    </span>
                    <span
                      className={cn(
                        'ml-auto h-1.5 w-1.5 shrink-0 rounded-full',
                        m.isOnline ? 'bg-acid' : 'bg-line-strong'
                      )}
                      title={m.isOnline ? 'online' : 'offline'}
                    />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <input
        value={message}
        maxLength={MESSAGE_MAX}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="mensagem (opcional)"
        className="rounded-brutal border border-line bg-void px-3 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-acid/60"
      />

      {error && (
        <p className="rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!picked || !affordable || busy}
        onClick={() => void send()}
        className="flex items-center justify-center gap-1.5 rounded-brutal bg-acid px-3 py-2 text-sm font-bold text-void transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
        {picked
          ? `Dar ${item.name} pra ${picked.displayName}`
          : 'Escolhe alguém aí em cima'}
      </button>
    </div>
  )
}
