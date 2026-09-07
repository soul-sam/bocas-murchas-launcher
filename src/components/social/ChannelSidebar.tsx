import * as React from 'react'
import {
  Hash,
  Megaphone,
  Volume2,
  Mic,
  MicOff,
  Headphones,
  HeadphoneOff,
  MonitorUp,
  MonitorX,
  Music,
  PhoneOff,
  Settings,
  ScreenShare,
  BellOff,
  Search,
  X,
  Eye,
  MessageSquare,
  Settings2
} from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useFocusTrap } from '@/lib/use-focus-trap'
import { resolveAssetUrl, users as usersApi, type Channel, type UserStatus } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'
import { useVoice } from '@/lib/voice-context'
import { useSocket } from '@/lib/socket-context'
import { useSettings } from '@/lib/settings-context'
import { useHotkeys } from '@/lib/hotkeys-context'
import { useOverlays } from '@/lib/overlay-context'
import { useLayout } from '@/lib/layout-context'
import { useActivity } from '@/lib/activity-context'
import { useMembers } from '@/lib/members-context'
import { NameEmoji } from './NameEmoji'
import { ActivityLine } from './ActivityLine'
import { OpenPartiesStrip } from './OpenPartiesStrip'
import { SoundboardPopover } from './SoundboardPopover'
import { ConnectionBars } from './ConnectionBars'

const STATUS_OPTIONS: Array<{ value: UserStatus; label: string; color: string }> = [
  { value: 'online', label: 'Online', color: 'hsl(var(--acid))' },
  { value: 'away', label: 'Ausente', color: 'hsl(var(--burn))' },
  { value: 'dnd', label: 'Não perturbe', color: '#B33' },
  { value: 'offline', label: 'Invisível', color: '#3A3A3A' }
]

interface ChannelSidebarProps {
  onSelectText: (channel: Channel) => void
  onSelectVoice: (channel: Channel) => void
  onOpenProfile: () => void
  /** Só aparece pra admin. */
  onManageChannels: () => void
}

