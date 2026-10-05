import * as React from 'react'
import {
  Loader2,
  Mic,
  Swords
} from 'lucide-react'
import { ChatIcon, MedalIcon, MurchosIcon, SoundboardIcon, StreakIcon, XpIcon } from '@/lib/bocas-icons'
import type { IconComponent } from '@/lib/icon-component'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import {
  gamification as api,
  formatMetricValue,
  METRIC_LABEL,
  type GamificationProfile,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type LeaderboardPeriod
} from '@/lib/api-gamification'
import { useAuth } from '@/lib/auth-context'
import { useLayout } from '@/lib/layout-context'
import { useMembers, type Member } from '@/lib/members-context'
import { useGamification } from '@/lib/gamification-context'
import { cn } from '@/lib/utils'
import { NameEffect } from './NameEffect'
import { NameEmoji } from './NameEmoji'
import { ArenaHeader, ArenaTabs } from './ArenaChrome'

/**
 * RANKING — painel da coluna direita, só o ranking.
 *
 * Meu card, lojinha, conquistas, recap e apostas moravam aqui e saíram pra
 * Arena (ver ArenaChrome.tsx). O que sobrou é a pergunta "quem lidera?", e
 * ela ganhou três coisas que não cabiam antes: o pódio dos três primeiros,
 * a MINHA posição em destaque (com a distância pra quem está na frente — é o
 * número que faz alguém mandar mais uma mensagem) e uma linha dizendo o que
 * cada métrica conta.
 *
 * Uma chamada por troca de período/métrica, guardada por combinação: voltar
 * pra "XP · semana" mostra a lista de antes na hora e atualiza por baixo, em
 * vez de piscar um spinner numa tabela que a pessoa acabou de ver.
 */

const METRICS: LeaderboardMetric[] = ['xp', 'coins', 'streak', 'wins', 'voice', 'sounds', 'messages']

const METRIC_ICON: Record<LeaderboardMetric, IconComponent> = {
  xp: XpIcon,
  coins: MurchosIcon,
  streak: StreakIcon,
  wins: Swords,
  voice: Mic,
  sounds: SoundboardIcon,
  messages: ChatIcon
}

/**
 * O que cada métrica conta. Espelha `leaderboardValues` da API
 * (routes/gamification.routes.ts): murchos são o LUCRO no período, não o
 * saldo; streak é o de agora na semana e o recorde no geral; mensagem de card
 * não conta.
 */
const METRIC_HINT: Record<LeaderboardMetric, string> = {
  xp: 'Tudo que rende XP: mensagem, reação, call, partida, check-in, missão.',
  coins: 'Lucro no período: ganhos mais o resultado de apostas e mãos de pôquer, perdas descontadas. Compras não descontam.',
  streak: 'Dias seguidos entrando na call. Pulou um dia sem call, zera e sai da lista.',
  wins: 'Partidas ganhas de LoL e Minecraft que o launcher registrou.',
  voice: 'Tempo em call.',
  sounds: 'Sons do soundboard tocados.',
  messages: 'Mensagens enviadas. Cards do sistema não contam.'
}

function metricHint(metric: LeaderboardMetric, period: LeaderboardPeriod): string {
  if (metric === 'streak' && period === 'all') {
    return 'O recorde de dias seguidos entrando na call de cada um. Não zera.'
  }
  return METRIC_HINT[metric]
}

/** Quantos o servidor devolve (LEADERBOARD_SIZE na API). */
const TOP = 50

/**
 * Pódio. Cor em vez de emoji de medalha: 🥇🥈🥉 saem com desenho diferente em
 * cada versão do Windows e desalinham a coluna, porque cada um tem largura
 * própria. Ouro/prata/bronze são cores de medalha, não da marca: iguais em
 * todo tema.
 */
const MEDAL_COLOR = ['#FFC53D', '#C9C9C9', '#B87333']

