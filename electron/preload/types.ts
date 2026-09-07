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
  /** Sessao guardada deixou de valer e foi apagada: o card volta pra "conectar". */
  | { state: 'signed-out'; reason: string }

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
  /** Verdadeiro quando a checagem partiu de um clique, nao do timer. */
  manualCheck?: boolean
  /** Quando a ultima checagem terminou (ISO). */
  checkedAt?: string
  /**
   * Quando o launcher vai reiniciar sozinho pra aplicar a versao baixada
   * (epoch ms). Presente so no estagio 'downloaded' e enquanto a contagem
   * regressiva esta rodando; some se a pessoa adiar ou entrar numa call.
   */
  installAt?: number
  /** Ate quando a instalacao automatica foi adiada (epoch ms). */
  postponedUntil?: number
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
  /**
   * Webcam escolhida. 'default' = a que o sistema entregar.
   *
   * Guardado aqui e nao no LiveKit porque a escolha tem que sobreviver a sair
   * e voltar da call — e quem tem duas cameras (a do notebook e a boa) trocava
   * na roleta a cada entrada.
   */
  cameraDeviceId: string
  inputGain: number
  outputVolume: number
  noiseGateThreshold: number
  noiseSuppression: boolean
  echoCancellation: boolean
  autoGainControl: boolean
  /**
   * Corta estouro de baixa frequencia (mesa, cadeira, ruido de corpo).
   *
   * Separado do `noiseSuppression`, que e o filtro do Chromium: aquele limpa
   * o fundo ENQUANTO a pessoa fala e nao tem opiniao sobre o que abre o gate.
   * Este manda o gate ignorar estouro cuja energia e quase toda grave — ver
   * lib/audio-processor.ts.
   */
  rumbleFilter: boolean
}

/**
 * Preferencias do chat.
 *
 * Ficam no settings.json (e nao no servidor) de proposito: sao decisoes de
 * quem LE, nao do canal. Cada um silencia o que quiser sem afetar a galera.
 */
export interface ChatSettings {
  /** Modo compacto: uma linha por mensagem, sem avatar grande. */
  compact: boolean
  /** Cartoes de preview embaixo dos links. */
  showEmbeds: boolean
  /** Notificacao do sistema quando citam voce. */
  notifyOnMention: boolean
  /** Notificacao do sistema em QUALQUER mensagem nova. */
  notifyAllMessages: boolean
  /** Bipe curto quando chega mensagem. */
  messageSound: boolean
  /** Canais sem contador e sem aviso. */
  mutedChannels: string[]
}

// ============================================
// PRESENCA DE JOGO (LoL via LCU, Minecraft via launch)
// ============================================

/** Fases do cliente do LoL, ja traduzidas do gameflow da LCU. */
export type LolPhase =
  | 'none'
  | 'lobby'
  | 'matchmaking'
  | 'ready-check'
  | 'champ-select'
  | 'in-progress'
  | 'end-of-game'

export interface LolLobbyMember {
  /** Riot ID: gameName#tagLine. */
  riotId: string
  puuid?: string
  summonerId?: number
}

export interface LolLiveScore {
  kills: number
  deaths: number
  assists: number
  cs?: number
  gold?: number
  level?: number
  /** Tempo de jogo em segundos. */
  gameTimeSec?: number
}

/** Retrato do cliente do LoL na maquina — vem do processo main a cada poll. */
export interface LolStatus {
  /** Cliente aberto e respondendo? */
  clientRunning: boolean
  phase: LolPhase
  /** Epoch ms de quando a fase atual comecou. */
  phaseSince: number
  /** Riot ID de quem esta logado no cliente. */
  me?: LolLobbyMember
  /** Fila em texto curto: ranked_solo, ranked_flex, normal_draft, aram, arena, tft, custom… */
  queue?: string
  /** Quem esta no lobby (inclui voce). */
  lobby?: LolLobbyMember[]
  /** Campeao escolhido (champ select ou em partida). */
  champion?: string
  /** Placar ao vivo, so em partida. */
  score?: LolLiveScore
  /** Ultimo erro de leitura, pra diagnostico na tela de configuracoes. */
  error?: string
  updatedAt: number
}

/** Fim de partida, com as estatisticas que o card de pos-jogo e o recap usam. */
export interface LolGameResult {
  gameId?: number
  queue?: string
  result: 'win' | 'loss' | 'remake' | 'unknown'
  champion?: string
  kills: number
  deaths: number
  assists: number
  cs?: number
  gold?: number
  damageToChampions?: number
  visionScore?: number
  doubleKills?: number
  tripleKills?: number
  quadraKills?: number
  pentaKills?: number
  durationSec: number
  /** Riot IDs do time da pessoa (pra achar quem do grupo estava junto). */
  teammates?: LolLobbyMember[]
  /** Payload cru da LCU (eog-stats-block), pra guardar no servidor. */
  raw?: unknown
  endedAt: number
}

export type ActivityGame = 'lol' | 'minecraft'

/**
 * O que o launcher manda pro servidor sobre "o que estou fazendo". Espelha
 * `GameActivity` do backend (src/realtime/activity.ts).
 */
