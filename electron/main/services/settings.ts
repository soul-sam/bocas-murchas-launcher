import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_SETTINGS,
  SETTINGS_REVISION,
  type ChatSettings,
  type HotkeySettings,
  type LauncherSettings,
  type LolSettings,
  type MusicSettings,
  type OverlaySettings,
  type OverlayCorner,
  type OverlayDock,
  type ScreenShareSettings,
  type VoiceSettings,
  type VoiceMode, isOverlayCorner, isOverlaySide, isScreenShareQuality, isScreenShareContent, isThemeId } from '../../preload/types.js'

export type { ChatSettings, HotkeySettings, LauncherSettings, LolSettings, MusicSettings, OverlaySettings, ScreenShareSettings, VoiceSettings, VoiceMode }

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
    cameraDeviceId: typeof v.cameraDeviceId === 'string' ? v.cameraDeviceId : d.cameraDeviceId,
    inputGain: clamp(Number(v.inputGain), 0, 3, d.inputGain),
    outputVolume: clamp(Number(v.outputVolume), 0, 1, d.outputVolume),
    noiseGateThreshold: clamp(Number(v.noiseGateThreshold), -100, 0, d.noiseGateThreshold),
    noiseSuppression: v.noiseSuppression ?? d.noiseSuppression,
    echoCancellation: v.echoCancellation ?? d.echoCancellation,
    autoGainControl: v.autoGainControl ?? d.autoGainControl,
    rumbleFilter: v.rumbleFilter ?? d.rumbleFilter
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
    // Arquivo salvo antes do clipe existir nao tem a chave: cai no padrao, e
    // quem atualizar o launcher ja ganha o atalho funcionando.
    clip: typeof h.clip === 'string' ? h.clip : d.clip,
    // Mesma historia dos de cima: quem ja tinha settings.json antes da
    // sobreposicao chamavel ganha os dois atalhos prontos na atualizacao.
    overlay: typeof h.overlay === 'string' ? h.overlay : d.overlay,
    soundWheel: typeof h.soundWheel === 'string' ? h.soundWheel : d.soundWheel,
    sounds
  }
}

function normalizeChat(raw: Partial<ChatSettings> | undefined): ChatSettings {
  const d = DEFAULTS.chat
  const c = raw ?? {}

  // Lista de canais silenciados vem do disco: filtrar o que nao e string
  // evita que um arquivo editado na mao quebre o `includes` do renderer.
  const mutedChannels = Array.isArray(c.mutedChannels)
    ? Array.from(new Set(c.mutedChannels.filter((id) => typeof id === 'string' && id)))
    : d.mutedChannels

  return {
    compact: c.compact ?? d.compact,
    showEmbeds: c.showEmbeds ?? d.showEmbeds,
    notifyOnMention: c.notifyOnMention ?? d.notifyOnMention,
    notifyAllMessages: c.notifyAllMessages ?? d.notifyAllMessages,
    messageSound: c.messageSound ?? d.messageSound,
    mutedChannels
  }
}

function normalizeScreenShare(
  raw: Partial<ScreenShareSettings> | undefined
): ScreenShareSettings {
  const d = DEFAULTS.screenShare
  const s = raw ?? {}
  return {
    withAudio: s.withAudio ?? d.withAudio,
    muteLauncher: s.muteLauncher ?? d.muteLauncher,
    quality: isScreenShareQuality(s.quality) ? s.quality : d.quality,
    content: isScreenShareContent(s.content) ? s.content : d.content,
    idleWhenUnwatched: s.idleWhenUnwatched ?? d.idleWhenUnwatched
  }
}

function normalizeMusic(raw: Partial<MusicSettings> | undefined): MusicSettings {
  const d = DEFAULTS.music
  const m = raw ?? {}
  return {
    volume: clamp(Number(m.volume), 0, 1, d.volume),
    duck: m.duck ?? d.duck,
    // Teto de 0.9: "abaixar pra 95%" nao abaixa nada e faria a pessoa achar
    // que o recurso esta quebrado quando na verdade esta ligado e sem efeito.
    duckLevel: clamp(Number(m.duckLevel), 0, 0.9, d.duckLevel)
  }
}

