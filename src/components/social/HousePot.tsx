import * as React from 'react'
import { ChevronDown, ChevronUp, Flame, Landmark, Vault } from 'lucide-react'
import { CrownIcon, TrophyIcon } from '@/lib/bocas-icons'
import { Hint } from '@/components/ui/tooltip'
import type { IconComponent } from '@/lib/icon-component'
import {
  formatCompact,
  JACKPOT_MIN_BETTORS,
  type JackpotWinInfo,
  type LiveWagerGame,
  type WagerHouse
} from '@/lib/api-gamification'
import { useGamification } from '@/lib/gamification-context'
import { useMembers } from '@/lib/members-context'
import { queueLabel } from '@/lib/activity-context'
import { formatRelative } from '@/lib/natural-date'
import { useTicker } from '@/lib/use-now'
import { cn } from '@/lib/utils'

/**
 * POTE DA CASA — no topo do painel de apostas o tempo todo.
 *
 * Antes o cofre só chegava dentro dos boards de `/wagers/live`, então sem
 * ninguém em partida o painel não tinha pote nenhum pra mostrar. Agora vem do
 * `/wagers/house` (carregado no login, andando pelo socket) e diz, além do
 * valor: se alguma partida está disputando o pote agora, quanto falta pra uma
 * disputar, quanto entrou na semana e quem levou os últimos.
 *
 * Desde out/2026 a Casa é a contraparte das apostas: os quadrinhos mostram a
 * BANCA (o que paga quem acerta), o fundo do bônus, o que já foi queimado e o
 * Fundo do Ano — tudo que o fechamento de domingo reparte.
 *
 * `fallback` é o cofre de um board, pra servidor que ainda não tem a rota.
 */

type Race =
  /** Uma partida já tem gente suficiente: o pote está em jogo. */
  | { kind: 'live'; game: LiveWagerGame; bettors: number }
  /** Aposta aberta, mas falta gente. */
  | { kind: 'short'; game: LiveWagerGame; bettors: number }
  /** Tem partida no ar, mas nenhuma chegou e as apostas já fecharam. */
  | { kind: 'closed' }
  | { kind: 'idle' }

function bettorsOf(game: LiveWagerGame): number {
  return new Set(game.bets.map((b) => b.userId)).size
}

function raceOf(matches: LiveWagerGame[], min: number): Race {
  const counted = matches
    .map((game) => ({ game, bettors: bettorsOf(game) }))
    .sort((a, b) => b.bettors - a.bettors)
  const live = counted.find((m) => m.bettors >= min)
  if (live) return { kind: 'live', ...live }
  const open = counted.find((m) => m.game.open)
  if (open) return { kind: 'short', ...open }
  return matches.length > 0 ? { kind: 'closed' } : { kind: 'idle' }
}

