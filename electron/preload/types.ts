export interface McPublicProfile {
  id: string
  name: string
}

export interface DeviceCodeInfo {
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export type McAuthProgressEvent =
  | { state: 'awaiting'; code: DeviceCodeInfo }
  | { state: 'success'; profile: McPublicProfile }
  | { state: 'expired' }
  | { state: 'cancelled' }
  | { state: 'error'; error: { message: string; code?: string } }

export type McAuthStartResult =
  | { ok: true; code: DeviceCodeInfo }
  | { ok: false; error: { message: string; code?: string } }

export type InstallStage =
  | 'idle'
  | 'starting'
  | 'java'
  | 'minecraft'
  | 'forge'
  | 'modpack'
  | 'done'
  | 'error'

export type McInstallSubStage =
  | 'manifest'
  | 'client'
  | 'libraries'
  | 'assetIndex'
  | 'assets'
  | 'done'

export type ModpackSubStage =
  | 'check'
  | 'download'
  | 'extract'
  | 'apply'
  | 'done'
  | 'skipped'

export interface InstallStatus {
  stage: InstallStage
  subStage?: McInstallSubStage | ModpackSubStage
  current: number
  total: number
  detail?: string
  error?: string
}

export type LaunchStage = 'idle' | 'preparing' | 'running' | 'exited' | 'error'

export interface LaunchStatus {
  stage: LaunchStage
  pid?: number
  exitCode?: number
  error?: string
  serverTarget?: string
  startedAt?: string
  logPath?: string
}

export type UpdaterStage =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdaterStatus {
  stage: UpdaterStage
  currentVersion?: string
  newVersion?: string
  percent?: number
  bytesPerSecond?: number
  transferred?: number
  total?: number
  error?: string
}

export interface LauncherSettings {
  maxRamMb: number
  minRamMb: number
}

export interface RamLimits {
  min: number
  max: number
  step: number
}

export const RAM_LIMITS: RamLimits = {
  min: 2048,
  max: 16384,
  step: 512
}

export interface BocasAPI {
  auth: {
    saveToken: (token: string) => Promise<void>
    loadToken: () => Promise<string | null>
    clearToken: () => Promise<void>
  }
  shell: {
    openExternal: (url: string) => Promise<void>
  }
  mcAuth: {
    start: () => Promise<McAuthStartResult>
    cancel: () => Promise<void>
    getProfile: () => Promise<McPublicProfile | null>
    logout: () => Promise<void>
    onProgress: (cb: (event: McAuthProgressEvent) => void) => () => void
  }
  install: {
    start: (options?: { quickCheck?: boolean }) => Promise<InstallStatus>
    status: () => Promise<InstallStatus>
    onProgress: (cb: (status: InstallStatus) => void) => () => void
  }
  game: {
    launch: () => Promise<LaunchStatus>
    status: () => Promise<LaunchStatus>
    onStatus: (cb: (status: LaunchStatus) => void) => () => void
  }
  updater: {
    status: () => Promise<UpdaterStatus>
    onStatus: (cb: (status: UpdaterStatus) => void) => () => void
    quitAndInstall: () => Promise<void>
  }
  settings: {
    get: () => Promise<LauncherSettings>
    update: (patch: Partial<LauncherSettings>) => Promise<LauncherSettings>
  }
  appWindow: {
    minimize: () => Promise<void>
    maximizeToggle: () => Promise<boolean>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    onStateChanged: (cb: (state: { maximized: boolean }) => void) => () => void
  }
}

declare global {
  interface Window {
    bocas: BocasAPI
  }
}
