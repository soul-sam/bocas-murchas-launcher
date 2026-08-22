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
  PhoneOff,
  Settings,
  Signal,
  ScreenShare
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
import { resolveAssetUrl, users as usersApi, type Channel, type UserStatus } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'
import { useVoice } from '@/lib/voice-context'
import { useSocket } from '@/lib/socket-context'
import { useSettings } from '@/lib/settings-context'
import { useHotkeys } from '@/lib/hotkeys-context'

const STATUS_OPTIONS: Array<{ value: UserStatus; label: string; color: string }> = [
  { value: 'online', label: 'Online', color: '#6AFF00' },
  { value: 'away', label: 'Ausente', color: '#F2B705' },
  { value: 'dnd', label: 'Não perturbe', color: '#B33' },
  { value: 'offline', label: 'Invisível', color: '#3A3A3A' }
]

interface ChannelSidebarProps {
  view: 'chat' | 'voice'
  onSelectText: (channel: Channel) => void
  onSelectVoice: (channel: Channel) => void
  onOpenProfile: () => void
}

export function ChannelSidebar({
  view,
  onSelectText,
  onSelectVoice,
  onOpenProfile
}: ChannelSidebarProps) {
  const { user, token, applyUser } = useAuth()
  const { textChannels, voiceChannels, activeChannelId, unread } = useChat()
  const voice = useVoice()
  const { voiceByChannel, screenShares, connected } = useSocket()
  const { open: openSettings } = useSettings()
  const { pttActive } = useHotkeys()

  const setStatus = async (status: UserStatus): Promise<void> => {
    if (!token || !user) return
    await usersApi.setStatus(token, status)
    applyUser({ ...user, status })
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[#1a1a1a] bg-[#0D0D0D]">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#1a1a1a] px-3">
        <img
          src="bocas-murchas-transp.png"
          alt=""
          aria-hidden
          className="h-6 w-6 drop-shadow-[0_0_8px_rgba(106,255,0,0.5)]"
        />
        <span className="font-display text-xs uppercase tracking-[0.15em] text-dirty-white">
          Bocas <span className="text-acid">Murchas</span>
        </span>
        <span
          title={connected ? 'Conectado' : 'Reconectando…'}
          className={cn(
            'ml-auto h-1.5 w-1.5 shrink-0 rounded-full',
            connected ? 'bg-acid shadow-[0_0_6px_#6AFF00]' : 'animate-pulse bg-burn'
          )}
        />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <Section label="Texto">
          {textChannels.map((channel) => {
            const count = unread[channel.id] ?? 0
            const active = view === 'chat' && channel.id === activeChannelId

            return (
              <button
                key={channel.id}
                type="button"
                onClick={() => onSelectText(channel)}
                className={cn(
                  'group flex w-full items-center gap-1.5 rounded-brutal px-2 py-1 text-left transition-colors',
                  active
                    ? 'bg-acid/10 text-acid'
                    : count > 0
                      ? 'text-foreground hover:bg-void-light'
                      : 'text-muted-foreground hover:bg-void-light hover:text-foreground'
                )}
              >
                {channel.type === 'announcements' ? (
                  <Megaphone className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <Hash className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate text-sm">{channel.name}</span>
                {count > 0 && !active && (
                  <span className="ml-auto shrink-0 rounded-full bg-destructive px-1.5 font-mono text-[10px] font-bold text-dirty-white">
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
                  onClick={() => onSelectVoice(channel)}
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded-brutal px-2 py-1 text-left transition-colors',
                    isCurrent
                      ? 'bg-acid/10 text-acid'
                      : 'text-muted-foreground hover:bg-void-light hover:text-foreground'
                  )}
                >
                  <Volume2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate text-sm">{channel.name}</span>
                  {occupants.length > 0 && (
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                      {occupants.length}
                    </span>
                  )}
                </button>

                {occupants.length > 0 && (
                  <ul className="mb-1 ml-4 space-y-0.5 border-l border-[#1a1a1a] pl-2">
                    {occupants.map((occupant) => (
                      <li
                        key={occupant.id}
                        className="flex items-center gap-1.5 py-0.5 text-xs text-muted-foreground"
                      >
                        <UserAvatar
                          src={resolveAssetUrl(occupant.avatar)}
                          name={occupant.displayName}
                          className="h-4 w-4 rounded-full"
                        />
                        <span className="truncate">{occupant.displayName}</span>
                        {sharing.includes(occupant.id) && (
                          <ScreenShare
                            className="ml-auto h-3 w-3 shrink-0 text-destructive"
                            aria-label="compartilhando tela"
                          />
                        )}
                      </li>
                    ))}
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
            <Signal className="h-3 w-3 shrink-0 animate-pulse text-acid" />
            <span className="truncate font-mono text-[10px] uppercase tracking-widest text-acid">
              {voice.channel.name}
            </span>
            {pttActive && (
              <span className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-widest text-acid">
                no ar
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <DockButton
              label={voice.screenSharing ? 'Compartilhando' : 'Compartilhar tela'}
              active={voice.screenSharing}
              onClick={() => {
                if (voice.screenSharing) void voice.stopScreenShare()
                else onSelectVoice(voice.channel!)
              }}
            >
              <MonitorUp className="h-3.5 w-3.5" />
            </DockButton>

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

      {/* Rodapé do usuário */}
      <footer className="flex shrink-0 items-center gap-2 border-t border-[#1a1a1a] bg-[#0B0B0B] px-2 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
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
                  className="block truncate text-xs font-medium"
                  style={user?.profileColor ? { color: user.profileColor } : undefined}
                >
                  {user?.displayName}
                </span>
                <span className="block truncate font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  {user?.customStatus || `@${user?.username}`}
                </span>
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
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex shrink-0 items-center">
          <DockButton
            label={voice.micEnabled ? 'Silenciar' : 'Reativar mic'}
            danger={!voice.micEnabled && voice.connected}
            disabled={!voice.connected}
            onClick={() => void voice.toggleMic()}
          >
            {voice.micEnabled ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
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
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-3 px-2">
      <h3 className="px-2 pb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  )
}

function DockButton({
  children,
  label,
  onClick,
  active,
  danger,
  disabled
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  active?: boolean
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-brutal p-1.5 transition-colors',
        disabled && 'cursor-not-allowed opacity-40',
        danger
          ? 'text-destructive hover:bg-destructive/15'
          : active
            ? 'text-acid'
            : 'text-muted-foreground hover:bg-void-light hover:text-acid'
      )}
    >
      {children}
    </button>
  )
}
