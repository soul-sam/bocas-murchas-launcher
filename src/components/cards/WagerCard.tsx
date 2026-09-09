import * as React from 'react'
import { useTicker } from '@/lib/use-now'
import { Coins, Swords, Pickaxe, Radio } from 'lucide-react'
import type { CardProps } from './index'
import { CardFrame } from './index'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import {
  WAGER_WINDOW_MS,
  type WagerBet,
  type WagerCardMeta,
  type WagerPool
} from '@/lib/api-gamification'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { useGamification } from '@/lib/gamification-context'
import { queueLabel } from '@/lib/activity-context'
import { BetForm, PoolBars } from '@/components/social/BetPopover'
import { formatElapsed } from '@/components/social/ActivityLine'
import { cn } from '@/lib/utils'
import { NameEmoji } from '@/components/social/NameEmoji'

/**
 * CARTÃO DE APOSTA.
 *
 * Postado quando alguém entra em partida; aberto até ela acabar. Enquanto
 * está aberto dá pra apostar direto daqui (mesmo formulário do popover).
 * Quando fecha, mostra o resultado e quem levou o quê.
 *
 * A pool do metadata pode estar atrasada (o servidor só reposta o cartão em
 * alguns momentos); se o poll de `liveGames` tem essa partida, ele ganha.
 */

const RESULT_LABEL: Record<string, string> = {
  win: 'Venceu',
  loss: 'Perdeu',
  remake: 'Remake',
  unknown: 'Encerrada'
}

// Relogio compartilhado (para com a janela escondida): ver lib/use-now.

