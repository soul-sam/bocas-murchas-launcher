import { BrowserWindow } from 'electron'
import { ensureJavaRuntime } from './java-runtime.js'
import { installVanilla, TARGET_MC_VERSION, type InstallProgress as McProgress } from './minecraft.js'
import { ensureForge } from './forge.js'
import { syncModpack, type ModpackProgressEvent } from './modpack.js'

export type InstallStage =
  | 'idle'
  | 'starting'
  | 'java'
  | 'minecraft'
  | 'forge'
  | 'modpack'
  | 'done'
  | 'error'

export interface InstallStatusEvent {
  stage: InstallStage
  subStage?: McProgress['stage'] | ModpackProgressEvent['phase']
  current: number
  total: number
  detail?: string
  error?: string
}

interface State extends InstallStatusEvent {
  running: boolean
}

let state: State = {
  stage: 'idle',
  current: 0,
  total: 0,
  running: false
}

export function getInstallStatus(): InstallStatusEvent {
  const { running: _running, ...visible } = state
  return visible
}

function broadcast(): void {
  const payload = getInstallStatus()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('install:progress', payload)
  }
}

function setState(patch: Partial<State>): void {
  state = { ...state, ...patch }
  broadcast()
}

interface StartInstallOptions {
  // quickCheck=true (default): trust existing files by size, skip SHA1.
  // Used for auto-launch verification.
  // quickCheck=false: full re-hash of every file. Triggered by user "Re-verificar".
  quickCheck?: boolean
}

/**
 * Sequence: Java → Vanilla MC → Forge → Modpack.
 * Idempotent at every step — re-running after success is fast.
 */
export async function startInstall(options: StartInstallOptions = {}): Promise<void> {
  if (state.running) return
  const quickCheck = options.quickCheck ?? true
  setState({
    running: true,
    stage: 'starting',
    current: 0,
    total: 0,
    detail: undefined,
    error: undefined,
    subStage: undefined
  })

  try {
    setState({ stage: 'java', current: 0, total: 0, detail: 'Verificando Java 17…', subStage: undefined })
    const java = await ensureJavaRuntime((bytes, total) => {
      setState({
        stage: 'java',
        current: bytes,
        total,
        detail: 'Baixando Java 17 (Adoptium Temurin)'
      })
    })

    setState({ stage: 'minecraft', subStage: 'manifest', current: 0, total: 1, detail: 'Buscando manifest da Mojang' })
    await installVanilla(TARGET_MC_VERSION, (p) => {
      setState({
        stage: 'minecraft',
        subStage: p.stage,
        current: p.current,
        total: p.total,
        detail: p.detail
      })
    }, { quickCheck })

    setState({ stage: 'forge', subStage: undefined, current: 0, total: 0, detail: 'Baixando installer Forge 47.4.10' })
    await ensureForge(java.javaExe, (bytes, total) => {
      setState({
        stage: 'forge',
        current: bytes,
        total,
        detail: 'Baixando installer Forge 47.4.10'
      })
    })
    setState({ stage: 'forge', current: 1, total: 1, detail: 'Forge instalado' })

    setState({ stage: 'modpack', subStage: 'check', current: 0, total: 1, detail: 'Buscando última release' })
    await syncModpack((e) => {
      setState({
        stage: 'modpack',
        subStage: e.phase,
        current: e.current,
        total: e.total,
        detail: e.detail
      })
    })

    setState({ stage: 'done', subStage: undefined, current: 1, total: 1, detail: 'Tudo pronto', running: false })
  } catch (err) {
    setState({
      stage: 'error',
      error: err instanceof Error ? err.message : String(err),
      running: false
    })
  }
}
