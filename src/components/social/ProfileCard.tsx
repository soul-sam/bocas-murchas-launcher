import * as React from 'react'
import { Zap, Shield, ExternalLink, Coins, Flame, Swords, Cake, Clock } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { UserAvatar } from '@/components/ui/avatar'
import { parseFavoriteGames, parseLinks, resolveAssetUrl } from '@/lib/api'
import { formatCompact, type GamificationProfile,
  DEFAULT_NAME_COLOR
} from '@/lib/api-gamification'
import { BadgeChip, TitleTag } from '@/lib/cosmetic-icons'
import { CargoChip } from '@/lib/cargo-icons'
import { useCargos } from '@/lib/cargos-context'
import {
  formatBirthday,
  hourDifference,
  isBirthdayToday,
  localTimeIn
} from '@/lib/profile-extras'
import { GameIcon, gameLabel } from './GameIcon'
import type { Member } from '@/lib/members-context'
import { useAuth } from '@/lib/auth-context'
import { useNudge } from '@/lib/nudge-context'
import { useActivity } from '@/lib/activity-context'
import { useGamification } from '@/lib/gamification-context'
import { cn } from '@/lib/utils'
import { ActivityLine } from './ActivityLine'
import { NameEffect } from './NameEffect'
import { NameEmoji } from './NameEmoji'
import { LevelRing } from './LevelRing'
import { BetPopover } from './BetPopover'
import { ChessBlock } from './ChessBlock'

const STATUS_LABEL: Record<string, string> = {
  online: 'Online',
  away: 'Ausente',
  dnd: 'Não perturbe',
  offline: 'Offline'
}

/** Quantas badges cabem antes do "+n". */
const BADGES_SHOWN = 8

/**
 * O cartao de perfil como POPOVER, ancorado em quem o abriu. E o formato da
 * lista de membros: abre do lado, sem cobrir a conversa.
 *
 * O conteudo mora em <ProfileBody>, que o modal (components/social/
 * ProfileModal) tambem desenha. Sao duas molduras pro mesmo perfil — e o dia
 * em que alguem somar um campo aqui ele tem que aparecer nos dois.
 */
