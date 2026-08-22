import { NavLink } from 'react-router-dom'
import { MessagesSquare, Gamepad2, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'

/**
 * Barra estreita da esquerda: alterna entre o social e o launcher do Minecraft.
 * O contador de não-lidas fica aqui porque o chat pode estar fora de vista.
 */
export function AppRail() {
  const { logout } = useAuth()
  const { unread } = useChat()

  const totalUnread = Object.values(unread).reduce((sum, count) => sum + count, 0)

  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-[#1a1a1a] bg-[#080808] py-2">
      <RailLink to="/" label="Social" badge={totalUnread}>
        <MessagesSquare className="h-5 w-5" />
      </RailLink>

      <RailLink to="/jogo" label="Minecraft">
        <Gamepad2 className="h-5 w-5" />
      </RailLink>

      <button
        type="button"
        title="Sair da conta"
        aria-label="Sair da conta"
        onClick={() => void logout()}
        className="mt-auto rounded-brutal p-2.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
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
  children
}: {
  to: string
  label: string
  badge?: number
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
        <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-destructive px-1 text-center font-mono text-[9px] font-bold leading-4 text-dirty-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )
}
