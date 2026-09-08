import * as React from 'react'
import {
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication
} from 'livekit-client'
import { useAuth } from './auth-context'
import { useSocket } from './socket-context'
import { useSettings } from './settings-context'
import { useVoice } from './voice-context'
import { useChat } from './chat-context'
import { playUiSound } from './ui-sounds'
import { clips as clipsApi, type Clip } from './api-clips'
import { createClipRecorder, type Capture, type ClipRecorder } from './clip-recorder'

/**
 * CLIPES DA CALL.
 *
 * Este contexto faz três coisas separadas:
 *
 *   1. ALIMENTA o buffer rolante (lib/clip-recorder.ts) com o áudio de todo
 *      mundo da call, enquanto a call durar;
 *   2. CAPTURA sob demanda e segura o resultado em `pending`, sem enviar
 *      nada — quem envia é a tela de confirmação (ClipComposer);
 *   3. mantém a LISTA de clipes salvos, que o painel desenha.
 *
 * ## Por que a captura não salva direto
 *
 * O atalho é global e serve pra ser apertado por reflexo, no meio do jogo.
 * Um reflexo erra: sem uma confirmação, metade dos clipes do acervo seriam
 * dedos pesados. A tela de confirmação é o custo mínimo (dois cliques) que
 * separa "quis clipar" de "encostei na tecla".
 *
 * ## Por que ele monta o próprio grafo em vez de pegar do voice-context
 *
 * Porque o que o `<audio>` de cada pessoa toca já passou pelo volume
 * individual que VOCÊ ajustou. Um clipe montado a partir dali sairia com o
 * amigo que você abaixou quase inaudível pra todo mundo. A mistura do clipe
 * vem das faixas cruas, antes disso.
 */

export interface PendingClip extends Capture {
  /** URL de objeto pro player da confirmação. Revogada ao descartar/salvar. */
  previewUrl: string
  participants: string[]
  channelId: string | null
  at: number
}

interface ClipContextValue {
  /** Dá pra clipar agora? (buffer ligado, na call, e já com áudio suficiente) */
  canClip: boolean
  /** Quantos ms o buffer já tem. Vira a dica "pega os últimos 24s". */
  bufferedMs: number

  /** Captura os últimos segundos e abre a confirmação. */
  capture: () => Promise<void>
  pending: PendingClip | null
  discard: () => void
  save: (title: string) => Promise<Clip>
  saving: boolean

  clips: Clip[]
  loading: boolean
  refresh: () => Promise<void>
  remove: (id: string) => Promise<void>

  /** Erro da última tentativa, pra tela mostrar. */
  error: string | null
}

const ClipContext = React.createContext<ClipContextValue | null>(null)

/** De quanto em quanto a tela relê o tamanho do buffer. */
const BUFFER_TICK_MS = 1_000

