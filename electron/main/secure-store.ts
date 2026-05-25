import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const TOKEN_FILE = 'auth-token.bin'
const MC_PROFILE_FILE = 'mc-profile.bin'

function filePath(name: string) {
  return path.join(app.getPath('userData'), name)
}

async function writeEncrypted(name: string, value: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level encryption is not available on this machine.')
  }
  const encrypted = safeStorage.encryptString(value)
  await fs.mkdir(path.dirname(filePath(name)), { recursive: true })
  await fs.writeFile(filePath(name), encrypted)
}

async function readEncrypted(name: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(filePath(name))
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.decryptString(buf)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    return null
  }
}

async function removeFile(name: string): Promise<void> {
  try {
    await fs.unlink(filePath(name))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}

export const saveToken = (token: string) => writeEncrypted(TOKEN_FILE, token)
export const loadToken = () => readEncrypted(TOKEN_FILE)
export const clearToken = () => removeFile(TOKEN_FILE)

export interface PersistedMcProfile {
  msRefreshToken: string
  mcAccessToken: string
  mcAccessTokenExpiresAt: number
  profile: { id: string; name: string }
}

export async function saveMcProfile(profile: PersistedMcProfile): Promise<void> {
  await writeEncrypted(MC_PROFILE_FILE, JSON.stringify(profile))
}

export async function loadMcProfile(): Promise<PersistedMcProfile | null> {
  const raw = await readEncrypted(MC_PROFILE_FILE)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PersistedMcProfile
  } catch {
    return null
  }
}

export const clearMcProfile = () => removeFile(MC_PROFILE_FILE)
