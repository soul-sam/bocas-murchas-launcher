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

/** Atalhos globais. Valor vazio = nao vinculado. */
export interface HotkeySettings {
  mute: string
  deafen: string
  pttToggle: string
  nudgeChannel: string
  /** soundId -> accelerator */
  sounds: Record<string, string>
}

export type VoiceMode = 'voice-activity' | 'push-to-talk'

export interface VoiceSettings {
  mode: VoiceMode
  /** Tecla do PTT com a janela em foco (code do KeyboardEvent). */
  pttKey: string
  inputDeviceId: string
  outputDeviceId: string
  inputGain: number
  outputVolume: number
  noiseGateThreshold: number
  noiseSuppression: boolean
  echoCancellation: boolean
  autoGainControl: boolean
}

export interface LauncherSettings {
  maxRamMb: number
  minRamMb: number
  notifyOnJoinLeave: boolean
  soundEnabled: boolean
  soundVolume: number
  lastSeenModpackTag: string | null

  voice: VoiceSettings
  hotkeys: HotkeySettings
  /**
   * Volume por pessoa na call: userId -> 0..2 (1 = normal, 0 = mudo pra mim).
   *
   * Fica no settings.json porque e preferencia de quem escuta, nao da call:
   * quem fala gritando continua alto amanha. Chave e o id do usuario, que e o
   * mesmo `identity` do participante no LiveKit.
   */
  userVolumes: Record<string, number>
  soundboardVolume: number
  nudgeOptOut: boolean
  nudgeShakeWindow: boolean
  closeToTray: boolean
}

// ============================================
// ATALHOS GLOBAIS
// ============================================

export type HotkeyAction =
  | { kind: 'sound'; soundId: string }
  | { kind: 'mute' }
  | { kind: 'deafen' }
  | { kind: 'ptt-toggle' }
  | { kind: 'nudge-channel' }

export interface HotkeyBinding {
  id: string
  accelerator: string
  action: HotkeyAction
}

export interface HotkeyRegistration {
  id: string
  accelerator: string
  ok: boolean
  error?: string
}

export interface HotkeyEvent {
  id: string
  action: HotkeyAction
  at: number
}

// ============================================
// COMPARTILHAR TELA
// ============================================

export interface ScreenSource {
  id: string
  name: string
  isScreen: boolean
  thumbnailDataUrl: string
  appIconDataUrl?: string
}

// ============================================
// NUDGE
// ============================================

export interface NudgeOptions {
  intensity?: number
  durationMs?: number
}

export interface NudgeResult {
  shook: boolean
  reason?: 'cooldown' | 'no-window' | 'maximized' | 'minimized'
}

export interface TrayCommand {
  command: 'toggle-mute' | 'leave-voice'
}

export interface ModpackChangelog {
  tag: string
  publishedAt: string
  name?: string
  body?: string
}

export interface PlayerSample {
  name: string
  id: string
}

export interface ServerStatus {
  online: boolean
  host: string
  port: number
  latencyMs?: number
  versionName?: string
  protocol?: number
  motd?: string
  playersOnline?: number
  playersMax?: number
  sample?: PlayerSample[]
  favicon?: string
  error?: string
  fetchedAt: string
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

/**
 * Valores padrao das configuracoes.
 *
 * Fica aqui (e nao no main) porque os dois lados precisam: o main normaliza o
 * settings.json com isso, e o renderer usa como estado inicial pra nao ter que
 * lidar com "settings ainda e null" em todo componente.
 */
export const DEFAULT_SETTINGS: LauncherSettings = {
  maxRamMb: 4096,
  minRamMb: 1024,
  notifyOnJoinLeave: true,
  soundEnabled: true,
  soundVolume: 0.5,
  lastSeenModpackTag: null,

  voice: {
    mode: 'voice-activity',
    pttKey: 'Space',
    inputDeviceId: 'default',
    outputDeviceId: 'default',
    inputGain: 1,
    outputVolume: 1,
    noiseGateThreshold: -50,
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: false
  },
  hotkeys: {
    mute: 'Control+Shift+M',
    deafen: 'Control+Shift+D',
    pttToggle: '',
    nudgeChannel: '',
    sounds: {}
  },
  userVolumes: {},
  soundboardVolume: 0.7,
  nudgeOptOut: false,
  nudgeShakeWindow: true,
  closeToTray: true
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
  serverStatus: {
    get: () => Promise<ServerStatus>
    refresh: () => Promise<ServerStatus>
    onStatus: (cb: (status: ServerStatus) => void) => () => void
  }
  modpack: {
    changelog: () => Promise<ModpackChangelog | null>
    installedTag: () => Promise<string | null>
  }
  hotkeys: {
    set: (bindings: HotkeyBinding[]) => Promise<HotkeyRegistration[]>
    probe: (accelerator: string) => Promise<{ ok: boolean; error?: string }>
    clear: () => Promise<void>
    onTriggered: (cb: (event: HotkeyEvent) => void) => () => void
  }
  screen: {
    listSources: () => Promise<ScreenSource[]>
    /** Marque a fonte ANTES de chamar getDisplayMedia(). */
    selectSource: (sourceId: string, withAudio?: boolean) => Promise<void>
    cancelSelection: () => Promise<void>
  }
  nudge: {
    shake: (options?: NudgeOptions) => Promise<NudgeResult>
  }
  tray: {
    setVoiceState: (state: { inVoice?: boolean; micMuted?: boolean }) => Promise<void>
    onCommand: (cb: (command: TrayCommand) => void) => () => void
  }
  notify: {
    show: (payload: { title: string; body: string; silent?: boolean }) => Promise<void>
  }
}

declare global {
  interface Window {
    bocas: BocasAPI
  }
}
