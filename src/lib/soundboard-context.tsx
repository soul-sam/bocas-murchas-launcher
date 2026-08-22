import * as React from 'react'
import { sounds as soundsApi, resolveAssetUrl, type Sound } from './api'
import { useAuth } from './auth-context'
import { useSocket } from './socket-context'
import { useSettings } from './settings-context'
import { useVoice } from './voice-context'

/**
 * Soundboard.
 *
 * Quem aperta a tecla NAO manda audio pelo microfone. O cliente pede ao
 * servidor ("toca o som X"), o servidor valida o limite e avisa a sala; cada
 * launcher toca o arquivo localmente. Assim o som sai limpo pra todo mundo
 * (nao passa pelo codec de voz) e nao gasta banda de upload de quem apertou.
 */

/** Mais que isso ao mesmo tempo vira ruido, nao piada. */
const MAX_CONCURRENT = 3

export interface SoundEvent {
  id: string
  soundName: string
  soundEmoji: string
  playedBy: string
  at: number
}

interface SoundboardContextValue {
  sounds: Sound[]
  loading: boolean
  /** Categoria -> sons, pra montar as abas. */
  byCategory: Record<string, Sound[]>

  /** Ultimo erro de cooldown vindo do servidor, pra mostrar na UI. */
  cooldownMessage: string | null
  recent: SoundEvent[]

  play: (soundId: string) => Promise<void>
  preview: (sound: Sound) => void
  stopAll: () => void

  upload: (payload: {
    file: File
    name: string
    emoji: string
    category?: string
  }) => Promise<Sound>
  update: (id: string, patch: { name?: string; emoji?: string; volume?: number }) => Promise<void>
  remove: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

const SoundboardContext = React.createContext<SoundboardContextValue | null>(null)

/** Lê a duração do arquivo antes de subir — o servidor não tem ffmpeg. */
export function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()

    const cleanup = (): void => URL.revokeObjectURL(url)

    audio.addEventListener('loadedmetadata', () => {
      const ms = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0
      cleanup()
      if (ms <= 0) reject(new Error('Não consegui ler a duração desse arquivo'))
      else resolve(ms)
    })

    audio.addEventListener('error', () => {
      cleanup()
      reject(new Error('Arquivo de áudio inválido'))
    })

    audio.src = url
  })
}

