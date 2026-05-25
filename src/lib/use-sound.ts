import * as React from 'react'
import { useSettings } from '@/lib/settings-context'

export type SoundName = 'click' | 'hover' | 'success' | 'error' | 'launch' | 'notify'

const cache = new Map<SoundName, HTMLAudioElement>()
const missing = new Set<SoundName>()

function load(name: SoundName): HTMLAudioElement | null {
  if (missing.has(name)) return null
  const cached = cache.get(name)
  if (cached) return cached
  const audio = new Audio(`sounds/${name}.mp3`)
  audio.preload = 'auto'
  audio.addEventListener(
    'error',
    () => {
      // File doesn't exist or failed to load — remember so we stop retrying.
      missing.add(name)
      cache.delete(name)
    },
    { once: true }
  )
  cache.set(name, audio)
  return audio
}

export function useSound(): (name: SoundName) => void {
  const { settings } = useSettings()

  return React.useCallback(
    (name: SoundName) => {
      if (!settings?.soundEnabled) return
      const audio = load(name)
      if (!audio) return
      try {
        // Restart from start so rapid-fire clicks don't get swallowed.
        audio.currentTime = 0
        audio.volume = settings.soundVolume
        void audio.play().catch(() => undefined)
      } catch {
        // ignore
      }
    },
    [settings?.soundEnabled, settings?.soundVolume]
  )
}
