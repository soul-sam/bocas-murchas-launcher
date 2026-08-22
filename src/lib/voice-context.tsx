import * as React from 'react'
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  type Participant
} from 'livekit-client'
import { livekit, type Channel } from './api'
import { useAuth } from './auth-context'
import { useSocket } from './socket-context'
import { useSettings } from './settings-context'
import { playUiSound } from './ui-sounds'

/**
 * Chamada de voz e compartilhamento de tela via LiveKit.
 *
 * Falamos com a classe Room direto em vez de usar <LiveKitRoom>. O componente
 * do @livekit/components-react obriga a arvore inteira a ficar dentro dele, e
 * aqui o estado da call precisa ser lido pela sidebar, pelo soundboard e pela
 * bandeja — todos fora da area de video.
 *
 * O socket continua sendo a fonte da verdade de QUEM esta em cada canal: o
 * servidor usa isso pra saber pra onde mandar som do soundboard e nudge.
 */

/** Presets pensados pra SFU self-hosted: o upload da VPS e o gargalo. */
export const SCREEN_QUALITY = {
  '720p30': { width: 1280, height: 720, frameRate: 30, maxBitrate: 1_800_000 },
  '1080p30': { width: 1920, height: 1080, frameRate: 30, maxBitrate: 3_000_000 },
  '1080p60': { width: 1920, height: 1080, frameRate: 60, maxBitrate: 5_000_000 }
} as const

export type ScreenQuality = keyof typeof SCREEN_QUALITY

export interface VoiceParticipant {
  identity: string
  name: string
  avatar?: string
  isLocal: boolean
  isSpeaking: boolean
  micEnabled: boolean
  isScreenSharing: boolean
}

export interface ScreenShareFeed {
  identity: string
  name: string
  track: Track
}

interface VoiceContextValue {
  room: Room | null
  channel: Channel | null
  connected: boolean
  connecting: boolean
  error: string | null

  participants: VoiceParticipant[]
  screenShares: ScreenShareFeed[]

  micEnabled: boolean
  deafened: boolean
  screenSharing: boolean

  /** userId -> volume 0..2 (1 = normal). So contem quem foi ajustado. */
  userVolumes: Record<string, number>
  /** Volume de UMA pessoa, 0..2. Persiste no settings.json. */
  setUserVolume: (identity: string, volume: number) => void
  /** Volume atual de uma pessoa (1 quando nunca foi mexido). */
  userVolume: (identity: string) => number

  join: (channel: Channel) => Promise<void>
  leave: () => Promise<void>
  toggleMic: () => Promise<void>
  setMic: (enabled: boolean) => Promise<void>
  toggleDeafen: () => void
  startScreenShare: (sourceId: string, options?: {
    withAudio?: boolean
    quality?: ScreenQuality
  }) => Promise<void>
  stopScreenShare: () => Promise<void>
}

const VoiceContext = React.createContext<VoiceContextValue | null>(null)

