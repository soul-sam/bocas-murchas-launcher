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
  VolumeX,
  Coffee,
  Lightbulb,
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
import { Hint } from '@/components/ui/tooltip'
import { useFocusTrap } from '@/lib/use-focus-trap'
import { resolveAssetUrl, users as usersApi, type Channel, type UserStatus } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'
import { useVoice } from '@/lib/voice-context'
import { useSocket } from '@/lib/socket-context'
import { useSettings } from '@/lib/settings-context'
import { useAfk } from '@/lib/afk-context'
import { useHotkeys } from '@/lib/hotkeys-context'
import { useOverlays } from '@/lib/overlay-context'
import { useLayout } from '@/lib/layout-context'
import { useActivity } from '@/lib/activity-context'
import { useMembers } from '@/lib/members-context'
import { NameEmoji } from './NameEmoji'
import { ActivityLine } from './ActivityLine'
import { OpenPartiesStrip } from './OpenPartiesStrip'
import { SmokeStrip } from './SmokeStrip'
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
  const { open: openSettings, settings } = useSettings()
  const { pttActive } = useHotkeys()
  const { openUserMenu, openQuickSwitcher, openAdmin, openScreenPicker } = useOverlays()
  const { view, sidebarIsDrawer, sidebarOpen, closeSidebar } = useLayout()
  const { afk, toggle: toggleAfk } = useAfk()

  /**
   * Quem está falando NA MINHA call.
   *
   * A lista de quem está em cada canal de voz vem do socket, que não tem (nem
   * teria como ter) nível de áudio: só existe voz medida do canal em que EU
   * estou, porque é o único que o meu launcher está ouvindo. Por isso o anel
   * aparece só nas pessoas da minha sala — nas outras seria chute.
   */
  const speakingIds = React.useMemo(
    () => new Set(voice.participants.filter((p) => p.isSpeaking).map((p) => p.identity)),
    [voice.participants]
  )

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
              <Hint
                label="Gerenciar canais"
                description="Criar, renomear, reordenar e apagar canais."
                side="right"
              >
                <button
                  type="button"
                  onClick={onManageChannels}
                  aria-label="Gerenciar canais"
                  className="rounded-brutal p-0.5 text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground"
                >
                  <Settings2 className="h-3 w-3" />
                </button>
              </Hint>
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
                ) : channel.type === 'suggestions' ? (
                  <Lightbulb className="h-3.5 w-3.5 shrink-0" />
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
                      const isSpeaking =
                        voice.channel?.id === channel.id && speakingIds.has(occupant.id)
                      // Estar na call e estar NA CADEIRA são coisas diferentes,
                      // e é essa diferença que faz alguém chamar três vezes sem
                      // resposta. Ver lib/afk-context.
                      const member = memberById[occupant.id]
                      const afkNote =
                        member?.status === 'away' ? member.customStatus : null

                      return (
                        <li key={occupant.id}>
                          <Hint
                            label={occupant.displayName}
                            description={
                              afkNote ??
                              (isSharing ? 'Está transmitindo — clique pra ver' : undefined)
                            }
                            side="right"
                          >
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
                            className={cn(
                              'flex w-full items-center gap-2.5 rounded-brutal py-1 pr-1 text-left text-sm text-muted-foreground transition-colors hover:bg-void-light',
                              !isSharing && 'cursor-default'
                            )}
                          >
                            <UserAvatar
                              src={resolveAssetUrl(occupant.avatar)}
                              name={occupant.displayName}
                              speaking={isSpeaking}
                              className="h-8 w-8 shrink-0 rounded-full"
                            />
                            <span className={cn('truncate', afkNote && 'opacity-60')}>
                              {occupant.displayName}
                            </span>
                            <NameEmoji id={memberById[occupant.id]?.emoji} />
                            {afkNote && (
                              <Coffee
                                className="h-3 w-3 shrink-0 text-burn"
                                aria-label={afkNote}
                              />
                            )}
                            {isSharing && (
                              <span className="ml-auto flex shrink-0 items-center gap-0.5 text-destructive">
                                <ScreenShare className="h-3.5 w-3.5" aria-label="compartilhando tela" />
                              </span>
                            )}
                          </button>
                          </Hint>
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
                <Hint label="Parar de compartilhar" side="right">
                  <button
                    type="button"
                    onClick={() => void voice.stopScreenShare()}
                    aria-label="Parar de compartilhar"
                    className="shrink-0 rounded-brutal p-0.5 text-burn transition-colors hover:bg-destructive/20 hover:text-destructive"
                  >
                    <MonitorX className="h-3 w-3" />
                  </button>
                </Hint>
              </div>
              {voice.shareInfo && (
                <Hint label={voice.shareInfo.sourceName} side="right">
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {voice.shareInfo.sourceName}
                  </p>
                </Hint>
              )}

              {/* O launcher mudo TEM que estar escrito. Sem isto, a pessoa
                  aperta um som do soundboard, não ouve nada e conclui que o
                  soundboard quebrou — quando ele está tocando pra todo mundo,
                  menos pra ela, de propósito. */}
              {voice.shareInfo?.muteLauncher && (
                <Hint
                  label="O Launcher está mudo"
                  description="Avisos e soundboard não tocam aqui enquanto você leva o som do sistema — é o que impede que eles entrem na transmissão. A galera ouve normal."
                  side="right"
                >
                  <p className="mt-0.5 flex cursor-help items-center gap-1 text-[11px] text-muted-foreground">
                    <VolumeX className="h-3 w-3 shrink-0" />
                    launcher mudo
                  </p>
                </Hint>
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
              description={
                voice.screenSharing ? undefined : 'Escolhe uma janela ou a tela inteira.'
              }
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
              <DockButton
                label="Soundboard"
                description="Os sons do grupo. Todo mundo na call ouve."
              >
                <Music className="h-3.5 w-3.5" />
              </DockButton>
            </SoundboardPopover>

            <Hint label="Sair da call" side="top">
              <button
                type="button"
                aria-label="Sair da call"
                onClick={() => void voice.leave()}
                className="ml-auto rounded-brutal p-1.5 text-destructive transition-colors hover:bg-destructive/15"
              >
                <PhoneOff className="h-3.5 w-3.5" />
              </button>
            </Hint>
          </div>
        </div>
      )}

      {/* "Bora?" abertos: visível mesmo com o chat em outro canal. */}
      <OpenPartiesStrip />
      <SmokeStrip />

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
            <DropdownMenuItem onSelect={toggleAfk}>
              <Coffee className="h-3.5 w-3.5 shrink-0" />
              {afk ? 'Voltei!' : 'Volto logo!'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onOpenProfile}>Editar perfil</DropdownMenuItem>
            {user?.role === 'admin' && (
              <DropdownMenuItem onSelect={openAdmin}>Painel admin</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex shrink-0 items-center">
          {/* "Volto logo!" fica AQUI, do lado do mic e do fone, e não escondido
              no menu de status: o valor dele é ser um clique só na hora em que
              a pessoa está levantando da cadeira. Ver lib/afk-context. */}
          <DockButton
            label={afk ? 'Voltei!' : 'Volto logo!'}
            description={
              afk
                ? 'Tira o aviso, devolve seu status e o áudio como estava. Também sai sozinho quando você mexer na janela.'
                : voice.connected
                  ? 'Avisa a galera que você saiu, desliga as cutucadas e muda seu mic e o som até você voltar.'
                  : 'Avisa a galera que você saiu e desliga as cutucadas até você voltar.'
            }
            active={afk}
            onClick={toggleAfk}
          >
            <Coffee className="h-3.5 w-3.5" />
          </DockButton>

          <DockButton
            label={voice.micEnabled ? 'Silenciar' : 'Reativar mic'}
            description={
              voice.connected ? undefined : 'Só funciona dentro de uma call.'
            }
            shortcut={settings.hotkeys.mute || undefined}
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
            description={
              voice.deafened
                ? 'Volta o som da call e reativa seu mic.'
                : 'Corta o som de todo mundo — e o seu mic junto.'
            }
            shortcut={settings.hotkeys.deafen || undefined}
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

          <DockButton
            label="Configurações"
            description="Microfone, som, atalhos e tema."
            onClick={openSettings}
          >
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
    description?: string
    /**
     * O atalho GLOBAL que a pessoa configurou, não um fixo escrito aqui. Ver
     * `settings.hotkeys` — mostrar a tecla no botão é o que faz alguém
     * descobrir que ela existe sem abrir as configurações.
     */
    shortcut?: string
    onClick?: () => void
    active?: boolean
    danger?: boolean
    disabled?: boolean
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function DockButton(
  { children, label, description, shortcut, onClick, active, danger, disabled, ...rest },
  ref
) {
  return (
    // A dica fica DENTRO, em volta do <button>: assim o `asChild` do popover
    // do soundboard continua entregando ref e handlers no botão de verdade.
    <Hint label={label} description={description} shortcut={shortcut} disabled={disabled}>
      <button
        ref={ref}
        type="button"
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
    </Hint>
  )
})