export function ProfileCard({
  member,
  children
}: {
  member: Member
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" side="left" className="w-72 p-0">
        <ProfileBody member={member} open={open} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * O PERFIL EM SI — sem moldura.
 *
 * Saiu de dentro do ProfileCard quando o modal apareceu: eram duas telas
 * mostrando a mesma pessoa, e manter duas copias garantiria que um campo novo
 * (ou uma correcao) entraria so numa delas.
 *
 * `open` nao e enfeite: a parte de gamificacao (nivel, XP, murchos, badges) e
 * buscada SO quando o perfil aparece — sao 30 pessoas na lista e ninguem abre
 * 30 perfis por noite. O contexto guarda em cache por um minuto. O modal passa
 * `open` fixo em true, porque ele so existe aberto.
 *
 * `wide` da mais respiro no modal (a bio e as badges cabem sem apertar) sem
 * mudar nada do popover, que vive espremido em 18rem do lado da lista.
 */
export function ProfileBody({
  member,
  open,
  wide
}: {
  member: Member
  open: boolean
  wide?: boolean
}) {
  const { user } = useAuth()
  const { nudgeUser } = useNudge()
  const { activityOf } = useActivity()
  const { profile: myProfile, profileOf, cosmeticName } = useGamification()

  const [remote, setRemote] = React.useState<GamificationProfile | null>(null)

  const isSelf = member.id === user?.id
  const color = member.profileColor ?? DEFAULT_NAME_COLOR
  const links = parseLinks(member.links)
  const status = member.isOnline ? (member.status ?? 'online') : 'offline'
  const activity = member.isOnline ? activityOf(member.id) : undefined
  const riotId = member.riotGameName ? `${member.riotGameName}#${member.riotTagLine ?? ''}` : null
  const title = cosmeticName(member.title)
  const { cargosOf } = useCargos()
  const cargos = cargosOf(member.id)
  const inMatch = !isSelf && activity?.phase === 'in-progress'
  const games = parseFavoriteGames(member.favoriteGames)

  React.useEffect(() => {
    if (!open || isSelf) return
    let cancelled = false
    void profileOf(member.id)
      .then((p) => {
        if (!cancelled) setRemote(p)
      })
      .catch(() => {
        // Sem gamificação pra essa pessoa (ou rota fora): o cartão fica como era.
      })
    return () => {
      cancelled = true
    }
  }, [open, isSelf, member.id, profileOf])

  const gp = isSelf ? myProfile : remote
  const progress = gp && gp.nextLevelXp > 0 ? gp.levelXp / gp.nextLevelXp : 0

  /**
   * As medidas do modo largo, juntas pra nao saírem de sincronia.
   *
   * O popover vive espremido em 18rem do lado da lista e essas medidas sao as
   * dele. No modal, que ocupa o meio da tela, elas ficavam pequenas demais —
   * uma foto de 56px num cartao de 512 parece erro de layout, e o anel de
   * nivel some. `ringPx` acompanha o avatar porque o placeholder (o div de
   * mesmo tamanho, pra nada pular quando o anel chega) usa o mesmo numero.
   */
  const ringPx = wide ? 96 : 68
  const avatarClass = wide ? 'h-20 w-20 border-2' : 'h-14 w-14 border-2'

  return (
    /*
      O pai unico dos dois blocos (capa e conteudo). No popover ele nao pinta
      nada — quem desenha a moldura e o PopoverContent. No modal ele e quem
      da o respiro: `wide` solta o texto, que espremido em 18rem cortava bio
      e badge no meio.
    */
    <div className={cn(wide && "text-sm")}>
      <div
        className={cn(wide ? 'h-28' : 'h-16')}
        style={
          member.banner
            ? {
                backgroundImage: `url(${resolveAssetUrl(member.banner)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }
            : { background: `linear-gradient(135deg, ${color}33, transparent)` }
        }
      />

      <div className={cn(wide ? 'px-4 pb-4' : 'px-3 pb-3')}>
        <div
          className={cn(
            'mb-2 flex items-end justify-between gap-2',
            wide ? '-mt-12' : '-mt-8'
          )}
        >
          {gp ? (
            <LevelRing level={gp.level} progress={progress} size={ringPx}>
              <UserAvatar
                src={resolveAssetUrl(member.avatar)}
                name={member.displayName}
                status={status}
                ringColor={color}
                frame={member.avatarFrame}
                className={avatarClass}
              />
            </LevelRing>
          ) : (
            // Mesmo tamanho do anel, pra nada pular quando ele chegar.
            <div
              className="flex shrink-0 items-center justify-center"
              style={{ width: ringPx, height: ringPx }}
            >
              <UserAvatar
                src={resolveAssetUrl(member.avatar)}
                name={member.displayName}
                status={status}
                ringColor={color}
                frame={member.avatarFrame}
                className={avatarClass}
              />
            </div>
          )}

          <div className="mb-1 flex items-center gap-1">
            {inMatch && (
              <BetPopover userId={member.id} targetName={member.displayName} side="left" align="start">
                <button
                  type="button"
                  title={`Apostar murchos na partida de ${member.displayName}`}
                  className={cn(
                    'flex items-center gap-1 rounded-brutal border-2 border-acid-dark px-2 py-1',
                    'font-mono text-[11.5px] uppercase tracking-widest text-acid',
                    'transition-colors hover:bg-acid/15 disabled:cursor-not-allowed disabled:opacity-40'
                  )}
                >
                  <Coins className="h-3 w-3" />
                  apostar
                </button>
              </BetPopover>
            )}

            {!isSelf && member.isOnline && (
              <button
                type="button"
                onClick={() => nudgeUser(member.id)}
                title="Cutucar (treme a tela dessa pessoa)"
                className={cn(
                  'flex items-center gap-1 rounded-brutal border-2 border-burn/60 px-2 py-1',
                  'font-mono text-[11.5px] uppercase tracking-widest text-burn',
                  'transition-colors hover:bg-burn/15'
                )}
              >
                <Zap className="h-3 w-3" />
                cutucar
              </button>
            )}
          </div>
        </div>

        <p
          className={cn(
            'flex items-center gap-1.5 font-display leading-tight',
            wide ? 'text-xl' : 'text-base'
          )}
          style={{ color }}
        >
          <NameEffect effect={member.nameEffect} className="truncate">
            {member.displayName}
          </NameEffect>
          <NameEmoji id={member.emoji} size="md" />
          {member.role === 'admin' && (
            <Shield className="h-3.5 w-3.5 shrink-0 text-burn" aria-label="admin" />
          )}
        </p>

        <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <span className="truncate">
            @{member.username}
            {member.pronouns && ` · ${member.pronouns}`}
          </span>
          {title && <TitleTag titleId={member.title} name={title} />}
        </p>

        {/* CARGOS. Ficam aqui, na identidade, e não junto das badges lá
            embaixo: badge é o que a pessoa conquistou jogando; cargo é o que
            ela É no grupo — quem rachou a impressora, quem opera a máquina.
            Ordem de prioridade, que é a que o servidor manda. */}
        {cargos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {cargos.map((cargo) => (
              <CargoChip key={cargo.id} cargo={cargo} />
            ))}
          </div>
        )}

        <PersonalLine
          timezone={member.timezone}
          birthday={member.birthday}
          games={games}
        />

        {gp && <GamificationBlock profile={gp} />}
        <ChessBlock userId={member.id} isSelf={isSelf} open={open} />

        {activity && (
          <div className="mt-2 rounded-brutal border border-burn/40 bg-burn/[0.06] px-2 py-1.5">
            <ActivityLine activity={activity} className="text-[11.5px]" />
          </div>
        )}

        {riotId && (
          <p
            className="mt-1.5 flex items-center gap-1 font-mono text-[11.5px] text-muted-foreground"
            title="Riot ID lido do cliente do LoL"
          >
            <Swords className="h-3 w-3 shrink-0" aria-hidden />
            {riotId}
          </p>
        )}

        {member.customStatus && (
          <p className="mt-2 rounded-brutal border border-line bg-void/60 px-2 py-1 text-xs text-foreground">
            {member.customStatus}
          </p>
        )}

        {member.bio && (
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {member.bio}
          </p>
        )}

        {links.length > 0 && (
          <div className="mt-2 space-y-1">
            {links.map((link, index) => (
              <button
                key={index}
                type="button"
                onClick={() => void window.bocas.shell.openExternal(link.url)}
                className="flex w-full items-center gap-1.5 truncate text-left text-xs text-acid transition-colors hover:underline"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{link.name}</span>
              </button>
            ))}
          </div>
        )}

        <p className="mt-3 border-t border-line pt-2 text-[11.5px] text-muted-foreground">
          {STATUS_LABEL[status] ?? status}
        </p>
      </div>
    </div>
  )
}


/**
 * Hora local, aniversário e jogos.
 *
 * A HORA vem com a diferença em relação a quem está olhando: saber que são
 * 04:12 pra alguém só ajuda depois de fazer a conta de cabeça, e a pergunta
 * real antes de chamar pra call é "ele tá acordado?".
 *
 * O ANIVERSÁRIO é comparado no fuso DA PESSOA (ver lib/profile-extras.ts): às
 * 22h de Lisboa já é o dia seguinte lá, e o aniversário é dela.
 *
 * A linha inteira desaparece quando não tem nada pra dizer — perfil de quem
 * não preencheu nada continua igual ao que era.
 */
function PersonalLine({
  timezone,
  birthday,
  games
}: {
  timezone?: string | null
  birthday?: string | null
  games: string[]
}) {
  const localTime = localTimeIn(timezone)
  const diff = hourDifference(timezone)
  const birthdayLabel = formatBirthday(birthday)
  const birthdayToday = isBirthdayToday(birthday, timezone)

  if (!localTime && !birthdayLabel && games.length === 0) return null

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11.5px] text-muted-foreground">
      {localTime && (
        <span
          className="flex items-center gap-1"
          title={
            diff === null
              ? 'Mesmo fuso que o seu'
              : `${Math.abs(diff)}h ${diff > 0 ? 'à frente' : 'atrás'} de você`
          }
        >
          <Clock className="h-2.5 w-2.5 shrink-0" />
          {localTime}
          {diff !== null && (
            <span className="opacity-70">
              ({diff > 0 ? '+' : '−'}
              {Math.abs(diff)}h)
            </span>
          )}
        </span>
      )}

      {birthdayLabel && (
        <span
          className={cn('flex items-center gap-1', birthdayToday && 'font-bold text-burn')}
          title={birthdayToday ? 'É HOJE. Dá os parabéns.' : `Aniversário: ${birthdayLabel}`}
        >
          <Cake className="h-2.5 w-2.5 shrink-0" />
          {birthdayToday ? 'é hoje!' : birthdayLabel}
        </span>
      )}

      {games.length > 0 && (
        <span className="flex items-center gap-1.5">
          {games.map((game) => (
            <span key={game} className="flex items-center" title={gameLabel(game)}>
              <GameIcon game={game} className="h-3 w-3" />
            </span>
          ))}
        </span>
      )}
    </div>
  )
}

/** Barra de XP, murchos, streak e badges — o pedaço "RPG" do cartão. */
function GamificationBlock({ profile }: { profile: GamificationProfile }) {
  const pct =
    profile.nextLevelXp > 0
      ? Math.max(0, Math.min(100, Math.round((profile.levelXp / profile.nextLevelXp) * 100)))
      : 0
  const shown = profile.badges.slice(0, BADGES_SHOWN)
  const rest = profile.badges.length - shown.length

  return (
    <div className="mt-2 space-y-1.5 rounded-brutal border border-line bg-void/60 px-2 py-1.5">
      <div>
        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <span>
            nível <span className="text-acid-text">{profile.level}</span>
          </span>
          <span>
            {formatCompact(profile.levelXp)} / {formatCompact(profile.nextLevelXp)} XP
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-brutal bg-surface-raised">
          <div className="xp-fill h-full bg-acid" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex items-center gap-3 font-mono text-[11.5px]">
        <span className="flex items-center gap-1 text-burn" title="Murchos (moeda da casa)">
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
        <span className="ml-auto text-muted-foreground" title="Partidas ganhas / jogadas">
          {profile.gamesWon}/{profile.gamesPlayed} W
        </span>
      </div>

      {profile.badges.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {shown.map((badge) => (
            <BadgeChip
              key={badge.id}
              badgeId={badge.id}
              name={badge.name}
              description={badge.description}
              rarity={badge.rarity}
            />
          ))}
          {rest > 0 && (
            <span className="font-mono text-[11px] text-muted-foreground">+{rest}</span>
          )}
        </div>
      )}
    </div>
  )
}
