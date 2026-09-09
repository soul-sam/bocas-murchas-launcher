import * as React from 'react'
import { subscribeTicker } from '@/lib/use-now'
import { X, Megaphone, AlertTriangle, PartyPopper, Siren, Trash2, Hash } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { resolveAssetUrl } from '@/lib/api'
import { drops as dropsApi, type Drop, type DropStyle, type DropType } from '@/lib/api-polls'
import { useAuth } from '@/lib/auth-context'
import { useSocket } from '@/lib/socket-context'
import { useSettings } from '@/lib/settings-context'
import { useChat } from '@/lib/chat-context'
import { useMembers, type Member } from '@/lib/members-context'
import { playUiSound } from '@/lib/ui-sounds'

/**
 * DROPS — anúncios animados do admin no topo da tela.
 *
 * Não são mensagens: não entram no histórico, somem sozinhos quando vencem e
 * cada pessoa dispensa o seu (em memória — reabrir o launcher traz de volta o
 * que ainda estiver ativo, e tudo bem: é anúncio). Drop global aparece em
 * qualquer tela; drop de canal só enquanto aquele canal está aberto.
 *
 * Mora em GlobalOverlays porque precisa estar acima de tudo e sobreviver à
 * troca de aba. Camada própria, sem Radix — ver lib/interaction-guard.ts.
 */

const MAX_VISIBLE = 3

export function DropHost() {
  const { token, user } = useAuth()
  const { socket } = useSocket()
  const { settings } = useSettings()
  const { activeChannelId } = useChat()
  const { byId } = useMembers()

  const [drops, setDrops] = React.useState<Drop[]>([])
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => new Set())
  const [now, setNow] = React.useState(() => Date.now())

  // Lidos por ref pelos handlers de socket, que são registrados uma vez só.
  const settingsRef = React.useRef(settings)
  settingsRef.current = settings
  const activeRef = React.useRef(activeChannelId)
  activeRef.current = activeChannelId
  const userRef = React.useRef(user)
  userRef.current = user

  React.useEffect(() => {
    if (!token) {
      setDrops([])
      return
    }
    dropsApi
      .list(token)
      .then(setDrops)
      .catch(() => {
        // Anúncio é enfeite: falhar aqui não pode derrubar nada.
      })
  }, [token])

  React.useEffect(() => {
    if (!socket) return

    const handleCreated = (data: { drop: Drop }): void => {
      const drop = data?.drop
      if (!drop?.id) return

      setDrops((prev) => (prev.some((d) => d.id === drop.id) ? prev : [drop, ...prev]))

      // Som e balão só pra quem vai VER o banner agora: drop de outro canal
      // fica guardado até a pessoa abrir aquele canal. E quem mandou não
      // precisa ser avisado do próprio drop.
      const visibleHere = !drop.channelId || drop.channelId === activeRef.current
      const mine = drop.createdById === userRef.current?.id
      if (!visibleHere || mine) return

      const current = settingsRef.current
      const volume = current.soundEnabled ? current.soundVolume : 0
      playUiSound('mention', volume)

      if (!document.hasFocus()) {
        void window.bocas.notify.show({
          title: drop.title,
          body: drop.content,
          // Já tocamos o nosso som; o do sistema por cima seria dois bipes.
          silent: volume > 0
        })
      }
    }

    const handleDeleted = (data: { dropId: string }): void => {
      if (!data?.dropId) return
      setDrops((prev) => prev.filter((d) => d.id !== data.dropId))
    }

    socket.on('dropCreated', handleCreated)
    socket.on('dropDeleted', handleDeleted)
    return () => {
      socket.off('dropCreated', handleCreated)
      socket.off('dropDeleted', handleDeleted)
    }
  }, [socket])

  // O relógio só anda enquanto houver drop com validade.
  const hasExpiring = drops.some((d) => d.expiresAt)
  React.useEffect(() => {
    if (!hasExpiring) return
    return subscribeTicker(1_000, setNow)
  }, [hasExpiring])

  // Vencidos saem do estado: senão a lista cresce a noite inteira.
  React.useEffect(() => {
    setDrops((prev) => {
      const next = prev.filter((d) => !d.expiresAt || new Date(d.expiresAt).getTime() > now)
      return next.length === prev.length ? prev : next
    })
  }, [now])

  const visible = React.useMemo(
    () =>
      drops
        .filter(
          (d) =>
            !dismissed.has(d.id) &&
            (!d.expiresAt || new Date(d.expiresAt).getTime() > now) &&
            (!d.channelId || d.channelId === activeChannelId)
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, MAX_VISIBLE),
    [drops, dismissed, now, activeChannelId]
  )

  const dismiss = (id: string): void => {
    setDismissed((prev) => new Set(prev).add(id))
  }

  const destroy = async (id: string): Promise<void> => {
    if (!token) return
    try {
      await dropsApi.remove(token, id)
      setDrops((prev) => prev.filter((d) => d.id !== id))
    } catch {
      // O dropDeleted do socket resolve se a chamada passou e a resposta não.
    }
  }

  if (visible.length === 0) return null

  return (
    // pointer-events-none na faixa: ela ocupa a largura toda e não pode roubar
    // clique do que está embaixo. Cada banner devolve o clique pra si.
    <div className="pointer-events-none fixed inset-x-0 top-12 z-[60] flex flex-col items-center gap-2 px-4">
      {visible.map((drop) => (
        <DropBanner
          key={drop.id}
          drop={drop}
          author={byId[drop.createdById]}
          canDelete={user?.role === 'admin'}
          onDismiss={() => dismiss(drop.id)}
          onDelete={() => void destroy(drop.id)}
        />
      ))}
    </div>
  )
}