function normalizeLol(raw: Partial<LolSettings> | undefined): LolSettings {
  const d = DEFAULTS.lol
  const l = raw ?? {}
  return {
    enabled: l.enabled ?? d.enabled,
    shareLiveScore: l.shareLiveScore ?? d.shareLiveScore,
    autoJoinVoice:
      l.autoJoinVoice === 'auto' || l.autoJoinVoice === 'off' || l.autoJoinVoice === 'ask'
        ? l.autoJoinVoice
        : d.autoJoinVoice,
    postGameCard: l.postGameCard ?? d.postGameCard,
    lockfilePath: typeof l.lockfilePath === 'string' ? l.lockfilePath.trim() : d.lockfilePath,
    overlay: l.overlay ?? d.overlay
  }
}

/**
 * Preferencias da sobreposicao.
 *
 * MIGRACAO 2 → 3: o canto morava em `lol.overlayCorner`. Quem ja tinha
 * escolhido um canto nao pode perde-lo so porque a sobreposicao deixou de ser
 * so de League — entao, faltando `overlay.corner` no arquivo, o valor antigo
 * vale. A leitura do campo velho e por cast: ele nao existe mais no tipo,
 * existe so nos arquivos ja gravados.
 *
 * Nao ha "revisao < 3" aqui de proposito. A migracao do tema (1 → 2) precisou
 * da revisao porque mudava uma escolha VALIDA da pessoa; esta so preenche um
 * campo que ainda nao existe, e checar a revisao daria o mesmo resultado com
 * mais uma coisa pra dar errado.
 */
function normalizeOverlay(
  raw: Partial<OverlaySettings> | undefined,
  lol: Partial<LolSettings> | undefined
): OverlaySettings {
  const d = DEFAULTS.overlay
  const o = raw ?? {}
  const legacyCorner = (lol as { overlayCorner?: unknown } | undefined)?.overlayCorner

  const corner = isOverlayCorner(o.corner)
    ? o.corner
    : isOverlayCorner(legacyCorner)
      ? legacyCorner
      : d.corner

  return {
    enabled: o.enabled ?? d.enabled,
    corner,
    dock: normalizeDock(o.dock, corner)
  }
}

/**
 * MIGRACAO 3 → 4: o canto vira lado + altura.
 *
 * Quem tinha escolhido "inferior esquerdo" nao pode ver a sobreposicao pular
 * pro outro lado da tela so porque agora ela se arrasta. O lado sai do canto
 * direto; a altura vira 1/4 ou 3/4 da tela, que e onde os cantos ficavam sem
 * encostar no placar nem no HUD.
 */
