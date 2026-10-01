import * as React from 'react'
import {
  ChevronDown,
  ChevronUp,
  Coins,
  Pickaxe,
  Radio,
  RefreshCw,
  Swords,
  Timer,
  Trophy,
  Users,
  Vault
} from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { Hint } from '@/components/ui/tooltip'
import { resolveAssetUrl } from '@/lib/api'
import {
  formatCompact,
  JACKPOT_MIN_BETTORS,
  WAGER_PAYOUT_MULTIPLIER,
  WAGER_WINDOW_MS,
  type LiveWagerGame
} from '@/lib/api-gamification'
import { useLayout } from '@/lib/layout-context'
import { useMembers } from '@/lib/members-context'
import { useGamification } from '@/lib/gamification-context'
import { queueLabel } from '@/lib/activity-context'
import { useTicker } from '@/lib/use-now'
import { cn } from '@/lib/utils'
import { BetPopover, PoolBars } from './BetPopover'
import { EarnRulesPopover } from './EarnRulesPopover'
import { formatElapsed } from './ActivityLine'
import { ArenaHeader, ArenaTabs } from './ArenaChrome'

/**
 * APOSTAS — as partidas ao vivo, agora num painel só delas.
 *
 * Era a seção "Ao vivo" no rodapé do ranking, com um card POR SESSÃO: um
 * 5-stack virava cinco cards iguais, cinco botões "apostar" pra uma aposta
 * só (ela vale pela partida). Aqui é um card por PARTIDA, com todo mundo que
 * está nela, a contagem regressiva da janela e o pote da casa em cima.
 *
 * Os dados vêm do poll de `liveGames` (gamification-context), que já roda
 * quando alguém do grupo está em partida — abrir este painel só garante que
 * ele continue rodando.
 */