export function HousePot({
  matches,
  fallback
}: {
  matches: LiveWagerGame[]
  fallback?: WagerHouse
}) {
  const { house } = useGamification()
  const { byId } = useMembers()
  const now = useTicker(60_000)
  const [historyOpen, setHistoryOpen] = React.useState(false)

  const jackpot = house?.jackpot ?? fallback?.jackpot ?? null
  const bonusFund = house?.bonusFund ?? fallback?.bonusFund ?? null
  const min = house?.rules.minBettors ?? JACKPOT_MIN_BETTORS
  const race = raceOf(matches, min)

  // Quando o pote cresce na frente de quem está olhando, um "+N" sobe ao lado
  // do número por um instante: dá pra ver que ele anda.
  const [bump, setBump] = React.useState<number | null>(null)
  const prevRef = React.useRef<number | null>(jackpot)
  React.useEffect(() => {
    const prev = prevRef.current
    prevRef.current = jackpot
    if (prev == null || jackpot == null || jackpot <= prev) return
    setBump(jackpot - prev)
    const timer = setTimeout(() => setBump(null), 2_500)
    return () => clearTimeout(timer)
  }, [jackpot])

  const nameOf = (userId: string, fallbackName: string): string =>
    byId[userId]?.displayName ?? fallbackName
  const leadOf = (game: LiveWagerGame): string =>
    nameOf(game.session.userId, game.session.user?.displayName ?? '?')

  const pct = (share: number | undefined, dflt: number): number => Math.round((share ?? dflt) * 100)
  const last = house?.wins[0]

  return (
    <section
      className={cn(
        'rounded-brutal border p-3 transition-shadow',
        race.kind === 'live'
          ? 'animate-glow-pulse border-acid bg-acid/[0.08]'
          : 'border-acid-dark/60 bg-acid/[0.05]'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
          <TrophyIcon className="h-3.5 w-3.5 text-acid-text" aria-hidden />
          Pote da casa
        </h3>
        {house && house.week.toJackpot > 0 && (
          <Hint
            label="Entrou no pote nesta semana"
            description={`Saiu do fechamento de domingo: ${pct(house.rules.close?.jackpot, 0.15)}% do que a banca da Casa juntou acima da reserva dela vai pro pote.`}
            side="left"
          >
            <span className="cursor-help font-mono text-[11px] text-acid-text">
              +{formatCompact(house.week.toJackpot)} na semana
            </span>
          </Hint>
        )}
      </div>

      <div className="mt-1.5 flex items-baseline gap-1.5">
        <p className="font-mono text-3xl leading-none tabular-nums text-acid-text">
          {jackpot != null ? jackpot.toLocaleString('pt-BR') : '—'}
        </p>
        <span className="text-xs text-muted-foreground">murchos</span>
        {bump != null && (
          <span
            key={jackpot ?? 0}
            className="ml-auto font-mono text-xs text-acid duration-500 animate-in fade-in slide-in-from-bottom-2"
          >
            +{formatCompact(bump)}
          </span>
        )}
      </div>

      {/* A corrida: o que falta pra esse número sair. */}
      <div className="mt-2.5 flex items-start gap-2">
        <BettorDots filled={race.kind === 'live' || race.kind === 'short' ? race.bettors : 0} total={min} live={race.kind === 'live'} />
        <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-muted-foreground">
          {race.kind === 'live' && (
            <>
              <span className="text-acid">Em disputa agora:</span>{' '}
              <span className="text-foreground">{race.bettors} apostando</span> na partida de{' '}
              <span className="text-foreground">{leadOf(race.game)}</span>. Se todo mundo acertar, cada um leva{' '}
              <span className="font-mono text-acid-text">
                {formatCompact(Math.floor((jackpot ?? 0) / Math.max(1, race.bettors)))}
              </span>
              .
            </>
          )}
          {race.kind === 'short' && (
            <>
              <span className="text-foreground">
                {race.bettors} de {min}
              </span>{' '}
              na partida de <span className="text-foreground">{leadOf(race.game)}</span>: falta
              {min - race.bettors === 1 ? '' : 'm'}{' '}
              <span className="text-burn">{min - race.bettors}</span> apostando pra valer o pote.
            </>
          )}
          {race.kind === 'closed' &&
            `As partidas no ar fecharam sem ${min} apostando. O pote espera a próxima.`}
          {race.kind === 'idle' && (
            <>
              Sai na próxima partida com <span className="text-foreground">{min} ou mais</span> apostando
              em que todo mundo acertar, dividido entre eles.
            </>
          )}
        </p>
      </div>

      {/* Os caixas da Casa: quem paga, o que banca o bônus, o que sumiu e o do ano. */}
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <Tile
          Icon={Landmark}
          label="banca livre"
          value={house?.free ?? (house?.banca != null ? house.banca - (house.exposure ?? 0) : null)}
          hint="Banca da Casa"
          description={`É ela que paga o lucro de quem acerta e fica com o que se perde. Só aceita aposta cujo lucro consegue pagar: no máximo ${pct(house?.rules.maxBetProfitShare, 0.05)}% dela numa aposta e ${pct(house?.rules.maxMatchProfitShare, 0.15)}% numa partida.${house?.exposure ? ` Agora ${house.exposure.toLocaleString('pt-BR')} estão prometidos a apostas abertas.` : ''}`}
        />
        <Tile
          Icon={Vault}
          label="fundo de bônus"
          value={bonusFund}
          hint="Fundo de bônus"
          description={`Paga o bônus de grupo: com ${min}+ apostando, +15% por apostador além do primeiro, até +60%. Recebe ${pct(house?.rules.close?.bonusFund, 0.15)}% do fechamento de domingo. Fundo baixo, bônus menor.`}
        />
        <Tile
          Icon={Flame}
          label="queimado"
          value={house?.sunk ?? null}
          hint="Queimado de vez"
          description={`${pct(house?.rules.close?.burn, 0.35)}% do que a banca junta acima da reserva some no fechamento, e metade do juro do Banco também. É o que segura o murcho de inflacionar.`}
        />
        <Tile
          Icon={CrownIcon}
          label="fundo do ano"
          value={house?.fundoAno ?? null}
          hint="Prêmio do Ano"
          description={`Paga os três primeiros do recap do ano (50/30/20). Recebe ${pct(house?.rules.close?.fundoAno, 0.2)}% do fechamento de domingo e um quarto do juro do Banco.`}
        />
      </div>

      {house?.lastClose && (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          {house.lastClose.surplus > 0 ? (
            <>
              Último fechamento: <span className="font-mono text-foreground">{formatCompact(house.lastClose.surplus)}</span>{' '}
              repartidos — {formatCompact(house.lastClose.burned)} queimados, {formatCompact(house.lastClose.toJackpot)} pro
              pote, {formatCompact(house.lastClose.toYear)} pro ano.
            </>
          ) : (
            'Último fechamento sem excedente: a banca guardou tudo pra cobrir as apostas.'
          )}
        </p>
      )}

      {/* Quem já levou. */}
      {house && (
        <div className="mt-3 border-t border-line pt-2.5">
          {!last ? (
            <p className="text-[11.5px] text-muted-foreground">Nenhum pote saiu ainda.</p>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">
                último pote · {formatRelative(new Date(last.at), new Date(now))}
              </p>
              <WinLine win={last} nameOf={nameOf} />
              {house.paid.count > 1 && (
                <button
                  type="button"
                  onClick={() => setHistoryOpen((v) => !v)}
                  aria-expanded={historyOpen}
                  className="mt-1.5 flex w-full items-center justify-between rounded-brutal px-1 py-1 text-[11.5px] text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground"
                >
                  <span>
                    {house.paid.count} potes pagos ·{' '}
                    <span className="font-mono">{formatCompact(house.paid.total)}</span> no total
                  </span>
                  {historyOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              )}
              {historyOpen && (
                <ul className="mt-1 space-y-2">
                  {house.wins.slice(1).map((win) => (
                    <li key={win.matchId}>
                      <p className="text-[11px] text-muted-foreground">
                        {formatRelative(new Date(win.at), new Date(now))}
                        {win.queue ? ` · ${queueLabel(win.queue)}` : ''}
                      </p>
                      <WinLine win={win} nameOf={nameOf} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}

function Tile({
  Icon,
  label,
  value,
  hint,
  description
}: {
  Icon: IconComponent
  label: string
  value: number | null
  hint: string
  description: string
}) {
  return (
    <Hint label={hint} description={description} side="bottom">
      <div className="cursor-help rounded-brutal border border-line bg-void/60 px-2 py-1.5">
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Icon className="h-3 w-3" aria-hidden />
          {label}
        </p>
        <p className="font-mono text-sm text-foreground">{value != null ? formatCompact(value) : '—'}</p>
      </div>
    </Hint>
  )
}

function BettorDots({ filled, total, live }: { filled: number; total: number; live: boolean }) {
  return (
    <span className="mt-1 flex shrink-0 gap-1" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-2 w-2 rounded-full border',
            i < filled ? (live ? 'border-acid bg-acid' : 'border-burn bg-burn') : 'border-line bg-surface-raised'
          )}
        />
      ))}
    </span>
  )
}

function WinLine({
  win,
  nameOf
}: {
  win: JackpotWinInfo
  nameOf: (userId: string, fallback: string) => string
}) {
  const names = win.winners.map((w) => nameOf(w.userId, w.displayName))
  const share = win.winners[0]?.share ?? Math.floor(win.amount / Math.max(1, names.length))
  const list =
    names.length <= 1 ? (names[0] ?? '?') : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
  return (
    <p className="text-xs leading-snug text-foreground">
      <span className="font-mono text-acid-text">{formatCompact(win.amount)}</span> pra {list}
      {names.length > 1 && (
        <span className="text-muted-foreground">
          {' '}
          (+<span className="font-mono">{formatCompact(share)}</span> cada)
        </span>
      )}
    </p>
  )
}
