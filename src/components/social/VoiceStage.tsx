import * as React from 'react'
import type { Track } from 'livekit-client'
import {
  Mic,
  MicOff,
  Headphones,
  HeadphoneOff,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Music,
  Zap,
  Loader2,
  Volume2,
  VolumeX,
  Users,
  PanelLeftOpen,
  Video,
  VideoOff
} from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useVoice, type VoiceParticipant } from '@/lib/voice-context'
import { useNudge } from '@/lib/nudge-context'
import { useMembers, type Member } from '@/lib/members-context'
import { useOverlays } from '@/lib/overlay-context'
import { useLayout } from '@/lib/layout-context'
import { ScreenStage, VideoSurface } from './ScreenStage'

export function VoiceStage({ onOpenSoundboard }: { onOpenSoundboard: () => void }) {
  const voice = useVoice()
  const { nudgeChannel } = useNudge()
  const { byId } = useMembers()
  // O seletor de tela é renderizado na casca autenticada, não aqui: este
  // componente sai da tela no instante em que a call cai, e arrancar uma modal
  // aberta trava o app inteiro (ver lib/interaction-guard.ts).
  const { openScreenPicker, openUserMenu } = useOverlays()
  const { density, sidebarIsDrawer, toggleSidebar } = useLayout()

  const [focused, setFocused] = React.useState<string | null>(null)

  /** identity -> faixa de webcam, pro card mostrar o rosto no lugar do avatar. */
  const cameraByIdentity = React.useMemo(() => {
    const map = new Map<string, Track>()
    for (const feed of voice.cameras) map.set(feed.identity, feed.track)
    return map
  }, [voice.cameras])

  /**
   * Quem está no foco do palco.
   *
   * Duas correções de comportamento: se a pessoa que eu estava assistindo para
   * de transmitir, o foco vai pra próxima em vez de deixar o palco vazio; e
   * quando alguém COMEÇA a transmitir e eu não escolhi nada ainda, o foco vai
   * pra tela dela — não pra minha própria, que eu já estou vendo no monitor.
   */
  React.useEffect(() => {
    const feeds = voice.screenShares
    if (feeds.length === 0) {
      if (focused) setFocused(null)
      return
    }

    if (focused && feeds.some((feed) => feed.identity === focused)) return

    const preferred = feeds.find((feed) => !feed.isLocal) ?? feeds[0]
    setFocused(preferred.identity)
  }, [voice.screenShares, focused])

  if (voice.connecting) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-acid" />
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Entrando em {voice.channel?.name}…
        </p>
      </div>
    )
  }

  if (!voice.connected || !voice.channel) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
        <p className="title-brutal text-lg">Nenhuma call</p>
        <p className="text-sm text-muted-foreground">
          Clique num canal de voz na barra lateral pra entrar.
        </p>
        {voice.error && <p className="mt-2 text-xs text-destructive">{voice.error}</p>}
      </div>
    )
  }

  const hasStage = voice.screenShares.length > 0
  const compact = density !== 'wide'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#1a1a1a] px-3 sm:px-4">
        {sidebarIsDrawer && (
          <button
            type="button"
            onClick={toggleSidebar}
            title="Canais"
            aria-label="Abrir canais"
            className="-ml-1 shrink-0 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-void-light hover:text-acid"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}

        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-acid shadow-[0_0_8px_#6AFF00]" />
        <h2 className="truncate font-display text-sm uppercase tracking-wide text-dirty-white">
          {voice.channel.name}
        </h2>

        <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <Users className="h-3 w-3" />
          {voice.participants.length}
        </span>

        {voice.screenSharing && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-brutal border border-burn/50 bg-burn/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-burn">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-burn" />
            no ar
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 sm:gap-3 sm:p-4">
        {hasStage ? (
          <>
            <ScreenStage
              feeds={voice.screenShares}
              focusedIdentity={focused}
              onFocus={setFocused}
            />

            {/* Fila enxuta: com a tela aberta os cards saem, e sem isso não
                haveria como abaixar o volume de ninguém durante uma gameplay. */}
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:gap-2">
              {voice.participants.map((participant) => (
                <ParticipantChip
                  key={participant.identity}
                  participant={participant}
                  member={byId[participant.identity]}
                  camera={cameraByIdentity.get(participant.identity)}
                  volume={voice.userVolume(participant.identity)}
                  onVolume={(value) => voice.setUserVolume(participant.identity, value)}
                  onContextMenu={(event) => openUserMenu(event, participant.identity)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-wrap content-center items-center justify-center gap-2 overflow-y-auto sm:gap-3">
            {voice.participants.map((participant) => (
              <ParticipantTile
                key={participant.identity}
                participant={participant}
                member={byId[participant.identity]}
                camera={cameraByIdentity.get(participant.identity)}
                volume={voice.userVolume(participant.identity)}
                onVolume={(value) => voice.setUserVolume(participant.identity, value)}
                onContextMenu={(event) => openUserMenu(event, participant.identity)}
              />
            ))}
          </div>
        )}

        {/* Controles */}
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-1.5 rounded-brutal border-2 border-[#1a1a1a] bg-void/60 p-2 sm:gap-2">
          <ControlButton
            active={voice.micEnabled}
            danger={!voice.micEnabled}
            label={voice.micEnabled ? 'Silenciar' : 'Reativar mic'}
            onClick={() => void voice.toggleMic()}
          >
            {voice.micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </ControlButton>

          <ControlButton
            active={!voice.deafened}
            danger={voice.deafened}
            label={voice.deafened ? 'Voltar a ouvir' : 'Ensurdecer'}
            onClick={voice.toggleDeafen}
          >
            {voice.deafened ? (
              <HeadphoneOff className="h-4 w-4" />
            ) : (
              <Headphones className="h-4 w-4" />
            )}
          </ControlButton>

          {/* O botão de compartilhar é o único com texto: é o que mais gera
              dúvida ("estou compartilhando ou não?") e ícone sozinho não
              responde isso. */}
          <ControlButton
            active={voice.screenSharing}
            danger={voice.screenSharing}
            label={voice.screenSharing ? 'Parar de compartilhar' : 'Compartilhar tela'}
            text={compact ? undefined : voice.screenSharing ? 'Parar' : 'Compartilhar'}
            onClick={() => {
              if (voice.screenSharing) void voice.stopScreenShare()
              else openScreenPicker()
            }}
          >
            {voice.screenSharing ? (
              <MonitorX className="h-4 w-4" />
            ) : (
              <MonitorUp className="h-4 w-4" />
            )}
          </ControlButton>

          <ControlButton
            active={voice.cameraEnabled}
            label={voice.cameraEnabled ? 'Desligar a câmera' : 'Ligar a câmera'}
            onClick={() => void voice.toggleCamera()}
          >
            {voice.cameraEnabled ? (
              <Video className="h-4 w-4" />
            ) : (
              <VideoOff className="h-4 w-4" />
            )}
          </ControlButton>

          <ControlButton label="Soundboard" onClick={onOpenSoundboard}>
            <Music className="h-4 w-4" />
          </ControlButton>

          <ControlButton
            label="Tremer a tela de todo mundo (1x por minuto)"
            onClick={nudgeChannel}
          >
            <Zap className="h-4 w-4" />
          </ControlButton>

          <span className="mx-1 hidden h-6 w-px bg-[#1a1a1a] sm:block" />

          <button
            type="button"
            title="Sair da call"
            aria-label="Sair da call"
            onClick={() => void voice.leave()}
            className="rounded-brutal border-2 border-destructive/60 p-2 text-destructive transition-colors hover:bg-destructive/20"
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Card de quem esta na call, com o volume individual.
 *
 * O controle aparece no hover pra nao poluir o palco, MAS fica sempre visivel
 * quando o volume nao esta em 100%: sem isso a pessoa abaixava alguem, esquecia
 * e depois achava que o coleguinha estava com problema de microfone.
 */
function ParticipantTile({
  participant,
  member,
  camera,
  volume,
  onVolume,
  onContextMenu
}: {
  participant: VoiceParticipant
  member?: Member
  /** Webcam ligada: o card vira vídeo em vez de avatar. */
  camera?: Track
  volume: number
  onVolume: (volume: number) => void
  onContextMenu: (event: React.MouseEvent) => void
}) {
  const muted = volume === 0
  const adjusted = volume !== 1

  return (
    <div
      onContextMenu={onContextMenu}
      className={cn(
        'group flex flex-col items-center gap-2 rounded-brutal border-2 p-3 transition-all sm:p-4',
        camera ? 'w-52 sm:w-64' : 'w-32 sm:w-40',
        participant.isSpeaking
          ? 'border-acid bg-acid/5 shadow-[0_0_20px_rgba(106,255,0,0.2)]'
          : 'border-[#1a1a1a] bg-void-light/30'
      )}
    >
      <div className="relative">
        {camera ? (
          <span
            className={cn(
              'block aspect-video w-full overflow-hidden rounded-brutal border-2 bg-black',
              participant.isSpeaking ? 'border-acid' : 'border-[#1a1a1a]'
            )}
          >
            {/* Espelhado só na própria imagem: é como todo mundo se vê no
                espelho, e vídeo de webcam invertido incomoda quem se olha. */}
            <VideoSurface
              track={camera}
              className={cn('object-cover', participant.isLocal && 'scale-x-[-1]')}
            />
          </span>
        ) : (
          <UserAvatar
            src={member?.avatar ?? participant.avatar}
            name={participant.name}
            ringColor={member?.profileColor}
            speaking={participant.isSpeaking}
            className="h-12 w-12 sm:h-16 sm:w-16"
          />
        )}

        {participant.isScreenSharing && (
          <span
            title="Compartilhando tela"
            className="absolute -right-1 -top-1 rounded-full border-2 border-void bg-destructive p-0.5"
          >
            <MonitorUp className="h-2.5 w-2.5 text-dirty-white" />
          </span>
        )}
      </div>

      <p className="w-full truncate text-center text-xs text-foreground sm:text-sm">
        {participant.name}
        {participant.isLocal && (
          <span className="ml-1 text-[10px] text-muted-foreground">(você)</span>
        )}
      </p>

      {!participant.micEnabled && <MicOff className="h-3.5 w-3.5 text-destructive" />}

      {/* Nao existe "abaixar meu proprio volume" — eu nao me escuto. */}
      {!participant.isLocal && (
        <div
          className={cn(
            'flex w-full items-center gap-1.5 transition-opacity',
            adjusted
              ? 'opacity-100'
              : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100'
          )}
        >
          <button
            type="button"
            title={
              muted
                ? `Voltar a ouvir ${participant.name}`
                : `Mutar ${participant.name} só pra mim`
            }
            aria-label={muted ? 'Voltar a ouvir' : 'Mutar só pra mim'}
            onClick={() => onVolume(muted ? 1 : 0)}
            className={cn(
              'shrink-0 transition-colors',
              muted ? 'text-destructive' : 'text-muted-foreground hover:text-acid'
            )}
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>

          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            // O duplo clique volta pro padrao: com o maximo em 200% acertar
            // exatamente 100% arrastando e chato.
            onDoubleClick={() => onVolume(1)}
            title={`Volume de ${participant.name}: ${Math.round(volume * 100)}% (2 cliques volta pro padrão)`}
            aria-label={`Volume de ${participant.name}`}
            className={cn('mini-slider min-w-0 flex-1', muted && 'is-muted')}
          />

          <span
            className={cn(
              'w-7 shrink-0 text-right font-mono text-[9px]',
              muted ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {Math.round(volume * 100)}
          </span>
        </div>
      )}
    </div>
  )
}

/** Versao horizontal do card, pra quando o palco esta ocupado por uma tela. */
function ParticipantChip({
  participant,
  member,
  camera,
  volume,
  onVolume,
  onContextMenu
}: {
  participant: VoiceParticipant
  member?: Member
  camera?: Track
  volume: number
  onVolume: (volume: number) => void
  onContextMenu: (event: React.MouseEvent) => void
}) {
  const muted = volume === 0

  return (
    <div
      onContextMenu={onContextMenu}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-brutal border-2 px-2 py-1',
        participant.isSpeaking ? 'border-acid bg-acid/5' : 'border-[#1a1a1a] bg-void-light/30'
      )}
    >
      {camera ? (
        <span className="block h-6 w-10 shrink-0 overflow-hidden rounded-[3px] bg-black">
          <VideoSurface
            track={camera}
            className={cn('object-cover', participant.isLocal && 'scale-x-[-1]')}
          />
        </span>
      ) : (
        <UserAvatar
          src={member?.avatar ?? participant.avatar}
          name={participant.name}
          ringColor={member?.profileColor}
          speaking={participant.isSpeaking}
          className="h-6 w-6"
        />
      )}
      <span className="max-w-24 truncate text-xs text-foreground">{participant.name}</span>

      {participant.isScreenSharing && (
        <MonitorUp className="h-3 w-3 shrink-0 text-destructive" aria-label="transmitindo" />
      )}
      {!participant.micEnabled && <MicOff className="h-3 w-3 shrink-0 text-destructive" />}

      {!participant.isLocal && (
        <>
          <button
            type="button"
            title={
              muted
                ? `Voltar a ouvir ${participant.name}`
                : `Mutar ${participant.name} só pra mim`
            }
            aria-label={muted ? 'Voltar a ouvir' : 'Mutar só pra mim'}
            onClick={() => onVolume(muted ? 1 : 0)}
            className={cn(
              'shrink-0 transition-colors',
              muted ? 'text-destructive' : 'text-muted-foreground hover:text-acid'
            )}
          >
            {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
          </button>

          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            onDoubleClick={() => onVolume(1)}
            title={`Volume de ${participant.name}: ${Math.round(volume * 100)}% (2 cliques volta pro padrão)`}
            aria-label={`Volume de ${participant.name}`}
            className={cn('mini-slider hidden w-16 shrink-0 sm:block', muted && 'is-muted')}
          />
        </>
      )}
    </div>
  )
}

function ControlButton({
  children,
  label,
  text,
  onClick,
  active,
  danger
}: {
  children: React.ReactNode
  label: string
  /** Rotulo visivel ao lado do icone. Sem ele o botao fica so com o icone. */
  text?: string
  onClick: () => void
  active?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-brutal border-2 p-2 transition-colors',
        text && 'px-3',
        danger
          ? 'border-destructive/60 text-destructive hover:bg-destructive/15'
          : active
            ? 'border-acid bg-acid/10 text-acid'
            : 'border-[#1a1a1a] text-muted-foreground hover:border-acid/50 hover:text-acid'
      )}
    >
      {children}
      {text && (
        <span className="font-mono text-[10px] uppercase tracking-widest">{text}</span>
      )}
    </button>
  )
}
