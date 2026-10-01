import * as React from 'react'
import { Zap, Shield, ExternalLink, Swords, Cake, Clock, Pencil, ChevronRight } from 'lucide-react'
import {
  MurchosIcon,
  StreakIcon,
  TrophyIcon,
  VoiceIcon,
  ChatIcon,
  ShopIcon
} from '@/lib/bocas-icons'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { UserAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/ui/tooltip'
import { parseFavoriteGames, parseLinks, resolveAssetUrl } from '@/lib/api'
import { formatCompact, type GamificationProfile } from '@/lib/api-gamification'
import { BadgeChip, TitleTag } from '@/lib/cosmetic-icons'
import { useOverlaysOptional } from '@/lib/overlay-context'
import { CargoChip } from '@/lib/cargo-icons'
import { useCargos } from '@/lib/cargos-context'
import { useLayout } from '@/lib/layout-context'
import { useChat } from '@/lib/chat-context'
import { useMembers, type Member } from '@/lib/members-context'
import { openExternal } from '@/lib/rich-text'
import {
  formatBirthday,
  hourDifference,
  isBirthdayToday,
  localTimeIn
} from '@/lib/profile-extras'
import { GameIcon, gameLabel } from './GameIcon'
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
import { StatusText } from './AwayBadge'
import { BotBadge } from './BotBadge'

/**
 * O PERFIL — o cartao de uma pessoa no Bocas, em duas molduras.
 *
 *  - <ProfileCard>  o POPOVER da lista de membros: abre do lado, ancorado
 *                   na linha, sem cobrir a conversa. Resumo, com um botao
 *                   pra abrir o perfil inteiro.
 *  - <ProfileBody>  o conteudo, que o popover e o modal (ProfileModal)
 *                   desenham com `variant` diferente. Um componente so, pra
 *                   que um campo novo entre nos dois de uma vez.
 *  - <ProfileHero>  capa + avatar + anel de nivel + acoes, SEM dados de
 *                   contexto. E o pedaco que o editor de perfil tambem
 *                   desenha como previa — o que a pessoa ve enquanto edita e
 *                   literalmente o que os outros vao ver.
 *
 * O QUE MUDOU NA REFORMA DE OUT/2026, e por que: o modal era o popover
 * esticado — mesma fonte de 11,5px, mesma capa de 112px, mesma barra de XP de
 * 6px numa caixa de 512. O perfil e a vitrine da personalizacao (cor, titulo,
 * efeito, moldura, badges, capa), e tudo isso aparecia em miniatura. Agora o
 * modal tem hierarquia: a capa manda, o avatar e o nome sao grandes, as acoes
 * sao botoes de verdade (Mensagem e primario), e nivel/murchos/vitorias viram
 * painel. O popover ficou compacto de proposito e aponta pro modal.
 *
 * A COR DO PERFIL pinta a capa quando nao ha imagem: e um item da lojinha, e
 * um item pago tem que aparecer. Sem cor, a capa vem no verde da casa.
 */

const STATUS_LABEL: Record<string, string> = {
  online: 'Online',
  away: 'Ausente',
  dnd: 'Não perturbe',
  offline: 'Offline'
}

/** Mesmas cores da bolinha do UserAvatar — a do perfil e so maior. */
const STATUS_DOT: Record<string, string> = {
  online: 'bg-acid shadow-neon-2',
  away: 'bg-burn',
  dnd: 'bg-destructive',
  offline: 'bg-surface-strong'
}

export type ProfileVariant = 'modal' | 'popover'

/**
 * As medidas de cada moldura, juntas pra nao sairem de sincronia. `ring` e
 * o lado do anel de nivel em px (o avatar vai dentro, `ring - 2·stroke -
 * 2·folga`); o placeholder sem anel usa o mesmo numero pra nada pular quando
 * a gamificacao chega.
 */
const HERO = {
  modal: {
    banner: 'h-44',
    ring: 128,
    stroke: 4,
    avatar: 'h-28 w-28 border-2',
    lift: '-mt-16',
    pad: 'px-6',
    label: 'text-xs leading-5 px-2 -bottom-2.5'
  },
  phone: {
    banner: 'h-36',
    ring: 104,
    stroke: 3,
    avatar: 'h-[88px] w-[88px] border-2',
    lift: '-mt-12',
    pad: 'px-4',
    label: 'text-xs leading-5 px-2 -bottom-2.5'
  },
  popover: {
    banner: 'h-24',
    ring: 84,
    stroke: 3,
    avatar: 'h-[72px] w-[72px] border-2',
    lift: '-mt-10',
    pad: 'px-4',
    label: undefined
  }
} as const

/**
 * A capa de quem nao subiu imagem: a cor do perfil em dois focos de luz e um
 * hachurado fino, sobre o fundo do card. Antes era `color33 → transparent`
 * (20% de alfa num canto), e uma cor epica comprada na lojinha ficava
 * indistinguivel da ausencia de cor.
 */
function fallbackBanner(color: string | null): React.CSSProperties {
  const strong = color ? `${color}73` : 'rgb(var(--neon-rgb) / 0.42)'
  const soft = color ? `${color}2e` : 'rgb(var(--neon-rgb) / 0.16)'
  const hatch = color ? `${color}1a` : 'rgb(var(--neon-rgb) / 0.10)'
  return {
    backgroundColor: 'hsl(var(--card))',
    backgroundImage: [
      `radial-gradient(90% 130% at 100% 0%, ${strong} 0%, transparent 62%)`,
      `radial-gradient(70% 90% at 0% 100%, ${soft} 0%, transparent 70%)`,
      `repeating-linear-gradient(135deg, ${hatch} 0 2px, transparent 2px 16px)`
    ].join(', ')
  }
}

// ============================================
// POPOVER
// ============================================

/**
 * O cartao de perfil como POPOVER, ancorado em quem o abriu. E o formato da
 * lista de membros: abre do lado, sem cobrir a conversa.
 */
export function ProfileCard({ member, children }: { member: Member; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="end"
        side="left"
        className="max-h-[85dvh] w-80 overflow-y-auto overscroll-contain p-0"
        // O Radix focava o primeiro botão de dentro (um ícone com dica) e a
        // dica abria sozinha junto com o cartão. O foco fica no gatilho; Tab
        // entra no cartão normalmente.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <ProfileBody member={member} open={open} variant="popover" onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

// ============================================
// HERO (capa + avatar + acoes) — sem contexto, reusado pelo editor
// ============================================

export interface ProfileHeroProps {
  /** URLs ja resolvidas (resolveAssetUrl). */
  banner?: string | null
  avatar?: string | null
  name: string
  /** Cor do perfil (hex) ou null — null pinta a capa no verde da casa. */
  color: string | null
  frame?: string | null
  status?: string
  /** Sem nivel (gamificacao ainda carregando) o avatar fica num placeholder do mesmo tamanho. */
  level?: number | null
  progress?: number
  variant: ProfileVariant
  /** Modal em janela de celular: medidas intermediarias. */
  phone?: boolean
  /** Botoes a direita do avatar, na linha da base da capa. */
  actions?: React.ReactNode
  /** Clique na capa/foto (abrir no lightbox, trocar no editor). */
  onBannerClick?: () => void
  onAvatarClick?: () => void
  bannerClickLabel?: string
  avatarClickLabel?: string
  /** Camadas extras do editor (botoes "Trocar capa", "Trocar foto"). */
  bannerOverlay?: React.ReactNode
  avatarOverlay?: React.ReactNode
  className?: string
}

export function ProfileHero({
  banner,
  avatar,
  name,
  color,
  frame,
  status,
  level,
  progress = 0,
  variant,
  phone,
  actions,
  onBannerClick,
  onAvatarClick,
  bannerClickLabel = 'Ver a capa',
  avatarClickLabel = 'Ver a foto',
  bannerOverlay,
  avatarOverlay,
  className
}: ProfileHeroProps) {
  const size = HERO[variant === 'modal' && phone ? 'phone' : variant]
  const bannerStyle: React.CSSProperties = banner
    ? { backgroundImage: `url(${banner})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : fallbackBanner(color)

  const avatarEl = (
    <UserAvatar
      src={avatar ?? undefined}
      name={name}
      // No popover a bolinha do proprio avatar serve; no modal ela e
      // desenhada aqui fora, maior, pra acompanhar a foto de 112px.
      status={variant === 'popover' ? status : undefined}
      ringColor={color}
      frame={frame}
      className={size.avatar}
      // Sem foto, as iniciais acompanham a caixa: "IN" em 14px dentro de
      // 112px parecia erro.
      fallbackClassName={variant === 'popover' ? 'text-2xl' : 'text-4xl'}
    />
  )

  return (
    <div className={cn('relative', className)}>
      <div className={cn('relative overflow-hidden', size.banner)}>
        {onBannerClick ? (
          <button
            type="button"
            onClick={onBannerClick}
            aria-label={bannerClickLabel}
            className="absolute inset-0 block h-full w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            style={bannerStyle}
          />
        ) : (
          <div aria-hidden className="absolute inset-0" style={bannerStyle} />
        )}
        {/* Sombra de leitura no pe da capa: o avatar e os botoes assentam
            sobre ela, e numa foto clara eles sumiam. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
          style={{
            background:
              'linear-gradient(to top, hsl(var(--card)) 0%, hsl(var(--card) / 0.55) 40%, transparent 100%)'
          }}
        />
        {bannerOverlay}
      </div>

      <div className={cn('flex items-end justify-between gap-3', size.pad, size.lift)}>
        <div className="relative shrink-0">
          {level != null ? (
            <LevelRing
              level={level}
              progress={progress}
              size={size.ring}
              stroke={size.stroke}
              labelClassName={size.label}
            >
              {avatarEl}
            </LevelRing>
          ) : (
            <div
              className="flex items-center justify-center"
              style={{ width: size.ring, height: size.ring }}
            >
              {avatarEl}
            </div>
          )}

          {onAvatarClick && (
            <button
              type="button"
              onClick={onAvatarClick}
              aria-label={avatarClickLabel}
              className="absolute inset-0 cursor-zoom-in rounded-brutal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          )}

          {status && variant === 'modal' && (
            <span
              aria-label={STATUS_LABEL[status] ?? status}
              className={cn(
                'absolute -right-1 -top-1 h-5 w-5 rounded-full border-[3px] border-card',
                STATUS_DOT[status] ?? STATUS_DOT.offline
              )}
            />
          )}

          {avatarOverlay}
        </div>

        {actions && (
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 pb-1.5">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// CORPO
// ============================================

/**
 * O PERFIL EM SI, dentro da moldura que o chamou.
 *
 * `open` nao e enfeite: a parte de gamificacao (nivel, XP, murchos, badges) e
 * buscada SO quando o perfil aparece — sao 30 pessoas na lista e ninguem abre
 * 30 perfis por noite. O contexto guarda em cache por um minuto. O modal passa
 * `open` fixo em true, porque ele so existe aberto.
 *
 * `onNavigate` avisa a moldura que a pessoa saiu do perfil por uma acao
 * (mandar mensagem, editar, lojinha, abrir o perfil completo) — o popover
 * fecha, o modal fecha.
 */
export function ProfileBody({
  member,
  open,
  variant = 'popover',
  wide,
  onNavigate
}: {
  member: Member
  open: boolean
  variant?: ProfileVariant
  /** Nome antigo de `variant="modal"`. */
  wide?: boolean
  onNavigate?: () => void
}) {
  const v: ProfileVariant = wide ? 'modal' : variant
  const modal = v === 'modal'
  const { isPhone } = useLayout()
  const { user } = useAuth()
  const { activityOf } = useActivity()
  const { profile: myProfile, profileOf, cosmeticName } = useGamification()
  const { cargosOf } = useCargos()
  const { byId } = useMembers()
  const overlays = useOverlaysOptional()

  const [remote, setRemote] = React.useState<GamificationProfile | null>(null)

  const isSelf = member.id === user?.id
  const color = member.profileColor ?? null
  const status = member.isOnline ? (member.status ?? 'online') : 'offline'
  const activity = member.isOnline ? activityOf(member.id) : undefined
  const title = cosmeticName(member.title)
  const cargos = cargosOf(member.id)
  const inMatch = !isSelf && activity?.phase === 'in-progress'
  const sponsor = member.sponsorId ? byId[member.sponsorId] : undefined
  const since = formatSince(member.createdAt)

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

  const bannerUrl = resolveAssetUrl(member.banner)
  const avatarUrl = resolveAssetUrl(member.avatar)
  const pad = modal ? (isPhone ? 'px-4' : 'px-6') : 'px-4'

  return (
    <div className={cn('flex flex-col', modal ? 'text-sm' : 'text-[13px]')}>
      <ProfileHero
        variant={v}
        phone={isPhone}
        banner={bannerUrl ?? null}
        avatar={avatarUrl ?? null}
        name={member.displayName}
        color={color}
        frame={member.avatarFrame}
        status={status}
        level={gp?.level ?? null}
        progress={progress}
        // Foto e capa abrem no lightbox so no modal — no popover a pessoa
        // esta a um clique do modal, e la ve tudo grande.
        onBannerClick={
          modal && bannerUrl && overlays ? () => overlays.openLightbox(bannerUrl) : undefined
        }
        onAvatarClick={
          modal && avatarUrl && overlays ? () => overlays.openLightbox(avatarUrl) : undefined
        }
        bannerClickLabel={`Ver a capa de ${member.displayName}`}
        avatarClickLabel={`Ver a foto de ${member.displayName}`}
        actions={
          <Actions
            member={member}
            isSelf={isSelf}
            inMatch={inMatch}
            modal={modal}
            onNavigate={onNavigate}
          />
        }
      />

      <div className={cn('flex flex-col', pad, modal ? 'mt-3 gap-5 pb-6' : 'mt-2 gap-3 pb-4')}>
        {/* ---------------------------------------------------- IDENTIDADE */}
        <ProfileIdentity
          size={modal ? (isPhone ? 'phone' : 'modal') : 'popover'}
          name={member.displayName}
          username={member.username}
          pronouns={member.pronouns}
          color={color}
          nameEffect={member.nameEffect}
          emoji={member.emoji}
          titleId={member.title}
          titleName={title}
          role={member.role}
          customStatus={member.customStatus}
          after={
            activity && (
              <div className="mt-1 rounded-brutal border border-burn/40 bg-burn/[0.06] px-2.5 py-1.5">
                <ActivityLine activity={activity} className={modal ? 'text-xs' : 'text-[11.5px]'} />
              </div>
            )
          }
        >
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
        </ProfileIdentity>

        {/* --------------------------------------------------- GAMIFICAÇÃO */}
        {gp &&
          (modal ? (
            <div className="flex flex-col gap-2">
              <LevelStrip profile={gp} modal />
              <StatsGrid profile={gp} />
            </div>
          ) : (
            <CompactStats profile={gp} />
          ))}

        {gp && gp.badges.length > 0 && (
          <BadgesSection
            profile={gp}
            modal={modal}
            onOpen={overlays ? (id?: string) => overlays.openAchievements(id) : undefined}
          />
        )}

        {/* --------------------------------------------------------- SOBRE */}
        <AboutSection
          member={member}
          modal={modal}
          isSelf={isSelf}
          onEdit={
            isSelf && overlays
              ? () => {
                  overlays.openProfileEditor()
                  onNavigate?.()
                }
              : undefined
          }
        />

        {/* Xadrez só no modal: o popover é resumo, e o bloco do chess.com
            (com formulário de vincular, no próprio) o deixava do tamanho da
            janela. */}
        {modal && <ChessBlock userId={member.id} isSelf={isSelf} open={open} />}

        {/* --------------------------------------------------------- RODAPÉ */}
        <footer
          className={cn(
            'flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-3 text-muted-foreground',
            modal ? 'text-xs' : 'text-[11.5px]'
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', STATUS_DOT[status] ?? STATUS_DOT.offline)} />
            {STATUS_LABEL[status] ?? status}
          </span>
          {since && <span>· no grupo desde {since}</span>}
          {sponsor && (
            <span>
              · apresentado por{' '}
              {overlays ? (
                <button
                  type="button"
                  onClick={() => overlays.openProfile(sponsor.id)}
                  className="text-foreground transition-colors hover:text-acid"
                >
                  {sponsor.displayName}
                </button>
              ) : (
                <span className="text-foreground">{sponsor.displayName}</span>
              )}
            </span>
          )}
        </footer>

        {!modal && overlays && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              overlays.openProfile(member.id)
              onNavigate?.()
            }}
          >
            Ver perfil completo
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

// ============================================
// IDENTIDADE (nome, @, título, recado) — sem contexto, reusado pelo editor
// ============================================

export type ProfileSize = 'modal' | 'phone' | 'popover'

/**
 * Nome, arroba, título e recado — o bloco que diz QUEM é, do jeito que a
 * pessoa escolheu aparecer. Sem contexto, pelo mesmo motivo do ProfileHero:
 * a prévia do editor desenha este mesmo componente com o que está sendo
 * digitado, então o que se vê editando é o que os outros vão ver.
 *
 * `children` entra entre a arroba e o recado (os cargos, no perfil);
 * `after` entra depois do recado (a atividade de jogo).
 */
export function ProfileIdentity({
  size,
  name,
  username,
  pronouns,
  color,
  nameEffect,
  emoji,
  titleId,
  titleName,
  role,
  customStatus,
  children,
  after
}: {
  size: ProfileSize
  name: string
  username: string
  pronouns?: string | null
  color: string | null
  nameEffect?: string | null
  emoji?: string | null
  titleId?: string | null
  titleName?: string | null
  role?: string
  customStatus?: string | null
  children?: React.ReactNode
  after?: React.ReactNode
}) {
  const modal = size !== 'popover'
  return (
    <div className="flex flex-col gap-1.5">
      <p
        className={cn(
          // leading 1.2, e não `leading-none`: a Anton tem ascendente alta e o
          // `truncate` do nome (overflow hidden) decapitava as letras a 32px.
          'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-display leading-[1.2]',
          size === 'modal' ? 'text-[32px]' : size === 'phone' ? 'text-[28px]' : 'text-xl'
        )}
        style={color ? { color } : undefined}
      >
        {/* Folga vertical no próprio nome: o `truncate` corta no limite da
            caixa, e a Anton desenha acima da linha. Nos efeitos de degradê
            (texto pintado pelo fundo) a parte de fora da caixa nem é
            pintada — o topo das letras sumia. */}
        <NameEffect effect={nameEffect} className="-my-[0.2em] min-w-0 truncate py-[0.2em]">
          {name}
        </NameEffect>
        <NameEmoji id={emoji} size="md" />
        {role === 'admin' && (
          <Hint label="Admin do servidor">
            <Shield
              className={cn('shrink-0 text-burn', modal ? 'h-4 w-4' : 'h-3.5 w-3.5')}
              aria-label="admin"
            />
          </Hint>
        )}
        {role === 'bot' && <BotBadge />}
      </p>

      <p
        className={cn(
          'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground',
          modal ? 'text-[13px]' : 'text-[11.5px]'
        )}
      >
        <span className="truncate">
          @{username}
          {pronouns && ` · ${pronouns}`}
        </span>
        {titleName && (
          <TitleTag
            titleId={titleId}
            name={titleName}
            className={modal ? 'px-1.5 text-xs leading-5' : undefined}
          />
        )}
      </p>

      {children}

      {/* O RECADO é a única frase que a pessoa escolheu mostrar — vem
          como fala, com a barra à esquerda, não como mais um dado. */}
      {customStatus && (
        <StatusText
          text={customStatus}
          className={cn(
            'mt-1 inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-r-brutal border-l-2 border-acid/70 bg-void/60 py-1.5 pl-3 pr-3 text-foreground',
            modal ? 'text-sm' : 'text-xs'
          )}
        />
      )}

      {after}
    </div>
  )
}

/** "set 2025" a partir do createdAt — ou null se a API antiga nao mandou. */
function formatSince(iso: string | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' })
    .format(date)
    .replace('. de ', ' ')
    .replace('.', '')
}

// ============================================
// AÇÕES
// ============================================

/**
 * Os botoes do perfil. No modal sao botoes de verdade, com verbo; no popover
 * viram icones com dica, porque a caixa tem 320px e o nome precisa do espaco.
 *
 *  - de outra pessoa: Mensagem (primario), Cutucar (se online e na cadeira),
 *    Apostar (se em partida);
 *  - do proprio: Editar perfil (primario) e Lojinha — e daqui que se chega
 *    na personalizacao.
 */
function Actions({
  member,
  isSelf,
  inMatch,
  modal,
  onNavigate
}: {
  member: Member
  isSelf: boolean
  inMatch: boolean
  modal: boolean
  onNavigate?: () => void
}) {
  const overlays = useOverlaysOptional()
  const { openDm } = useChat()
  const { nudgeUser } = useNudge()

  const go = (action: () => void): void => {
    action()
    onNavigate?.()
  }

  if (isSelf) {
    if (!overlays) return null
    return modal ? (
      <>
        <Button size="sm" onClick={() => go(overlays.openProfileEditor)}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Editar perfil
        </Button>
        <Button size="sm" variant="outline" onClick={() => go(overlays.openShop)}>
          <ShopIcon className="mr-1.5 h-3.5 w-3.5" />
          Lojinha
        </Button>
      </>
    ) : (
      <>
        <IconAction label="Editar perfil" onClick={() => go(overlays.openProfileEditor)}>
          <Pencil className="h-3.5 w-3.5" />
        </IconAction>
        <IconAction
          label="Lojinha"
          description="Cor, título, efeito, moldura"
          onClick={() => go(overlays.openShop)}
        >
          <ShopIcon className="h-3.5 w-3.5" />
        </IconAction>
      </>
    )
  }

  // Quem avisou que saiu não é cutucado — o servidor recusa, e descobrir
  // pelo erro é descobrir tarde. Ver lib/afk-context.
  const away = member.status === 'away'
  const nudgeLabel = away ? 'Cutucar — saiu' : 'Cutucar'
  const nudgeHint = away ? 'Avisou que saiu da cadeira' : 'Treme a tela dessa pessoa'

  if (modal) {
    return (
      <>
        <Button size="sm" onClick={() => go(() => void openDm(member.id))}>
          <ChatIcon className="mr-1.5 h-3.5 w-3.5" />
          Mensagem
        </Button>
        {member.isOnline && (
          <Hint label={nudgeLabel} description={nudgeHint}>
            <Button size="sm" variant="outline" disabled={away} onClick={() => nudgeUser(member.id)}>
              <Zap className="mr-1.5 h-3.5 w-3.5 text-burn" />
              Cutucar
            </Button>
          </Hint>
        )}
        {inMatch && (
          <BetPopover
            userId={member.id}
            targetName={member.displayName}
            side="bottom"
            align="end"
            contentClassName="z-topo"
          >
            <Button
              size="sm"
              variant="outline"
              className="border-burn/60 text-burn hover:border-burn hover:bg-burn/10"
            >
              <MurchosIcon className="mr-1.5 h-3.5 w-3.5" />
              Apostar
            </Button>
          </BetPopover>
        )}
      </>
    )
  }

  return (
    <>
      <IconAction label="Mandar mensagem" onClick={() => go(() => void openDm(member.id))}>
        <ChatIcon className="h-3.5 w-3.5" />
      </IconAction>
      {member.isOnline && (
        <IconAction
          label={nudgeLabel}
          description={nudgeHint}
          disabled={away}
          onClick={() => nudgeUser(member.id)}
          tone="burn"
        >
          <Zap className="h-3.5 w-3.5" />
        </IconAction>
      )}
      {inMatch && (
        <BetPopover userId={member.id} targetName={member.displayName} side="left" align="start">
          <button
            type="button"
            aria-label={`Apostar murchos na partida de ${member.displayName}`}
            title="Apostar na partida"
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-brutal border border-burn/60 text-burn',
              'transition-colors hover:bg-burn/10 disabled:cursor-not-allowed disabled:opacity-40'
            )}
          >
            <MurchosIcon className="h-3.5 w-3.5" />
          </button>
        </BetPopover>
      )}
    </>
  )
}

function IconAction({
  label,
  description,
  onClick,
  disabled,
  tone,
  children
}: {
  label: string
  description?: string
  onClick: () => void
  disabled?: boolean
  tone?: 'burn'
  children: React.ReactNode
}) {
  return (
    <Hint label={label} description={description}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-brutal border transition-colors',
          'disabled:cursor-not-allowed disabled:opacity-40',
          tone === 'burn'
            ? 'border-burn/60 text-burn hover:bg-burn/10'
            : 'border-line-strong text-foreground hover:border-acid/60 hover:bg-acid/5'
        )}
      >
        {children}
      </button>
    </Hint>
  )
}

// ============================================
// GAMIFICAÇÃO
// ============================================

function xpPercent(profile: GamificationProfile): number {
  return profile.nextLevelXp > 0
    ? Math.max(0, Math.min(100, Math.round((profile.levelXp / profile.nextLevelXp) * 100)))
    : 0
}

/** Nivel grande + barra de XP. E o cabecalho do painel RPG do modal. */
function LevelStrip({ profile, modal }: { profile: GamificationProfile; modal?: boolean }) {
  const pct = xpPercent(profile)
  return (
    <div
      className={cn(
        'rounded-brutal border border-line bg-void/60',
        modal ? 'px-4 py-3' : 'px-3 py-2'
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-baseline gap-1.5">
          <span className={cn('font-display leading-none text-acid', modal ? 'text-3xl' : 'text-xl')}>
            {profile.level}
          </span>
          <span className={cn('text-muted-foreground', modal ? 'text-sm' : 'text-xs')}>nível</span>
        </p>
        <p
          className={cn(
            'font-mono tabular-nums text-muted-foreground',
            modal ? 'text-xs' : 'text-[11px]'
          )}
        >
          <span className="text-foreground">{formatCompact(profile.levelXp)}</span> /{' '}
          {formatCompact(profile.nextLevelXp)} XP
          {modal && <span className="ml-2 text-acid-text">{pct}%</span>}
        </p>
      </div>
      <div
        className={cn(
          'mt-2 w-full overflow-hidden rounded-brutal bg-surface-raised',
          modal ? 'h-2' : 'h-1.5'
        )}
      >
        <div className="xp-fill h-full bg-acid" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/**
 * Os quatro numeros que o grupo compara: murchos, sequencia, vitorias e
 * tempo de call. Mono grande pro numero, rotulo pequeno em cima — a leitura
 * e de painel, nao de linha de texto.
 */
function StatsGrid({ profile }: { profile: GamificationProfile }) {
  const winrate =
    profile.gamesPlayed > 0 ? Math.round((profile.gamesWon / profile.gamesPlayed) * 100) : null
  const hours = Math.round(profile.voiceMinutes / 60)
  return (
    <dl className="grid grid-cols-4 gap-2 max-sm:grid-cols-2">
      <Stat
        icon={<MurchosIcon className="h-3.5 w-3.5 text-burn" />}
        label="Murchos"
        value={formatCompact(profile.coins)}
        sub="moeda da casa"
      />
      <Stat
        icon={
          <StreakIcon
            className={cn(
              'h-3.5 w-3.5',
              profile.streak >= 2 ? 'text-burn' : 'text-muted-foreground'
            )}
          />
        }
        label="Sequência"
        value={String(profile.streak)}
        sub={profile.bestStreak > 0 ? `melhor: ${profile.bestStreak}` : 'dias seguidos'}
      />
      <Stat
        icon={<TrophyIcon className="h-3.5 w-3.5 text-acid" />}
        label="Vitórias"
        value={String(profile.gamesWon)}
        sub={winrate !== null ? `de ${profile.gamesPlayed} · ${winrate}%` : 'nenhuma partida'}
      />
      <Stat
        icon={<VoiceIcon className="h-3.5 w-3.5 text-muted-foreground" />}
        label="Em call"
        value={hours > 0 ? `${hours}h` : `${profile.voiceMinutes}min`}
        sub={
          profile.messageCount > 0
            ? `${formatCompact(profile.messageCount)} mensagens`
            : 'tempo de voz'
        }
      />
    </dl>
  )
}

function Stat({
  icon,
  label,
  value,
  sub
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-brutal border border-line bg-void/60 px-3 py-2">
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="font-mono text-lg font-bold leading-tight tabular-nums text-foreground">{value}</dd>
      {sub && <dd className="truncate text-[11px] text-muted-foreground">{sub}</dd>}
    </div>
  )
}

/** A versao de uma linha, pro popover. */
function CompactStats({ profile }: { profile: GamificationProfile }) {
  return (
    <div className="flex flex-col gap-1.5">
      <LevelStrip profile={profile} />
      <div className="flex items-center gap-3 px-1 font-mono text-xs tabular-nums">
        <span className="flex items-center gap-1 text-burn" title="Murchos">
          <MurchosIcon className="h-3.5 w-3.5" />
          {formatCompact(profile.coins)}
        </span>
        <span
          className={cn(
            'flex items-center gap-1',
            profile.streak >= 2 ? 'text-burn' : 'text-muted-foreground'
          )}
          title={`Sequência · melhor: ${profile.bestStreak}`}
        >
          <StreakIcon className="h-3.5 w-3.5" />
          {profile.streak}
        </span>
        <span
          className="ml-auto flex items-center gap-1 text-muted-foreground"
          title="Partidas ganhas / jogadas"
        >
          <TrophyIcon className="h-3.5 w-3.5" />
          {profile.gamesWon}/{profile.gamesPlayed}
        </span>
      </div>
    </div>
  )
}

// ============================================
// CONQUISTAS
// ============================================

/**
 * Vitrine na frente, grande e com o halo da raridade — e o que a pessoa
 * ESCOLHEU mostrar. O resto por data, menor, e um "+n" que abre o painel.
 */
function BadgesSection({
  profile,
  modal,
  onOpen
}: {
  profile: GamificationProfile
  modal: boolean
  onOpen?: (badgeId?: string) => void
}) {
  const showcase = profile.showcase ?? []
  const pinned = showcase
    .map((id) => profile.badges.find((b) => b.id === id))
    .filter((b): b is (typeof profile.badges)[number] => !!b)
  const others = profile.badges.filter((b) => !showcase.includes(b.id))
  // 11 no modal: com as três da vitrine e o "+n", é o que cabe numa linha de
  // 528px sem o "+n" cair sozinho na linha de baixo.
  const limit = modal ? 11 : 6
  const shownOthers = others.slice(0, Math.max(0, limit - pinned.length))
  const rest = profile.badges.length - pinned.length - shownOthers.length

  return (
    <section className="flex flex-col gap-2">
      <SectionHead
        title="Conquistas"
        count={profile.badges.length}
        action={
          onOpen && (
            <button
              type="button"
              onClick={() => onOpen()}
              className="inline-flex items-center gap-0.5 text-xs text-acid-text transition-colors hover:text-acid"
            >
              ver todas
              <ChevronRight className="h-3 w-3" />
            </button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {pinned.length > 0 && (
          <div
            className={cn(
              'flex items-center gap-2',
              modal && shownOthers.length > 0 && 'mr-1 border-r border-line pr-3'
            )}
          >
            {pinned.map((badge) => (
              <BadgeChip
                key={badge.id}
                badgeId={badge.id}
                name={badge.name}
                description={`${badge.description} · na vitrine`}
                rarity={badge.rarity}
                glow
                className={modal ? 'h-11 w-11 border-2' : 'h-8 w-8 border-2'}
                iconClassName={modal ? 'h-6 w-6' : 'h-4 w-4'}
                onClick={onOpen && (() => onOpen(badge.id))}
              />
            ))}
          </div>
        )}
        {shownOthers.map((badge) => (
          <BadgeChip
            key={badge.id}
            badgeId={badge.id}
            name={badge.name}
            description={badge.description}
            rarity={badge.rarity}
            className={modal ? 'h-8 w-8' : 'h-7 w-7'}
            iconClassName={modal ? 'h-4 w-4' : undefined}
            onClick={onOpen && (() => onOpen(badge.id))}
          />
        ))}
        {rest > 0 &&
          (onOpen ? (
            <button
              type="button"
              onClick={() => onOpen()}
              className={cn(
                'flex items-center justify-center rounded-brutal border border-dashed border-line font-mono text-[11.5px] text-muted-foreground transition-colors hover:border-acid/60 hover:text-acid',
                modal ? 'h-8 min-w-8 px-1.5' : 'h-7 min-w-7 px-1'
              )}
              title="Ver todas as conquistas"
            >
              +{rest}
            </button>
          ) : (
            <span className="font-mono text-[11.5px] text-muted-foreground">+{rest}</span>
          ))}
      </div>
    </section>
  )
}

// ============================================
// SOBRE
// ============================================

/**
 * Bio, hora local, aniversario, jogos, links e Riot ID.
 *
 * A HORA vem com a diferença em relação a quem está olhando: saber que são
 * 04:12 pra alguém só ajuda depois de fazer a conta de cabeça, e a pergunta
 * real antes de chamar pra call é "ele tá acordado?".
 *
 * O ANIVERSÁRIO é comparado no fuso DA PESSOA (ver lib/profile-extras.ts): às
 * 22h de Lisboa já é o dia seguinte lá, e o aniversário é dela.
 *
 * A seção inteira some quando não tem nada — menos no PRÓPRIO perfil, onde
 * vira o convite pra preencher.
 */
function AboutSection({
  member,
  modal,
  isSelf,
  onEdit
}: {
  member: Member
  modal: boolean
  isSelf: boolean
  onEdit?: () => void
}) {
  const links = parseLinks(member.links)
  const games = parseFavoriteGames(member.favoriteGames)
  const localTime = localTimeIn(member.timezone)
  const diff = hourDifference(member.timezone)
  const birthdayLabel = formatBirthday(member.birthday)
  const birthdayToday = isBirthdayToday(member.birthday, member.timezone)
  const riotId = member.riotGameName
    ? `${member.riotGameName}#${member.riotTagLine ?? ''}`
    : null

  const hasFacts = !!localTime || !!birthdayLabel || games.length > 0
  const empty = !member.bio && !hasFacts && links.length === 0 && !riotId

  if (empty) {
    if (!isSelf || !modal || !onEdit) return null
    return (
      <section className="flex flex-col gap-2">
        <SectionHead title="Sobre" />
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center justify-between gap-3 rounded-brutal border border-dashed border-line px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:border-acid/60 hover:text-foreground"
        >
          <span>Conte algo sobre você: bio, aniversário, fuso, jogos e links aparecem aqui.</span>
          <Pencil className="h-3.5 w-3.5 shrink-0" />
        </button>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <SectionHead title="Sobre" />

      {member.bio && (
        <p
          className={cn(
            'whitespace-pre-wrap leading-relaxed text-foreground/90',
            modal ? 'text-sm' : 'line-clamp-4 text-xs'
          )}
        >
          {member.bio}
        </p>
      )}

      {hasFacts && (
        <div className="flex flex-wrap items-center gap-1.5">
          {localTime && (
            <Fact
              icon={<Clock className="h-3 w-3" />}
              hint={
                diff === null
                  ? 'Mesmo fuso que o seu'
                  : `${Math.abs(diff)}h ${diff > 0 ? 'à frente' : 'atrás'} de você`
              }
            >
              {localTime}
              {diff !== null && (
                <span className="text-muted-foreground">
                  {' '}
                  ({diff > 0 ? '+' : '−'}
                  {Math.abs(diff)}h)
                </span>
              )}
            </Fact>
          )}
          {birthdayLabel && (
            <Fact
              icon={<Cake className="h-3 w-3" />}
              tone={birthdayToday ? 'burn' : undefined}
              hint={birthdayToday ? 'É HOJE. Dá os parabéns.' : 'Aniversário'}
            >
              {birthdayToday ? 'aniversário é hoje!' : birthdayLabel}
            </Fact>
          )}
          {games.map((game) => (
            <Fact
              key={game}
              icon={<GameIcon game={game} className="h-3 w-3" />}
              hint={gameLabel(game)}
            >
              {modal ? gameLabel(game) : null}
            </Fact>
          ))}
        </div>
      )}

      {modal && links.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {links.map((link, index) => (
            <button
              key={index}
              type="button"
              onClick={() => openExternal(link.url)}
              title={link.url}
              className={cn(
                'inline-flex max-w-full items-center gap-1.5 rounded-brutal border border-line bg-void/60 px-2.5 py-1 text-xs text-acid-text',
                'transition-colors hover:border-acid/60 hover:text-acid'
              )}
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{link.name}</span>
            </button>
          ))}
        </div>
      )}

      {modal && riotId && (
        <p
          className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground"
          title="Riot ID lido do cliente do LoL"
        >
          <Swords className="h-3 w-3 shrink-0" aria-hidden />
          {riotId}
        </p>
      )}
    </section>
  )
}

function Fact({
  icon,
  hint,
  tone,
  children
}: {
  icon: React.ReactNode
  hint?: string
  tone?: 'burn'
  children: React.ReactNode
}) {
  return (
    <span
      title={hint}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-brutal border border-line bg-void/60 px-2 py-1 text-xs tabular-nums',
        tone === 'burn' ? 'border-burn/50 font-semibold text-burn' : 'text-foreground'
      )}
    >
      <span className={cn('shrink-0', tone === 'burn' ? 'text-burn' : 'text-muted-foreground')}>
        {icon}
      </span>
      {children}
    </span>
  )
}

function SectionHead({
  title,
  count,
  action
}: {
  title: string
  count?: number
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {title}
        {count != null && (
          <span className="font-mono font-normal normal-case tracking-normal text-acid-text">
            {count}
          </span>
        )}
      </h3>
      {action}
    </div>
  )
}
