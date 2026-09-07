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
  Users,
  PanelLeftOpen,
  Video,
  VideoOff,
  Tv,
  Radio
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVoice, type ScreenShareFeed } from '@/lib/voice-context'
import { useNudge } from '@/lib/nudge-context'
import { useMembers } from '@/lib/members-context'
import { useOverlays } from '@/lib/overlay-context'
import { useLayout } from '@/lib/layout-context'
import { useWatch } from '@/lib/watch-context'
import { CallStage, ParticipantChip } from './CallStage'
import { SoundboardPopover } from './SoundboardPopover'
import { ScreenStage } from './ScreenStage'
import { WatchStage } from './WatchStage'

export function VoiceStage() {
  const voice = useVoice()
  const { nudgeChannel } = useNudge()
  const { byId } = useMembers()
  // O seletor de tela é renderizado na casca autenticada, não aqui: este
  // componente sai da tela no instante em que a call cai, e arrancar uma modal
  // aberta trava o app inteiro (ver lib/interaction-guard.ts).
  const { openScreenPicker, openUserMenu } = useOverlays()
  const { density, sidebarIsDrawer, toggleSidebar } = useLayout()
  const watch = useWatch()

  const [focused, setFocused] = React.useState<string | null>(null)

  /**
   * Assistir junto no palco.
   *
   * `watchOpen` é SÓ meu: fechar o painel não para o vídeo de ninguém, e a
   * sessão da sala continua existindo pra quem quiser reabrir pelo botão.
   * `watchFocused` decide quem manda no palco quando tem vídeo E tela
   * compartilhada ao mesmo tempo — o outro vira uma barra fina com "ver".
   */
  const [watchOpen, setWatchOpen] = React.useState(false)
  const [watchFocused, setWatchFocused] = React.useState(true)

  const hasStage = voice.screenShares.length > 0
  const watchVideoId = watch.current?.videoId ?? null

  /**
   * Vídeo novo na sala (alguém colou um link, ou eu entrei numa call que já
   * tinha um) abre o palco sozinho — a pessoa não deveria precisar saber que
   * existe um botão pra ver o que os outros já estão vendo. Quando a sessão
   * acaba, o painel fecha; se eu fechei no meio, fica fechado até o PRÓXIMO
   * vídeo, não até a próxima mensagem de play/pause.
   *
   * Com uma tela no ar, a tela continua em foco e o vídeo entra como barra:
   * quem está compartilhando tem prioridade sobre um link colado.
   */
  const previousVideoRef = React.useRef<string | null>(null)
  const watchOpenRef = React.useRef(watchOpen)
  watchOpenRef.current = watchOpen
  const hasStageRef = React.useRef(hasStage)
  hasStageRef.current = hasStage

  React.useEffect(() => {
    const previous = previousVideoRef.current
    previousVideoRef.current = watchVideoId

    if (watchVideoId && watchVideoId !== previous) {
      // Refs, não deps: o foco inicial é decidido UMA vez, na hora em que o
      // vídeo chega. Mudar de tela ou abrir o painel depois não deve reabrir nada.
      if (!watchOpenRef.current) setWatchFocused(!hasStageRef.current)
      setWatchOpen(true)
    } else if (!watchVideoId && previous) {
      setWatchOpen(false)
    }
  }, [watchVideoId])

  const toggleWatch = React.useCallback(() => {
    setWatchOpen((open) => {
      if (!open) setWatchFocused(true)
      return !open
    })
  }, [])

  /** identity -> faixa de webcam, pro card mostrar o rosto no lugar do avatar. */
  const cameraByIdentity = React.useMemo(() => {
    const map = new Map<string, Track>()
    for (const feed of voice.cameras) map.set(feed.identity, feed.track)
    return map
  }, [voice.cameras])

  /**
   * O palco recebe funções em vez do Map e do dicionário crus: assim ele não
   * precisa saber de onde sai membro, câmera nem volume, e serve tanto pro
   * modo grade quanto pra fileira compacta.
   */
  const memberOf = React.useCallback((identity: string) => byId[identity], [byId])
  const cameraOf = React.useCallback(
    (identity: string) => cameraByIdentity.get(identity),
    [cameraByIdentity]
  )

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

  const compact = density !== 'wide'
  const watchIsMain = watchOpen && (!hasStage || watchFocused)

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

        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {watch.current && (
            <button
              type="button"
              onClick={() => {
                setWatchOpen(true)
                setWatchFocused(true)
              }}
              title={watch.current.title ?? 'Assistindo junto'}
              className="flex items-center gap-1.5 rounded-brutal border border-acid/50 bg-acid/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-acid transition-colors hover:bg-acid/20"
            >
              <Tv className="h-3 w-3" />
              {watch.current.playing ? 'assistindo' : 'vídeo pausado'}
            </button>
          )}

          {voice.screenSharing && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-brutal border border-burn/50 bg-burn/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-burn">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-burn" />
              no ar
            </span>
          )}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 sm:gap-3 sm:p-4">
        {/*
          O WatchStage é sempre o PRIMEIRO filho quando está aberto, nos dois
          modos (painel e barra). Se mudasse de posição na árvore ao trocar o
          foco com a tela compartilhada, o React remontaria o iframe e o vídeo
          recomeçaria do zero pra essa pessoa.
        */}
        {watchOpen && (
          <WatchStage
            collapsed={hasStage && !watchFocused}
            onExpand={() => setWatchFocused(true)}
            onClose={() => setWatchOpen(false)}
          />
        )}

        {hasStage && watchIsMain && (
          <ScreenSharesBar feeds={voice.screenShares} onShow={() => setWatchFocused(false)} />
        )}

        {hasStage && !watchIsMain && (
          <ScreenStage
            feeds={voice.screenShares}
            focusedIdentity={focused}
            onFocus={setFocused}
          />
        )}

        {hasStage || watchOpen ? (
          <>
            {/* Fila enxuta: com a tela (ou o vídeo) aberta os cards saem, e sem
                isso não haveria como abaixar o volume de ninguém durante uma
                gameplay. */}
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:gap-2">
              {voice.participants.map((participant) => (
                <ParticipantChip
                  key={participant.identity}
                  participant={participant}
                  member={memberOf(participant.identity)}
                  camera={cameraOf(participant.identity)}
                  volume={voice.userVolume(participant.identity)}
                  onVolume={(value) => voice.setUserVolume(participant.identity, value)}
                  onContextMenu={(event) => openUserMenu(event, participant.identity)}
                />
              ))}
            </div>
          </>
        ) : (
          <CallStage
            participants={voice.participants}
            memberOf={memberOf}
            cameraOf={cameraOf}
            volumeOf={voice.userVolume}
            onVolume={voice.setUserVolume}
            onContextMenu={openUserMenu}
          />
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

          <SoundboardPopover align="center">
            <ControlButton label="Soundboard">
              <Music className="h-4 w-4" />
            </ControlButton>
          </SoundboardPopover>

          {/* "Rolando" quando tem vídeo na sala e eu fechei o painel: é a
              única pista de que tem algo pra reabrir. */}
          <ControlButton
            active={watchOpen}
            label={
              watchOpen
                ? 'Fechar o assistir junto (só pra mim)'
                : watch.current
                  ? 'Tem vídeo rolando na sala — abrir'
                  : 'Assistir junto (YouTube sincronizado)'
            }
            text={compact ? undefined : watch.current && !watchOpen ? 'Rolando' : 'Assistir'}
            onClick={toggleWatch}
          >
            <Tv className="h-4 w-4" />
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
 * Barra fina de "tem tela no ar" enquanto o vídeo ocupa o palco.
 *
 * Quando alguém começa a transmitir com o assistir junto em foco, a tela NÃO
 * toma o palco à força: quem está vendo o vídeo decide quando trocar. Mas
 * precisa saber que tem tela pra trocar — daí a barra, com quem está
 * transmitindo e um botão de ver.
 */
function ScreenSharesBar({ feeds, onShow }: { feeds: ScreenShareFeed[]; onShow: () => void }) {
  const names = feeds.map((feed) => (feed.isLocal ? 'você' : feed.name))
  const label =
    feeds.length === 1
      ? feeds[0].isLocal
        ? 'você está transmitindo'
        : `${names[0]} está transmitindo`
      : `${feeds.length} telas no ar: ${names.join(', ')}`

  return (
    <button
      type="button"
      onClick={onShow}
      className="flex shrink-0 items-center gap-2 rounded-brutal border-2 border-[#1a1a1a] bg-void/60 px-2 py-1.5 text-left transition-colors hover:border-destructive/50"
    >
      <Radio className="h-3.5 w-3.5 shrink-0 animate-pulse text-destructive" />
      <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-widest text-dirty-white">
        {label}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1 rounded-brutal border border-destructive/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-destructive">
        <MonitorUp className="h-3 w-3" />
        ver tela
      </span>
    </button>
  )
}

/**
 * `forwardRef` + `...rest` porque este botao tambem serve de gatilho de
 * popover (o soundboard): o `asChild` do Radix injeta ref e handlers no filho,
 * e um componente que ignora os dois vira um botao que nao abre nada.
 */
const ControlButton = React.forwardRef<
  HTMLButtonElement,
  {
    children: React.ReactNode
    label: string
    /** Rotulo visivel ao lado do icone. Sem ele o botao fica so com o icone. */
    text?: string
    onClick?: () => void
    active?: boolean
    danger?: boolean
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function ControlButton(
  { children, label, text, onClick, active, danger, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      {...rest}
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
})
