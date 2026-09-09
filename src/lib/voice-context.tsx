import * as React from 'react'
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  LocalAudioTrack,
  type LocalTrackPublication,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  type Participant,
  type ConnectionQuality
} from 'livekit-client'
import { livekit, type Channel } from './api'
import { useAuth } from './auth-context'
import { useSocket } from './socket-context'
import { useSettings } from './settings-context'
import { playUiSound, playJoinSound } from './ui-sounds'
import { useMembers } from './members-context'
import { createMicProcessor, type MicProcessor } from './audio-processor'
import { setLauncherSilenced } from './launcher-silence'
import { exposeVoiceStats } from './voice-diagnostics'
import { createCaptureGate, type CaptureGate, type CaptureState } from './screen-capture-gate'
import { createSpeakingDetector, type SpeakingDetector } from './speaking-detector'
import {
  SCREEN_QUALITY,
  shouldSubscribe,
  encoderProfile,
  type ScreenQuality,
  type ScreenContent
} from './screen-share-policy'

export { SCREEN_QUALITY, type ScreenQuality, type ScreenContent }

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

/**
 * Constraints do AUDIO da tela — as tres primeiras existem pra DESLIGAR o que
 * o Chromium liga sozinho.
 *
 * Medido nesta maquina: sem pedir nada, a faixa de loopback vem com
 * `autoGainControl: true`, `noiseSuppression: true` e UM canal. Ou seja, o som
 * do jogo passava pelo pipeline de VOZ do navegador — o controle automatico
 * de ganho levantava o sinal em ~13 dB (e portanto bombeia nas partes altas) e
 * o supressor de ruido comia fundo de trilha e ambiencia. Com os tres
 * desligados a captura vira copia fiel.
 *
 * `channelCount: 2` e honrado (conferido no `getSettings()` da faixa): o
 * padrao era mono, entao musica e jogo chegavam na call sem imagem estereo.
 *
 * `echoCancellation` NAO resolve o eco do proprio launcher, apesar do nome: o
 * Chromium aceita a constraint, responde que esta ligada e nao aplica nada na
 * captura de loopback. A medicao esta em lib/launcher-silence.ts.
 */
const SCREEN_AUDIO_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 2
} as const

/** Bitrate do audio da tela, no mesmo degrau da imagem. */
const SCREEN_AUDIO_PRESET: Record<ScreenQuality, { maxBitrate: number }> = {
  '720p30': { maxBitrate: 64_000 },
  '1080p30': { maxBitrate: 96_000 },
  '1080p60': { maxBitrate: 128_000 }
}

export interface VoiceParticipant {
  identity: string
  name: string
  avatar?: string
  isLocal: boolean
  isSpeaking: boolean
  micEnabled: boolean
  isScreenSharing: boolean
  cameraEnabled: boolean
}

/** Uma webcam no ar. Mesmo formato do compartilhamento de tela. */
export interface CameraFeed {
  identity: string
  name: string
  track: Track
  isLocal: boolean
}

export interface ScreenShareFeed {
  identity: string
  name: string
  /**
   * A faixa de video, SO enquanto este cliente esta assistindo.
   *
   * O feed existe a partir da PUBLICACAO (alguem apertou "compartilhar"),
   * nao da assinatura: a sala conecta com autoSubscribe desligado e o video
   * so e pedido ao SFU depois do clique em "Assistir". Null = no ar, mas nao
   * estou recebendo. Na propria transmissao a faixa esta sempre aqui (e
   * local, nao custa rede) — o palco e que decide se pinta ou nao.
   */
  track: Track | null
  /** Este cliente pediu o video dessa pessoa ao servidor. */
  watching: boolean
  /** A tela vem com audio junto (faixa ScreenShareAudio publicada). */
  hasAudio: boolean
  /**
   * Verdadeiro na SUA propria transmissao.
   *
   * Antes o palco so listava faixa de terceiro (o handler era o de
   * TrackSubscribed, que por definicao nao dispara pra voce): quem estava
   * compartilhando nao via nada — nem qual janela foi parar no ar, nem se
   * ainda estava no ar. A propria transmissao entra na lista como qualquer
   * outra; o que muda e o rotulo e o botao de parar.
   */
  isLocal: boolean
}

/** O que esta sendo transmitido agora — pro palco poder dizer em voz alta. */
export interface ScreenShareInfo {
  sourceName: string
  quality: ScreenQuality
  withAudio: boolean
  /** O launcher esta mudo por causa desta transmissao. */
  muteLauncher: boolean
  startedAt: number
  /**
   * `idle` = ninguem assistindo, captura PARADA (ver lib/screen-capture-gate).
   * A publicacao continua no ar; a captura volta sozinha no primeiro
   * "Assistir".
   */
  capture: CaptureState
}

interface VoiceContextValue {
  room: Room | null
  channel: Channel | null
  connected: boolean
  connecting: boolean
  error: string | null

  participants: VoiceParticipant[]
  screenShares: ScreenShareFeed[]
  /** Webcams ligadas na call, incluindo a sua. */
  cameras: CameraFeed[]

  micEnabled: boolean
  cameraEnabled: boolean
  deafened: boolean
  /**
   * Ida e volta até o servidor de mídia, em ms. Null antes da primeira
   * medição (ou quando o navegador não entrega a estatística).
   */
  pingMs: number | null
  /** O que o próprio LiveKit acha da sua conexão. */
  connectionQuality: 'excellent' | 'good' | 'poor' | 'lost' | 'unknown'
  screenSharing: boolean
  /** Detalhes da SUA transmissao. Null quando voce nao esta compartilhando. */
  shareInfo: ScreenShareInfo | null

  /** userId -> volume 0..2 (1 = normal). So contem quem foi ajustado. */
  userVolumes: Record<string, number>
  /** Volume de UMA pessoa, 0..2. Persiste no settings.json. */
  setUserVolume: (identity: string, volume: number) => void
  /** Volume atual de uma pessoa (1 quando nunca foi mexido). */
  userVolume: (identity: string) => number

  join: (channel: Channel) => Promise<void>
  leave: () => Promise<void>
  toggleMic: () => Promise<void>
  /**
   * `transient` e o push-to-talk: abre e fecha o microfone sem mudar a ESCOLHA
   * da pessoa, entao nao vira icone de mudo pra sala.
   */
  setMic: (enabled: boolean, opts?: { transient?: boolean }) => Promise<void>
  toggleDeafen: () => void
  /** Ensurdecer com valor explícito (o AFK usa). */
  setDeafen: (value: boolean) => void
  toggleCamera: () => Promise<void>
  startScreenShare: (sourceId: string, options?: {
    withAudio?: boolean
    quality?: ScreenQuality
    content?: ScreenContent
    sourceName?: string
    muteLauncher?: boolean
    /** Parar a captura quando ninguem assiste (padrao: sim). */
    idleWhenUnwatched?: boolean
  }) => Promise<void>
  stopScreenShare: () => Promise<void>

