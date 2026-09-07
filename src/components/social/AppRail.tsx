import * as React from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { MessagesSquare, Gamepad2, LogOut, Keyboard, Trophy, Flame, Printer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'
import { useOverlays } from '@/lib/overlay-context'
import { useLayout } from '@/lib/layout-context'
import { useGamification } from '@/lib/gamification-context'
import { useCargos } from '@/lib/cargos-context'

/**
 * Barra estreita da esquerda: alterna entre o social e o launcher do Minecraft.
 * O contador de não-lidas fica aqui porque o chat pode estar fora de vista.
 *
 * As conversas abertas (DMs) moram AQUI, embaixo dos ícones fixos — cada uma
 * com a foto da pessoa. Os ícones nunca rolam; só a lista de conversas rola
 * quando não cabe. Mensagem direta existe fora do servidor, por isso ela não
 * entra na coluna de canais.
 */
export function AppRail() {
  const { logout } = useAuth()
  const { unread, mentions, dmChannels, conversations, textChannels, activeChannelId, setActiveChannel } =
    useChat()
  const { toggleShortcuts, openUserMenu } = useOverlays()
  const { view, setView, leaderboardOpen, toggleLeaderboard } = useLayout()
  const { profile } = useGamification()
  const { can } = useCargos()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const totalUnread = Object.values(unread).reduce((sum, count) => sum + count, 0)
  const totalMentions = Object.values(mentions).reduce((sum, count) => sum + count, 0)

  const onSocial = pathname === '/'
  const streak = profile?.streak ?? 0
  const dmActive = activeChannelId?.startsWith('dm:') === true

  // Voltar pro servidor tem que cair no canal em que a pessoa estava, não num
  // canal qualquer — por isso guardamos o último canal não-DM visitado.
  const lastServerChannelRef = React.useRef<string | null>(null)
  if (activeChannelId && !activeChannelId.startsWith('dm:')) {
    lastServerChannelRef.current = activeChannelId
  }

  const openChannel = (id: string): void => {
    setActiveChannel(id)
    setView('chat')
    if (!onSocial) navigate('/')
  }

  /**
   * O ícone do social faz dupla função: sai da aba do Minecraft e, se uma DM
   * está aberta, volta pros canais do servidor.
   */
  const openSocial = (event: React.MouseEvent): void => {
    if (!onSocial || !dmActive) return
    event.preventDefault()
    const target =
      textChannels.find((c) => c.id === lastServerChannelRef.current) ?? textChannels[0]
    if (target) openChannel(target.id)
  }

  /**
   * O painel de ranking mora na coluna direita da tela social. Clicar nele
   * da aba do Minecraft precisa levar pra lá — abrir um painel que a pessoa
   * não vê é a mesma coisa que não fazer nada.
   */
  const openRanking = (): void => {
    if (!onSocial) {
      navigate('/')
      if (!leaderboardOpen) toggleLeaderboard()
      return
    }
    toggleLeaderboard()
  }

  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-line bg-void py-2">
      <RailLink
        to="/"
        label="Social"
        badge={totalMentions || totalUnread}
        // Menção é vermelha; não-lida comum é discreta. Voltar pro PC e ver
        // vermelho tem que significar "alguém falou COM VOCÊ".
        urgent={totalMentions > 0}
        // Com DM aberta o servidor não está "ativo": o destaque vai pro avatar.
        forceInactive={onSocial && dmActive}
        onClick={openSocial}
      >
        <MessagesSquare className="h-5 w-5" />
      </RailLink>

      <RailLink to="/jogo" label="Minecraft">
        <Gamepad2 className="h-5 w-5" />
      </RailLink>

      {/* A impressora só existe na barra pra quem tem o cargo "Impressora
          Murcha" — quem rachou a Kobra. Pra todo mundo mais, a aba não está
          escondida: ela não faz parte do app. Ver lib/cargos-context.tsx
          sobre o `can()` ser falso enquanto o catálogo não chegou. */}
      {can('print') && (
        <RailLink to="/impressao" label="Impressora 3D">
          <Printer className="h-5 w-5" />
        </RailLink>
      )}

      <button
        type="button"
        title={profile ? `Ranking · nível ${profile.level}` : 'Ranking'}
        aria-label="Ranking"
        onClick={openRanking}
        className={cn(
          'relative rounded-brutal p-2.5 transition-colors',
          leaderboardOpen && onSocial
            ? 'bg-acid/10 text-acid shadow-[inset_2px_0_0_hsl(var(--acid))]'
            : 'text-muted-foreground hover:bg-void-light hover:text-foreground'
        )}
      >
        <Trophy className="h-5 w-5" />
        {profile && (
          <span className="absolute -bottom-0.5 -right-0.5 min-w-4 rounded-full border border-acid-dark bg-void px-1 text-center font-mono text-[11px] font-bold leading-4 text-foreground">
            {profile.level}
          </span>
        )}
      </button>

      {/* Streak só a partir de 2: "1" é qualquer um que abriu o app hoje. */}
      {streak >= 2 && (
        <span
          title={`Streak de check-in: ${streak} dias seguidos`}
          className="flex items-center gap-0.5 rounded-brutal px-1 font-mono text-[11.5px] font-bold text-burn"
        >
          <Flame className="h-3 w-3" />
          {streak}
        </span>
      )}

      {/* Conversas abertas: os ícones acima e os botões abaixo ficam fixos;
          só esta lista rola. `min-h-0` é o que permite ela encolher em vez de
          empurrar o rodapé pra fora da tela. */}
      {dmChannels.length > 0 && <span className="my-1 h-px w-8 shrink-0 bg-surface-raised" />}

      <div
        aria-label="Conversas"
        className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto overflow-x-hidden py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {dmChannels.map((channel) => {
          const peer = conversations.find((c) => 'dm:' + c.id === channel.id)?.other
          const count = unread[channel.id] ?? 0
          const active = onSocial && view === 'chat' && channel.id === activeChannelId

          return (
            <div key={channel.id} className="relative shrink-0">
              <span
                aria-hidden
                className={cn(
                  'absolute -left-2 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-acid transition-all',
                  active ? 'h-6 opacity-100' : 'h-0 opacity-0'
                )}
              />
              <button
                type="button"
                title={peer ? channel.name + ' (@' + peer.username + ')' : channel.name}
                aria-label={channel.name}
                aria-current={active ? 'true' : undefined}
                onClick={() => openChannel(channel.id)}
                onContextMenu={(event) => peer && openUserMenu(event, peer.id)}
                className="relative block rounded-brutal transition-transform hover:scale-105 focus:outline-none focus-visible:ring-1 focus-visible:ring-acid"
              >
                <UserAvatar
                  src={resolveAssetUrl(peer?.avatar)}
                  name={peer?.displayName ?? channel.name}
                  status={peer?.status ?? 'offline'}
                  className={cn('h-9 w-9', active && 'ring-1 ring-acid')}
                />
                {count > 0 && !active && (
                  <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full border-2 border-void bg-destructive px-1 text-center font-mono text-[11px] font-bold leading-[12px] text-dirty-white">
                    {count > 9 ? '9+' : count}
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        title="Atalhos (Ctrl + /)"
        aria-label="Atalhos"
        onClick={toggleShortcuts}
        className="rounded-brutal p-2.5 text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground"
      >
        <Keyboard className="h-4 w-4" />
      </button>

      <button
        type="button"
        title="Sair da conta"
        aria-label="Sair da conta"
        onClick={() => void logout()}
        className="rounded-brutal p-2.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </nav>
  )
}

function RailLink({
  to,
  label,
  badge,
  urgent,
  forceInactive,
  onClick,
  children
}: {
  to: string
  label: string
  badge?: number
  urgent?: boolean
  forceInactive?: boolean
  onClick?: (event: React.MouseEvent) => void
  children: React.ReactNode
}) {
  return (
    <NavLink
      to={to}
      end
      title={label}
      aria-label={label}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'relative rounded-brutal p-2.5 transition-colors',
          isActive && !forceInactive
            ? 'bg-acid/10 text-acid shadow-[inset_2px_0_0_hsl(var(--acid))]'
            : 'text-muted-foreground hover:bg-void-light hover:text-foreground'
        )
      }
    >
      {children}
      {!!badge && badge > 0 && (
        <span
          className={cn(
            'absolute -right-0.5 -top-0.5 min-w-4 rounded-full px-1 text-center font-mono text-[11px] font-bold leading-4 text-dirty-white',
            urgent ? 'bg-destructive' : 'bg-surface-strong'
          )}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )
}
