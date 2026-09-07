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

/**
 * Lista webcams.
 *
 * SEPARADO do hook de áudio de propósito, e com gatilho próprio. Assim como o
 * microfone, `enumerateDevices` só devolve o NOME da câmera depois que a
 * página teve permissão de câmera — mas pedir essa permissão ACENDE O LED da
 * webcam, e fazer isso toda vez que alguém abre as configurações é o tipo de
 * coisa que assusta com razão.
 *
 * Então: por padrão só enumera (sem pedir nada). Quem já usou a câmera numa
 * call vê os nomes na hora; quem nunca usou vê "Câmera 1", "Câmera 2" e um
 * botão pra revelar os nomes, que é o único caminho que acende o LED — e aí é
 * escolha da pessoa.
 */
export interface VideoDevicesState {
  cameras: AudioDevice[]
  loading: boolean
  error: string | null
  /** true quando algum nome veio vazio: dá pra oferecer o botão de revelar. */
  needsPermission: boolean
  /** Pede permissão de câmera (acende o LED) e enumera de novo. */
  reveal: () => Promise<void>
  refresh: () => Promise<void>
}

export function useVideoDevices(enabled: boolean): VideoDevicesState {
  const [cameras, setCameras] = React.useState<AudioDevice[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [needsPermission, setNeedsPermission] = React.useState(false)

  const enumerate = React.useCallback(async (probe: boolean) => {
    setLoading(true)
    setError(null)

    let stream: MediaStream | null = null
    try {
      if (probe) stream = await navigator.mediaDevices.getUserMedia({ video: true })

      const devices = await navigator.mediaDevices.enumerateDevices()
      const found = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Câmera ${i + 1}` }))

      setCameras(found)
      // Sem label = sem permissão ainda. Se a lista está vazia, não é falta de
      // permissão: é falta de câmera, e aí o botão de revelar não ajudaria.
      setNeedsPermission(
        found.length > 0 &&
          devices.some((d) => d.kind === 'videoinput' && !d.label)
      )
    } catch (err) {
      setError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Permissão de câmera negada'
          : 'Não consegui listar as câmeras'
      )
    } finally {
      // Solta na hora: segurar a faixa deixaria o LED aceso à toa.
      stream?.getTracks().forEach((track) => track.stop())
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (!enabled) return
    void enumerate(false)

    const handleChange = (): void => void enumerate(false)
    navigator.mediaDevices.addEventListener('devicechange', handleChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', handleChange)
  }, [enabled, enumerate])

  return {
    cameras,
    loading,
    error,
    needsPermission,
    reveal: () => enumerate(true),
    refresh: () => enumerate(false)
  }
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