function readMetadata(participant: Participant): { displayName?: string; avatar?: string } {
  if (!participant.metadata) return {}
  try {
    return JSON.parse(participant.metadata)
  } catch {
    return {}
  }
}

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  const { socket } = useSocket()
  const { settings, update: updateSettings } = useSettings()

  const [room, setRoom] = React.useState<Room | null>(null)
  const [channel, setChannel] = React.useState<Channel | null>(null)
  const [connecting, setConnecting] = React.useState(false)
  const [connected, setConnected] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [participants, setParticipants] = React.useState<VoiceParticipant[]>([])
  const [screenShares, setScreenShares] = React.useState<ScreenShareFeed[]>([])
  const [micEnabled, setMicEnabled] = React.useState(false)
  const [deafened, setDeafened] = React.useState(false)
  const [screenSharing, setScreenSharing] = React.useState(false)

  /** Elementos <audio> das faixas remotas ficam fora do React. */
  const audioSinkRef = React.useRef<HTMLDivElement | null>(null)
  const roomRef = React.useRef<Room | null>(null)
  const deafenedRef = React.useRef(false)
  const leavingRef = React.useRef(false)

  /** Onde estou e se estou compartilhando — pra reavisar o socket ao reconectar. */
  const channelRef = React.useRef<Channel | null>(null)
  channelRef.current = channel
  const screenSharingRef = React.useRef(false)
  screenSharingRef.current = screenSharing

  /**
   * Volume dos avisos lido por ref: os handlers do LiveKit sao registrados uma
   * vez no connect e nunca mais; se dependessem do estado, ficariam presos ao
   * valor de quando a call comecou.
   */
  const cueVolumeRef = React.useRef(0)
  cueVolumeRef.current = settings.soundEnabled ? settings.soundVolume : 0

  const cue = React.useCallback((name: Parameters<typeof playUiSound>[0]) => {
    playUiSound(name, cueVolumeRef.current)
  }, [])

  /**
   * Volume por pessoa.
   *
   * O disco (settings.json) e a verdade, mas o estado local vem na frente: a
   * gravacao e atrasada (ver flushUserVolumes) e o slider tem que andar junto
   * com o dedo, nao esperar o IPC voltar.
   */
  const [userVolumes, setUserVolumes] = React.useState<Record<string, number>>(
    settings.userVolumes
  )

  const pendingVolumesRef = React.useRef<Record<string, number>>({})

  // Chegou versao nova do arquivo: o que ainda nao foi gravado tem prioridade.
  React.useEffect(() => {
    setUserVolumes({ ...settings.userVolumes, ...pendingVolumesRef.current })
  }, [settings.userVolumes])

  /**
   * Tambem por ref, pelo mesmo motivo do cue: o handler de TrackSubscribed e
   * registrado uma vez no connect e precisa do valor de AGORA, senao a faixa
   * entra no volume padrao a cada republicacao de microfone.
   */
  const userVolumesRef = React.useRef(userVolumes)
  userVolumesRef.current = userVolumes

  const masterVolumeRef = React.useRef(1)
  masterVolumeRef.current = settings.voice.outputVolume

  /** Volume que o LiveKit deve receber: ajuste da pessoa x geral x ensurdecido. */
  const effectiveVolume = React.useCallback((identity: string): number => {
    if (deafenedRef.current) return 0
    const own = userVolumesRef.current[identity]
    const perUser = Number.isFinite(own) ? own : 1
    return Math.max(0, Math.min(2, perUser * masterVolumeRef.current))
  }, [])

  /** Reaplica tudo na sala. Chamado quando um slider mexe ou o deafen troca. */
  const applyVolumes = React.useCallback(() => {
    const current = roomRef.current
    if (!current) return

    for (const participant of current.remoteParticipants.values()) {
      participant.setVolume(effectiveVolume(participant.identity))
    }
  }, [effectiveVolume])

  const userVolume = React.useCallback(
    (identity: string): number => {
      const value = userVolumes[identity]
      return Number.isFinite(value) ? value : 1
    },
    [userVolumes]
  )

  /**
   * Gravacao do volume atrasada.
   *
   * Arrastar o slider dispara um onChange por pixel. Gravar todos seria uma
   * enxurrada de read-modify-write no settings.json — e como cada um le o
   * arquivo antes de escrever, dois em paralelo se atropelam e uma alteracao
   * some. O som muda na hora; o disco espera a mao parar.
   */
  const flushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushUserVolumes = React.useCallback(() => {
    const pending = pendingVolumesRef.current
    pendingVolumesRef.current = {}
    flushTimerRef.current = null
    if (Object.keys(pending).length > 0) void updateSettings({ userVolumes: pending })
  }, [updateSettings])

  const setUserVolume = React.useCallback(
    (identity: string, volume: number) => {
      const clamped = Math.max(0, Math.min(2, volume))

      // A ref antes de tudo: o som muda neste instante, sem esperar render.
      const next = { ...userVolumesRef.current, [identity]: clamped }
      userVolumesRef.current = next
      roomRef.current?.remoteParticipants
        .get(identity)
        ?.setVolume(effectiveVolume(identity))
      setUserVolumes(next)

      pendingVolumesRef.current[identity] = clamped
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
      flushTimerRef.current = setTimeout(flushUserVolumes, 400)
    },
    [effectiveVolume, flushUserVolumes]
  )

  // Fechar o app no meio do arrasto nao pode jogar o ajuste fora.
  React.useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current)
        flushUserVolumes()
      }
    }
  }, [flushUserVolumes])

  // Mudanca de volume geral (ou vinda de outra janela) tambem reaplica.
  React.useEffect(() => {
    applyVolumes()
  }, [applyVolumes, userVolumes, settings.voice.outputVolume])

  React.useEffect(() => {
    const sink = document.createElement('div')
    sink.style.display = 'none'
    sink.dataset.bocas = 'audio-sink'
    document.body.appendChild(sink)
    audioSinkRef.current = sink

    return () => {
      sink.remove()
      audioSinkRef.current = null
    }
  }, [])

  const syncParticipants = React.useCallback((current: Room) => {
    const all: Participant[] = [
      current.localParticipant,
      ...Array.from(current.remoteParticipants.values())
    ]

    setParticipants(
      all.map((p) => {
        const meta = readMetadata(p)
        return {
          identity: p.identity,
          name: meta.displayName || p.name || p.identity,
          avatar: meta.avatar,
          isLocal: p.identity === current.localParticipant.identity,
          isSpeaking: p.isSpeaking,
          micEnabled: p.isMicrophoneEnabled,
          isScreenSharing: p.isScreenShareEnabled
        }
      })
    )

    setMicEnabled(current.localParticipant.isMicrophoneEnabled)
    setScreenSharing(current.localParticipant.isScreenShareEnabled)
  }, [])

  const applyDeafen = React.useCallback(
    (value: boolean) => {
      deafenedRef.current = value
      // Voltar a ouvir devolve o volume AJUSTADO de cada um. Antes voltava
      // todo mundo pro 1 e apagava o volume que a pessoa tinha escolhido.
      applyVolumes()
    },
    [applyVolumes]
  )

  const leave = React.useCallback(async () => {
    const current = roomRef.current

    // disconnect() dispara RoomEvent.Disconnected, que chama leave() de novo.
    // Sem essa guarda o servidor recebe leaveVoice duas vezes por saida.
    if (!current && !leavingRef.current) return

    roomRef.current = null
    leavingRef.current = true

    if (current) {
      cue('self-leave')
      await current.disconnect().catch(() => {})
    }

    socket?.emit('leaveVoice')
    socket?.emit('screenshare:state', { active: false })

    setRoom(null)
    setChannel(null)
    setConnected(false)
    setConnecting(false)
    setParticipants([])
    setScreenShares([])
    setMicEnabled(false)
    setScreenSharing(false)
    setDeafened(false)
    deafenedRef.current = false

    void window.bocas.tray.setVoiceState({ inVoice: false, micMuted: false })
    leavingRef.current = false
  }, [socket, cue])

  const join = React.useCallback(
    async (target: Channel) => {
      if (!token) return

      // Trocar de canal: sai do atual antes de entrar no novo.
      if (roomRef.current) await leave()

      setConnecting(true)
      setError(null)
      setChannel(target)

      try {
        const credentials = await livekit.token(token, `voice-${target.id}`)

        const next = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            deviceId:
              settings.voice.inputDeviceId !== 'default'
                ? settings.voice.inputDeviceId
                : undefined,
            echoCancellation: settings.voice.echoCancellation,
            noiseSuppression: settings.voice.noiseSuppression,
            autoGainControl: settings.voice.autoGainControl,
            channelCount: 1,
            sampleRate: 48_000
          },
          publishDefaults: {
            dtx: true,
            red: true,
            audioPreset: { maxBitrate: 48_000 }
          }
        })

        next.on(RoomEvent.ParticipantConnected, () => {
          // So dispara pra quem chega DEPOIS de voce; quem ja estava na sala
          // vem em remoteParticipants no connect, sem evento.
          cue('user-join')
          syncParticipants(next)
        })
        next.on(RoomEvent.ParticipantDisconnected, () => {
          cue('user-leave')
          syncParticipants(next)
        })
        next.on(RoomEvent.TrackMuted, () => syncParticipants(next))
        next.on(RoomEvent.TrackUnmuted, () => syncParticipants(next))
        next.on(RoomEvent.ActiveSpeakersChanged, () => syncParticipants(next))
        next.on(RoomEvent.LocalTrackPublished, () => syncParticipants(next))
        next.on(RoomEvent.LocalTrackUnpublished, () => syncParticipants(next))

        next.on(
          RoomEvent.TrackSubscribed,
          (
            track: RemoteTrack,
            _publication: RemoteTrackPublication,
            participant: RemoteParticipant
          ) => {
            if (track.kind === Track.Kind.Audio) {
              // Anexamos na mao porque nao usamos <RoomAudioRenderer>.
              const element = track.attach()
              element.setAttribute('data-identity', participant.identity)
              // Ja entra no volume certo: quem chegou depois de eu abaixar o
              // volume dele voltava no padrao ao republicar o microfone.
              participant.setVolume(effectiveVolume(participant.identity))
              audioSinkRef.current?.appendChild(element)
            }

            if (
              track.kind === Track.Kind.Video &&
              track.source === Track.Source.ScreenShare
            ) {
              const meta = readMetadata(participant)
              setScreenShares((prev) => [
                ...prev.filter((s) => s.identity !== participant.identity),
                {
                  identity: participant.identity,
                  name: meta.displayName || participant.name || participant.identity,
                  track
                }
              ])
            }

            syncParticipants(next)
          }
        )

        next.on(
          RoomEvent.TrackUnsubscribed,
          (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
            track.detach().forEach((el) => el.remove())

            if (track.source === Track.Source.ScreenShare) {
              setScreenShares((prev) =>
                prev.filter((s) => s.identity !== participant.identity)
              )
            }

            syncParticipants(next)
          }
        )

        next.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          setConnected(state === ConnectionState.Connected)
        })

        next.on(RoomEvent.Disconnected, () => {
          void leave()
        })

        await next.connect(credentials.url, credentials.token)

        // Push-to-talk comeca mudo; voz ativa comeca aberto.
        const startMuted = settings.voice.mode === 'push-to-talk'
        await next.localParticipant.setMicrophoneEnabled(!startMuted)

        if (settings.voice.outputDeviceId !== 'default') {
          await next.switchActiveDevice('audiooutput', settings.voice.outputDeviceId).catch(
            () => {}
          )
        }

        roomRef.current = next
        setRoom(next)
        setConnected(true)
        syncParticipants(next)

        cue('self-join')

        // Só agora o servidor sabe em que sala mandar soundboard e nudge.
        socket?.emit('joinVoice', target.id)

        void window.bocas.tray.setVoiceState({ inVoice: true, micMuted: startMuted })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao entrar na call')
        setChannel(null)
      } finally {
        setConnecting(false)
      }
    },
    [token, leave, settings.voice, socket, syncParticipants, cue, effectiveVolume]
  )

  const setMic = React.useCallback(
    async (enabled: boolean) => {
      const current = roomRef.current
      if (!current) return
      await current.localParticipant.setMicrophoneEnabled(enabled)
      setMicEnabled(enabled)
      cue(enabled ? 'unmute' : 'mute')
      void window.bocas.tray.setVoiceState({ inVoice: true, micMuted: !enabled })
    },
    [cue]
  )

  const toggleMic = React.useCallback(async () => {
    const current = roomRef.current
    if (!current) return
    await setMic(!current.localParticipant.isMicrophoneEnabled)
  }, [setMic])

  const toggleDeafen = React.useCallback(() => {
    setDeafened((prev) => {
      const next = !prev
      applyDeafen(next)
      cue(next ? 'deafen' : 'undeafen')
      // Ensurdecer sem mutar o proprio mic e o comportamento errado: quem nao
      // ouve ninguem tambem nao deveria estar falando.
      if (next) void setMic(false)
      return next
    })
  }, [applyDeafen, setMic, cue])

  const startScreenShare = React.useCallback(
    async (
      sourceId: string,
      options: { withAudio?: boolean; quality?: ScreenQuality } = {}
    ) => {
      const current = roomRef.current
      if (!current) return

      const withAudio = options.withAudio ?? true
      const preset = SCREEN_QUALITY[options.quality ?? '720p30']

      // O main so libera getDisplayMedia se a fonte estiver marcada antes.
      await window.bocas.screen.selectSource(sourceId, withAudio)

      try {
        await current.localParticipant.setScreenShareEnabled(
          true,
          {
            audio: withAudio,
            resolution: {
              width: preset.width,
              height: preset.height,
              frameRate: preset.frameRate
            }
          },
          {
            videoEncoding: {
              maxBitrate: preset.maxBitrate,
              maxFramerate: preset.frameRate
            },
            // Texto de IDE fica ilegivel se o encoder trocar nitidez por fps.
            degradationPreference: 'maintain-resolution',
            simulcast: true
          }
        )

        setScreenSharing(true)
        socket?.emit('screenshare:state', { active: true })
      } catch (err) {
        await window.bocas.screen.cancelSelection()
        setError(err instanceof Error ? err.message : 'Erro ao compartilhar tela')
        throw err
      }
    },
    [socket]
  )

  const stopScreenShare = React.useCallback(async () => {
    const current = roomRef.current
    if (!current) return
    await current.localParticipant.setScreenShareEnabled(false)
    setScreenSharing(false)
    socket?.emit('screenshare:state', { active: false })
  }, [socket])

  /**
   * Reconexao do socket: reavisar em que canal eu estou.
   *
   * A call e do LiveKit e sobrevive a uma queda do socket — mas o socket volta
   * como uma conexao NOVA, fora de qualquer room do servidor. Sem reavisar, o
   * servidor passa a achar que ninguem esta na call: soundboard e cutucada
   * param de chegar e a pessoa desaparece da barra lateral dos outros mesmo
   * continuando a falar. Era metade do bug de "some da lista mas esta na sala".
   */
  React.useEffect(() => {
    if (!socket) return

    const handleConnect = (): void => {
      const target = channelRef.current
      if (!roomRef.current || !target) return

      socket.emit('joinVoice', target.id)
      if (screenSharingRef.current) socket.emit('screenshare:state', { active: true })
    }

    socket.on('connect', handleConnect)
    return () => {
      socket.off('connect', handleConnect)
    }
  }, [socket])

  // A janela fechar (ou o app cair) tem que soltar a sala no servidor.
  React.useEffect(() => {
    const handleUnload = (): void => {
      roomRef.current?.disconnect()
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  // Comandos do menu da bandeja.
  React.useEffect(() => {
    return window.bocas.tray.onCommand((payload) => {
      if (payload.command === 'toggle-mute') void toggleMic()
      if (payload.command === 'leave-voice') void leave()
    })
  }, [toggleMic, leave])

  const value = React.useMemo<VoiceContextValue>(
    () => ({
      room,
      channel,
      connected,
      connecting,
      error,
      participants,
      screenShares,
      micEnabled,
      deafened,
      screenSharing,
      userVolumes,
      setUserVolume,
      userVolume,
      join,
      leave,
      toggleMic,
      setMic,
      toggleDeafen,
      startScreenShare,
      stopScreenShare
    }),
    [
      room,
      channel,
      connected,
      connecting,
      error,
      participants,
      screenShares,
      micEnabled,
      deafened,
      screenSharing,
      userVolumes,
      setUserVolume,
      userVolume,
      join,
      leave,
      toggleMic,
      setMic,
      toggleDeafen,
      startScreenShare,
      stopScreenShare
    ]
  )

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>
}

export function useVoice(): VoiceContextValue {
  const ctx = React.useContext(VoiceContext)
  if (!ctx) throw new Error('useVoice must be used within a VoiceProvider')
  return ctx
}
