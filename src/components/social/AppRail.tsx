import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { MessagesSquare, Gamepad2, LogOut, Keyboard, Trophy, Flame, Printer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'
import { useOverlays } from '@/lib/overlay-context'
import { useLayout } from '@/lib/layout-context'
import { useGamification } from '@/lib/gamification-context'
import { useCargos } from '@/lib/cargos-context'

/**
 * Barra estreita da esquerda: alterna entre o social e o launcher do Minecraft.
 * O contador de não-lidas fica aqui porque o chat pode estar fora de vista.
 */
export function AppRail() {
  const { logout } = useAuth()
  const { unread, mentions } = useChat()
  const { toggleShortcuts } = useOverlays()
  const { leaderboardOpen, toggleLeaderboard } = useLayout()
  const { profile } = useGamification()
  const { can } = useCargos()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const totalUnread = Object.values(unread).reduce((sum, count) => sum + count, 0)
  const totalMentions = Object.values(mentions).reduce((sum, count) => sum + count, 0)

  const onSocial = pathname === '/'
  const streak = profile?.streak ?? 0

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
    <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-[#1a1a1a] bg-[#080808] py-2">
      <RailLink
        to="/"
        label="Social"
        badge={totalMentions || totalUnread}
        // Menção é vermelha; não-lida comum é discreta. Voltar pro PC e ver
        // vermelho tem que significar "alguém falou COM VOCÊ".
        urgent={totalMentions > 0}
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
            ? 'bg-acid/10 text-acid shadow-[inset_2px_0_0_#6AFF00]'
            : 'text-muted-foreground hover:bg-void-light hover:text-foreground'
        )}
      >
        <Trophy className="h-5 w-5" />
        {profile && (
          <span className="absolute -bottom-0.5 -right-0.5 min-w-4 rounded-full border border-acid-dark bg-void px-1 text-center font-mono text-[9px] font-bold leading-4 text-acid">
            {profile.level}
          </span>
        )}
      </button>

      {/* Streak só a partir de 2: "1" é qualquer um que abriu o app hoje. */}
      {streak >= 2 && (
        <span
          title={`Streak de check-in: ${streak} dias seguidos`}
          className="flex items-center gap-0.5 rounded-brutal px-1 font-mono text-[10px] font-bold text-burn"
        >
          <Flame className="h-3 w-3" />
          {streak}
        </span>
      )}

      <button
        type="button"
        title="Atalhos (Ctrl + /)"
        aria-label="Atalhos"
        onClick={toggleShortcuts}
        className="mt-auto rounded-brutal p-2.5 text-muted-foreground transition-colors hover:bg-void-light hover:text-acid"
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
  children
}: {
  to: string
  label: string
  badge?: number
  urgent?: boolean
  children: React.ReactNode
}) {
  return (
    <NavLink
      to={to}
      end
      title={label}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          'relative rounded-brutal p-2.5 transition-colors',
          isActive
            ? 'bg-acid/10 text-acid shadow-[inset_2px_0_0_#6AFF00]'
            : 'text-muted-foreground hover:bg-void-light hover:text-foreground'
        )
      }
    >
      {children}
      {!!badge && badge > 0 && (
        <span
          className={cn(
            'absolute -right-0.5 -top-0.5 min-w-4 rounded-full px-1 text-center font-mono text-[9px] font-bold leading-4 text-dirty-white',
            urgent ? 'bg-destructive' : 'bg-[#2a2a2a]'
          )}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )
}
