import { Users } from 'lucide-react'
import { MurchosIcon } from '@/lib/bocas-icons'
import type { CardProps } from './index'
import { CardFrame } from './index'
import { UserAvatar } from '@/components/ui/avatar'
import { GameIcon } from '@/components/social/GameIcon'
import { resolveAssetUrl } from '@/lib/api'
import { CARTAS_SPEED_LABEL, stakeLabel, tableKind, type CardGame, type CartasSpeed, type TrucoVariant } from '@/lib/api-cartas'
import { useAuth } from '@/lib/auth-context'
import { useCartas } from '@/lib/cartas-context'
import { useMembers } from '@/lib/members-context'
import { cn } from '@/lib/utils'

/** O que o servidor grava no card (lib/cartas/table.ts → cardMetadata). */
export interface CartasCardMetadata {
  tableId: string
  game: CardGame
  variant: TrucoVariant | null
  name: string
  stake: number
  maxSeats: number
  speed: CartasSpeed
  status: 'waiting' | 'playing' | 'closed'
  playing: boolean
  createdById: string
  seats: Array<{ userId: string; displayName: string }>
  matchCount: number
  summary: string | null
  lastWinners: string[] | null
  closedAt: number | null
}

/**
 * CARTÃO DA MESA DE TRUCO OU CACHETA — postado no canal de jogos quando
 * alguém abre uma mesa, reescrito pelo servidor a cada mudança. Mesmo jeito
 * do card do pôquer: enquanto a mesa existe, manda a lista viva do saguão;
 * mesa que sumiu do saguão é mesa fechada.
 */
export function CartasCard({ metadata }: CardProps<CartasCardMetadata>) {
  const { user } = useAuth()
  const { byId } = useMembers()
  const { tables, ready, goTo } = useCartas()

  const live = tables.find((t) => t.id === metadata.tableId)
  const closed = metadata.status === 'closed' || (ready && !live)
  const seats = live ? live.players.map((p) => ({ userId: p.userId, displayName: p.displayName })) : metadata.seats ?? []
  const maxSeats = live?.maxSeats ?? metadata.maxSeats
  const matches = live?.matchNumber ?? metadata.matchCount
  const playing = live?.playing ?? metadata.playing
  const summary = live?.summary ?? metadata.summary
  const imSeated = !!user && seats.some((s) => s.userId === user.id)
  const kind = tableKind({ game: metadata.game, variant: metadata.variant })
  const format = metadata.game === 'truco' ? (maxSeats === 4 ? '2x2' : '1x1') : `${maxSeats} lugares`

  return (
    <CardFrame
      accent={closed ? 'muted' : metadata.stake > 0 ? 'burn' : 'acid'}
      icon={<GameIcon game={metadata.game} className="h-3.5 w-3.5" />}
      title={closed ? `Mesa de ${kind.toLowerCase()} fechada` : `Mesa de ${kind.toLowerCase()}`}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">
            {matches > 0 ? `${matches} ${matches === 1 ? 'partida' : 'partidas'}` : 'nenhuma partida ainda'}
            {playing && summary && <> · {summary}</>}
          </span>
          {metadata.lastWinners && metadata.lastWinners.length > 0 && (
            <span className="truncate text-burn">última: {metadata.lastWinners.map((n) => n.split(/\s+/)[0]).join(' e ')}</span>
          )}
        </div>
      }
    >
      <p className={cn('font-display text-lg leading-tight', closed ? 'text-muted-foreground line-through' : 'text-foreground')}>{metadata.name}</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <MurchosIcon className="h-3 w-3 text-burn" aria-hidden />
          {stakeLabel(metadata.stake)}
        </span>
        <span>· {format}</span>
        <span>· {CARTAS_SPEED_LABEL[metadata.speed] ?? metadata.speed}</span>
        <span className="flex items-center gap-1">
          · <Users className="h-3 w-3" aria-hidden />{' '}
          <span className="font-mono">
            {seats.length}/{maxSeats}
          </span>
        </span>
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
              frameColor={m?.profileColor}
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
            onClick={() => goTo(metadata.game, metadata.tableId)}
            className="flex items-center gap-1.5 rounded-brutal border-2 border-acid bg-acid px-2.5 py-1 text-[11.5px] font-semibold text-void transition-colors hover:bg-acid/90"
          >
            <GameIcon game={metadata.game} className="h-3 w-3" />
            {imSeated ? 'Voltar à mesa' : playing || seats.length >= maxSeats ? 'Assistir' : 'Sentar'}
          </button>
        </div>
      )}
    </CardFrame>
  )
}