function normalizeDock(
  raw: Partial<OverlayDock> | undefined,
  corner: OverlayCorner
): OverlayDock {
  const fromCorner: OverlayDock = {
    side: corner === 'top-left' || corner === 'bottom-left' ? 'left' : 'right',
    offset: corner === 'top-left' || corner === 'top-right' ? 0.25 : 0.75
  }
  const dock = raw ?? {}

  return {
    side: isOverlaySide(dock.side) ? dock.side : fromCorner.side,
    // Preso longe das bordas: uma aba com o centro em 0 ou 1 sai metade pra
    // fora da tela e nao da mais pra pegar de volta.
    offset: clamp(Number(dock.offset), 0.06, 0.94, fromCorner.offset)
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

  // Revisao 1 → 2: o tema padrao virou Roxo Murcho e a decisao foi "pra
  // todo mundo" — quem ainda esta na revisao 1 recebe o roxo mesmo que o
  // arquivo diga grafite (que era o unico valor possivel ate entao). Quem
  // escolher outro tema depois salva com a revisao nova e nao e mexido.
  const revision = Number(raw.settingsRevision) || 1
  const theme = revision < 2 ? 'roxo' : isThemeId(raw.theme) ? raw.theme : DEFAULTS.theme

  return {
    settingsRevision: SETTINGS_REVISION,
    theme,
    maxRamMb,
    minRamMb,
    notifyOnJoinLeave: raw.notifyOnJoinLeave ?? DEFAULTS.notifyOnJoinLeave,
    soundEnabled: raw.soundEnabled ?? DEFAULTS.soundEnabled,
    soundVolume: clamp(Number(raw.soundVolume), 0, 1, DEFAULTS.soundVolume),
    lastSeenModpackTag: raw.lastSeenModpackTag ?? DEFAULTS.lastSeenModpackTag,
    lastSeenVersion: raw.lastSeenVersion ?? DEFAULTS.lastSeenVersion,

    autostart: raw.autostart ?? DEFAULTS.autostart,
    startMinimized: raw.startMinimized ?? DEFAULTS.startMinimized,
    shareMinecraftActivity: raw.shareMinecraftActivity ?? DEFAULTS.shareMinecraftActivity,
    lol: normalizeLol(raw.lol),
    overlay: normalizeOverlay(raw.overlay, raw.lol),

    voice: normalizeVoice(raw.voice),
    hotkeys: normalizeHotkeys(raw.hotkeys),
    chat: normalizeChat(raw.chat),
    screenShare: normalizeScreenShare(raw.screenShare),
    music: normalizeMusic(raw.music),
    userVolumes: normalizeUserVolumes(raw.userVolumes),
    soundboardVolume: clamp(Number(raw.soundboardVolume), 0, 1, DEFAULTS.soundboardVolume),
    voiceCueVolume: clamp(Number(raw.voiceCueVolume), 0, 1, DEFAULTS.voiceCueVolume),
    nudgeOptOut: raw.nudgeOptOut ?? DEFAULTS.nudgeOptOut,
    nudgeShakeWindow: raw.nudgeShakeWindow ?? DEFAULTS.nudgeShakeWindow,
    // Teto de 3h: numero absurdo no arquivo (editado na mao) nao pode virar um
    // automatico que nunca dispara sem explicacao.
    afkAutoMinutes: Math.round(clamp(Number(raw.afkAutoMinutes), 0, 180, DEFAULTS.afkAutoMinutes)),
    closeToTray: raw.closeToTray ?? DEFAULTS.closeToTray,
    clipBuffer: raw.clipBuffer ?? DEFAULTS.clipBuffer
  }
}

/**
 * Cache do arquivo, validado pelo mtime.
 *
 * `loadSettings` e chamado de timers (descoberta do LoL a cada ciclo, status
 * do servidor a cada 30 s, cada `settings:get` do renderer): ler e normalizar
 * o JSON toda vez era leitura de disco e alocacao a troco de nada. Um `stat`
 * e barato e ainda pega edicao manual do arquivo com o launcher aberto.
 *
 * O objeto devolvido e sempre uma copia nova (normalize) — quem chama pode
 * mexer a vontade sem envenenar o cache.
 */
let cached: { mtimeMs: number; size: number; raw: string } | null = null

export async function loadSettings(): Promise<LauncherSettings> {
  try {
    const file = settingsPath()
    const stat = await fs.stat(file)
    if (!cached || cached.mtimeMs !== stat.mtimeMs || cached.size !== stat.size) {
      cached = { mtimeMs: stat.mtimeMs, size: stat.size, raw: await fs.readFile(file, 'utf-8') }
    }
    return normalize(JSON.parse(cached.raw) as Partial<LauncherSettings>)
  } catch {
    cached = null
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
    lol: { ...current.lol, ...(patch.lol ?? {}) },
    overlay: { ...current.overlay, ...(patch.overlay ?? {}) },
    hotkeys: {
      ...current.hotkeys,
      ...(patch.hotkeys ?? {}),
      sounds: { ...current.hotkeys.sounds, ...(patch.hotkeys?.sounds ?? {}) }
    },
    // `mutedChannels` NAO entra no merge: silenciar e dessilenciar precisam
    // poder ENCOLHER a lista, e um spread so sabe crescer.
    chat: { ...current.chat, ...(patch.chat ?? {}) },
    screenShare: { ...current.screenShare, ...(patch.screenShare ?? {}) },
    music: { ...current.music, ...(patch.music ?? {}) },
    // Merge por pessoa: ajustar o volume de UM nao pode apagar o dos outros.
    // Voltar alguem pro 1 remove a chave no normalize logo abaixo.
    userVolumes: { ...current.userVolumes, ...(patch.userVolumes ?? {}) }
  }

  const next = normalize(merged)
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true })
  // Escrita atomica: gravar direto e cair no meio deixava um JSON truncado, e
  // o boot seguinte voltava tudo pro padrao.
  const file = settingsPath()
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(next, null, 2))
  await fs.rename(tmp, file)
  cached = null
  return next
}