  /**
   * Assinar a tela de UMA pessoa. Uma por vez: assistir outra solta a
   * anterior. O video e o audio da tela so saem do servidor depois daqui.
   */
  watchScreen: (identity: string) => void
  /** Soltar a tela (fechar o painel, trocar de aba, sair da call). */
  unwatchScreen: (identity?: string) => void

  /**
   * Nível do microfone processado, 0..100, e se o gate está aberto.
   *
   * São funções, não estado: o medidor lê por requestAnimationFrame e escreve
   * no DOM. Se fossem estado, cada frame re-renderizaria todo mundo que usa
   * useVoice() — a sidebar inteira, o palco, a bandeja.
   */
  getMicLevel: () => number
  isMicGateOpen: () => boolean

  /**
   * Mantém um processador de mic vivo mesmo fora da call, pra o medidor da
   * tela de configurações ter o que mostrar. Devolve a função que solta. Na
   * call o medidor lê o mic publicado e este pedido é inofensivo.
   */
  holdMicMonitor: () => () => void

  /**
   * "Testar microfone": ouvir o próprio mic, já processado (ganho + gate), na
   * saída de som escolhida. Só faz sentido na tela de configurações — é onde a
   * pessoa está mexendo nos sliders e quer ouvir o que os outros vão ouvir.
   */
  micTest: {
    start: () => void
    stop: () => void
    active: boolean
  }
}

const VoiceContext = React.createContext<VoiceContextValue | null>(null)

function sameParticipants(a: VoiceParticipant[], b: VoiceParticipant[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (
      x.identity !== y.identity ||
      x.name !== y.name ||
      x.avatar !== y.avatar ||
      x.isLocal !== y.isLocal ||
      x.isSpeaking !== y.isSpeaking ||
      x.micEnabled !== y.micEnabled ||
      x.isScreenSharing !== y.isScreenSharing ||
      x.cameraEnabled !== y.cameraEnabled
    ) {
      return false
    }
  }
  return true
}

function readMetadata(participant: Participant): { displayName?: string; avatar?: string } {
  if (!participant.metadata) return {}
  try {
    return JSON.parse(participant.metadata)
  } catch {
    return {}
  }
}

/**
 * `participant.setVolume(v)` do LiveKit so mexe no MICROFONE (source padrao).
 * O audio da tela e outra faixa (ScreenShareAudio) — sem passar por aqui o
 * slider e o ensurdecer nao valiam pro som do jogo de quem transmite.
 */
