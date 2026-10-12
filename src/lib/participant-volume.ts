/**
 * VOLUME POR PESSOA — dois botões, não um.
 *
 * Quem transmite a tela chega em DUAS faixas no LiveKit: o microfone e o som
 * da tela (ScreenShareAudio). Um volume só pros dois obrigava a escolher:
 * jogo audível = voz sumida. Agora a voz tem o dela (até 300%, porque mic
 * baixo é o caso comum) e a tela tem o dela (até 200%).
 *
 * Ganho acima de 100% só existe porque a sala roda com `webAudioMix`
 * (GainNode); `HTMLMediaElement.volume` estoura acima de 1.
 */
export const VOICE_VOLUME_MAX = 3
export const SCREEN_VOLUME_MAX = 2

function clamp(value: number, max: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.max(0, Math.min(max, value))
}

export function clampVoiceVolume(value: number): number {
  return clamp(value, VOICE_VOLUME_MAX)
}

export function clampScreenVolume(value: number): number {
  return clamp(value, SCREEN_VOLUME_MAX)
}

/** O que o LiveKit recebe: ajuste da pessoa × geral × ensurdecido, no teto da fonte. */
export function effectiveVolume(input: {
  perUser: number | undefined
  master: number
  deafened: boolean
  max: number
}): number {
  if (input.deafened) return 0
  const perUser = Number.isFinite(input.perUser) ? (input.perUser as number) : 1
  return Math.max(0, Math.min(input.max, perUser * input.master))
}
