import * as React from 'react'
import {
  X,
  Coins,
  Flame,
  ShoppingBag,
  ScrollText,
  Loader2,
  ChevronDown,
  ChevronUp,
  Swords,
  Pickaxe,
  Radio,
  Medal
} from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { parseMetadata, resolveAssetUrl } from '@/lib/api'
import {
  gamification as api,
  formatCompact,
  formatMetricValue,
  METRIC_LABEL,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type LeaderboardPeriod,
  type RecapCardMeta,
  type WeeklyRecap,
  DEFAULT_NAME_COLOR
} from '@/lib/api-gamification'
import { useAuth } from '@/lib/auth-context'
import { useLayout } from '@/lib/layout-context'
import { useOverlays } from '@/lib/overlay-context'
import { useMembers } from '@/lib/members-context'
import { useGamification } from '@/lib/gamification-context'
import { queueLabel } from '@/lib/activity-context'
import { AwardIcon, BadgeChip, TitleTag } from '@/lib/cosmetic-icons'
import { cn } from '@/lib/utils'
import { NameEffect } from './NameEffect'
import { NameEmoji } from './NameEmoji'
import { LevelRing } from './LevelRing'
import { BetPopover, PoolBars } from './BetPopover'
import { formatElapsed } from './ActivityLine'

/**
 * RANKING — painel da coluna direita.
 *
 * Meu card em cima (nível, XP, murchos, streak, badges), depois o ranking
 * por período e métrica, depois as partidas ao vivo pra apostar. Uma chamada
 * ao servidor por troca de aba/métrica, nada de baixar tudo de uma vez: são
 * 14 combinações e a pessoa olha duas.
 */

const METRICS: LeaderboardMetric[] = ['xp', 'coins', 'streak', 'wins', 'voice', 'sounds', 'messages']

/**
 * Pódio. Cor em vez de emoji de medalha: 🥇🥈🥉 saem com desenho diferente em
 * cada versão do Windows e desalinham a coluna, porque cada um tem largura
 * própria. Aqui os três ocupam o mesmo espaço.
 */
// Ouro/prata/bronze sao cores de medalha, nao da marca: iguais em todo tema.
const MEDAL_COLOR = ['#FFC53D', '#C9C9C9', '#B87333']