export function ChannelSidebar({
  onSelectText,
  onSelectVoice,
  onOpenProfile,
  onManageChannels
}: ChannelSidebarProps) {
  const { user, token, applyUser } = useAuth()
  // Emoji equipado de quem está na call: o VoiceUser do socket é só id/nome/avatar.
  const { byId: memberById } = useMembers()
  const {
    textChannels,
    voiceChannels,
    activeChannelId,
    unread,
    mentions,
    isMuted
  } = useChat()
  const voice = useVoice()
  const { mine: myActivity } = useActivity()
  const { voiceByChannel, screenShares, connected } = useSocket()
  const { open: openSettings } = useSettings()
  const { pttActive } = useHotkeys()
  const { openUserMenu, openQuickSwitcher, openAdmin, openScreenPicker } = useOverlays()
  const { view, sidebarIsDrawer, sidebarOpen, closeSidebar } = useLayout()

  const setStatus = async (status: UserStatus): Promise<void> => {
    if (!token || !user) return
    await usersApi.setStatus(token, status)
    applyUser({ ...user, status })
  }

  /**
   * Escolher um canal na gaveta fecha a gaveta.
   *
   * Em janela apertada a barra flutua POR CIMA do chat. Deixá-la aberta depois
   * do clique esconderia justamente a mensagem que a pessoa foi ler.
   */
  const afterSelect = React.useCallback(() => {
    if (sidebarIsDrawer) closeSidebar()
  }, [sidebarIsDrawer, closeSidebar])

  // Em modo gaveta a barra e um dialogo de verdade: foco preso dentro (Tab
  // nao vaza pro chat que esta atras do overlay) e Escape fecha.
  const trapRef = useFocusTrap<HTMLElement>(sidebarIsDrawer && sidebarOpen, closeSidebar)

  if (sidebarIsDrawer && !sidebarOpen) return null

  const aside = (
    <aside
      ref={trapRef}
      role={sidebarIsDrawer ? 'dialog' : undefined}
      aria-modal={sidebarIsDrawer ? true : undefined}
      aria-label={sidebarIsDrawer ? 'Canais' : undefined}
      className={cn(
        'flex w-60 shrink-0 flex-col border-r border-line bg-depth-2',
        sidebarIsDrawer && 'absolute inset-y-0 left-14 z-30 shadow-[10px_0_30px_rgba(0,0,0,0.6)]'
      )}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <img
          src="bocas-murchas-transp.png"
          alt=""
          aria-hidden
          className="h-6 w-6 drop-shadow-[0_0_8px_rgb(var(--neon-rgb)/0.3)]"
        />
        <span className="min-w-0 flex-1 truncate font-display text-xs uppercase tracking-[0.15em] text-dirty-white">
          Bocas <span className="text-acid-text">Murchas</span>
        </span>

        <span
          title={connected ? 'Conectado' : 'Reconectando…'}
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            connected ? 'bg-acid shadow-neon-2' : 'animate-pulse bg-burn'
          )}
        />

        {sidebarIsDrawer && (
          <button
            type="button"
            onClick={closeSidebar}
            title="Fechar"
            aria-label="Fechar canais"
            className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </header>

      <button
        type="button"
        onClick={openQuickSwitcher}
        className="mx-2 mt-2 flex shrink-0 items-center gap-2 rounded-brutal border border-line px-2 py-1.5 text-left text-muted-foreground transition-colors hover:border-acid/40 hover:text-foreground"
      >
        <Search className="h-3 w-3 shrink-0" />
        <span className="flex-1 truncate text-xs">Ir pra…</span>
        <kbd className="shrink-0 font-mono text-[11px] uppercase tracking-widest opacity-70">
          Ctrl K
        </kbd>
      </button>

      <p className="mx-2 mb-1 mt-1.5 flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground/70">
        <MessageSquare className="h-2.5 w-2.5" />
        botão direito em alguém = conversa (aparece na barra)
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <Section
          label="Texto"
          action={
            user?.role === 'admin' ? (
              <button
                type="button"
                onClick={onManageChannels}
                title="Gerenciar canais"
                aria-label="Gerenciar canais"
                className="rounded-brutal p-0.5 text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground"
              >
                <Settings2 className="h-3 w-3" />
              </button>
            ) : undefined
          }
        >
          {textChannels.map((channel) => {
            const count = unread[channel.id] ?? 0
            const pings = mentions[channel.id] ?? 0
            const active = view === 'chat' && channel.id === activeChannelId
            const muted = isMuted(channel.id)

            return (
              <button
                key={channel.id}
                type="button"
                onClick={() => {
                  onSelectText(channel)
                  afterSelect()
                }}
                title={muted ? `#${channel.name} — silenciado` : `#${channel.name}`}
                className={cn(
                  'group flex w-full items-center gap-1.5 rounded-brutal px-2 py-1 text-left transition-colors',
                  active
                    ? 'bg-acid/10 text-acid'
                    : count > 0
                      ? 'text-foreground hover:bg-void-light'
                      : 'text-muted-foreground hover:bg-void-light hover:text-foreground',
                  muted && !active && 'opacity-45 hover:opacity-100'
                )}
              >
                {channel.type === 'announcements' ? (
                  <Megaphone className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <Hash className="h-3.5 w-3.5 shrink-0" />
                )}

                <span className={cn('truncate text-sm', count > 0 && !active && 'font-semibold')}>
                  {channel.name}
                </span>

                {muted && <BellOff className="ml-auto h-3 w-3 shrink-0 opacity-70" />}

                {/* Menção é vermelha e vem primeiro: numa lista com 200
                    não-lidas, o que importa é que 2 delas falam com você. */}
                {pings > 0 && !active && (
                  <span
                    title={`${pings} ${pings === 1 ? 'menção' : 'menções'}`}
                    className={cn(
                      'shrink-0 rounded-full bg-destructive px-1.5 font-mono text-[11.5px] font-bold text-dirty-white',
                      !muted && 'ml-auto'
                    )}
                  >
                    @{pings > 9 ? '9+' : pings}
                  </span>
                )}

                {count > 0 && !active && pings === 0 && (
                  <span
                    className={cn(
                      'shrink-0 rounded-full bg-surface-strong px-1.5 font-mono text-[11.5px] font-bold text-dirty-white',
                      !muted && 'ml-auto'
                    )}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            )
          })}
        </Section>

        <Section label="Voz">
          {voiceChannels.map((channel) => {
            const occupants = voiceByChannel[channel.id] ?? []
            const sharing = screenShares[channel.id] ?? []
            const isCurrent = voice.channel?.id === channel.id

            return (
              <div key={channel.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectVoice(channel)
                    afterSelect()
                  }}
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded-brutal px-2 py-1 text-left transition-colors',
                    isCurrent
                      ? 'bg-acid/10 text-acid'
                      : 'text-muted-foreground hover:bg-void-light hover:text-foreground'
                  )}
                >
                  <Volume2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate text-sm">{channel.name}</span>

                  {sharing.length > 0 && (
                    <ScreenShare
                      className="ml-auto h-3 w-3 shrink-0 animate-pulse text-destructive"
                      aria-label="tem gente transmitindo"
                    />
                  )}
                  {occupants.length > 0 && (
                    <span
                      className={cn(
                        'shrink-0 font-mono text-[11.5px] text-muted-foreground',
                        sharing.length === 0 && 'ml-auto'
                      )}
                    >
                      {occupants.length}
                    </span>
                  )}
                </button>

                {occupants.length > 0 && (
                  <ul className="mb-1 ml-4 space-y-0.5 border-l border-line pl-2">
                    {occupants.map((occupant) => {
                      const isSharing = sharing.includes(occupant.id)

                      return (
                        <li key={occupant.id}>
                          <button
                            type="button"
                            onContextMenu={(event) => openUserMenu(event, occupant.id)}
                            // Clicar em quem está transmitindo leva pro palco
                            // daquele canal — o caminho óbvio pra "quero ver".
                            onClick={() => {
                              if (!isSharing) return
                              onSelectVoice(channel)
                              afterSelect()
                            }}
                            title={
                              isSharing
                                ? `Ver a tela de ${occupant.displayName}`
                                : occupant.displayName
                            }
                            className={cn(
                              'flex w-full items-center gap-2.5 rounded-brutal py-1 pr-1 text-left text-sm text-muted-foreground transition-colors hover:bg-void-light',
                              !isSharing && 'cursor-default'
                            )}
                          >
                            <UserAvatar
                              src={resolveAssetUrl(occupant.avatar)}
                              name={occupant.displayName}
                              className="h-8 w-8 shrink-0 rounded-full"
                            />
                            <span className="truncate">{occupant.displayName}</span>
                            <NameEmoji id={memberById[occupant.id]?.emoji} />
                            {isSharing && (
                              <span className="ml-auto flex shrink-0 items-center gap-0.5 text-destructive">
                                <ScreenShare className="h-3.5 w-3.5" aria-label="compartilhando tela" />
                              </span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </Section>
      </div>

      {/* Dock da call */}
      {voice.connected && voice.channel && (
        <div className="shrink-0 border-t border-acid-dark/40 bg-acid/5 px-3 py-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <ConnectionBars quality={voice.connectionQuality} pingMs={voice.pingMs} />
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-acid-text">
              {voice.channel.name}
            </span>
            {pttActive && (
              <span className="ml-auto shrink-0 text-[11px] text-acid-text">
                no ar
              </span>
            )}
          </div>

          {/* Você transmitindo é a informação mais fácil de esquecer e a mais
              cara de esquecer. Fica escrito, com o que está no ar e o botão de
              parar do lado — não só um ícone aceso. */}
          {voice.screenSharing && (
            <div className="mb-1.5 rounded-brutal border border-burn/50 bg-burn/10 px-2 py-1">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-burn" />
                <span className="flex-1 truncate text-[11px] text-burn">
                  transmitindo
                </span>
                <button
                  type="button"
                  onClick={() => void voice.stopScreenShare()}
                  title="Parar de compartilhar"
                  className="shrink-0 rounded-brutal p-0.5 text-burn transition-colors hover:bg-destructive/20 hover:text-destructive"
                >
                  <MonitorX className="h-3 w-3" />
                </button>
              </div>
              {voice.shareInfo && (
                <p
                  title={voice.shareInfo.sourceName}
                  className="truncate font-mono text-[11px] text-muted-foreground"
                >
                  {voice.shareInfo.sourceName}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-1">
            {voice.screenShares.length > 0 && view !== 'voice' && (
              <DockButton
                label="Ver quem está transmitindo"
                onClick={() => onSelectVoice(voice.channel!)}
              >
                <Eye className="h-3.5 w-3.5" />
              </DockButton>
            )}

            {/* Abre o seletor direto. Antes só trocava pro palco da call — e
                quem já estava nele clicava e não acontecia nada. */}
            <DockButton
              label={voice.screenSharing ? 'Parar de compartilhar' : 'Compartilhar tela'}
              active={voice.screenSharing}
              onClick={() => {
                if (voice.screenSharing) {
                  void voice.stopScreenShare()
                  return
                }
                onSelectVoice(voice.channel!)
                openScreenPicker()
              }}
            >
              <MonitorUp className="h-3.5 w-3.5" />
            </DockButton>

            <SoundboardPopover align="start">
              <DockButton label="Soundboard">
                <Music className="h-3.5 w-3.5" />
              </DockButton>
            </SoundboardPopover>

            <button
              type="button"
              title="Sair da call"
              onClick={() => void voice.leave()}
              className="ml-auto rounded-brutal p-1.5 text-destructive transition-colors hover:bg-destructive/15"
            >
              <PhoneOff className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* "Bora?" abertos: visível mesmo com o chat em outro canal. */}
      <OpenPartiesStrip />

      {/* Rodapé do usuário */}
      <footer className="flex shrink-0 items-center gap-2 border-t border-line bg-void px-2 py-2">
        {/* modal={false} de proposito: menu modal do Radix escreve
            `pointer-events: none` no <body>, e este aqui abre o editor de
            perfil — duas camadas sobrepostas era um dos caminhos que deixavam o
            app inteiro sem clique. Ver lib/interaction-guard.ts. */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onContextMenu={(event) => user && openUserMenu(event, user.id)}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-brutal p-1 text-left transition-colors hover:bg-void-light"
            >
              <UserAvatar
                src={resolveAssetUrl(user?.avatar)}
                name={user?.displayName ?? '??'}
                status={user?.status ?? 'online'}
                ringColor={user?.profileColor}
                className="h-8 w-8"
              />
              <span className="min-w-0 flex-1">
                <span
                  className="flex items-center gap-1 text-xs font-medium"
                  style={user?.profileColor ? { color: user.profileColor } : undefined}
                >
                  <span className="truncate">{user?.displayName}</span>
                  <NameEmoji id={user?.emoji} />
                </span>
                {myActivity ? (
                  <ActivityLine activity={myActivity} />
                ) : (
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {user?.customStatus || `@${user?.username}`}
                  </span>
                )}
              </span>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" side="top" className="w-48">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {STATUS_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onSelect={() => void setStatus(option.value)}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: option.color }}
                />
                {option.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onOpenProfile}>Editar perfil</DropdownMenuItem>
            {user?.role === 'admin' && (
              <DropdownMenuItem onSelect={openAdmin}>Painel admin</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex shrink-0 items-center">
          <DockButton
            label={voice.micEnabled ? 'Silenciar' : 'Reativar mic'}
            danger={!voice.micEnabled && voice.connected}
            disabled={!voice.connected}
            onClick={() => void voice.toggleMic()}
          >
            {voice.micEnabled ? (
              <Mic className="h-3.5 w-3.5" />
            ) : (
              <MicOff className="h-3.5 w-3.5" />
            )}
          </DockButton>

          <DockButton
            label={voice.deafened ? 'Voltar a ouvir' : 'Ensurdecer'}
            danger={voice.deafened}
            disabled={!voice.connected}
            onClick={voice.toggleDeafen}
          >
            {voice.deafened ? (
              <HeadphoneOff className="h-3.5 w-3.5" />
            ) : (
              <Headphones className="h-3.5 w-3.5" />
            )}
          </DockButton>

          <DockButton label="Configurações" onClick={openSettings}>
            <Settings className="h-3.5 w-3.5" />
          </DockButton>
        </div>
      </footer>
    </aside>
  )

  if (!sidebarIsDrawer) return aside

  return (
    <>
      {/* Clicar fora fecha a gaveta. Um <div> e não uma camada do Radix: o
          Radix trancaria o <body> e este componente some junto com o resize. */}
      <div
        onClick={closeSidebar}
        className="absolute inset-0 z-20 bg-black/50"
        aria-hidden
      />
      {aside}
    </>
  )
}

function Section({
  label,
  action,
  children
}: {
  label: string
  /** Botãozinho no canto do título (ex.: engrenagem de gerenciar canais). */
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="mb-3 px-2">
      <h3 className="flex items-center gap-1 px-2 pb-1 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        <span className="flex-1 truncate">{label}</span>
        {action}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  )
}

/**
 * `forwardRef` + `...rest` porque este botao tambem serve de gatilho de
 * popover (o soundboard): o `asChild` do Radix injeta ref e handlers no filho,
 * e um componente que ignora os dois vira um botao que nao abre nada.
 */
const DockButton = React.forwardRef<
  HTMLButtonElement,
  {
    children: React.ReactNode
    label: string
    onClick?: () => void
    active?: boolean
    danger?: boolean
    disabled?: boolean
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function DockButton(
  { children, label, onClick, active, danger, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      {...rest}
      className={cn(
        'rounded-brutal p-1.5 transition-colors',
        disabled && 'cursor-not-allowed opacity-40',
        danger
          ? 'text-destructive hover:bg-destructive/15'
          : active
            ? 'text-acid'
            : 'text-muted-foreground hover:bg-void-light hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
})
