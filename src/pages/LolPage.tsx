import * as React from 'react'
import { Loader2, Play } from 'lucide-react'
import { BackToHall } from '@/components/games/BackToHall'
import { GameIcon } from '@/components/social/GameIcon'
import { BetPopover } from '@/components/social/BetPopover'
import { formatElapsed } from '@/components/social/ActivityLine'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl, type RiotStatus } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useSocket } from '@/lib/socket-context'
import type { LiveWagerGame } from '@/lib/api-gamification'
import { useActivity } from '@/lib/activity-context'
import { useGamification } from '@/lib/gamification-context'
import { useMembers } from '@/lib/members-context'
import { useTicker } from '@/lib/use-now'
import { cn } from '@/lib/utils'

/**
 * O LOL COMO TELA: quem está em partida, quem está com o cliente aberto (com o
 * status da Riot), e o botão de jogar.
 *
 * As estatísticas do grupo continuam no canal de LoL do chat
 * (components/social/lol/LolPanel). Aqui é só o "agora": cada partida em
 * andamento, há quanto tempo, e se ainda dá pra apostar. Os dados são os
 * mesmos do painel de apostas (`liveGames`, poll do gamification-context).
 */
export function LolPage() {
  const { liveGames } = useGamification()
  const { lol } = useActivity()
  const { lolPresence } = useSocket()
  const { members } = useMembers()
  const { user } = useAuth()
  const [launching, setLaunching] = React.useState(false)
  const [launchError, setLaunchError] = React.useState<string | null>(null)

  // Uma partida, vários boards (um por pessoa do grupo): fica um por
  // `matchId`, preferindo o da minha sessão — mesmo critério do WagersPanel.
  const matches = React.useMemo(() => {
    const byMatch = new Map<string, LiveWagerGame>()
    for (const game of liveGames) {
      if (game.session.game !== 'lol') continue
      const id = game.matchId ?? game.session.id
      const prev = byMatch.get(id)
      if (!prev || (game.self && !prev.self)) byMatch.set(id, game)
    }
    return [...byMatch.values()].sort(
      (a, b) => new Date(b.session.startedAt).getTime() - new Date(a.session.startedAt).getTime()
    )
  }, [liveGames])

  // Quem está com o cliente aberto e NÃO está numa das partidas acima.
  const idle = React.useMemo(() => {
    const playing = new Set<string>()
    for (const game of matches) {
      playing.add(game.session.userId)
      for (const p of game.players ?? []) playing.add(p.userId)
    }
    // O meu vem direto do cliente desta máquina: aparece na hora, sem esperar
    // a volta do servidor.
    const presence =
      user && lol?.clientRunning && lol.riotStatus
        ? { ...lolPresence, [user.id]: lol.riotStatus }
        : lolPresence
    return members
      .filter((m) => presence[m.id] && !playing.has(m.id))
      .map((member) => ({ member, status: presence[member.id] }))
      .sort(
        (a, b) =>
          RIOT_STATUS[a.status].order - RIOT_STATUS[b.status].order ||
          a.member.displayName.localeCompare(b.member.displayName)
      )
  }, [members, lolPresence, matches, user, lol?.clientRunning, lol?.riotStatus])

  const clientOpen = Boolean(lol?.clientRunning)

  const play = React.useCallback(async () => {
    setLaunching(true)
    setLaunchError(null)
    try {
      const result = await window.bocas.lol.launch()
      if (!result.ok) setLaunchError(result.error ?? 'Não consegui abrir o LoL')
    } catch {
      setLaunchError('Não consegui abrir o LoL')
    } finally {
      // O Riot Client demora a aparecer: segura o botão pra não abrir dois.
      setTimeout(() => setLaunching(false), 4_000)
    }
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-line/70 px-4 py-3 sm:px-6">
        <GameIcon game="lol" className="h-8 w-8 shrink-0 text-acid" />
        <div className="min-w-0 flex-1">
          <h1 className="title-brutal text-2xl leading-none">League of Legends</h1>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
            {launchError ?? 'Quem está em partida agora'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void play()}
          disabled={launching || clientOpen}
          className="flex shrink-0 items-center gap-1.5 rounded-brutal border border-acid-dark bg-acid/10 px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-acid transition-colors hover:bg-acid/20 disabled:opacity-60 disabled:hover:bg-acid/10"
        >
          {launching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Play className="h-3.5 w-3.5" aria-hidden />
          )}
          {clientOpen ? 'Cliente aberto' : launching ? 'Abrindo' : 'Jogar'}
        </button>
        <BackToHall />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <section>
            <SectionTitle>Em partida</SectionTitle>
            {matches.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Ninguém em partida agora.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {matches.map((game) => (
                  <MatchRow key={game.matchId ?? game.session.id} game={game} />
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionTitle>No cliente</SectionTitle>
            {idle.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Ninguém com o LoL aberto.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {idle.map(({ member, status }) => (
                  <li key={member.id} className="flex items-center gap-3 rounded-brutal px-3 py-2">
                    <UserAvatar
                      userId={member.id}
                      src={resolveAssetUrl(member.avatar)}
                      name={member.displayName}
                      ringColor={member.profileColor ?? undefined}
                      frame={member.avatarFrame}
                      frameColor={member.profileColor}
                      className="h-8 w-8"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{member.displayName}</span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
                      <span className={cn('h-2 w-2 rounded-full', RIOT_STATUS[status].dot)} aria-hidden />
                      {RIOT_STATUS[status].label}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

/** Mesmas cores do cliente da Riot: verde, amarelo, vermelho. */
const RIOT_STATUS: Record<RiotStatus, { label: string; dot: string; order: number }> = {
  online: { label: 'Online', dot: 'bg-emerald-500', order: 0 },
  away: { label: 'Ausente', dot: 'bg-amber-400', order: 1 },
  busy: { label: 'Ocupado', dot: 'bg-red-500', order: 2 }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{children}</h2>
  )
}

function MatchRow({ game }: { game: LiveWagerGame }) {
  const { byId } = useMembers()
  const { liveGames } = useGamification()
  const now = useTicker(1_000)

  const lead = byId[game.session.userId]
  const leadName = lead?.displayName ?? game.session.user?.displayName ?? '?'
  const players =
    Array.isArray(game.players) && game.players.length > 0
      ? game.players
      : [{ sessionId: game.session.id, userId: game.session.userId, displayName: leadName, champion: null }]
  const names = players.map((p) => byId[p.userId]?.displayName ?? p.displayName).join(', ')
  const since = new Date(game.session.startedAt).getTime()

  // Minha partida: a janela que vale é a de apostar em mim, que mora no board
  // da MINHA sessão (ver WagersPanel).
  const selfBoard =
    game.self ??
    (game.mine
      ? liveGames.find((g) => g.self && (g.matchId ?? g.session.id) === (game.matchId ?? game.session.id))?.self ?? null
      : null)
  const open = game.mine ? Boolean(selfBoard?.open) : game.open
  const myWager = game.myWager

  return (
    <li className="flex items-center gap-3 rounded-brutal border border-line bg-void/60 p-3">
      <div className="flex shrink-0 -space-x-2">
        {players.slice(0, 5).map((p) => {
          const member = byId[p.userId]
          return (
            <UserAvatar
              key={p.userId}
              userId={p.userId}
              src={resolveAssetUrl(
                member?.avatar ?? (p.userId === game.session.userId ? game.session.user?.avatar : undefined)
              )}
              name={member?.displayName ?? p.displayName}
              ringColor={member?.profileColor ?? undefined}
              frame={member?.avatarFrame}
              frameColor={member?.profileColor}
              className="h-9 w-9 border-2 border-void"
            />
          )
        })}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-tight text-foreground">{names}</p>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          em partida há{' '}
          <span className="font-mono text-foreground">
            {Number.isFinite(since) ? formatElapsed(since, now) : '—'}
          </span>
        </p>
      </div>

      <BetPopover userId={game.session.userId} sessionId={game.session.id} targetName={leadName} side="left">
        <button
          type="button"
          disabled={!open && !myWager}
          className={cn(
            'shrink-0 rounded-brutal border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-widest transition-colors',
            myWager
              ? 'border-acid-dark bg-acid/10 text-acid'
              : open
                ? 'border-acid-dark text-acid hover:bg-acid/15'
                : 'border-line text-muted-foreground opacity-60'
          )}
        >
          {myWager ? 'apostado' : open ? (game.mine ? 'apostar em mim' : 'apostar') : 'apostas fechadas'}
        </button>
      </BetPopover>
    </li>
  )
}
