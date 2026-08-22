import * as React from 'react'

/**
 * Lista microfones e saídas de áudio.
 *
 * enumerateDevices() só devolve os NOMES dos dispositivos depois que a página
 * já teve permissão de microfone concedida numa chamada de getUserMedia. Sem
 * isso a lista vem com labels vazias e o usuário escolhe entre "" e "". Por
 * isso pedimos um stream descartável antes de enumerar — e o soltamos na hora.
 */

export interface AudioDevice {
  deviceId: string
  label: string
}

interface AudioDevicesState {
  inputs: AudioDevice[]
  outputs: AudioDevice[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useAudioDevices(enabled: boolean): AudioDevicesState {
  const [inputs, setInputs] = React.useState<AudioDevice[]>([])
  const [outputs, setOutputs] = React.useState<AudioDevice[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError(null)

    let probe: MediaStream | null = null
    try {
      probe = await navigator.mediaDevices.getUserMedia({ audio: true })

      const devices = await navigator.mediaDevices.enumerateDevices()

      setInputs(
        devices
          .filter((d) => d.kind === 'audioinput')
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Microfone ${i + 1}`
          }))
      )

      setOutputs(
        devices
          .filter((d) => d.kind === 'audiooutput')
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Saída ${i + 1}`
          }))
      )
    } catch (err) {
      setError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Permissão de microfone negada'
          : 'Não consegui listar os dispositivos'
      )
    } finally {
      // Segurar o microfone aceso depois de listar acenderia o LED da webcam/mic
      // sem motivo — e em alguns headsets trava o dispositivo pro LiveKit.
      probe?.getTracks().forEach((track) => track.stop())
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (!enabled) return
    void refresh()

    const handleChange = (): void => void refresh()
    navigator.mediaDevices.addEventListener('devicechange', handleChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', handleChange)
  }, [enabled, refresh])

  return { inputs, outputs, loading, error, refresh }
}