interface TypeLook {
  border: string
  gradient: string
  iconBg: string
  icon: React.ReactNode
  bar: string
}

/** Cara de cada tipo, nos tokens da casa: acid pra aviso, burn pra atenção… */
const TYPE_LOOK: Record<DropType, TypeLook> = {
  announcement: {
    border: 'border-acid/60',
    gradient: 'from-acid/20 to-acid/5',
    iconBg: 'bg-acid/20',
    icon: <Megaphone className="h-5 w-5 text-muted-foreground" />,
    bar: 'bg-acid/60'
  },
  alert: {
    border: 'border-burn/60',
    gradient: 'from-burn/20 to-burn/5',
    iconBg: 'bg-burn/20',
    icon: <AlertTriangle className="h-5 w-5 text-burn" />,
    bar: 'bg-burn/60'
  },
  celebration: {
    border: 'border-purple-500/60',
    gradient: 'from-purple-500/20 to-pink-500/5',
    iconBg: 'bg-purple-500/20',
    icon: <PartyPopper className="h-5 w-5 text-purple-400" />,
    bar: 'bg-purple-400/60'
  },
  warning: {
    border: 'border-destructive/60',
    gradient: 'from-destructive/25 to-destructive/5',
    iconBg: 'bg-destructive/20',
    icon: <Siren className="h-5 w-5 text-red-400" />,
    bar: 'bg-red-400/60'
  }
}

/** Animação por estilo. Quem pediu menos movimento no sistema não leva. */
const STYLE_ANIMATION: Record<DropStyle, string> = {
  default: '',
  glow: 'animate-glow-pulse motion-reduce:animate-none',
  shake: 'animate-drop-shake motion-reduce:animate-none',
  rainbow: 'animate-rainbow motion-reduce:animate-none'
}

function DropBanner({
  drop,
  author,
  canDelete,
  onDismiss,
  onDelete
}: {
  drop: Drop
  author?: Member
  canDelete: boolean
  onDismiss: () => void
  onDelete: () => void
}) {
  const [entered, setEntered] = React.useState(false)
  const [leaving, setLeaving] = React.useState(false)

  // Entra deslizando de cima: o estado vira true um quadro depois de montar.
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const leave = (then: () => void): void => {
    setLeaving(true)
    setTimeout(then, 250)
  }

  const look = TYPE_LOOK[drop.type] ?? TYPE_LOOK.announcement
  const animation = STYLE_ANIMATION[drop.style] ?? ''

  const displayName = author?.displayName ?? drop.createdBy?.displayName ?? 'admin'
  const avatar = author?.avatar ?? drop.createdBy?.avatar
  const isAdmin = (author?.role ?? drop.createdBy?.role) === 'admin'

  // Duração da barra calculada UMA vez, na montagem: é o que resta até vencer.
  // Se recalculasse a cada render a animação recomeçaria do zero.
  const [remainingMs] = React.useState<number | null>(() => {
    if (!drop.expiresAt) return null
    return Math.max(0, new Date(drop.expiresAt).getTime() - Date.now())
  })

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto w-full max-w-lg transition-all duration-300 ease-out',
        entered && !leaving ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
      )}
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-brutal border-2 bg-gradient-to-r backdrop-blur-md',
          'bg-void/90 shadow-[0_8px_40px_rgba(0,0,0,0.7)]',
          look.border,
          look.gradient,
          animation
        )}
      >
        <div className="pointer-events-none absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgb(var(--neon-rgb)/0.3),transparent_70%)]" />
        </div>

        <div className="relative flex items-start gap-3 p-3">
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-brutal', look.iconBg)}>
            {drop.icon ? <span className="text-2xl leading-none">{drop.icon}</span> : look.icon}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="truncate font-display text-sm uppercase tracking-wide text-dirty-white">
                {drop.title}
              </h4>
              {drop.channel && (
                <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
                  <Hash className="h-2.5 w-2.5" />
                  {drop.channel.name}
                </span>
              )}
            </div>

            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-snug text-dirty-white/85">
              {drop.content}
            </p>

            <div className="mt-2 flex items-center gap-1.5">
              <UserAvatar src={resolveAssetUrl(avatar)} name={displayName} className="h-4 w-4 text-[11px]" />
              <span className="truncate text-[11.5px] text-muted-foreground">
                {displayName}
              </span>
              {isAdmin && (
                <span className="rounded-brutal bg-burn/20 px-1 text-[11px] font-bold text-burn">
                  admin
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => leave(onDismiss)}
              title="Dispensar (só pra você)"
              aria-label="Dispensar"
              className="rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-dirty-white"
            >
              <X className="h-4 w-4" />
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={() => leave(onDelete)}
                title="Apagar pra todo mundo"
                aria-label="Apagar drop"
                className="rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {remainingMs !== null && (
          <div className="h-1 bg-black/30">
            <div
              className={cn('h-full animate-shrink-width motion-reduce:animate-none', look.bar)}
              style={{ animationDuration: `${remainingMs}ms` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
