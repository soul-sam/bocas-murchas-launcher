import { describe, expect, it } from 'vitest'
import {
  SCREEN_VOLUME_MAX,
  VOICE_VOLUME_MAX,
  clampScreenVolume,
  clampVoiceVolume,
  effectiveVolume
} from './participant-volume'

describe('tetos', () => {
  it('voz vai até 300%, tela até 200%', () => {
    expect(VOICE_VOLUME_MAX).toBe(3)
    expect(SCREEN_VOLUME_MAX).toBe(2)
    expect(clampVoiceVolume(5)).toBe(3)
    expect(clampScreenVolume(5)).toBe(2)
    expect(clampVoiceVolume(-1)).toBe(0)
    expect(clampScreenVolume(NaN)).toBe(1)
  })
})

describe('effectiveVolume', () => {
  it('ensurdecido zera', () => {
    expect(effectiveVolume({ perUser: 2, master: 1, deafened: true, max: 3 })).toBe(0)
  })
  it('multiplica pelo geral e respeita o teto da fonte', () => {
    expect(effectiveVolume({ perUser: 3, master: 1, deafened: false, max: 3 })).toBe(3)
    expect(effectiveVolume({ perUser: 3, master: 0.5, deafened: false, max: 3 })).toBe(1.5)
    expect(effectiveVolume({ perUser: 3, master: 1, deafened: false, max: 2 })).toBe(2)
  })
  it('sem ajuste vale 1', () => {
    expect(effectiveVolume({ perUser: undefined, master: 1, deafened: false, max: 3 })).toBe(1)
  })
})
