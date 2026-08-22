import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_SETTINGS,
  type HotkeySettings,
  type LauncherSettings,
  type VoiceSettings,
  type VoiceMode
} from '../../preload/types.js'

export type { HotkeySettings, LauncherSettings, VoiceSettings, VoiceMode }

const FILE = 'settings.json'

export const DEFAULTS: LauncherSettings = DEFAULT_SETTINGS

export const RAM_LIMITS = {
  min: 2048,
  max: 16384,
  step: 512
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), FILE)
}

function clampRam(value: number): number {
  const v = Math.max(RAM_LIMITS.min, Math.min(RAM_LIMITS.max, Math.round(value)))
  // Snap to nearest step
  return Math.round(v / RAM_LIMITS.step) * RAM_LIMITS.step
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
}

function normalizeVoice(raw: Partial<VoiceSettings> | undefined): VoiceSettings {
  const d = DEFAULTS.voice
  const v = raw ?? {}
  return {
    mode: v.mode === 'push-to-talk' ? 'push-to-talk' : 'voice-activity',
    pttKey: typeof v.pttKey === 'string' && v.pttKey ? v.pttKey : d.pttKey,
    inputDeviceId: typeof v.inputDeviceId === 'string' ? v.inputDeviceId : d.inputDeviceId,
    outputDeviceId: typeof v.outputDeviceId === 'string' ? v.outputDeviceId : d.outputDeviceId,
    inputGain: clamp(Number(v.inputGain), 0, 3, d.inputGain),
    outputVolume: clamp(Number(v.outputVolume), 0, 1, d.outputVolume),
    noiseGateThreshold: clamp(Number(v.noiseGateThreshold), -100, 0, d.noiseGateThreshold),
    noiseSuppression: v.noiseSuppression ?? d.noiseSuppression,
    echoCancellation: v.echoCancellation ?? d.echoCancellation,
    autoGainControl: v.autoGainControl ?? d.autoGainControl
  }
}

function normalizeHotkeys(raw: Partial<HotkeySettings> | undefined): HotkeySettings {
  const d = DEFAULTS.hotkeys
  const h = raw ?? {}

  const sounds: Record<string, string> = {}
  if (h.sounds && typeof h.sounds === 'object') {
    for (const [soundId, accelerator] of Object.entries(h.sounds)) {
      if (typeof accelerator === 'string' && accelerator) sounds[soundId] = accelerator
    }
  }

  return {
    mute: typeof h.mute === 'string' ? h.mute : d.mute,
    deafen: typeof h.deafen === 'string' ? h.deafen : d.deafen,
    pttToggle: typeof h.pttToggle === 'string' ? h.pttToggle : d.pttToggle,
    nudgeChannel: typeof h.nudgeChannel === 'string' ? h.nudgeChannel : d.nudgeChannel,
    sounds
  }
}

/** Volume por pessoa: 0..2. Entrada porca (string, NaN, negativo) e descartada. */
function normalizeUserVolumes(
  raw: Record<string, number> | undefined
): Record<string, number> {
  const volumes: Record<string, number> = {}
  if (!raw || typeof raw !== 'object') return volumes

  for (const [userId, value] of Object.entries(raw)) {
    const volume = Number(value)
    if (!userId || !Number.isFinite(volume)) continue
    // 1 e o padrao — nao vale guardar linha por pessoa que nunca foi ajustada.
    if (volume === 1) continue
    volumes[userId] = Math.max(0, Math.min(2, volume))
  }

  return volumes
}

function normalize(raw: Partial<LauncherSettings>): LauncherSettings {
  const maxRamMb = clampRam(raw.maxRamMb ?? DEFAULTS.maxRamMb)
  const rawMin = raw.minRamMb ?? DEFAULTS.minRamMb
  const minRamMb = Math.min(maxRamMb, Math.max(512, Math.round(rawMin)))

  return {
    maxRamMb,
    minRamMb,
    notifyOnJoinLeave: raw.notifyOnJoinLeave ?? DEFAULTS.notifyOnJoinLeave,
    soundEnabled: raw.soundEnabled ?? DEFAULTS.soundEnabled,
    soundVolume: clamp(Number(raw.soundVolume), 0, 1, DEFAULTS.soundVolume),
    lastSeenModpackTag: raw.lastSeenModpackTag ?? DEFAULTS.lastSeenModpackTag,

    voice: normalizeVoice(raw.voice),
    hotkeys: normalizeHotkeys(raw.hotkeys),
    userVolumes: normalizeUserVolumes(raw.userVolumes),
    soundboardVolume: clamp(Number(raw.soundboardVolume), 0, 1, DEFAULTS.soundboardVolume),
    nudgeOptOut: raw.nudgeOptOut ?? DEFAULTS.nudgeOptOut,
    nudgeShakeWindow: raw.nudgeShakeWindow ?? DEFAULTS.nudgeShakeWindow,
    closeToTray: raw.closeToTray ?? DEFAULTS.closeToTray
  }
}

export async function loadSettings(): Promise<LauncherSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf-8')
    return normalize(JSON.parse(raw) as Partial<LauncherSettings>)
  } catch {
    // normalize({}) em vez de espalhar DEFAULTS: um spread raso devolveria
    // voice/hotkeys por referencia, compartilhados com o objeto de defaults.
    return normalize({})
  }
}

export async function updateSettings(patch: Partial<LauncherSettings>): Promise<LauncherSettings> {
  const current = await loadSettings()

  // Merge raso perderia o resto de voice/hotkeys a cada patch parcial.
  const merged: Partial<LauncherSettings> = {
    ...current,
    ...patch,
    voice: { ...current.voice, ...(patch.voice ?? {}) },
    hotkeys: {
      ...current.hotkeys,
      ...(patch.hotkeys ?? {}),
      sounds: { ...current.hotkeys.sounds, ...(patch.hotkeys?.sounds ?? {}) }
    },
    // Merge por pessoa: ajustar o volume de UM nao pode apagar o dos outros.
    // Voltar alguem pro 1 remove a chave no normalize logo abaixo.
    userVolumes: { ...current.userVolumes, ...(patch.userVolumes ?? {}) }
  }

  const next = normalize(merged)
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true })
  await fs.writeFile(settingsPath(), JSON.stringify(next, null, 2))
  return next
}
