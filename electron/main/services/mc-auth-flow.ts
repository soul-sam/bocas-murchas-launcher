import { BrowserWindow } from 'electron'
import {
  MicrosoftAuthError,
  pollDeviceCode,
  refreshTokens,
  requestDeviceCode
} from './microsoft-auth.js'
import { buildMinecraftSession, type MinecraftProfile } from './minecraft-auth.js'
import {
  clearMcProfile,
  loadMcProfile,
  saveMcProfile,
  type PersistedMcProfile
} from '../secure-store.js'

const REFRESH_SAFETY_MS = 60_000

export interface PublicMcProfile {
  id: string
  name: string
}

export interface DeviceCodeInfo {
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export type AuthProgressEvent =
  | { state: 'awaiting'; code: DeviceCodeInfo }
  | { state: 'success'; profile: PublicMcProfile }
  | { state: 'expired' }
  | { state: 'cancelled' }
  | { state: 'error'; error: { message: string; code?: string } }

interface ActiveFlow {
  cancelled: boolean
  deviceCode: string
  startedAt: number
  expiresInMs: number
}

let active: ActiveFlow | null = null

function publicView(p: PersistedMcProfile | null): PublicMcProfile | null {
  return p ? { id: p.profile.id, name: p.profile.name } : null
}

export async function getMcProfile(): Promise<PublicMcProfile | null> {
  return publicView(await loadMcProfile())
}

export async function logoutMc(): Promise<void> {
  if (active) active.cancelled = true
  active = null
  await clearMcProfile()
}

export function cancelMcAuth(): void {
  if (active) {
    active.cancelled = true
    broadcast({ state: 'cancelled' })
  }
  active = null
}

function broadcast(event: AuthProgressEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('mc-auth:progress', event)
  }
}

/**
 * Kicks off Microsoft device-code flow. Returns the user_code + verification
 * URI immediately so the renderer can show the modal. Polling and the
 * downstream XBL/XSTS/MC chain happens in the background and reports
 * progress via the 'mc-auth:progress' event channel.
 */
export async function startMcAuth(): Promise<DeviceCodeInfo> {
  // Cancel any previous flow
  if (active) active.cancelled = true

  const dc = await requestDeviceCode()

  const flow: ActiveFlow = {
    cancelled: false,
    deviceCode: dc.device_code,
    startedAt: Date.now(),
    expiresInMs: dc.expires_in * 1000
  }
  active = flow

  const codeInfo: DeviceCodeInfo = {
    userCode: dc.user_code,
    verificationUri: dc.verification_uri,
    expiresIn: dc.expires_in,
    interval: dc.interval
  }

  broadcast({ state: 'awaiting', code: codeInfo })

  // Background polling loop
  void (async () => {
    let intervalMs = Math.max(dc.interval * 1000, 1000)

    while (!flow.cancelled) {
      if (Date.now() - flow.startedAt > flow.expiresInMs) {
        if (active === flow) active = null
        broadcast({ state: 'expired' })
        return
      }

      await new Promise((r) => setTimeout(r, intervalMs))
      if (flow.cancelled) return

      try {
        const result = await pollDeviceCode(flow.deviceCode)
        if (result.kind === 'pending') continue
        if (result.kind === 'slow-down') {
          intervalMs += 5000
          continue
        }

        // result.kind === 'tokens'
        const session = await buildMinecraftSession(result.tokens.accessToken)
        const persisted: PersistedMcProfile = {
          msRefreshToken: result.tokens.refreshToken,
          mcAccessToken: session.accessToken,
          mcAccessTokenExpiresAt: session.expiresAt,
          profile: session.profile
        }
        await saveMcProfile(persisted)
        if (active === flow) active = null
        broadcast({
          state: 'success',
          profile: { id: session.profile.id, name: session.profile.name }
        })
        return
      } catch (err) {
        if (active === flow) active = null
        broadcast({
          state: 'error',
          error: {
            message: err instanceof Error ? err.message : String(err),
            code: err instanceof MicrosoftAuthError ? err.code : undefined
          }
        })
        return
      }
    }
  })()

  return codeInfo
}

export async function ensureFreshMcSession(): Promise<{ accessToken: string; profile: MinecraftProfile } | null> {
  const stored = await loadMcProfile()
  if (!stored) return null

  if (stored.mcAccessTokenExpiresAt - REFRESH_SAFETY_MS > Date.now()) {
    return { accessToken: stored.mcAccessToken, profile: stored.profile }
  }

  try {
    const refreshed = await refreshTokens(stored.msRefreshToken)
    const session = await buildMinecraftSession(refreshed.accessToken)
    const next: PersistedMcProfile = {
      msRefreshToken: refreshed.refreshToken,
      mcAccessToken: session.accessToken,
      mcAccessTokenExpiresAt: session.expiresAt,
      profile: session.profile
    }
    await saveMcProfile(next)
    return { accessToken: session.accessToken, profile: session.profile }
  } catch (err) {
    if (err instanceof MicrosoftAuthError && (err.code === 'invalid_grant' || err.code === 'NO_CLIENT_ID')) {
      await clearMcProfile()
    }
    throw err
  }
}