export function WagersPanel() {
  const { closeWagers: close } = useLayout()
  const { profile, liveGames, refreshLiveGames } = useGamification()
  const [refreshing, setRefreshing] = React.useState(false)
  const [rulesOpen, setRulesOpen] = React.useState(false)

  const refresh = React.useCallback(async () => {
    setRefreshing(true)
    try {
      await refreshLiveGames()
    } finally {
      // Dá pra ver que girou mesmo quando a resposta volta em 40ms.
      setTimeout(() => setRefreshing(false), 400)
    }
  }, [refreshLiveGames])

  /**
   * Uma partida, vários boards: cada sessão do grupo traz o seu, com a mesma
   * pool. Fica um por `matchId`, preferindo o que traz `self` — é o da minha
   * sessão, o único com a odd de apostar em mim.
   */
  const matches = React.useMemo(() => {
    const byMatch = new Map<string, LiveWagerGame>()
    for (const game of liveGames) {
      const id = game.matchId ?? game.session.id
      const prev = byMatch.get(id)
      if (!prev || (game.self && !prev.self)) byMatch.set(id, game)
    }
    return [...byMatch.values()].sort(
      (a, b) => new Date(b.session.startedAt).getTime() - new Date(a.session.startedAt).getTime()
    )
  }, [liveGames])

  // O cofre é um só; qualquer board o traz.
  const house = liveGames.find((g) => g.house)?.house

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-void xl:w-80">
      <ArenaHeader title="Apostas" onClose={close}>
        <Hint label="Atualizar agora" description="A lista se atualiza sozinha a cada 30 segundos." side="bottom">
          <button
            type="button"
            onClick={() => void refresh()}
            aria-label="Atualizar"
            className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          </button>
        </Hint>
        <EarnRulesPopover />
      </ArenaHeader>
      <ArenaTabs current="wagers" />

      <div className="scroll-stable min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {/* Carteira: quanto eu tenho pra apostar, sempre à vista. */}
        <div className="flex items-center gap-2 rounded-brutal border border-line bg-void/60 px-3 py-2">
          <Coins className="h-4 w-4 shrink-0 text-burn" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">seus murchos</p>
            <p className="font-mono text-sm text-burn">{profile ? formatCompact(profile.coins) : '—'}</p>
          </div>
          {matches[0]?.maxAmount != null && (
            <Hint
              label="Teto por aposta"
              description="Começa em 50 e sobe a cada aposta feita, até 5.000."
              side="left"
            >
              <p className="cursor-help text-right text-[11px] text-muted-foreground">
                teto
                <br />
                <span className="font-mono text-foreground">{formatCompact(matches[0].maxAmount)}</span>
              </p>
            </Hint>
          )}
        </div>

        {house && <HouseVault jackpot={house.jackpot} bonusFund={house.bonusFund} />}

        <section>
          <h4 className="mb-1.5 flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
            <Radio className={cn('h-3 w-3', matches.length > 0 && 'text-destructive')} aria-hidden />
            Ao vivo — {matches.length}
          </h4>

          {matches.length === 0 ? (
            <div className="rounded-brutal border border-line bg-void/60 px-3 py-5 text-center">
              <p className="text-xs text-foreground">Ninguém em partida agora.</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Quando alguém do grupo entrar numa partida de LoL ou Minecraft, ela aparece aqui com a
                aposta aberta.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {matches.map((game) => (
                <MatchCard key={game.matchId ?? game.session.id} game={game} />
              ))}
            </ul>
          )}
        </section>

        {/* Com partida na tela a regra fica dobrada; sem, aberta — é a hora em
            que alguém novo pergunta "como funciona isso?". */}
        {matches.length === 0 ? (
          <HowItWorks />
        ) : (
          <div>
            <button
              type="button"
              onClick={() => setRulesOpen((v) => !v)}
              aria-expanded={rulesOpen}
              className="flex w-full items-center justify-between rounded-brutal px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground"
            >
              Como funciona
              {rulesOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {rulesOpen && <HowItWorks />}
          </div>
        )}
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------

/**
 * O cofre da casa: o que se perde em aposta vira pote e fundo de bônus (ver
 * WagerHouse em api-gamification). Dois números que a galera só via no
 * rodapé do card, quando havia card.
 */
function HouseVault({ jackpot, bonusFund }: { jackpot: number; bonusFund: number }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <Hint
        label="Pote da casa"
        description={`Sai numa partida com ${JACKPOT_MIN_BETTORS} ou mais apostando em que todo mundo acertou, dividido entre eles. Cresce com o que é perdido em aposta.`}
        side="bottom"
      >
        <div className="cursor-help rounded-brutal border border-acid-dark/60 bg-acid/[0.05] px-2.5 py-2">
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Trophy className="h-3 w-3 text-acid-text" aria-hidden />
            pote
          </p>
          <p className="font-mono text-sm text-acid-text">{formatCompact(jackpot)}</p>
        </div>
      </Hint>
      <Hint
        label="Fundo de bônus"
        description="Paga o bônus de grupo: +15% por apostador além do primeiro, até +60%. Quando o fundo está baixo, o bônus sai menor."
        side="bottom"
      >
        <div className="cursor-help rounded-brutal border border-line bg-void/60 px-2.5 py-2">
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Vault className="h-3 w-3" aria-hidden />
            fundo de bônus
          </p>
          <p className="font-mono text-sm text-foreground">{formatCompact(bonusFund)}</p>
        </div>
      </Hint>
    </div>
  )
}

// ---------------------------------------------------------------------------

function MatchCard({ game }: { game: LiveWagerGame }) {
  const { byId } = useMembers()
  const { liveGames } = useGamification()
  // Segundo a segundo: a janela de 5 min fecha e a contagem tem que andar.
  const now = useTicker(1_000)

  const lead = byId[game.session.userId]
  const leadName = lead?.displayName ?? game.session.user?.displayName ?? '?'
  const leadColor = lead?.profileColor ?? game.session.user?.profileColor ?? undefined

  const players = Array.isArray(game.players) && game.players.length > 0
    ? game.players
    : [{ sessionId: game.session.id, userId: game.session.userId, displayName: leadName, champion: game.session.champion ?? null }]
  const others = players.filter((p) => p.userId !== game.session.userId)

  const GameIcon = game.session.game === 'minecraft' ? Pickaxe : Swords
  const detail = [game.session.champion, queueLabel(game.session.queue ?? undefined)].filter(Boolean).join(' · ')
  const since = new Date(game.session.startedAt).getTime()

  // Minha partida: a janela que vale é a de apostar em mim, que é mais curta
  // e mora no board da MINHA sessão (BetPopover resolve o board certo).
  const selfBoard =
    game.self ??
    (game.mine
      ? liveGames.find((g) => g.self && (g.matchId ?? g.session.id) === (game.matchId ?? game.session.id))?.self ?? null
      : null)
  const open = game.mine ? Boolean(selfBoard?.open) : game.open
  const closesAt = new Date((game.mine && selfBoard ? selfBoard.closesAt : game.closesAt) ?? 0).getTime()
  const remaining = Number.isFinite(closesAt) ? closesAt - now : 0

  const bettors = new Set(game.bets.map((b) => b.userId)).size
  const myWager = game.myWager

  return (
    <li
      className={cn(
        'rounded-brutal border p-2.5',
        open ? 'border-burn/40 bg-burn/[0.04]' : 'border-line bg-void/60'
      )}
    >
      <div className="flex items-start gap-2">
        {/* Quem está na partida: um avatar, ou a pilha do grupo. */}
        <div className="flex shrink-0 -space-x-2">
          {players.slice(0, 4).map((p) => {
            const member = byId[p.userId]
            return (
              <UserAvatar
                key={p.userId}
                userId={p.userId}
                src={resolveAssetUrl(member?.avatar ?? (p.userId === game.session.userId ? game.session.user?.avatar : undefined))}
                name={member?.displayName ?? p.displayName}
                ringColor={member?.profileColor ?? undefined}
                frame={member?.avatarFrame}
                className="h-7 w-7 border-2 border-void"
              />
            )
          })}
          {players.length > 4 && (
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-void bg-surface-raised font-mono text-[11px] text-muted-foreground">
              +{players.length - 4}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-tight" style={leadColor ? { color: leadColor } : undefined}>
            {leadName}
            {others.length > 0 && (
              <span className="text-muted-foreground">
                {' '}
                {others.length === 1
                  ? `e ${byId[others[0].userId]?.displayName ?? others[0].displayName}`
                  : `+${others.length}`}
              </span>
            )}
          </p>
          <p className="flex items-center gap-1 truncate text-[11px] text-burn">
            <GameIcon className="h-2.5 w-2.5 shrink-0" aria-hidden />
            <span className="truncate">{detail || game.session.game}</span>
            {Number.isFinite(since) && (
              <span className="shrink-0 text-muted-foreground">· {formatElapsed(since, now)}</span>
            )}
          </p>
        </div>

        <BetPopover userId={game.session.userId} sessionId={game.session.id} targetName={leadName} side="left">
          <button
            type="button"
            disabled={!open && !myWager}
            className={cn(
              'shrink-0 rounded-brutal border px-2 py-1 font-mono text-[11px] uppercase tracking-widest transition-colors',
              myWager
                ? 'border-acid-dark bg-acid/10 text-acid'
                : open
                  ? 'border-acid-dark text-acid hover:bg-acid/15'
                  : 'border-line text-muted-foreground opacity-60'
            )}
          >
            {myWager ? 'apostado' : open ? (game.mine ? 'em mim' : 'apostar') : 'fechado'}
          </button>
        </BetPopover>
      </div>

      {/* A janela: o que separa "ainda dá" de "perdi". */}
      <p className="mt-2 flex items-center gap-1.5 text-[11px]">
        <Timer className={cn('h-3 w-3 shrink-0', open ? 'text-burn' : 'text-muted-foreground')} aria-hidden />
        {open && remaining > 0 ? (
          <span className="text-burn">
            aposta fecha em <span className="font-mono">{formatCountdown(remaining)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">apostas fechadas</span>
        )}
        {bettors > 0 && (
          <span className="ml-auto flex items-center gap-1 text-muted-foreground">
            <Users className="h-3 w-3" aria-hidden />
            {bettors} apostando
          </span>
        )}
      </p>

      {myWager && (
        <p className="mt-1.5 rounded-brutal border border-acid-dark/60 bg-acid/[0.06] px-2 py-1 text-[11px] text-foreground">
          Você: <span className="font-mono text-burn">{formatCompact(myWager.amount)}</span>{' '}
          {myWager.self ? 'em você mesmo' : myWager.prediction === 'win' ? 'na vitória' : 'na derrota'} →{' '}
          <span className="font-mono text-acid-text">{formatCompact(myWager.potential)}</span> se acertar
        </p>
      )}

      <PoolBars pool={game.pool} bonus={game.groupBonus} house={game.house} className="mt-2" />
    </li>
  )
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------

/**
 * A regra, escrita a partir das constantes que o cliente já tem — mudou o
 * balanceamento, muda o texto. Os 15%/60% do bônus de grupo espelham
 * `groupBonusPreview` (api-gamification.ts).
 */
function HowItWorks() {
  const minutes = Math.round(WAGER_WINDOW_MS / 60_000)
  return (
    <section className="rounded-brutal border border-line bg-void/60 p-3">
      <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        Como funciona
      </h4>
      <ul className="space-y-1.5 text-xs leading-snug text-muted-foreground">
        <li>
          Alguém do grupo entra em partida de LoL ou Minecraft e a aposta abre por{' '}
          <span className="text-foreground">{minutes} minutos</span>.
        </li>
        <li>
          Acertou o resultado, recebe <span className="text-foreground">{WAGER_PAYOUT_MULTIPLIER}x</span> o
          que apostou. Errou, perde.
        </li>
        <li>
          Mais gente apostando na mesma partida rende bônus de grupo:{' '}
          <span className="text-foreground">+15% por apostador</span>, até +60%.
        </li>
        <li>
          Com <span className="text-foreground">{JACKPOT_MIN_BETTORS} ou mais</span> apostando e todo mundo
          acertando, o pote da casa sai dividido.
        </li>
        <li>Na própria partida também dá: a odd sai da sua winrate recente.</li>
      </ul>
    </section>
  )
}