export function SoundboardProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  const { socket } = useSocket()
  const { settings } = useSettings()
  const { connected: inVoice } = useVoice()

  const [sounds, setSounds] = React.useState<Sound[]>([])
  const [loading, setLoading] = React.useState(true)
  const [cooldownMessage, setCooldownMessage] = React.useState<string | null>(null)
  const [recent, setRecent] = React.useState<SoundEvent[]>([])

  const activeAudioRef = React.useRef<HTMLAudioElement[]>([])
  const masterVolumeRef = React.useRef(settings.soundboardVolume)
  masterVolumeRef.current = settings.soundboardVolume

  const refresh = React.useCallback(async () => {
    if (!token) return
    try {
      setSounds(await soundsApi.list(token))
    } catch {
      // Servidor antigo (sem /api/sounds) ou fora do ar: fica sem soundboard,
      // mas o resto do app continua funcionando.
      setSounds([])
    } finally {
      setLoading(false)
    }
  }, [token])

  React.useEffect(() => {
    if (!token) {
      setSounds([])
      setLoading(false)
      return
    }
    void refresh()
  }, [token, refresh])

  const playFile = React.useCallback((url: string, volume: number) => {
    // Sons empilhados sem limite viram parede de ruido.
    activeAudioRef.current = activeAudioRef.current.filter((a) => !a.ended && !a.paused)
    if (activeAudioRef.current.length >= MAX_CONCURRENT) {
      const oldest = activeAudioRef.current.shift()
      oldest?.pause()
    }

    const audio = new Audio(url)
    audio.volume = Math.max(0, Math.min(1, volume * masterVolumeRef.current))
    activeAudioRef.current.push(audio)

    audio.addEventListener('ended', () => {
      activeAudioRef.current = activeAudioRef.current.filter((a) => a !== audio)
    })

    void audio.play().catch(() => {
      // Autoplay bloqueado ou arquivo sumiu: nao vale derrubar nada por isso.
      activeAudioRef.current = activeAudioRef.current.filter((a) => a !== audio)
    })
  }, [])

  // --- som tocado por alguem da sala (inclusive eu) -----------------------
  React.useEffect(() => {
    if (!socket) return

    const handlePlayed = (data: {
      sound: { id: string; name: string; emoji: string; url: string; volume: number }
      playedBy: { id: string; displayName: string }
      at: number
    }): void => {
      const url = resolveAssetUrl(data?.sound?.url)
      if (!url) return

      playFile(url, data.sound.volume ?? 1)

      setRecent((prev) =>
        [
          {
            id: `${data.sound.id}:${data.at}`,
            soundName: data.sound.name,
            soundEmoji: data.sound.emoji,
            playedBy: data.playedBy?.displayName ?? 'alguém',
            at: data.at
          },
          ...prev
        ].slice(0, 6)
      )
    }

    const handleAdded = (data: { sound: Sound }): void => {
      if (!data?.sound) return
      setSounds((prev) =>
        prev.some((s) => s.id === data.sound.id) ? prev : [...prev, data.sound]
      )
    }

    const handleUpdated = (data: { sound: Sound }): void => {
      if (!data?.sound) return
      setSounds((prev) => prev.map((s) => (s.id === data.sound.id ? data.sound : s)))
    }

    const handleRemoved = (data: { soundId: string }): void => {
      setSounds((prev) => prev.filter((s) => s.id !== data?.soundId))
    }

    socket.on('soundboard:played', handlePlayed)
    socket.on('soundboard:soundAdded', handleAdded)
    socket.on('soundboard:soundUpdated', handleUpdated)
    socket.on('soundboard:soundRemoved', handleRemoved)

    return () => {
      socket.off('soundboard:played', handlePlayed)
      socket.off('soundboard:soundAdded', handleAdded)
      socket.off('soundboard:soundUpdated', handleUpdated)
      socket.off('soundboard:soundRemoved', handleRemoved)
    }
  }, [socket, playFile])

  // Aviso de cooldown some sozinho.
  React.useEffect(() => {
    if (!cooldownMessage) return
    const timer = setTimeout(() => setCooldownMessage(null), 2_500)
    return () => clearTimeout(timer)
  }, [cooldownMessage])

  const play = React.useCallback(
    async (soundId: string) => {
      if (!socket) return

      if (!inVoice) {
        setCooldownMessage('Entra num canal de voz primeiro.')
        return
      }

      socket.emit(
        'soundboard:play',
        { soundId },
        (response: { ok: boolean; error?: string }) => {
          if (!response?.ok && response?.error) setCooldownMessage(response.error)
        }
      )
    },
    [socket, inVoice]
  )

  /** Toca só pra mim — usado ao escolher/testar um som. */
  const preview = React.useCallback(
    (sound: Sound) => {
      const url = resolveAssetUrl(sound.url)
      if (url) playFile(url, sound.volume ?? 1)
    },
    [playFile]
  )

  const stopAll = React.useCallback(() => {
    for (const audio of activeAudioRef.current) audio.pause()
    activeAudioRef.current = []
  }, [])

  const upload = React.useCallback(
    async (payload: { file: File; name: string; emoji: string; category?: string }) => {
      if (!token) throw new Error('Sem sessão')

      const durationMs = await readAudioDuration(payload.file)
      const sound = await soundsApi.create(token, { ...payload, durationMs })

      setSounds((prev) => (prev.some((s) => s.id === sound.id) ? prev : [...prev, sound]))
      return sound
    },
    [token]
  )

  const update = React.useCallback(
    async (id: string, patch: { name?: string; emoji?: string; volume?: number }) => {
      if (!token) return
      const updated = await soundsApi.update(token, id, patch)
      setSounds((prev) => prev.map((s) => (s.id === id ? updated : s)))
    },
    [token]
  )

  const remove = React.useCallback(
    async (id: string) => {
      if (!token) return
      await soundsApi.remove(token, id)
      setSounds((prev) => prev.filter((s) => s.id !== id))
    },
    [token]
  )

  const byCategory = React.useMemo(() => {
    const groups: Record<string, Sound[]> = {}
    for (const sound of sounds) {
      const key = sound.category || 'geral'
      if (!groups[key]) groups[key] = []
      groups[key].push(sound)
    }
    return groups
  }, [sounds])

  const value = React.useMemo<SoundboardContextValue>(
    () => ({
      sounds,
      loading,
      byCategory,
      cooldownMessage,
      recent,
      play,
      preview,
      stopAll,
      upload,
      update,
      remove,
      refresh
    }),
    [
      sounds,
      loading,
      byCategory,
      cooldownMessage,
      recent,
      play,
      preview,
      stopAll,
      upload,
      update,
      remove,
      refresh
    ]
  )

  return <SoundboardContext.Provider value={value}>{children}</SoundboardContext.Provider>
}

export function useSoundboard(): SoundboardContextValue {
  const ctx = React.useContext(SoundboardContext)
  if (!ctx) throw new Error('useSoundboard must be used within a SoundboardProvider')
  return ctx
}