export function ClipProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  const { socket } = useSocket()
  const { settings } = useSettings()
  const voice = useVoice()
  const { activeChannelId, textChannels } = useChat()

  const [pending, setPending] = React.useState<PendingClip | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [clips, setClips] = React.useState<Clip[]>([])
  const [loading, setLoading] = React.useState(true)
  const [bufferedMs, setBufferedMs] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)

  const recorderRef = React.useRef<ClipRecorder | null>(null)

  const enabled = settings.clipBuffer
  const room = voice.room
  const connected = voice.connected

  // Refs pro atalho global, que é registrado uma vez e não pode depender de
  // valores fechados num render antigo.
  const participantsRef = React.useRef(voice.participants)
  participantsRef.current = voice.participants
  const voiceChannelRef = React.useRef(voice.channel?.id ?? null)
  voiceChannelRef.current = voice.channel?.id ?? null

  // ------------------------------------------------------------------
  // O gravador: nasce ao entrar na call, morre ao sair
  // ------------------------------------------------------------------

  React.useEffect(() => {
    if (!enabled || !connected || !room) {
      recorderRef.current?.destroy()
      recorderRef.current = null
      setBufferedMs(0)
      return
    }

    const recorder = createClipRecorder()
    recorderRef.current = recorder

    /** Qualquer faixa de áudio entra: voz, e também o som da tela compartilhada. */
    const addTrack = (key: string, track: { mediaStreamTrack?: MediaStreamTrack }): void => {
      if (!track.mediaStreamTrack) return
      recorder.add(key, new MediaStream([track.mediaStreamTrack]))
    }

    /**
     * O que já está tocando quando este efeito roda.
     *
     * O provider pode montar DEPOIS de a call estabelecer (troca de aba, ou
     * a ordem dos providers no App). Sem esta varredura inicial, o buffer só
     * teria quem entrasse na sala a partir de agora — e o clipe sairia com
     * meia conversa.
     */
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        if (publication.kind !== Track.Kind.Audio) continue
        if (publication.track) {
          addTrack(`${participant.identity}:${publication.trackSid}`, publication.track)
        }
      }
    }
    for (const publication of room.localParticipant.trackPublications.values()) {
      if (publication.kind !== Track.Kind.Audio) continue
      if (publication.track) addTrack(`me:${publication.trackSid}`, publication.track)
    }

    const onSubscribed = (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ): void => {
      if (track.kind !== Track.Kind.Audio) return
      addTrack(`${participant.identity}:${publication.trackSid}`, track)
    }

    const onUnsubscribed = (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ): void => {
      if (track.kind !== Track.Kind.Audio) return
      recorder.remove(`${participant.identity}:${publication.trackSid}`)
    }

    /**
     * O SEU microfone entra pela faixa PUBLICADA, não pelo mic cru.
     *
     * A publicada é a que já passou pelo ganho e pelo portão de ruído (ver
     * lib/audio-processor.ts) — ou seja, exatamente o que os outros ouviram.
     * Um clipe em que você aparece mais alto do que apareceu na call seria
     * uma memória falsa.
     */
    const onLocalPublished = (publication: LocalTrackPublication): void => {
      if (publication.kind !== Track.Kind.Audio || !publication.track) return
      addTrack(`me:${publication.trackSid}`, publication.track)
    }

    const onLocalUnpublished = (publication: LocalTrackPublication): void => {
      if (publication.kind !== Track.Kind.Audio) return
      recorder.remove(`me:${publication.trackSid}`)
    }

    const onDisconnected = (participant: Participant): void => {
      // Faixas somem uma a uma pelo `TrackUnsubscribed`, mas uma queda seca
      // pode não emitir todas. Limpa o que sobrou pelo prefixo.
      for (const publication of participant.trackPublications.values()) {
        recorder.remove(`${participant.identity}:${publication.trackSid}`)
      }
    }

    room.on(RoomEvent.TrackSubscribed, onSubscribed)
    room.on(RoomEvent.TrackUnsubscribed, onUnsubscribed)
    room.on(RoomEvent.LocalTrackPublished, onLocalPublished)
    room.on(RoomEvent.LocalTrackUnpublished, onLocalUnpublished)
    room.on(RoomEvent.ParticipantDisconnected, onDisconnected)

    const tick = window.setInterval(() => setBufferedMs(recorder.bufferedMs()), BUFFER_TICK_MS)

    return () => {
      window.clearInterval(tick)
      room.off(RoomEvent.TrackSubscribed, onSubscribed)
      room.off(RoomEvent.TrackUnsubscribed, onUnsubscribed)
      room.off(RoomEvent.LocalTrackPublished, onLocalPublished)
      room.off(RoomEvent.LocalTrackUnpublished, onLocalUnpublished)
      room.off(RoomEvent.ParticipantDisconnected, onDisconnected)
      recorder.destroy()
      if (recorderRef.current === recorder) recorderRef.current = null
      setBufferedMs(0)
    }
  }, [enabled, connected, room])

  // ------------------------------------------------------------------
  // Lista
  // ------------------------------------------------------------------

  const refresh = React.useCallback(async () => {
    if (!token) return
    try {
      setClips(await clipsApi.list(token, { limit: 50 }))
    } catch {
      // Servidor antigo (sem /api/clips) ou fora do ar: fica sem acervo, e o
      // resto do app continua.
      setClips([])
    } finally {
      setLoading(false)
    }
  }, [token])

  React.useEffect(() => {
    if (!token) {
      setClips([])
      setLoading(false)
      return
    }
    void refresh()
  }, [token, refresh])

  React.useEffect(() => {
    if (!socket) return

    const onCreated = (data: { clip?: Clip }): void => {
      if (!data?.clip) return
      setClips((prev) => (prev.some((c) => c.id === data.clip!.id) ? prev : [data.clip!, ...prev]))
    }
    const onRemoved = (data: { clipId?: string }): void => {
      setClips((prev) => prev.filter((c) => c.id !== data?.clipId))
    }

    socket.on('clip:created', onCreated)
    socket.on('clip:removed', onRemoved)
    return () => {
      socket.off('clip:created', onCreated)
      socket.off('clip:removed', onRemoved)
    }
  }, [socket])

  // ------------------------------------------------------------------
  // Capturar / salvar / descartar
  // ------------------------------------------------------------------

  const revoke = React.useCallback((clip: PendingClip | null) => {
    if (clip) URL.revokeObjectURL(clip.previewUrl)
  }, [])

  const capture = React.useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder) {
      setError('Entra numa call primeiro.')
      return
    }

    const shot = await recorder.capture()
    if (!shot) {
      setError('O buffer ainda está enchendo. Tenta de novo em alguns segundos.')
      return
    }

    setError(null)
    playUiSound('mention', settings.soundEnabled ? settings.soundVolume : 0)

    setPending((previous) => {
      // Clipou de novo antes de resolver o anterior: o novo ganha, e a URL do
      // antigo é solta na hora pra não vazar o blob.
      revoke(previous)
      return {
        ...shot,
        previewUrl: URL.createObjectURL(shot.blob),
        participants: participantsRef.current.map((p) => p.identity),
        channelId: voiceChannelRef.current,
        at: Date.now()
      }
    })
  }, [revoke, settings.soundEnabled, settings.soundVolume])

  const discard = React.useCallback(() => {
    setPending((previous) => {
      revoke(previous)
      return null
    })
    setError(null)
  }, [revoke])

  /**
   * Onde o card do clipe é postado.
   *
   * O canal ativo, quando é de texto. Quem clipa está quase sempre no palco
   * da call (não num canal de texto), então o plano B é o primeiro canal de
   * texto do servidor — melhor um card no #geral do que um clipe que só
   * existe no painel.
   */
  const postChannelId = React.useMemo(() => {
    const active = activeChannelId && !activeChannelId.startsWith('dm:') ? activeChannelId : null
    if (active && textChannels.some((c) => c.id === active)) return active
    return textChannels[0]?.id ?? null
  }, [activeChannelId, textChannels])

  const save = React.useCallback(
    async (title: string) => {
      if (!token) throw new Error('Sem sessão')
      const current = pending
      if (!current) throw new Error('Nenhum clipe pra salvar')

      setSaving(true)
      try {
        const clip = await clipsApi.save(token, {
          blob: current.blob,
          durationMs: current.durationMs,
          title: title.trim() || undefined,
          participants: current.participants,
          channelId: current.channelId,
          postChannelId
        })
        setClips((prev) => (prev.some((c) => c.id === clip.id) ? prev : [clip, ...prev]))
        revoke(current)
        setPending(null)
        setError(null)
        return clip
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao salvar o clipe'
        setError(message)
        throw err
      } finally {
        setSaving(false)
      }
    },
    [token, pending, postChannelId, revoke]
  )

  const remove = React.useCallback(
    async (id: string) => {
      if (!token) return
      await clipsApi.remove(token, id)
      setClips((prev) => prev.filter((c) => c.id !== id))
    },
    [token]
  )

  // Sair do app com um pendente aberto não pode deixar o blob preso.
  React.useEffect(() => {
    return () => revoke(pending)
    // Só na desmontagem: `pending` na lista faria a URL ser revogada a cada
    // troca, incluindo a do clipe que está na tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // O aviso de erro some sozinho — é sempre uma frase curta de "tenta de novo".
  React.useEffect(() => {
    if (!error) return
    const timer = window.setTimeout(() => setError(null), 5_000)
    return () => window.clearTimeout(timer)
  }, [error])

  const canClip = enabled && connected && bufferedMs > 3_000

  const value = React.useMemo<ClipContextValue>(
    () => ({
      canClip,
      bufferedMs,
      capture,
      pending,
      discard,
      save,
      saving,
      clips,
      loading,
      refresh,
      remove,
      error
    }),
    [
      canClip,
      bufferedMs,
      capture,
      pending,
      discard,
      save,
      saving,
      clips,
      loading,
      refresh,
      remove,
      error
    ]
  )

  return <ClipContext.Provider value={value}>{children}</ClipContext.Provider>
}

export function useClips(): ClipContextValue {
  const ctx = React.useContext(ClipContext)
  if (!ctx) throw new Error('useClips must be used within a ClipProvider')
  return ctx
}
