import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const FILE = 'settings.json'

export interface LauncherSettings {
  maxRamMb: number
  minRamMb: number
}

export const DEFAULTS: LauncherSettings = {
  maxRamMb: 4096,
  minRamMb: 1024
}

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

function normalize(raw: Partial<LauncherSettings>): LauncherSettings {
  const maxRamMb = clampRam(raw.maxRamMb ?? DEFAULTS.maxRamMb)
  // Min is capped at max so we never end up with min > max
  const rawMin = raw.minRamMb ?? DEFAULTS.minRamMb
  const minRamMb = Math.min(maxRamMb, Math.max(512, Math.round(rawMin)))
  return { maxRamMb, minRamMb }
}

export async function loadSettings(): Promise<LauncherSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf-8')
    return normalize(JSON.parse(raw) as Partial<LauncherSettings>)
  } catch {
    return { ...DEFAULTS }
  }
}

export async function updateSettings(patch: Partial<LauncherSettings>): Promise<LauncherSettings> {
  const current = await loadSettings()
  const next = normalize({ ...current, ...patch })
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true })
  await fs.writeFile(settingsPath(), JSON.stringify(next, null, 2))
  return next
}