export function WagerCard({ metadata }: CardProps<WagerCardMeta>) {
  const { user } = useAuth()
  const { byId } = useMembers()
  const { liveGames, profile } = useGamification()

  const settled = !!metadata.settled
  const live = React.useMemo(
    () => (settled ? undefined : liveGames.find((g) => g.session.id === metadata.sessionId)),
    [liveGames, metadata.sessionId, settled]
  )

  const pool: WagerPool = live?.pool ?? metadata.pool ?? { win: 0, loss: 0 }
  const bets: WagerBet[] = live?.bets ?? (Array.isArray(metadata.bets) ? metadata.bets : [])
  const myBet = live?.myWager ?? bets.find((b) => b.userId === user?.id) ?? null

  const player = byId[metadata.userId]
  const name = player?.displayName ?? metadata.displayName
  const color = player?.profileColor ?? undefined
  const GameIcon = metadata.game === 'minecraft' ? Pickaxe : Swords
  const detail = [metadata.champion, queueLabel(metadata.queue ?? undefined)].filter(Boolean).join(' · ')

  const since = typeof metadata.since === 'number' ? metadata.since : new Date(metadata.since).getTime()
  const now = useTicker(10_000, !settled)

  // Grupo na mesma partida: o cartão é da partida, não de uma pessoa. Se eu
  // estou em qualquer uma das sessões, é minha partida e eu não aposto.
  const players = React.useMemo(
    () => (Array.isArray(metadata.players) ? metadata.players : []),
    [metadata.players]
  )
  const others = players.filter((p) => p.userId !== metadata.userId)
  const isMine = metadata.userId === user?.id || players.some((p) => p.userId === user?.id)

  // Janela de 5 min: cartões antigos não têm `closesAt`, daí o fallback pelo
  // início da partida.
  const closesAtMs =
    typeof metadata.closesAt === 'number'
      ? metadata.closesAt
      : metadata.closesAt
        ? new Date(metadata.closesAt).getTime()
        : since + WAGER_WINDOW_MS
  const windowOpen = live ? live.open : Number.isFinite(closesAtMs) && now < closesAtMs

  const canBet = !settled && !isMine && !myBet && !!user && windowOpen

  const accent: 'acid' | 'burn' | 'destructive' | 'muted' = settled
    ? metadata.result === 'win'
      ? 'acid'
      : metadata.result === 'loss'
        ? 'destructive'
        : 'muted'
    : 'burn'

  const payouts = Array.isArray(metadata.payouts) ? metadata.payouts : []

  return (
    <CardFrame
      accent={accent}
      icon={
        settled ? (
          <Coins className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Radio className="h-3.5 w-3.5 text-destructive" />
        )
      }
      title={
        settled ? (
          <span>
            Aposta encerrada ·{' '}
            <span
              className={
                metadata.result === 'win'
                  ? 'text-acid'
                  : metadata.result === 'loss'
                    ? 'text-destructive'
                    : 'text-muted-foreground'
              }
            >
              {RESULT_LABEL[metadata.result ?? 'unknown'] ?? 'Encerrada'}
            </span>
          </span>
        ) : (
          <span>
            Aposta ao vivo
            {Number.isFinite(since) && (
              <span className="text-burn"> · {formatElapsed(since, now)}</span>
            )}
          </span>
        )
      }
      footer={
        bets.length > 0 ? (
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5 normal-case">
            {bets.slice(0, 8).map((bet, index) => {
              const who = byId[bet.userId]
              const payout = payouts.find((p) => p.userId === bet.userId)?.payout
              return (
                <li key={`${bet.userId}-${index}`} className="flex items-center gap-1">
                  <span style={who?.profileColor ? { color: who.profileColor } : undefined}>
                    {who?.displayName ?? 'alguém'}
                  </span>
                  <NameEmoji id={who?.emoji} />
                  <span className={bet.prediction === 'win' ? 'text-acid' : 'text-destructive'}>
                    {bet.amount} {bet.prediction === 'win' ? 'W' : 'L'}
                  </span>
                  {settled && payout !== undefined && (
                    <span className={cn('font-bold', payout > 0 ? 'text-acid' : 'text-destructive')}>
                      {payout > 0 ? `+${payout}` : `−${bet.amount}`}
                    </span>
                  )}
                </li>
              )
            })}
            {bets.length > 8 && <li className="text-muted-foreground">+{bets.length - 8}</li>}
          </ul>
        ) : settled ? (
          <span>ninguém apostou</span>
        ) : undefined
      }
    >
      <div className="flex items-center gap-2">
        <UserAvatar
          userId={metadata.userId}
          src={resolveAssetUrl(player?.avatar)}
          name={name}
          ringColor={color}
          frame={player?.avatarFrame}
          className="h-8 w-8"
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 font-display text-sm leading-tight" style={color ? { color } : undefined}>
            <span className="truncate">{name}</span>
            <NameEmoji id={player?.emoji} />
          </p>
          <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <GameIcon className="h-2.5 w-2.5 shrink-0" />
            {detail || (metadata.game === 'minecraft' ? 'Minecraft' : 'LoL')}
          </p>
        </div>
      </div>

      <PoolBars pool={pool} className="mt-2" />

      {others.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {others.map((p) => p.displayName).join(', ')} {others.length > 1 ? 'estão' : 'está'} na
          mesma partida — uma aposta vale por todos.
        </p>
      )}

      {canBet && (
        <div className="mt-2 border-t border-line pt-2">
          <BetForm
            sessionId={live?.session.id ?? metadata.sessionId}
            coins={profile?.coins ?? 0}
            max={live?.maxAmount}
            closesAt={Number.isFinite(closesAtMs) ? new Date(closesAtMs).toISOString() : undefined}
          />
        </div>
      )}

      {!settled && !isMine && !myBet && !windowOpen && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          aposta fechada — só nos 5 primeiros minutos
        </p>
      )}

      {!settled && myBet && (
        <p className="mt-2 rounded-brutal border border-burn/40 bg-burn/[0.06] px-2 py-1 text-xs text-foreground">
          Você apostou <span className="font-mono text-burn">{myBet.amount}</span> em{' '}
          <span className={myBet.prediction === 'win' ? 'text-acid' : 'text-destructive'}>
            {myBet.prediction === 'win' ? 'vitória' : 'derrota'}
          </span>
          .
        </p>
      )}

      {!settled && isMine && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          é a sua partida — a galera está apostando em você
        </p>
      )}
    </CardFrame>
  )
}