export interface GameActivity {
  game: ActivityGame
  phase: LolPhase | 'in-progress'
  detail?: string
  queue?: string
  champion?: string
  partyUserIds?: string[]
  score?: Omit<LolLiveScore, 'gameTimeSec'>
  since: number
  server?: string
}

/** Preferencias da integracao com o LoL. */
export interface LolSettings {
  /** Ler o cliente do LoL e mostrar presenca pra galera. */
  enabled: boolean
  /** Mandar o placar ao vivo (KDA) junto com a presenca. */
  shareLiveScore: boolean
  /** Ao detectar 2+ do grupo no mesmo lobby: entrar na call sozinho, perguntar ou nada. */
  autoJoinVoice: 'auto' | 'ask' | 'off'
  /** Postar o card de pos-jogo no chat automaticamente. */
  postGameCard: boolean
  /** Caminho manual do lockfile, quando a deteccao automatica falha. */
  lockfilePath: string
}

export interface LauncherSettings {
  maxRamMb: number
  minRamMb: number
  notifyOnJoinLeave: boolean
  soundEnabled: boolean
  soundVolume: number
  lastSeenModpackTag: string | null

  /** Iniciar junto com o Windows. */
  autostart: boolean
  /** Ao iniciar com o Windows, abrir direto na bandeja (sem janela). */
  startMinimized: boolean
  /** Mostrar "jogando Minecraft" pros outros. */
  shareMinecraftActivity: boolean
  lol: LolSettings

  voice: VoiceSettings
  hotkeys: HotkeySettings
  chat: ChatSettings
  /**
   * Volume por pessoa na call: userId -> 0..2 (1 = normal, 0 = mudo pra mim).
   *
   * Fica no settings.json porque e preferencia de quem escuta, nao da call:
   * quem fala gritando continua alto amanha. Chave e o id do usuario, que e o
   * mesmo `identity` do participante no LiveKit.
   */
  userVolumes: Record<string, number>
  soundboardVolume: number
  /** Volume (0..1) dos sons de alguém entrar/sair da call. */
  voiceCueVolume: number
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

  // Ligado por padrao: o ponto do launcher e estar aberto quando a galera
  // aparece. Quem nao quiser desliga nas configuracoes.
  autostart: true,
  startMinimized: true,
  shareMinecraftActivity: true,
  lol: {
    enabled: true,
    shareLiveScore: true,
    autoJoinVoice: 'ask',
    postGameCard: true,
    lockfilePath: ''
  },

  voice: {
    mode: 'voice-activity',
    pttKey: 'Space',
    inputDeviceId: 'default',
    outputDeviceId: 'default',
    cameraDeviceId: 'default',
    inputGain: 1,
    outputVolume: 1,
    noiseGateThreshold: -50,
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: false,
    rumbleFilter: true
  },
  hotkeys: {
    mute: 'Control+Shift+M',
    deafen: 'Control+Shift+D',
    pttToggle: '',
    nudgeChannel: '',
    sounds: {}
  },
  chat: {
    compact: false,
    showEmbeds: true,
    notifyOnMention: true,
    // Desligado: um grupo tagarela viraria uma fila de balao no canto da tela.
    notifyAllMessages: false,
    messageSound: true,
    mutedChannels: []
  },
  userVolumes: {},
  soundboardVolume: 0.7,
  // Os mp3 já vêm normalizados no talo; metade é o suficiente pra notar sem
  // assustar quem está de fone.
  voiceCueVolume: 0.5,
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
    /** Procura versao nova agora (pedido explicito do usuario). */
    check: () => Promise<UpdaterStatus>
    quitAndInstall: () => Promise<void>
    /** Adia a instalacao automatica por meia hora. */
    postpone: () => Promise<UpdaterStatus>
  }
  settings: {
    get: () => Promise<LauncherSettings>
    update: (patch: Partial<LauncherSettings>) => Promise<LauncherSettings>
  }
  appWindow: {
    minimize: () => Promise<void>
    maximizeToggle: () => Promise<boolean>
    close: () => Promise<void>
    /** Recarrega o renderer — saida de emergencia pra interface travada. */
    reload: () => Promise<void>
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
  /** Leitura do cliente do League of Legends (LCU) na maquina. */
  lol: {
    status: () => Promise<LolStatus>
    onStatus: (cb: (status: LolStatus) => void) => () => void
    /** Partida terminou: estatisticas finais lidas do cliente. */
    onGameEnded: (cb: (result: LolGameResult) => void) => () => void
    /** Forca uma releitura agora (botao "testar" nas configuracoes). */
    refresh: () => Promise<LolStatus>
  }
  app: {
    /** Aplica iniciar-com-o-Windows AGORA (a preferencia ja foi salva). */
    applyAutostart: () => Promise<{ enabled: boolean; supported: boolean }>
    /** true quando este processo foi aberto pelo autostart do Windows. */
    launchedAtLogin: () => Promise<boolean>
    /** Versao do launcher (package.json). */
    version: () => Promise<string>
  }
}

declare global {
  interface Window {
    bocas: BocasAPI
  }
}