export function LeaderboardPanel() {
  const { closeLeaderboard: close } = useLayout()
  const currentYear = new Date().getFullYear()
  const { openShop, openWrapped } = useOverlays()
  const [recapOpen, setRecapOpen] = React.useState(false)

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-void xl:w-80">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <h3 className="flex-1 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">Ranking</h3>
        {/* A retrospectiva mora AQUI e não numa aba própria: quem abre o
            ranking já está perguntando "como eu fui?", e é a mesma pergunta
            numa escala maior. */}
        <button
          type="button"
          onClick={() => openWrapped()}
          title={`Retrospectiva Murcha ${currentYear}`}
          aria-label="Retrospectiva Murcha"
          className="shrink-0 rounded-brutal border border-line px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-acid/60 hover:text-acid"
        >
          {currentYear}
        </button>
        <button type="button" onClick={close} aria-label="Fechar" className="rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <MyCard />

        <div className="flex gap-1">
          <button
            type="button"
            onClick={openShop}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-brutal border-2 border-burn/60 px-2 py-1.5 font-mono text-[11.5px] uppercase tracking-widest text-burn transition-colors hover:bg-burn/15"
          >
            <ShoppingBag className="h-3 w-3" />
            lojinha
          </button>
          <button
            type="button"
            onClick={() => setRecapOpen((v) => !v)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-brutal border-2 px-2 py-1.5 font-mono text-[11.5px] uppercase tracking-widest transition-colors',
              recapOpen
                ? 'border-acid bg-acid/10 text-acid'
                : 'border-line-strong text-muted-foreground hover:border-acid/50 hover:text-foreground'
            )}
          >
            <ScrollText className="h-3 w-3" />
            recap
            {recapOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>

        {recapOpen && <RecapBox />}

        <Ranking />
        <LiveGames />
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------

function MyCard() {
  const { user } = useAuth()
  const { byId } = useMembers()
  const { profile, ready, cosmeticName } = useGamification()

  if (!user) return null
  const me = byId[user.id] ?? user
  const color = me.profileColor ?? DEFAULT_NAME_COLOR
  const title = cosmeticName(me.title)

  if (!profile) {
    return (
      <div className="flex items-center gap-2 rounded-brutal border border-line bg-void/60 px-3 py-2 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        {ready ? 'sem perfil de gamificação ainda' : <><Loader2 className="h-3 w-3 animate-spin" /> carregando</>}
      </div>
    )
  }

  const pct =
    profile.nextLevelXp > 0
      ? Math.max(0, Math.min(100, Math.round((profile.levelXp / profile.nextLevelXp) * 100)))
      : 0

  return (
    <div className="card-acid rounded-brutal p-3">
      <div className="flex items-center gap-3">
        <LevelRing level={profile.level} progress={profile.nextLevelXp > 0 ? profile.levelXp / profile.nextLevelXp : 0} size={56}>
          <UserAvatar
            src={resolveAssetUrl(me.avatar)}
            name={me.displayName}
            ringColor={color}
            frame={me.avatarFrame}
            className="h-11 w-11 border-2"
          />
        </LevelRing>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-display text-base leading-tight" style={{ color }}>
            <NameEffect effect={me.nameEffect} className="truncate">
              {me.displayName}
            </NameEffect>
            <NameEmoji id={me.emoji} size="md" />
          </p>
          {title && <TitleTag titleId={me.title} name={title} className="mt-0.5 inline-flex max-w-full" />}
          <p className="mt-0.5 flex items-center gap-2 font-mono text-[11.5px]">
            <span className="flex items-center gap-1 text-burn" title="Murchos">
              <Coins className="h-3 w-3" />
              {formatCompact(profile.coins)}
            </span>
            <span
              className={cn('flex items-center gap-1', profile.streak >= 2 ? 'text-burn' : 'text-muted-foreground')}
              title={`Streak de check-in · melhor: ${profile.bestStreak}`}
            >
              <Flame className="h-3 w-3" />
              {profile.streak}
            </span>
            <span className="ml-auto text-muted-foreground" title="XP da semana">
              +{formatCompact(profile.weeklyXp)} sem.
            </span>
          </p>
        </div>
      </div>

      <div className="mt-2">
        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <span>
            nível {profile.level} → {profile.level + 1}
          </span>
          <span>
            {formatCompact(profile.levelXp)} / {formatCompact(profile.nextLevelXp)} XP
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-brutal bg-surface-raised">
          <div className="xp-fill h-full bg-acid" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {profile.badges.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {profile.badges.slice(0, 10).map((badge) => (
            <BadgeChip
              key={badge.id}
              badgeId={badge.id}
              name={badge.name}
              description={badge.description}
              rarity={badge.rarity}
            />
          ))}
          {profile.badges.length > 10 && (
            <span className="font-mono text-[11px] text-muted-foreground">+{profile.badges.length - 10}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

/**
 * Resumo do último recap, expandido embaixo dos botões. Busca uma vez ao
 * abrir e guarda: o recap muda uma vez por semana, não a cada clique.
 */
function RecapBox() {
  const { token } = useAuth()
  const [recap, setRecap] = React.useState<WeeklyRecap | null | undefined>(undefined)

  React.useEffect(() => {
    if (!token || recap !== undefined) return
    let cancelled = false
    void api
      .latestRecap(token)
      .then((res) => {
        if (!cancelled) setRecap(res)
      })
      .catch(() => {
        if (!cancelled) setRecap(null)
      })
    return () => {
      cancelled = true
    }
  }, [token, recap])

  return (
    <div className="rounded-brutal border border-acid-dark bg-void/60 p-2">
      {recap === undefined ? (
        <p className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> buscando
        </p>
      ) : recap ? (
        <RecapSummary recap={recap} />
      ) : (
        <p className="text-[11.5px] text-muted-foreground">
          Nenhum recap ainda — sai no domingo.
        </p>
      )}
    </div>
  )
}

function RecapSummary({ recap }: { recap: WeeklyRecap }) {
  const { byId } = useMembers()
  const meta = parseMetadata<RecapCardMeta>(recap.payload)
  const range = `${shortDate(recap.weekStart)} – ${shortDate(recap.weekEnd)}`

  if (!meta) {
    return <p className="font-mono text-[11.5px] text-muted-foreground">Recap de {range} (sem detalhes).</p>
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground">Semana {range}</p>
      <ul className="space-y-1">
        {(meta.awards ?? []).slice(0, 5).map((award) => {
          const person = byId[award.userId]
          return (
            <li key={award.key} className="flex items-center gap-1.5 text-xs">
              <span className="flex w-5 shrink-0 items-center justify-center text-burn">
                <AwardIcon awardKey={award.key} className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="text-muted-foreground">{award.title}: </span>
                <span
                  className="font-display"
                  style={person?.profileColor ? { color: person.profileColor } : undefined}
                >
                  {person?.displayName ?? award.displayName}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[11px] text-burn">
                {formatCompact(award.value)} {award.label}
              </span>
            </li>
          )
        })}
      </ul>
      {meta.totals && (
        <p className="border-t border-line pt-1 text-[11px] text-muted-foreground">
          {formatCompact(meta.totals.messages)} msgs · {formatCompact(meta.totals.voiceMinutes)} min call ·{' '}
          {meta.totals.games} partidas · {formatCompact(meta.totals.xp)} XP
        </p>
      )}
    </div>
  )
}

function shortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// ---------------------------------------------------------------------------

function Ranking() {
  const { token, user } = useAuth()
  const { byId } = useMembers()
  const [period, setPeriod] = React.useState<LeaderboardPeriod>('week')
  const [metric, setMetric] = React.useState<LeaderboardMetric>('xp')
  const [entries, setEntries] = React.useState<LeaderboardEntry[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void api
      .leaderboard(token, period, metric)
      .then((res) => {
        if (!cancelled) setEntries(Array.isArray(res?.entries) ? res.entries : [])
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setEntries([])
        setError(err instanceof Error ? err.message : 'Não deu pra carregar o ranking.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, period, metric])

  return (
    <section>
      <div className="mb-2 grid grid-cols-2 gap-1">
        {(['week', 'all'] as LeaderboardPeriod[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              'rounded-brutal border px-2 py-1 font-mono text-[11.5px] uppercase tracking-widest transition-colors',
              period === p
                ? 'border-acid bg-acid/10 text-acid'
                : 'border-line text-muted-foreground hover:text-foreground'
            )}
          >
            {p === 'week' ? 'Semana' : 'Sempre'}
          </button>
        ))}
      </div>

      <div className="mb-2 flex flex-wrap gap-1">
        {METRICS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMetric(m)}
            className={cn(
              'rounded-brutal border px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-widest transition-colors',
              metric === m
                ? 'border-burn bg-burn/15 text-burn'
                : 'border-line text-muted-foreground hover:border-burn/50 hover:text-foreground'
            )}
          >
            {METRIC_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="relative min-h-[80px] rounded-brutal border border-line bg-void/60">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-void/60">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {error ? (
          <p className="px-3 py-4 text-center text-xs text-destructive">{error}</p>
        ) : entries && entries.length === 0 && !loading ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            Ninguém pontuou ainda. Vai lá.
          </p>
        ) : (
          <ol className="divide-y divide-line">
            {(entries ?? []).map((entry) => {
              const person = byId[entry.userId]
              const isMe = entry.userId === user?.id
              const color = person?.profileColor ?? entry.profileColor ?? undefined
              return (
                <li
                  key={entry.userId}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5',
                    isMe && 'bg-acid/[0.06] shadow-[inset_2px_0_0_hsl(var(--acid))]'
                  )}
                >
                  {entry.rank <= 3 ? (
                    <span
                      className="flex w-6 shrink-0 items-center justify-center"
                      style={{ color: MEDAL_COLOR[entry.rank - 1] }}
                      title={`${entry.rank}º lugar`}
                    >
                      <Medal className="h-4 w-4" aria-hidden />
                    </span>
                  ) : (
                    <span className="w-6 shrink-0 text-center font-mono text-[11.5px] text-muted-foreground">
                      #{entry.rank}
                    </span>
                  )}
                  <UserAvatar
                    userId={entry.userId}
                    src={resolveAssetUrl(person?.avatar ?? entry.avatar)}
                    name={person?.displayName ?? entry.displayName}
                    ringColor={color}
                    frame={person?.avatarFrame}
                    className="h-6 w-6"
                  />
                  <span
                    className="flex min-w-0 flex-1 items-center gap-1 text-sm"
                    style={color ? { color } : undefined}
                  >
                    <NameEffect effect={person?.nameEffect} className="truncate">
                      {person?.displayName ?? entry.displayName}
                    </NameEffect>
                    <NameEmoji id={person?.emoji} />
                  </span>
                  <span className="shrink-0 font-mono text-[11.5px] text-burn">
                    {formatMetricValue(metric, entry.value)}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

function useTicker(intervalMs: number): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

function LiveGames() {
  const { user } = useAuth()
  const { byId } = useMembers()
  const { liveGames } = useGamification()
  const now = useTicker(10_000)

  return (
    <section>
      <h4 className="mb-1.5 flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        <Radio className={cn('h-3 w-3', liveGames.length > 0 ? 'text-destructive' : '')} />
        Ao vivo — {liveGames.length}
      </h4>

      {liveGames.length === 0 ? (
        <p className="rounded-brutal border border-line bg-void/60 px-3 py-3 text-center text-xs text-muted-foreground">
          Ninguém em partida agora.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {liveGames.map((game) => {
            const person = byId[game.session.userId]
            const name = person?.displayName ?? game.session.user?.displayName ?? '?'
            const color = person?.profileColor ?? game.session.user?.profileColor ?? undefined
            const Icon = game.session.game === 'minecraft' ? Pickaxe : Swords
            const detail = [game.session.champion, queueLabel(game.session.queue ?? undefined)]
              .filter(Boolean)
              .join(' · ')
            const since = new Date(game.session.startedAt).getTime()
            const isMine = game.session.userId === user?.id

            return (
              <li key={game.session.id} className="rounded-brutal border border-burn/40 bg-burn/[0.04] p-2">
                <div className="flex items-center gap-2">
                  <UserAvatar
                    userId={game.session.userId}
                    src={resolveAssetUrl(person?.avatar ?? game.session.user?.avatar)}
                    name={name}
                    ringColor={color}
                    frame={person?.avatarFrame}
                    className="h-7 w-7"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm" style={color ? { color } : undefined}>
                      {name}
                    </p>
                    <p className="flex items-center gap-1 truncate text-[11px] text-burn">
                      <Icon className="h-2.5 w-2.5 shrink-0" />
                      {detail || game.session.game}
                      {Number.isFinite(since) && <span className="text-muted-foreground">· {formatElapsed(since, now)}</span>}
                    </p>
                  </div>
                  {!isMine && (
                    <BetPopover userId={game.session.userId} sessionId={game.session.id} targetName={name} side="left">
                      <button
                        type="button"
                        className="shrink-0 rounded-brutal border border-acid-dark px-2 py-1 font-mono text-[11px] uppercase tracking-widest text-acid transition-colors hover:bg-acid/15 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {game.myWager ? 'apostado' : 'apostar'}
                      </button>
                    </BetPopover>
                  )}
                </div>
                <PoolBars pool={game.pool} className="mt-2" />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
