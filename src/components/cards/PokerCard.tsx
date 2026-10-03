import { Coins, Users } from 'lucide-react'
import { MurchosIcon } from '@/lib/bocas-icons'
import type { CardProps } from './index'
import { CardFrame } from './index'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { SPEED_LABEL, formatMoney, formatMoneyShort, type PokerCardMetadata } from '@/lib/api-poker'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { useOverlays } from '@/lib/overlay-context'
import { usePoker } from '@/lib/poker-context'
import { PokerIcon } from '@/components/poker/PokerGlyphs'
import { cn } from '@/lib/utils'

/**
 * CARTÃO DA MESA DE PÔQUER — postado no canal de jogos quando alguém abre
 * uma mesa; o servidor reescreve o metadata a cada mudança de quem está
 * sentado e a cada fim de mão, e marca `closed` quando ela fecha.
 *
 * Igual ao card do "bora?": o estado VIVO (a lista do saguão, via socket)
 * manda enquanto a mesa existe; o metadata gravado vale depois. Mesa que
 * sumiu do saguão com o metadata ainda dizendo "aberta" (servidor reiniciou)
 * é tratada como fechada — melhor que um botão que leva a lugar nenhum.
 */
export function PokerCard({ metadata }: CardProps<PokerCardMetadata>) {
  const { user } = useAuth()
  const { byId } = useMembers()
  const { tables, ready } = usePoker()
  const { openPoker } = useOverlays()

  const live = tables.find((t) => t.id === metadata.tableId)
  const closed = metadata.status === 'closed' || (ready && !live)
  const currency = metadata.currency ?? 'murchos'
  const seats = live ? live.players.map((p) => ({ userId: p.userId, displayName: p.displayName })) : metadata.seats ?? []
  const maxSeats = live?.maxSeats ?? metadata.maxSeats
  const hands = live?.handCount ?? metadata.handCount
  const leader = metadata.leader ? byId[metadata.leader.userId] : null
  const imSeated = !!user && seats.some((s) => s.userId === user.id)

  return (
    <CardFrame
      accent={closed ? 'muted' : currency === 'brl' ? 'burn' : 'acid'}
      icon={<PokerIcon className="h-3.5 w-3.5" />}
      title={closed ? 'Mesa de pôquer fechada' : currency === 'brl' ? 'Mesa de pôquer valendo' : 'Mesa de pôquer'}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">
            {hands > 0 ? `${hands} ${hands === 1 ? 'mão' : 'mãos'}` : 'nenhuma mão ainda'}
            {metadata.biggestPot > 0 && <> · maior pote {formatMoney(metadata.biggestPot, currency)}</>}
          </span>
          {closed && leader && metadata.leader && (
            <span className="truncate text-burn">
              {leader.displayName.split(/\s+/)[0]} saiu no lucro: +{formatMoney(metadata.leader.net, currency)}
            </span>
          )}
        </div>
      }
    >
      <p className={cn('font-display text-lg leading-tight', closed ? 'text-muted-foreground line-through' : 'text-foreground')}>
        {metadata.name}
      </p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted-foreground">
        <span className="flex items-center gap-1">
          {currency === 'brl' ? <Coins className="h-3 w-3 text-burn" aria-hidden /> : <MurchosIcon className="h-3 w-3 text-burn" aria-hidden />}
          blinds <span className="font-mono">{formatMoneyShort(metadata.smallBlind, currency)}/{formatMoneyShort(metadata.bigBlind, currency)}</span>
        </span>
        <span>· {SPEED_LABEL[metadata.speed] ?? metadata.speed}</span>
        <span className="flex items-center gap-1">
          · <Users className="h-3 w-3" aria-hidden /> <span className="font-mono">{seats.length}/{maxSeats}</span>
        </span>
        {live && live.pot > 0 && (
          <span>
            · pote <span className="font-mono text-burn">{formatMoney(live.pot, currency)}</span>
          </span>
        )}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {seats.map((s) => {
          const m = byId[s.userId]
          return (
            <UserAvatar
              key={s.userId}
              userId={s.userId}
              src={resolveAssetUrl(m?.avatar)}
              name={m?.displayName ?? s.displayName}
              ringColor={m?.profileColor}
              frame={m?.avatarFrame}
              className="h-7 w-7"
            />
          )
        })}
        {!closed &&
          Array.from({ length: Math.max(0, maxSeats - seats.length) }).map((_, i) => (
            <span key={`vaga-${i}`} aria-hidden className="h-7 w-7 rounded-brutal border-2 border-dashed border-line-strong" />
          ))}
        {seats.length > 0 && (
          <span className="ml-1 min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {seats.map((s) => (byId[s.userId]?.displayName ?? s.displayName).split(/\s+/)[0]).join(', ')}
          </span>
        )}
      </div>

      {!closed && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => openPoker(metadata.tableId)}
            className="flex items-center gap-1.5 rounded-brutal border-2 border-acid bg-acid px-2.5 py-1 font-mono text-[11.5px] uppercase tracking-widest text-void transition-colors hover:bg-acid/90"
          >
            <PokerIcon className="h-3 w-3" />
            {imSeated ? 'Voltar à mesa' : seats.length >= maxSeats ? 'Assistir' : 'Sentar'}
          </button>
        </div>
      )}
    </CardFrame>
  )
}