export function LeaderboardPanel() {
  const { closeLeaderboard: close } = useLayout()
  const { token } = useAuth()
  const [period, setPeriod] = React.useState<LeaderboardPeriod>('week')
  const [metric, setMetric] = React.useState<LeaderboardMetric>('xp')
  const [boards, setBoards] = React.useState<Record<string, LeaderboardEntry[]>>({})
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const key = `${period}:${metric}`
  const entries = boards[key]

  React.useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void api
      .leaderboard(token, period, metric)
      .then((res) => {
        if (cancelled) return
        const list = Array.isArray(res?.entries) ? res.entries : []
        setBoards((prev) => ({ ...prev, [key]: list }))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Não deu pra carregar o ranking.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, period, metric, key])

  const MetricIcon = METRIC_ICON[metric]

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-void xl:w-80">
      <ArenaHeader title="Ranking" onClose={close}>
        {loading && entries && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="atualizando" />
        )}
      </ArenaHeader>
      <ArenaTabs current="ranking" />

      <div className="scroll-stable min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {/* Período: dois estados, um controle segmentado. */}
        <div role="tablist" aria-label="Período" className="grid grid-cols-2 gap-0.5 rounded-brutal border border-line bg-depth-2 p-0.5">
          {(['week', 'all'] as LeaderboardPeriod[]).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-[4px] py-1 text-xs font-medium transition-colors',
                period === p
                  ? 'bg-acid/15 text-acid'
                  : 'text-muted-foreground hover:bg-void-light hover:text-foreground'
              )}
            >
              {p === 'week' ? 'Esta semana' : 'Desde sempre'}
            </button>
          ))}
        </div>

        {/* Métrica: chips com ícone. Sete cabem em duas linhas a 288px. */}
        <div>
          <div role="tablist" aria-label="Métrica" className="flex flex-wrap gap-1">
            {METRICS.map((m) => {
              const Icon = METRIC_ICON[m]
              const active = metric === m
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMetric(m)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-brutal border px-2 py-1 text-[11.5px] transition-colors',
                    active
                      ? 'border-burn bg-burn/15 text-burn'
                      : 'border-line text-muted-foreground hover:border-line-strong hover:text-foreground'
                  )}
                >
                  <Icon className="h-3 w-3 shrink-0" aria-hidden />
                  {METRIC_LABEL[m]}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <MetricIcon className="mt-0.5 h-3 w-3 shrink-0 text-burn" aria-hidden />
            <span>{metricHint(metric, period)}</span>
          </p>
        </div>

        {error && !entries ? (
          <p className="rounded-brutal border border-destructive/40 bg-destructive/10 px-3 py-3 text-center text-xs text-destructive">
            {error}
          </p>
        ) : !entries ? (
          <Skeleton />
        ) : entries.length === 0 ? (
          <p className="rounded-brutal border border-line bg-void/60 px-3 py-6 text-center text-xs text-muted-foreground">
            Ninguém pontuou em {METRIC_LABEL[metric].toLowerCase()} {period === 'week' ? 'esta semana' : 'ainda'}.
            <br />
            Vai lá.
          </p>
        ) : (
          <div className={cn('space-y-3 transition-opacity', loading && 'opacity-70')}>
            <MyStanding entries={entries} metric={metric} period={period} />
            <Podium entries={entries.slice(0, 3)} metric={metric} />
            {entries.length > 3 && <Rows entries={entries.slice(3)} metric={metric} />}
            <p className="text-center text-[11px] text-muted-foreground">
              {entries.length === TOP ? `top ${TOP}` : `${entries.length} ${entries.length === 1 ? 'pessoa' : 'pessoas'}`}
              {' · '}
              {period === 'week' ? 'a semana vira na segunda' : 'desde o começo'}
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------

/** Quem é a pessoa da linha: o membro (fresco) ganha do retrato que veio na lista. */
function usePerson() {
  const { byId } = useMembers()
  return React.useCallback(
    (entry: LeaderboardEntry): { member: Member | undefined; name: string; color: string | undefined; avatar: string | undefined } => {
      const member = byId[entry.userId]
      return {
        member,
        name: member?.displayName ?? entry.displayName,
        color: member?.profileColor ?? entry.profileColor ?? undefined,
        avatar: resolveAssetUrl(member?.avatar ?? entry.avatar)
      }
    },
    [byId]
  )
}

/**
 * Meu valor quando eu não estou na lista. Só o que o perfil sabe de verdade:
 * na semana só XP (`weeklyXp`); "murchos ganhos" não é o saldo, então fica
 * de fora nos dois períodos.
 */
function myValueFor(profile: GamificationProfile, period: LeaderboardPeriod, metric: LeaderboardMetric): number | null {
  if (metric === 'streak') return period === 'all' ? profile.bestStreak : profile.streak
  if (period === 'week') return metric === 'xp' ? profile.weeklyXp : null
  switch (metric) {
    case 'xp':
      return profile.xp
    case 'wins':
      return profile.gamesWon
    case 'voice':
      return profile.voiceMinutes
    case 'sounds':
      return profile.soundPlays
    case 'messages':
      return profile.messageCount
    default:
      return null
  }
}

function MyStanding({
  entries,
  metric,
  period
}: {
  entries: LeaderboardEntry[]
  metric: LeaderboardMetric
  period: LeaderboardPeriod
}) {
  const { user } = useAuth()
  const { profile } = useGamification()
  const person = usePerson()
  if (!user) return null

  const mine = entries.find((e) => e.userId === user.id)

  if (!mine) {
    const value = profile ? myValueFor(profile, period, metric) : null
    return (
      <div className="rounded-brutal border border-line bg-void/60 px-3 py-2">
        <p className="text-xs text-foreground">Você ainda não está no top {TOP}.</p>
        <p className="text-[11px] text-muted-foreground">
          {value != null && value > 0
            ? `Seu total: ${formatMetricValue(metric, value)}. ${entries.length > 0 ? `Falta ${formatMetricValue(metric, Math.max(0, entries[entries.length - 1].value - value))} pra entrar.` : ''}`
            : metricHint(metric, period)}
        </p>
      </div>
    )
  }

  const above = mine.rank > 1 ? entries[mine.rank - 2] : undefined
  const below = entries[mine.rank]
  const detail = above
    ? `${formatMetricValue(metric, Math.max(0, above.value - mine.value))} atrás de ${person(above).name}`
    : below
      ? `${formatMetricValue(metric, Math.max(0, mine.value - below.value))} à frente de ${person(below).name}`
      : 'sozinho no ranking'

  return (
    <div className="flex items-center gap-3 rounded-brutal border border-line bg-void/60 px-3 py-2 shadow-[inset_2px_0_0_hsl(var(--acid))]">
      <span className="font-display text-2xl leading-none text-acid" aria-label={`${mine.rank}º lugar`}>
        #{mine.rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1.5 text-xs text-foreground">
          <span>você</span>
          <span className="font-mono text-burn">{formatMetricValue(metric, mine.value)}</span>
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Podium({ entries, metric }: { entries: LeaderboardEntry[]; metric: LeaderboardMetric }) {
  const [first, second, third] = entries
  // Visualmente 2º · 1º · 3º, o do meio mais alto — a forma de pódio que todo
  // mundo lê sem legenda.
  const slots = [second, first, third]

  return (
    <ol className="grid grid-cols-3 items-end gap-1" aria-label="Pódio">
      {slots.map((entry, position) =>
        entry ? (
          <PodiumSlot key={entry.userId} entry={entry} metric={metric} tall={position === 1} />
        ) : (
          <li key={`vazio-${position}`} aria-hidden />
        )
      )}
    </ol>
  )
}

function PodiumSlot({ entry, metric, tall }: { entry: LeaderboardEntry; metric: LeaderboardMetric; tall: boolean }) {
  const { user } = useAuth()
  const person = usePerson()
  const { member, name, color, avatar } = person(entry)
  const medal = MEDAL_COLOR[entry.rank - 1]
  const isMe = entry.userId === user?.id

  return (
    <li
      className={cn(
        'flex min-w-0 flex-col items-center rounded-brutal border border-line bg-void/60 px-1 pt-2 text-center',
        isMe && 'border-acid/40 bg-acid/[0.06]'
      )}
      title={`${entry.rank}º · ${name} · ${formatMetricValue(metric, entry.value)}`}
    >
      <UserAvatar
        userId={entry.userId}
        src={avatar}
        name={name}
        ringColor={medal}
        frame={member?.avatarFrame}
        frameColor={member?.profileColor}
        className={cn('border-2', tall ? 'h-12 w-12' : 'h-10 w-10')}
      />
      <span
        className="mt-1.5 flex w-full min-w-0 items-center justify-center gap-0.5 text-xs leading-tight"
        style={color ? { color } : undefined}
      >
        <NameEffect effect={member?.nameEffect} color={color} className="truncate">
          {name}
        </NameEffect>
        <NameEmoji id={member?.emoji} />
      </span>
      <span className="font-mono text-[11.5px] text-burn">{formatMetricValue(metric, entry.value)}</span>
      {/* O degrau: altura é posição. */}
      <span
        className={cn(
          'mt-1.5 flex w-full items-center justify-center gap-1 rounded-t-[4px] bg-surface-raised font-mono text-[11.5px] font-bold',
          tall ? 'h-7' : 'h-5'
        )}
        style={{ color: medal }}
      >
        <MedalIcon className="h-3 w-3" aria-hidden />
        {entry.rank}
      </span>
    </li>
  )
}

// ---------------------------------------------------------------------------

function Rows({ entries, metric }: { entries: LeaderboardEntry[]; metric: LeaderboardMetric }) {
  const { user } = useAuth()
  const person = usePerson()

  return (
    <ol className="divide-y divide-line rounded-brutal border border-line bg-void/60" start={entries[0]?.rank ?? 4}>
      {entries.map((entry) => {
        const { member, name, color, avatar } = person(entry)
        const isMe = entry.userId === user?.id
        return (
          <li
            key={entry.userId}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5',
              isMe && 'bg-acid/[0.06] shadow-[inset_2px_0_0_hsl(var(--acid))]'
            )}
          >
            <span className="w-6 shrink-0 text-center font-mono text-[11.5px] text-muted-foreground">
              {entry.rank}
            </span>
            <UserAvatar
              userId={entry.userId}
              src={avatar}
              name={name}
              ringColor={color}
              frame={member?.avatarFrame}
              frameColor={member?.profileColor}
              className="h-6 w-6"
            />
            <span className="flex min-w-0 flex-1 items-center gap-1 text-sm" style={color ? { color } : undefined}>
              <NameEffect effect={member?.nameEffect} color={color} className="truncate">
                {name}
              </NameEffect>
              <NameEmoji id={member?.emoji} />
            </span>
            <span className="shrink-0 font-mono text-[11.5px] text-burn">
              {formatMetricValue(metric, entry.value)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// ---------------------------------------------------------------------------

/** Primeira carga: a forma da tela, sem spinner no meio do nada. */
function Skeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      <div className="h-12 rounded-brutal bg-surface-raised" />
      <div className="grid grid-cols-3 items-end gap-1">
        <div className="h-24 rounded-brutal bg-surface-raised" />
        <div className="h-28 rounded-brutal bg-surface-raised" />
        <div className="h-24 rounded-brutal bg-surface-raised" />
      </div>
      <div className="space-y-px overflow-hidden rounded-brutal">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 bg-surface-raised" />
        ))}
      </div>
    </div>
  )
}
