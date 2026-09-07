import * as React from 'react'
import { Shield, Search, Volume2, ScreenShare, X, Coins } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { resolveAssetUrl } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useMembers, type Member } from '@/lib/members-context'
import { useOverlays } from '@/lib/overlay-context'
import { useSocket, type ActivityEntry } from '@/lib/socket-context'
import { useLayout } from '@/lib/layout-context'
import { useGamification } from '@/lib/gamification-context'
import { TitleIcon } from '@/lib/cosmetic-icons'
import { ProfileCard } from './ProfileCard'
import { ActivityLine } from './ActivityLine'
import { NameEffect } from './NameEffect'
import { NameEmoji } from './NameEmoji'
import { BetPopover } from './BetPopover'

/**
 * Lista de membros.
 *
 * Duas coisas que faltavam: procurar alguem pelo nome (com 30 pessoas a lista
 * vira rolagem) e saber quem esta EM CALL agora sem precisar varrer a barra de
 * canais. Quem esta na voz sobe pro topo, com o nome do canal do lado.
 */
export function MemberList() {
  const { members, loading } = useMembers()
  const { voiceByChannel, screenShares, activities } = useSocket()
  const { toggleMembers } = useLayout()
  const [term, setTerm] = React.useState('')

  /** userId -> canal em que ele esta falando agora. */
  const voiceByUser = React.useMemo(() => {
    const map = new Map<string, { channelId: string; sharing: boolean }>()
    for (const [channelId, users] of Object.entries(voiceByChannel)) {
      const sharing = screenShares[channelId] ?? []
      for (const user of users ?? []) {
        map.set(user.id, { channelId, sharing: sharing.includes(user.id) })
      }
    }
    return map
  }, [voiceByChannel, screenShares])

  const needle = term.trim().toLowerCase()

  const { inVoice, playing, online, offline } = React.useMemo(() => {
    const matches = needle
      ? members.filter(
          (member) =>
            member.displayName.toLowerCase().includes(needle) ||
            member.username?.toLowerCase().includes(needle)
        )
      : members

    /**
     * "Em call" exige estar ONLINE.
     *
     * Sem esse `m.isOnline` uma sobra no estado de voz — alguem cuja conexao
     * caiu no meio da call — aparecia listado como se ainda estivesse falando,
     * na secao de cima e com a bolinha cinza de offline do lado. E era o
     * primeiro nome da lista.
     */
    const inCall = (m: Member): boolean => m.isOnline && voiceByUser.has(m.id)
    // "Jogando" e quem tem atividade de jogo e NAO esta em call (quem esta em
    // call aparece la em cima, com a atividade embaixo do nome).
    const isPlaying = (m: Member): boolean => m.isOnline && !inCall(m) && !!activities[m.id]

    return {
      inVoice: matches.filter(inCall),
      playing: matches.filter(isPlaying),
      online: matches.filter((m) => m.isOnline && !inCall(m) && !isPlaying(m)),
      offline: matches.filter((m) => !m.isOnline)
    }
  }, [members, needle, voiceByUser, activities])

  if (loading) return <aside className="w-56 shrink-0 border-l border-[#1a1a1a]" />

  return (
    <aside className="flex w-56 shrink-0 flex-col border-l border-[#1a1a1a] bg-[#0D0D0D]">
      <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-[#1a1a1a] px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-brutal border border-[#1a1a1a] px-2 transition-colors focus-within:border-acid/50">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Procurar"
            className="min-w-0 flex-1 bg-transparent py-1 text-xs outline-none placeholder:text-muted-foreground"
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm('')}
              aria-label="Limpar busca"
              className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={toggleMembers}
          title="Esconder membros"
          aria-label="Esconder membros"
          className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-acid"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto py-3">
        {inVoice.length > 0 && (
          <Group label="Em call" members={inVoice} voiceByUser={voiceByUser} activities={activities} />
        )}
        {playing.length > 0 && (
          <Group label="Jogando" members={playing} voiceByUser={voiceByUser} activities={activities} />
        )}
        <Group label="Online" members={online} voiceByUser={voiceByUser} activities={activities} />
        {offline.length > 0 && (
          <Group label="Offline" members={offline} voiceByUser={voiceByUser} activities={activities} dimmed />
        )}

        {needle && inVoice.length + playing.length + online.length + offline.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            Ninguém com esse nome.
          </p>
        )}
      </div>
    </aside>
  )
}

