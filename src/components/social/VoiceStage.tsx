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
  Maximize2,
  Loader2,
  Volume2,
  VolumeX
} from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import {
  useVoice,
  type ScreenShareFeed,
  type ScreenQuality,
  type VoiceParticipant
} from '@/lib/voice-context'
import { useNudge } from '@/lib/nudge-context'
import { useMembers, type Member } from '@/lib/members-context'
import { ScreenSharePicker } from './ScreenSharePicker'

/** Anexa uma faixa de vídeo do LiveKit a um <video> real. */
function VideoSurface({ track, className }: { track: Track; className?: string }) {
  const ref = React.useRef<HTMLVideoElement>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    track.attach(el)
    return () => {
      track.detach(el)
    }
  }, [track])

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      // Sem isso o próprio compartilhamento volta pelos alto-falantes e microfona.
      muted
      className={cn('h-full w-full bg-black object-contain', className)}
    />
  )
}

function ScreenFeed({ feed }: { feed: ScreenShareFeed }) {
  const containerRef = React.useRef<HTMLDivElement>(null)

  const goFullscreen = (): void => {
    void containerRef.current?.requestFullscreen().catch(() => {})
  }

  return (
    <div
      ref={containerRef}
      className="group relative min-h-0 flex-1 overflow-hidden rounded-brutal border-2 border-acid-dark bg-black"
    >
      <VideoSurface track={feed.track} />

      <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-brutal bg-void/90 px-2 py-1">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-dirty-white">
          {feed.name}
        </span>
      </div>

      <button
        type="button"
        onClick={goFullscreen}
        title="Tela cheia"
        className="absolute right-2 top-2 rounded-brutal bg-void/90 p-1.5 text-muted-foreground opacity-0 transition-all hover:text-acid group-hover:opacity-100"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function VoiceStage({
  onOpenSoundboard
}: {
  onOpenSoundboard: () => void
}) {
  const voice = useVoice()
  const { nudgeChannel } = useNudge()
  const { byId } = useMembers()
  const [pickerOpen, setPickerOpen] = React.useState(false)

  const handleShare = async (
    sourceId: string,
    options: { withAudio: boolean; quality: ScreenQuality }
  ): Promise<void> => {
    await voice.startScreenShare(sourceId, options)
  }

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#1a1a1a] px-4">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-acid shadow-[0_0_8px_#6AFF00]" />
        <h2 className="font-display text-sm uppercase tracking-wide text-dirty-white">
          {voice.channel.name}
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {voice.participants.length}{' '}
          {voice.participants.length === 1 ? 'pessoa' : 'pessoas'}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        {voice.screenShares.length > 0 ? (
          <>
            <div
              className={cn(
                'grid min-h-0 flex-1 gap-3',
                voice.screenShares.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
              )}
            >
              {voice.screenShares.map((feed) => (
                <ScreenFeed key={feed.identity} feed={feed} />
              ))}
            </div>

            {/* Fila enxuta: com a tela aberta os cards saem, e sem isso nao
                haveria como abaixar o volume de ninguem durante uma gameplay. */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 overflow-x-auto">
              {voice.participants.map((participant) => (
                <ParticipantChip
                  key={participant.identity}
                  participant={participant}
                  member={byId[participant.identity]}
                  volume={voice.userVolume(participant.identity)}
                  onVolume={(value) => voice.setUserVolume(participant.identity, value)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-wrap content-center items-center justify-center gap-3">
            {voice.participants.map((participant) => (
              <ParticipantTile
                key={participant.identity}
                participant={participant}
                member={byId[participant.identity]}
                volume={voice.userVolume(participant.identity)}
                onVolume={(value) => voice.setUserVolume(participant.identity, value)}
              />
            ))}
          </div>
        )}

        {/* Controles */}
        <div className="flex shrink-0 items-center justify-center gap-2 rounded-brutal border-2 border-[#1a1a1a] bg-void/60 p-2">
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

          <ControlButton
            active={voice.screenSharing}
            label={voice.screenSharing ? 'Parar de compartilhar' : 'Compartilhar tela'}
            onClick={() => {
              if (voice.screenSharing) void voice.stopScreenShare()
              else setPickerOpen(true)
            }}
          >
            {voice.screenSharing ? (
              <MonitorX className="h-4 w-4" />
            ) : (
              <MonitorUp className="h-4 w-4" />
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

          <span className="mx-1 h-6 w-px bg-[#1a1a1a]" />

          <button
            type="button"
            title="Sair da call"
            onClick={() => void voice.leave()}
            className="rounded-brutal border-2 border-destructive/60 p-2 text-destructive transition-colors hover:bg-destructive/20"
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ScreenSharePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={handleShare}
      />
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
  volume,
  onVolume
}: {
  participant: VoiceParticipant
  member?: Member
  volume: number
  onVolume: (volume: number) => void
}) {
  const muted = volume === 0
  const adjusted = volume !== 1

  return (
    <div
      className={cn(
        'group flex w-40 flex-col items-center gap-2 rounded-brutal border-2 p-4 transition-all',
        participant.isSpeaking
          ? 'border-acid bg-acid/5 shadow-[0_0_20px_rgba(106,255,0,0.2)]'
          : 'border-[#1a1a1a] bg-void-light/30'
      )}
    >
      <UserAvatar
        src={member?.avatar ?? participant.avatar}
        name={participant.name}
        ringColor={member?.profileColor}
        speaking={participant.isSpeaking}
        className="h-16 w-16"
      />

      <p className="w-full truncate text-center text-sm text-foreground">
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
            adjusted ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100'
          )}
        >
          <button
            type="button"
            title={muted ? `Voltar a ouvir ${participant.name}` : `Mutar ${participant.name} só pra mim`}
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
  volume,
  onVolume
}: {
  participant: VoiceParticipant
  member?: Member
  volume: number
  onVolume: (volume: number) => void
}) {
  const muted = volume === 0

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-brutal border-2 px-2 py-1',
        participant.isSpeaking ? 'border-acid bg-acid/5' : 'border-[#1a1a1a] bg-void-light/30'
      )}
    >
      <UserAvatar
        src={member?.avatar ?? participant.avatar}
        name={participant.name}
        ringColor={member?.profileColor}
        speaking={participant.isSpeaking}
        className="h-6 w-6"
      />
      <span className="max-w-24 truncate text-xs text-foreground">{participant.name}</span>

      {!participant.micEnabled && <MicOff className="h-3 w-3 shrink-0 text-destructive" />}

      {!participant.isLocal && (
        <>
          <button
            type="button"
            title={muted ? `Voltar a ouvir ${participant.name}` : `Mutar ${participant.name} só pra mim`}
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
            className={cn('mini-slider w-16 shrink-0', muted && 'is-muted')}
          />
        </>
      )}
    </div>
  )
}

function ControlButton({
  children,
  label,
  onClick,
  active,
  danger
}: {
  children: React.ReactNode
  label: string
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
        'rounded-brutal border-2 p-2 transition-colors',
        danger
          ? 'border-destructive/60 text-destructive hover:bg-destructive/15'
          : active
            ? 'border-acid bg-acid/10 text-acid'
            : 'border-[#1a1a1a] text-muted-foreground hover:border-acid/50 hover:text-acid'
      )}
    >
      {children}
    </button>
  )
}