function setParticipantVolume(participant: RemoteParticipant, volume: number): void {
  participant.setVolume(volume, Track.Source.Microphone)
  participant.setVolume(volume, Track.Source.ScreenShareAudio)
}

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth()
  const { socket } = useSocket()
  const { settings, update: updateSettings } = useSettings()
  const { byId } = useMembers()

  const [room, setRoom] = React.useState<Room | null>(null)
  const [channel, setChannel] = React.useState<Channel | null>(null)
  const [connecting, setConnecting] = React.useState(false)
  const [connected, setConnected] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [participants, setParticipants] = React.useState<VoiceParticipant[]>([])
  const [screenShares, setScreenShares] = React.useState<ScreenShareFeed[]>([])
  const [cameras, setCameras] = React.useState<CameraFeed[]>([])
  const [cameraEnabled, setCameraEnabled] = React.useState(false)
  const [pingMs, setPingMs] = React.useState<number | null>(null)
  const [connectionQuality, setConnectionQuality] =
    React.useState<VoiceContextValue['connectionQuality']>('unknown')
  const [micEnabled, setMicEnabled] = React.useState(false)
  const [deafened, setDeafened] = React.useState(false)
  const [screenSharing, setScreenSharing] = React.useState(false)
  const [shareInfo, setShareInfo] = React.useState<ScreenShareInfo | null>(null)

  /**
   * O socket lido por ref.
   *
   * Os handlers do LiveKit sao registrados uma unica vez, dentro do connect. Se
   * avisassem o servidor pelo `socket` capturado ali, uma reconexao trocaria a
   * instancia e o aviso de "parei de compartilhar" iria pro lugar nenhum — a
   * bolinha vermelha de quem transmite ficaria acesa pra sempre na barra dos
   * outros.
   */
  const socketRef = React.useRef(socket)
  socketRef.current = socket

  /** Elementos <audio> das faixas remotas ficam fora do React. */
  const audioSinkRef = React.useRef<HTMLDivElement | null>(null)
  const roomRef = React.useRef<Room | null>(null)
  const deafenedRef = React.useRef(false)

  /**
   * Mudo POR ESCOLHA — o que a barra lateral dos outros mostra.
   *
   * Separado de `micEnabled` porque o push-to-talk liga e desliga a faixa o
   * tempo todo: usar o estado da faixa faria o icone de mudo piscar a cada
   * frase de quem fala com tecla.
   */
  const selfMutedRef = React.useRef(false)
  const leavingRef = React.useRef(false)

  /**
   * Processamento do microfone (ganho + noise gate), ver lib/audio-processor.
   *
   * Dois processadores possíveis, nunca os dois ao mesmo tempo com o mesmo
   * papel: o da CALL nasce no join e morre no leave — é a faixa publicada no
   * LiveKit. O AVULSO só existe fora da call, enquanto a tela de configurações
   * pede (holdMicMonitor / micTest), pra o medidor e o teste funcionarem antes
   * de a pessoa entrar em algum canal. O medidor lê o que estiver vivo.
   */
  const callProcessorRef = React.useRef<MicProcessor | null>(null)
  const standaloneProcessorRef = React.useRef<MicProcessor | null>(null)
  const [monitorHolds, setMonitorHolds] = React.useState(0)
  const [micTestActive, setMicTestActive] = React.useState(false)
  /** Incrementa quando um processador nasce ou morre — o loopback reanexa. */
  const [processorEpoch, setProcessorEpoch] = React.useState(0)

  /**
   * QUEM ESTÁ FALANDO, medido aqui (ver lib/speaking-detector).
   *
   * Fica em ref e não em estado: quem guarda o resultado é a lista de
   * participantes, que já é estado. O detector só avisa que mudou.
   */
  const speakingRef = React.useRef<SpeakingDetector | null>(null)
  /** Guardado à parte porque o `syncParticipants` roda antes da sala existir. */
  const roomForSyncRef = React.useRef<Room | null>(null)

  const speakingDetector = React.useCallback((): SpeakingDetector => {
    if (!speakingRef.current) {
      speakingRef.current = createSpeakingDetector(() => {
        const current = roomForSyncRef.current
        if (current) syncParticipantsRef.current(current)
      })
    }
    return speakingRef.current
  }, [])

  /**
   * ASSINATURA SOB DEMANDA (ver lib/screen-share-policy).
   *
   * A sala conecta com `autoSubscribe: false`. Cada publicacao remota passa
   * por `shouldSubscribe`: microfone e camera sempre; video e audio da tela
   * so pra quem eu estou assistindo — e o video so com a janela visivel.
   *
   * `watchingRef` e a identidade de quem eu estou assistindo (uma por vez) e
   * `hiddenRef` espelha `document.visibilityState`. Os dois sao refs porque
   * quem le e o handler de TrackPublished, registrado uma unica vez.
   */
  const watchingRef = React.useRef<string | null>(null)
  const hiddenRef = React.useRef(document.visibilityState === 'hidden')

  const applySubscription = React.useCallback(
    (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      const wanted = shouldSubscribe(
        { source: publication.source, kind: publication.kind },
        { watching: watchingRef.current === participant.identity, hidden: hiddenRef.current }
      )
      // `isDesired` e o que ESTE cliente pediu; sem a comparacao cada
      // sincronizacao mandaria um UpdateSubscription redundante pro servidor.
      if (publication.isDesired !== wanted) publication.setSubscribed(wanted)
    },
    []
  )

  const applyAllSubscriptions = React.useCallback(
    (current: Room) => {
      for (const participant of current.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          applySubscription(publication, participant)
        }
      }
    },
    [applySubscription]
  )

  /**
   * Feeds nascem da PUBLICACAO. `track` entra no TrackSubscribed e sai no
   * TrackUnsubscribed; `watching` acompanha o pedido, nao a chegada — assim o
   * palco mostra "carregando" entre o clique e o primeiro quadro.
   */
  const upsertRemoteFeed = React.useCallback(
    (participant: RemoteParticipant, patch: Partial<ScreenShareFeed> = {}) => {
      const meta = readMetadata(participant)
      const videoPub = participant.getTrackPublication(Track.Source.ScreenShare)
      const audioPub = participant.getTrackPublication(Track.Source.ScreenShareAudio)
      setScreenShares((prev) => {
        const existing = prev.find((s) => s.identity === participant.identity)
        const rest = prev.filter((s) => s.identity !== participant.identity)
        const feed: ScreenShareFeed = {
          identity: participant.identity,
          name: meta.displayName || participant.name || participant.identity,
          track: existing?.track ?? null,
          watching: watchingRef.current === participant.identity,
          hasAudio: !!audioPub,
          isLocal: false,
          ...patch
        }
        // Sem publicacao de video nao tem feed — o audio sozinho nao e "tela".
        if (!videoPub) return rest
        // Antes das suas: quem entra numa call pra assistir quer ver a
        // tela do outro, nao a propria.
        const localIndex = rest.findIndex((s) => s.isLocal)
        if (localIndex === -1) return [...rest, feed]
        return [...rest.slice(0, localIndex), feed, ...rest.slice(localIndex)]
      })
    },
    []
  )

  const watchScreen = React.useCallback(
    (identity: string) => {
      const current = roomRef.current
      if (!current) return
      if (identity === current.localParticipant.identity) return
      const previous = watchingRef.current
      watchingRef.current = identity
      if (previous && previous !== identity) {
        const before = current.remoteParticipants.get(previous)
        if (before) upsertRemoteFeed(before, { watching: false })
      }
      const participant = current.remoteParticipants.get(identity)
      if (participant) upsertRemoteFeed(participant, { watching: true })
      applyAllSubscriptions(current)
    },
    [applyAllSubscriptions, upsertRemoteFeed]
  )

  const unwatchScreen = React.useCallback(
    (identity?: string) => {
      const previous = watchingRef.current
      if (!previous) return
      if (identity && identity !== previous) return
      watchingRef.current = null
      const current = roomRef.current
      if (!current) return
      const participant = current.remoteParticipants.get(previous)
      if (participant) upsertRemoteFeed(participant, { watching: false })
      // Na hora, nao no proximo evento: e o que libera decodificador e rede
      // enquanto a pessoa ainda esta fechando o painel.
      applyAllSubscriptions(current)
    },
    [applyAllSubscriptions, upsertRemoteFeed]
  )

  /**
   * Janela escondida/minimizada: corta o VIDEO da tela no servidor. Nao e
   * so "pausar": sem assinatura nao chega pacote, nao tem decodificador vivo
   * e a memoria dos buffers vai embora. Voltando, o video e pedido de novo
   * — quem assiste continua assistindo, so pagou o custo de um keyframe.
   */
  React.useEffect(() => {
    const handle = (): void => {
      hiddenRef.current = document.visibilityState === 'hidden'
      const current = roomRef.current
      if (current) applyAllSubscriptions(current)
    }
    document.addEventListener('visibilitychange', handle)
    return () => document.removeEventListener('visibilitychange', handle)
  }, [applyAllSubscriptions])

  /** Configurações de voz por ref, pros efeitos que não devem reagir a slider. */
  const voiceSettingsRef = React.useRef(settings.voice)
  voiceSettingsRef.current = settings.voice

  /** Onde estou e se estou compartilhando — pra reavisar o socket ao reconectar. */
  const channelRef = React.useRef<Channel | null>(null)
  channelRef.current = channel
  const screenSharingRef = React.useRef(false)
  screenSharingRef.current = screenSharing

  /** Para a captura da tela quando ninguem assiste. Vive com a transmissao. */
  const captureGateRef = React.useRef<CaptureGate | null>(null)
  const dropCaptureGate = React.useCallback(() => {
    captureGateRef.current?.destroy()
    captureGateRef.current = null
  }, [])

  /**
   * Volume dos avisos lido por ref: os handlers do LiveKit sao registrados uma
   * vez no connect e nunca mais; se dependessem do estado, ficariam presos ao
   * valor de quando a call comecou.
   */
  const cueVolumeRef = React.useRef(0)
  cueVolumeRef.current = settings.soundEnabled ? settings.soundVolume : 0

  // Entrar/sair da call tem slider proprio (aba Chat). Ja foi porque eram mp3
  // muito mais presentes que os bipes; hoje sao sintetizados como o resto, e o
  // slider fica porque e o aviso que mais toca numa noite — um por pessoa que
  // entra ou sai — e quem joga com a call cheia quer abaixar SO ele.
  const voiceCueVolumeRef = React.useRef(0)
  voiceCueVolumeRef.current = settings.soundEnabled ? settings.voiceCueVolume : 0

  const cue = React.useCallback((name: Parameters<typeof playUiSound>[0]) => {
    const isVoiceCue = name === 'voice-join' || name === 'voice-leave'
    playUiSound(name, isVoiceCue ? voiceCueVolumeRef.current : cueVolumeRef.current)
  }, [])

  /**
   * Conta pro servidor (e por ele pra barra lateral de todo mundo) se estou
   * mudo ou ensurdecido. O canal quem sabe e o servidor — daqui so vai o
   * estado.
   */
  const publishFlags = React.useCallback(() => {
    socketRef.current?.emit('voice:flags', {
      muted: selfMutedRef.current,
      deafened: deafenedRef.current
    })
  }, [])

  /**
   * Entrar/sair toca o som DE QUEM entrou ou saiu — o cosmético `joinSound`
   * comprado na lojinha, que a lista de membros já carrega. A identidade do
   * LiveKit é o id do usuário, então é só olhar em `byId`. Sem som comprado
   * cai no aviso padrão. Refs porque os handlers do LiveKit são registrados
   * uma vez só (ver `cueVolumeRef`).
   */
  const membersRef = React.useRef(byId)
  membersRef.current = byId
  const myJoinSoundRef = React.useRef<string | null | undefined>(user?.joinSound)
  myJoinSoundRef.current = (user && membersRef.current[user.id]?.joinSound) ?? user?.joinSound

  const voiceCue = React.useCallback(
    (phase: 'join' | 'leave', identity?: string) => {
      const sound = identity ? membersRef.current[identity]?.joinSound : myJoinSoundRef.current
      if (sound && playJoinSound(sound, phase, voiceCueVolumeRef.current)) return
      cue(phase === 'join' ? 'voice-join' : 'voice-leave')
    },
    [cue]
  )

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
      setParticipantVolume(participant, effectiveVolume(participant.identity))
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
      const participant = roomRef.current?.remoteParticipants.get(identity)
      if (participant) setParticipantVolume(participant, effectiveVolume(identity))
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

    const detector = speakingRef.current

    const next: VoiceParticipant[] = all.map((p) => {
      const meta = readMetadata(p)
      return {
        identity: p.identity,
        name: meta.displayName || p.name || p.identity,
        avatar: meta.avatar,
        isLocal: p.identity === current.localParticipant.identity,
        // Medição local quando existe (rápida e sem lista de dominantes);
        // pra quem ainda não tem faixa medida, o sinal do servidor — que é
        // o comportamento antigo, e é melhor que anel nenhum.
        isSpeaking: detector?.watching(p.identity)
          ? detector.isSpeaking(p.identity)
          : p.isSpeaking,
        micEnabled: p.isMicrophoneEnabled,
        isScreenSharing: p.isScreenShareEnabled,
        cameraEnabled: p.isCameraEnabled
      }
    })

    // Este sync roda a cada evento da sala (ActiveSpeakersChanged dispara
    // varias vezes por segundo numa conversa). Devolver a MESMA lista quando
    // nada mudou poupa um render da arvore inteira da call — palco, <video>,
    // barra lateral — que estava acontecendo em cima de uma transmissao 60fps.
    setParticipants((prev) => (sameParticipants(prev, next) ? prev : next))

    setMicEnabled(current.localParticipant.isMicrophoneEnabled)
    setScreenSharing(current.localParticipant.isScreenShareEnabled)
    setCameraEnabled(current.localParticipant.isCameraEnabled)
  }, [])

  /**
   * O detector avisa "mudou quem está falando" fora do React, então precisa de
   * uma referência sempre atual pra remontar a lista.
   */
  const syncParticipantsRef = React.useRef(syncParticipants)
  syncParticipantsRef.current = syncParticipants

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
    roomForSyncRef.current = null
    watchingRef.current = null
    dropCaptureGate()
    // O detector segura um AudioContext e um nó por pessoa: sair da call sem
    // desmontar isso deixaria o grafo vivo e medindo silêncio pra sempre.
    speakingRef.current?.destroy()
    speakingRef.current = null
    leavingRef.current = true

    if (current) {
      voiceCue('leave')
      await current.disconnect().catch(() => {})
    }

    // O disconnect para a faixa publicada, mas o grafo de áudio e o mic cru
    // por baixo dela são nossos: sem isso o LED do mic fica aceso e o timer
    // do gate continua rodando pra ninguém.
    callProcessorRef.current?.destroy()
    callProcessorRef.current = null
    setProcessorEpoch((epoch) => epoch + 1)

    // Pela ref, nao pelo `socket` fechado no callback: `leave` e chamada de
    // dentro dos handlers do LiveKit e do menu da bandeja, que foram
    // registrados uma unica vez. Com a instancia capturada, uma saida
    // disparada por ali podia avisar um socket que nao existe mais — e a
    // pessoa ficava pendurada na call pro resto da galera.
    socketRef.current?.emit('leaveVoice')
    socketRef.current?.emit('screenshare:state', { active: false })

    setRoom(null)
    setChannel(null)
    setConnected(false)
    setConnecting(false)
    setParticipants([])
    setScreenShares([])
    setCameras([])
    setMicEnabled(false)
    setScreenSharing(false)
    setCameraEnabled(false)
    setPingMs(null)
    setConnectionQuality('unknown')
    setShareInfo(null)
    setLauncherSilenced(false)
    setDeafened(false)
    deafenedRef.current = false
    selfMutedRef.current = false

    void window.bocas.tray.setVoiceState({ inVoice: false, micMuted: false })
    leavingRef.current = false
  }, [cue, dropCaptureGate])

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
          // Volume por pessoa vai ate 200%. Sem isso o LiveKit escreve direto em
          // <audio>.volume, que o navegador limita a 1 (acima disso da
          // IndexSizeError e o ajuste nao aplica). Com WebAudio o volume vira
          // um GainNode, que aceita > 1. A troca de saida continua funcionando:
          // o SDK chama AudioContext.setSinkId alem do setSinkId dos elementos.
          webAudioMix: true,
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

        next.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
          // So dispara pra quem chega DEPOIS de voce; quem ja estava na sala
          // vem em remoteParticipants no connect, sem evento.
          voiceCue('join', participant.identity)
          syncParticipants(next)
        })
        next.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          voiceCue('leave', participant.identity)
          speakingRef.current?.unwatch(participant.identity)
          if (watchingRef.current === participant.identity) watchingRef.current = null
          setScreenShares((prev) => prev.filter((s) => s.identity !== participant.identity))
          syncParticipants(next)
        })

        /**
         * PUBLICACAO remota: e aqui que a assinatura e decidida (autoSubscribe
         * esta desligado). Microfone e camera entram na hora; a tela vira um
         * card "fulano esta transmitindo" e so e pedida ao servidor depois do
         * clique em "Assistir".
         */
        next.on(
          RoomEvent.TrackPublished,
          (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
            applySubscription(publication, participant)
            if (
              publication.source === Track.Source.ScreenShare ||
              publication.source === Track.Source.ScreenShareAudio
            ) {
              upsertRemoteFeed(participant)
            }
            syncParticipants(next)
          }
        )

        next.on(
          RoomEvent.TrackUnpublished,
          (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
            if (publication.source === Track.Source.ScreenShare) {
              if (watchingRef.current === participant.identity) watchingRef.current = null
            }
            if (
              publication.source === Track.Source.ScreenShare ||
              publication.source === Track.Source.ScreenShareAudio
            ) {
              // getTrackPublication ja nao devolve a faixa removida: o upsert
              // apaga o feed quando o video sumiu e so atualiza hasAudio
              // quando foi o audio.
              upsertRemoteFeed(participant)
            }
            syncParticipants(next)
          }
        )
        next.on(RoomEvent.TrackMuted, () => syncParticipants(next))
        next.on(RoomEvent.TrackUnmuted, () => syncParticipants(next))
        next.on(RoomEvent.ActiveSpeakersChanged, () => syncParticipants(next))
        next.on(RoomEvent.LocalTrackPublished, (publication: LocalTrackPublication) => {
          // A propria transmissao entra no palco como qualquer outra: e o
          // unico jeito de quem compartilha conferir o que foi pro ar.
          if (publication.source === Track.Source.ScreenShare && publication.track) {
            const meta = readMetadata(next.localParticipant)
            const track = publication.track
            setScreenShares((prev) => [
              ...prev.filter((s) => !s.isLocal),
              {
                identity: next.localParticipant.identity,
                name: meta.displayName || next.localParticipant.name || 'Você',
                track,
                watching: true,
                hasAudio: !!next.localParticipant.getTrackPublication(
                  Track.Source.ScreenShareAudio
                ),
                isLocal: true
              }
            ])
          }

          // A propria camera tambem aparece: e o espelho que todo mundo
          // procura antes de ligar a webcam ("ta pegando meu rosto?").
          if (publication.source === Track.Source.Camera && publication.track) {
            const meta = readMetadata(next.localParticipant)
            const track = publication.track
            setCameras((prev) => [
              ...prev.filter((c) => !c.isLocal),
              {
                identity: next.localParticipant.identity,
                name: meta.displayName || next.localParticipant.name || 'Você',
                track,
                isLocal: true
              }
            ])
          }

          syncParticipants(next)
        })

        next.on(RoomEvent.LocalTrackUnpublished, (publication: LocalTrackPublication) => {
          /**
           * A transmissao pode acabar sem passar pelo nosso botao: a janela
           * compartilhada e fechada, o driver de video reinicia, o SFU derruba
           * a faixa. Antes o app continuava mostrando "compartilhando" e a
           * bolinha vermelha ficava acesa na barra lateral dos outros — pra
           * voltar ao normal so saindo da call.
           */
          if (publication.source === Track.Source.ScreenShare) {
            dropCaptureGate()
            setScreenShares((prev) => prev.filter((s) => !s.isLocal))
            setScreenSharing(false)
            setShareInfo(null)
            // Fechar a janela transmitida nao pode deixar o launcher mudo pro
            // resto da noite: e por aqui que a maioria das transmissoes acaba.
            setLauncherSilenced(false)
            socketRef.current?.emit('screenshare:state', { active: false })
          }

          if (publication.source === Track.Source.Camera) {
            setCameras((prev) => prev.filter((c) => !c.isLocal))
            setCameraEnabled(false)
          }

          syncParticipants(next)
        })

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
              setParticipantVolume(participant, effectiveVolume(participant.identity))
              audioSinkRef.current?.appendChild(element)

              // Derivação da faixa pro medidor de voz — é o que faz o anel
              // acender na primeira sílaba em vez de esperar o servidor.
              // Ver lib/speaking-detector.
              if (track.mediaStreamTrack) {
                speakingDetector().watch(
                  participant.identity,
                  new MediaStream([track.mediaStreamTrack])
                )
              }
            }

            if (
              track.kind === Track.Kind.Video &&
              track.source === Track.Source.Camera
            ) {
              const meta = readMetadata(participant)
              setCameras((prev) => [
                ...prev.filter((c) => c.identity !== participant.identity),
                {
                  identity: participant.identity,
                  name: meta.displayName || participant.name || participant.identity,
                  track,
                  isLocal: false
                }
              ])
            }

            if (
              track.kind === Track.Kind.Video &&
              track.source === Track.Source.ScreenShare
            ) {
              // So chega aqui depois do "Assistir": o feed ja existe desde
              // a publicacao, falta a faixa.
              upsertRemoteFeed(participant, { track })
            }

            syncParticipants(next)
          }
        )

        next.on(
          RoomEvent.TrackUnsubscribed,
          (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
            track.detach().forEach((el) => el.remove())

            if (track.kind === Track.Kind.Audio) {
              speakingRef.current?.unwatch(participant.identity)
            }

            if (track.source === Track.Source.ScreenShare) {
              // Desassinar nao e "saiu do ar": a tela continua publicada e
              // o card fica, so sem video (janela minimizada, parei de
              // assistir). Se a publicacao acabou, TrackUnpublished limpa.
              upsertRemoteFeed(participant, { track: null })
            }

            if (track.source === Track.Source.Camera) {
              setCameras((prev) => prev.filter((c) => c.identity !== participant.identity))
            }

            syncParticipants(next)
          }
        )

        next.on(
          RoomEvent.ConnectionQualityChanged,
          (quality: ConnectionQuality, participant: Participant) => {
            // Só a MINHA: a dos outros não cabe nesta barra, e o que a pessoa
            // quer saber é se o problema é dela.
            if (participant.identity !== next.localParticipant.identity) return
            setConnectionQuality(
              quality === 'excellent' || quality === 'good' || quality === 'poor' || quality === 'lost'
                ? quality
                : 'unknown'
            )
          }
        )

        next.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          setConnected(state === ConnectionState.Connected)
        })

        next.on(RoomEvent.Disconnected, () => {
          void leave()
        })

        // autoSubscribe DESLIGADO: e a raiz do lag de quem nao estava nem
        // olhando a tela. Com ele ligado o SFU mandava o video da tela (ate
        // 1080p60, 5 Mbps) pra todo mundo da call no instante da publicacao,
        // e cada cliente decodificava — no meio de uma partida. O que assinar
        // e decidido por publicacao em lib/screen-share-policy.
        await next.connect(credentials.url, credentials.token, { autoSubscribe: false })

        // Quem ja estava na sala nao dispara TrackPublished: assinar o
        // microfone deles (e listar as telas no ar) e por aqui.
        applyAllSubscriptions(next)
        for (const participant of next.remoteParticipants.values()) {
          if (participant.getTrackPublication(Track.Source.ScreenShare)) {
            upsertRemoteFeed(participant)
          }
        }

        // Push-to-talk comeca mudo; voz ativa comeca aberto.
        const startMuted = settings.voice.mode === 'push-to-talk'

        /**
         * O microfone NÃO é o setMicrophoneEnabled(true) do LiveKit: a faixa
         * publicada é a saída do nosso grafo (ganho + noise gate), embrulhada
         * num LocalAudioTrack "fornecido pelo usuário". Pro LiveKit ela é um
         * mic comum com source=Microphone — então setMicrophoneEnabled,
         * isMicrophoneEnabled, PTT e mute continuam funcionando em cima dela
         * (mute/unmute só ligam e desligam a faixa; user-provided nunca é
         * parada nem readquirida pelo SDK).
         *
         * Muta ANTES de publicar quando é PTT: publicar e mutar depois abriria
         * uma janela de alguns quadros com o mic no ar.
         */
        try {
          const processor = await createMicProcessor({
            deviceId:
              settings.voice.inputDeviceId !== 'default'
                ? settings.voice.inputDeviceId
                : undefined,
            echoCancellation: settings.voice.echoCancellation,
            noiseSuppression: settings.voice.noiseSuppression,
            autoGainControl: settings.voice.autoGainControl,
            inputGain: settings.voice.inputGain,
            noiseGateThreshold: settings.voice.noiseGateThreshold,
            rumbleFilter: settings.voice.rumbleFilter
          })
          callProcessorRef.current?.destroy()
          callProcessorRef.current = processor
          setProcessorEpoch((epoch) => epoch + 1)

          // O SEU anel sai da faixa processada — a que sai daqui depois do
          // ganho e do portão. Portão fechado é silêncio pros outros, então
          // tem que ser silêncio no seu anel também.
          speakingDetector().watch(next.localParticipant.identity, processor.processedStream)

          const micTrack = new LocalAudioTrack(processor.processedTrack, undefined, true)
          if (startMuted) await micTrack.mute()

          await next.localParticipant.publishTrack(micTrack, {
            source: Track.Source.Microphone,
            name: 'microphone',
            // Repetidos aqui (e não só em publishDefaults) porque é o gate que
            // torna o DTX útil: gate fechado = silêncio digital = Opus para de
            // mandar pacote. Com o mic cru o DTX quase nunca engatava.
            dtx: true,
            red: true,
            audioPreset: { maxBitrate: 48_000 }
          })
        } catch (err) {
          // Sem permissão, sem mic, AudioContext falhou… a call ainda tem que
          // acontecer: cai pro mic cru do LiveKit, sem ganho e sem gate.
          console.warn('[voice] processamento do mic falhou, publicando o mic cru', err)
          callProcessorRef.current?.destroy()
          callProcessorRef.current = null
          await next.localParticipant.setMicrophoneEnabled(!startMuted)
        }

        if (settings.voice.outputDeviceId !== 'default') {
          await next.switchActiveDevice('audiooutput', settings.voice.outputDeviceId).catch(
            () => {}
          )
        }

        roomRef.current = next
        roomForSyncRef.current = next
        setRoom(next)
        setConnected(true)
        syncParticipants(next)

        voiceCue('join')

        // Só agora o servidor sabe em que sala mandar soundboard e nudge.
        socketRef.current?.emit('joinVoice', target.id)
        // Entrar mudo (push-to-talk ou nao) so conta como ESCOLHA fora do PTT.
        selfMutedRef.current = startMuted && settings.voice.mode !== 'push-to-talk'
        publishFlags()

        void window.bocas.tray.setVoiceState({ inVoice: true, micMuted: startMuted })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao entrar na call')
        setChannel(null)
      } finally {
        setConnecting(false)
      }
    },
    [
      token,
      leave,
      settings.voice,
      syncParticipants,
      cue,
      effectiveVolume,
      publishFlags,
      applySubscription,
      applyAllSubscriptions,
      upsertRemoteFeed,
      dropCaptureGate
    ]
  )

  const setMic = React.useCallback(
    async (enabled: boolean, opts?: { transient?: boolean }) => {
      const current = roomRef.current
      if (!current) return
      await current.localParticipant.setMicrophoneEnabled(enabled)
      setMicEnabled(enabled)
      cue(enabled ? 'unmute' : 'mute')
      void window.bocas.tray.setVoiceState({ inVoice: true, micMuted: !enabled })

      if (!opts?.transient) {
        selfMutedRef.current = !enabled
        publishFlags()
      }
    },
    [cue, publishFlags]
  )

  const toggleMic = React.useCallback(async () => {
    const current = roomRef.current
    if (!current) return
    await setMic(!current.localParticipant.isMicrophoneEnabled)
  }, [setMic])

  /**
   * Ensurdecer com valor explícito.
   *
   * Existe porque quem chama de fora nem sempre quer ALTERNAR: o "Volto
   * logo!" quer DESLIGAR o som, e um toggle ali desligaria pra quem estava
   * ouvindo e LIGARIA de volta pra quem já tinha ensurdecido antes de sair.
   */
  const setDeafen = React.useCallback(
    (value: boolean) => {
      setDeafened((prev) => {
        if (prev === value) return prev
        applyDeafen(value)
        cue(value ? 'deafen' : 'undeafen')
        // Ensurdecer sem mutar o proprio mic e o comportamento errado: quem nao
        // ouve ninguem tambem nao deveria estar falando.
        if (value) void setMic(false)
        else publishFlags()
        return value
      })
    },
    [applyDeafen, setMic, cue, publishFlags]
  )

  const toggleDeafen = React.useCallback(() => {
    setDeafen(!deafenedRef.current)
  }, [setDeafen])

  /**
   * Liga e desliga a webcam.
   *
   * Resolucao modesta de proposito: numa call de 6 pessoas o gargalo e o
   * upload de quem transmite, e rosto em 720p nao acrescenta nada sobre 480p —
   * ao contrario da tela, onde texto pequeno exige resolucao.
   */
  /**
   * PING E QUALIDADE.
   *
   * A qualidade vem de graça: o LiveKit já calcula e avisa por evento. O
   * NÚMERO em ms não — pra isso é `getStats()` do WebRTC, lendo o par de
   * candidatos em uso (`candidate-pair` com `state: 'succeeded'`), que é o
   * único lugar onde o RTT real aparece.
   *
   * Por que passar pelo `engine.pcManager`, que é interno do SDK: o
   * livekit-client 2.x não expõe a RTCPeerConnection nem um `getStats()`
   * público. A alternativa seria estimar o ping por outro caminho (o socket da
   * nossa API, por exemplo) — mas aquele mede outro servidor, em outra
   * máquina, e mostraria um número que não tem nada a ver com a call. Melhor
   * um acesso interno com guarda do que um número honesto sobre a coisa
   * errada. Se o SDK mudar por dentro, `pingMs` fica null e a barra volta a
   * mostrar só a qualidade — nada quebra.
   *
   * A cada 3s: RTT muda devagar, e o custo é uma varredura de estatísticas.
   */
  React.useEffect(() => {
    if (!connected) return

    let cancelled = false

    const read = async (): Promise<void> => {
      const room = roomRef.current
      if (!room || cancelled) return

      const engine = (room as unknown as {
        engine?: {
          pcManager?: {
            publisher?: { getStats?: () => Promise<RTCStatsReport> }
            subscriber?: { getStats?: () => Promise<RTCStatsReport> }
          }
        }
      }).engine

      const connections = [engine?.pcManager?.publisher, engine?.pcManager?.subscriber]

      for (const pc of connections) {
        if (!pc?.getStats) continue
        try {
          const report = await pc.getStats()
          if (cancelled) return

          let rtt: number | null = null
          report.forEach((entry) => {
            const stat = entry as { type?: string; state?: string; currentRoundTripTime?: number }
            if (
              stat.type === 'candidate-pair' &&
              stat.state === 'succeeded' &&
              typeof stat.currentRoundTripTime === 'number'
            ) {
              rtt = Math.round(stat.currentRoundTripTime * 1000)
            }
          })

          if (rtt !== null) {
            setPingMs(rtt)
            return
          }
        } catch {
          // Conexão fechando no meio da leitura: tenta na próxima volta.
        }
      }
    }

    void read()
    const timer = setInterval(() => void read(), 3_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [connected])

  const toggleCamera = React.useCallback(async () => {
    const current = roomRef.current
    if (!current) return

    const next = !current.localParticipant.isCameraEnabled
    const chosen = voiceSettingsRef.current.cameraDeviceId

    try {
      await current.localParticipant.setCameraEnabled(next, {
        resolution: { width: 640, height: 480, frameRate: 24 },
        // `deviceId` só quando a pessoa escolheu uma: 'default' significa
        // "o que o sistema entregar", e mandar isso como deviceId faria o
        // Chromium procurar um dispositivo chamado literalmente "default".
        ...(chosen && chosen !== 'default' ? { deviceId: chosen } : {})
      })
      setCameraEnabled(next)
      if (!next) setCameras((prev) => prev.filter((c) => !c.isLocal))
    } catch (err) {
      // Webcam ocupada por outro programa (ou sem permissao) e o caso comum.
      setError(err instanceof Error ? err.message : 'Não consegui abrir a câmera')
    }
  }, [])

  /** O gate encerra a transmissao se a fonte sumir; a funcao nasce abaixo. */
  const stopScreenShareRef = React.useRef<() => Promise<void>>(async () => {})

  const startScreenShare = React.useCallback(
    async (
      sourceId: string,
      options: {
        withAudio?: boolean
        quality?: ScreenQuality
        content?: ScreenContent
        sourceName?: string
        muteLauncher?: boolean
        idleWhenUnwatched?: boolean
      } = {}
    ) => {
      const current = roomRef.current
      if (!current) return

      const withAudio = options.withAudio ?? true
      const quality = options.quality ?? '720p30'
      const preset = SCREEN_QUALITY[quality]
      const profile = encoderProfile(options.content ?? 'game')
      const muteLauncher = withAudio && (options.muteLauncher ?? true)

      // O main so libera getDisplayMedia se a fonte estiver marcada antes.
      await window.bocas.screen.selectSource(sourceId, withAudio)

      // ANTES de capturar: o silencio precisa valer no primeiro quadro de
      // audio, senao o aviso de "comecou a transmitir" entra na propria
      // transmissao. Ver lib/launcher-silence.
      setLauncherSilenced(muteLauncher)

      try {
        await current.localParticipant.setScreenShareEnabled(
          true,
          {
            audio: withAudio ? SCREEN_AUDIO_CONSTRAINTS : false,
            resolution: {
              width: preset.width,
              height: preset.height,
              frameRate: preset.frameRate
            },
            // 'motion' pra jogo, 'detail' pra texto — ver encoderProfile.
            contentHint: profile.contentHint
          },
          {
            videoEncoding: {
              maxBitrate: preset.maxBitrate,
              maxFramerate: preset.frameRate
            },
            /**
             * H.264 em vez do VP8 padrao do LiveKit.
             *
             * No Windows o Chromium codifica E decodifica H.264 na GPU (Media
             * Foundation / D3D11); VP8 e software nos dois lados. Com VP8 o
             * encoder de 1080p disputava os nucleos com o jogo de quem
             * transmite, e cada espectador pagava um decodificador em
             * software. O SFU nao transcodifica — se algum cliente nao souber
             * H.264 o LiveKit pede o codec reserva (VP8) so pra ele.
             */
            videoCodec: 'h264',
            degradationPreference: profile.degradationPreference,
            // Duas camadas (original + ~360p a 3 fps): a miniatura e a janela
            // pequena recebem a menor, sem o custo de um segundo encoder
            // pesado — a camada baixa e barata de codificar.
            simulcast: true,
            // O audio da tela e MUSICA/JOGO, nao voz: o preset da call (48k
            // mono, que serve pra fala) espremia trilha e efeito. O LiveKit
            // percebe sozinho que a faixa e estereo (channelCount 2 nas
            // constraints) e ja desliga DTX e RED, que nao valem pra isso.
            audioPreset: SCREEN_AUDIO_PRESET[quality]
          }
        )

        setScreenSharing(true)
        setShareInfo({
          sourceName: options.sourceName ?? 'Sua tela',
          quality,
          withAudio,
          muteLauncher,
          startedAt: Date.now(),
          capture: 'live'
        })
        socketRef.current?.emit('screenshare:state', { active: true })

        // Ninguem assistindo = captura parada (o encoder o dynacast ja
        // parava). Ver lib/screen-capture-gate.
        dropCaptureGate()
        if (options.idleWhenUnwatched ?? true) {
          captureGateRef.current = createCaptureGate({
            room: current,
            sourceId,
            resolution: {
              width: preset.width,
              height: preset.height,
              frameRate: preset.frameRate
            },
            contentHint: profile.contentHint,
            onStateChange: (capture) => {
              setShareInfo((prev) => (prev ? { ...prev, capture } : prev))
            },
            onLost: () => {
              void stopScreenShareRef.current()
            }
          })
        }
      } catch (err) {
        await window.bocas.screen.cancelSelection()
        // Falhou no meio: o launcher nao pode ficar mudo por causa de uma
        // transmissao que nem chegou a existir.
        setLauncherSilenced(false)
        setError(err instanceof Error ? err.message : 'Erro ao compartilhar tela')
        throw err
      }
    },
    [dropCaptureGate]
  )

  const stopScreenShare = React.useCallback(async () => {
    const current = roomRef.current
    if (!current) return
    dropCaptureGate()
    await current.localParticipant.setScreenShareEnabled(false)
    setLauncherSilenced(false)
    setScreenSharing(false)
    setShareInfo(null)
    // O feed local sai na hora: esperar o LocalTrackUnpublished deixaria o
    // palco com uma imagem congelada por um instante depois do clique.
    setScreenShares((prev) => prev.filter((s) => !s.isLocal))
    socketRef.current?.emit('screenshare:state', { active: false })
  }, [dropCaptureGate])
  stopScreenShareRef.current = stopScreenShare

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
      // O servidor perdeu o estado com a conexao: mudo e ensurdecido voltam junto.
      publishFlags()
    }

    socket.on('connect', handleConnect)
    return () => {
      socket.off('connect', handleConnect)
    }
  }, [socket, publishFlags])

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

  // ============================================
  // PROCESSAMENTO DO MIC: medidor, teste e ajustes ao vivo
  // ============================================

  const getMicLevel = React.useCallback((): number => {
    const processor = callProcessorRef.current ?? standaloneProcessorRef.current
    return processor?.getLevel() ?? 0
  }, [])

  const isMicGateOpen = React.useCallback((): boolean => {
    const processor = callProcessorRef.current ?? standaloneProcessorRef.current
    return processor?.isOpen() ?? false
  }, [])

  const holdMicMonitor = React.useCallback((): (() => void) => {
    setMonitorHolds((count) => count + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      setMonitorHolds((count) => Math.max(0, count - 1))
    }
  }, [])

  // Ganho, limiar e corte de grave valem NA HORA, na call e no avulso: é o
  // único jeito de ajustar olhando o medidor. Dispositivo e filtros do
  // Chromium continuam valendo só na próxima entrada — trocar exige readquirir
  // o mic.
  React.useEffect(() => {
    const patch = {
      inputGain: settings.voice.inputGain,
      noiseGateThreshold: settings.voice.noiseGateThreshold,
      rumbleFilter: settings.voice.rumbleFilter
    }
    callProcessorRef.current?.update(patch)
    standaloneProcessorRef.current?.update(patch)
  }, [
    settings.voice.inputGain,
    settings.voice.noiseGateThreshold,
    settings.voice.rumbleFilter
  ])

  /**
   * Processador avulso: existe enquanto alguém segura o monitor (ou o teste
   * está ligado) e NÃO há call. Assim que a call conecta, morre — o medidor
   * passa a ler a faixa publicada, que é a que importa.
   *
   * Recriado ao trocar de microfone ou de filtro: é justamente na tela de
   * configurações que a pessoa troca de mic e quer ver o medidor acompanhar.
   */
  const needStandalone = (monitorHolds > 0 || micTestActive) && !connected

  React.useEffect(() => {
    if (!needStandalone) return

    let cancelled = false
    let mine: MicProcessor | null = null
    const voice = voiceSettingsRef.current

    void createMicProcessor({
      deviceId: voice.inputDeviceId !== 'default' ? voice.inputDeviceId : undefined,
      echoCancellation: voice.echoCancellation,
      noiseSuppression: voice.noiseSuppression,
      autoGainControl: voice.autoGainControl,
      inputGain: voice.inputGain,
      noiseGateThreshold: voice.noiseGateThreshold,
      rumbleFilter: voice.rumbleFilter
    })
      .then((processor) => {
        // A tela fechou (ou a call entrou) antes do getUserMedia responder.
        if (cancelled) {
          processor.destroy()
          return
        }
        mine = processor
        standaloneProcessorRef.current = processor
        setProcessorEpoch((epoch) => epoch + 1)
      })
      .catch((err) => {
        console.warn('[voice] não consegui abrir o mic pro medidor', err)
      })

    return () => {
      cancelled = true
      mine?.destroy()
      if (standaloneProcessorRef.current === mine) standaloneProcessorRef.current = null
      setProcessorEpoch((epoch) => epoch + 1)
    }
  }, [
    needStandalone,
    settings.voice.inputDeviceId,
    settings.voice.echoCancellation,
    settings.voice.noiseSuppression,
    settings.voice.autoGainControl
  ])

  /**
   * Loopback do teste: a faixa processada vai pra um <audio> apontado pra
   * saída escolhida. Depende do epoch porque o processador por baixo troca
   * (entrou na call, trocou de mic) e o elemento precisa apontar pro novo.
   */
  React.useEffect(() => {
    if (!micTestActive) return

    const processor = callProcessorRef.current ?? standaloneProcessorRef.current
    if (!processor) return

    const audio = document.createElement('audio')
    audio.srcObject = processor.processedStream
    audio.dataset.bocas = 'mic-test'
    audioSinkRef.current?.appendChild(audio)

    const outputId = voiceSettingsRef.current.outputDeviceId
    const route =
      outputId !== 'default' && typeof audio.setSinkId === 'function'
        ? audio.setSinkId(outputId).catch(() => {})
        : Promise.resolve()

    void route.then(() => audio.play()).catch(() => {})

    return () => {
      audio.pause()
      audio.srcObject = null
      audio.remove()
    }
  }, [micTestActive, processorEpoch, settings.voice.outputDeviceId])

  // Logout (o provider desmonta) não pode deixar mic aberto nem timer rodando.
  React.useEffect(() => {
    return () => {
      callProcessorRef.current?.destroy()
      callProcessorRef.current = null
      standaloneProcessorRef.current?.destroy()
      standaloneProcessorRef.current = null
    }
  }, [])

  const micTest = React.useMemo(
    () => ({
      start: () => setMicTestActive(true),
      stop: () => setMicTestActive(false),
      active: micTestActive
    }),
    [micTestActive]
  )

  // `await __voiceStats()` no DevTools: codec, fps, GPU ou CPU, perda, bitrate.
  React.useEffect(() => exposeVoiceStats(room), [room])

  const value = React.useMemo<VoiceContextValue>(
    () => ({
      room,
      channel,
      connected,
      connecting,
      error,
      participants,
      screenShares,
      cameras,
      micEnabled,
      cameraEnabled,
      deafened,
      pingMs,
      connectionQuality,
      screenSharing,
      shareInfo,
      userVolumes,
      setUserVolume,
      userVolume,
      join,
      leave,
      toggleMic,
      setMic,
      toggleDeafen,
      setDeafen,
      toggleCamera,
      startScreenShare,
      stopScreenShare,
      watchScreen,
      unwatchScreen,
      getMicLevel,
      isMicGateOpen,
      holdMicMonitor,
      micTest
    }),
    [
      room,
      channel,
      connected,
      connecting,
      error,
      participants,
      screenShares,
      cameras,
      micEnabled,
      cameraEnabled,
      deafened,
      screenSharing,
      shareInfo,
      userVolumes,
      setUserVolume,
      userVolume,
      join,
      leave,
      toggleMic,
      setMic,
      toggleDeafen,
      setDeafen,
      toggleCamera,
      startScreenShare,
      stopScreenShare,
      watchScreen,
      unwatchScreen,
      getMicLevel,
      isMicGateOpen,
      holdMicMonitor,
      micTest,
      // Faltavam: sem eles o ping e a qualidade so atualizavam de carona em
      // outro evento da sala.
      pingMs,
      connectionQuality
    ]
  )

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>
}

export function useVoice(): VoiceContextValue {
  const ctx = React.useContext(VoiceContext)
  if (!ctx) throw new Error('useVoice must be used within a VoiceProvider')
  return ctx
}