function Group({
  label,
  members,
  voiceByUser,
  activities,
  dimmed
}: {
  label: string
  members: Member[]
  voiceByUser: Map<string, { channelId: string; sharing: boolean }>
  activities: Record<string, ActivityEntry>
  dimmed?: boolean
}) {
  const { openUserMenu } = useOverlays()
  const { user } = useAuth()
  const { cosmeticName } = useGamification()

  if (members.length === 0) return null

  return (
    <section className="mb-3 px-2">
      <h3 className="px-2 pb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label} — {members.length}
      </h3>

      <div className="space-y-0.5">
        {members.map((member) => {
          const voice = voiceByUser.get(member.id)
          const activity = member.isOnline ? activities[member.id] : undefined
          const title = cosmeticName(member.title)
          /**
           * Botão de apostar: só em partida de verdade (não em champ select) e
           * nunca no próprio. Aparece também pra quem está em call e jogando —
           * o 5-stack inteiro está na seção "Em call", e é justamente neles
           * que a galera quer apostar.
           */
          const canBet = activity?.phase === 'in-progress' && member.id !== user?.id

          return (
            // O gatilho do perfil e o de apostar são IRMÃOS, não pai e filho:
            // botão dentro de botão é HTML inválido e o clique vaza pros dois.
            <div
              key={member.id}
              className={cn(
                'flex items-center rounded-brutal transition-colors hover:bg-void-light',
                dimmed && 'opacity-45 hover:opacity-100'
              )}
            >
              <ProfileCard member={member}>
                <button
                  type="button"
                  onContextMenu={(event) => openUserMenu(event, member.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-brutal px-2 py-1 text-left"
                >
                  <UserAvatar
                    src={resolveAssetUrl(member.avatar)}
                    name={member.displayName}
                    status={member.isOnline ? (member.status ?? 'online') : 'offline'}
                    ringColor={member.profileColor}
                    frame={member.avatarFrame}
                    className="h-7 w-7"
                  />

                  <span className="min-w-0 flex-1">
                    <span
                      className="flex items-center gap-1 truncate text-sm"
                      style={member.profileColor ? { color: member.profileColor } : undefined}
                    >
                      <NameEffect effect={member.nameEffect} className="truncate">
                        {member.displayName}
                      </NameEffect>
                      <NameEmoji id={member.emoji} />
                      {member.role === 'admin' && (
                        <Shield className="h-3 w-3 shrink-0 text-burn" aria-label="admin" />
                      )}
                    </span>

                    {/* Jogo ganha da call: "em partida 12:30" diz mais do que
                        "na call" — e quem esta em call ja esta na secao certa.
                        O título só aparece quando não tem nada mais vivo pra
                        dizer: é enfeite, não informação. */}
                    {activity ? (
                      <ActivityLine activity={activity} />
                    ) : voice ? (
                      <span className="flex items-center gap-1 truncate font-mono text-[9px] uppercase tracking-widest text-acid">
                        <Volume2 className="h-2.5 w-2.5 shrink-0" />
                        na call
                        {voice.sharing && (
                          <ScreenShare
                            className="h-2.5 w-2.5 shrink-0 text-destructive"
                            aria-label="transmitindo"
                          />
                        )}
                      </span>
                    ) : member.customStatus ? (
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {member.customStatus}
                      </span>
                    ) : (
                      title && (
                        <span className="flex items-center gap-1 truncate font-mono text-[9px] uppercase tracking-widest text-burn/80">
                          <TitleIcon titleId={member.title} className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{title}</span>
                        </span>
                      )
                    )}
                  </span>
                </button>
              </ProfileCard>

              {canBet && (
                <BetPopover userId={member.id} targetName={member.displayName}>
                  <button
                    type="button"
                    title={`Apostar em ${member.displayName}`}
                    aria-label={`Apostar em ${member.displayName}`}
                    className="mr-1 shrink-0 rounded-brutal p-1 text-burn/70 transition-colors hover:bg-burn/15 hover:text-burn disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <Coins className="h-3.5 w-3.5" />
                  </button>
                </BetPopover>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
