import { app, BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { findExistingJava } from './java-runtime.js'
import { loadMergedVersion } from './version-loader.js'
import { buildLaunchArgs } from './arg-builder.js'
import { ensureFreshMcSession } from './mc-auth-flow.js'
import { FORGE_VERSION_ID } from './forge.js'
import { getMcPaths } from './minecraft.js'
import { loadSettings } from './settings.js'

const MC_SERVER = { host: '187.77.205.239', port: 25565 }

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

interface InternalState extends LaunchStatus {
  process?: ChildProcess
  stderrBuffer: string[]
  stdoutBuffer: string[]
}

// Captures the full crash output so we never lose stack traces to a tail cap.
const MAX_BUFFER_LINES = 1200

let state: InternalState = {
  stage: 'idle',
  stderrBuffer: [],
  stdoutBuffer: []
}

function crashLogPath(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(app.getPath('userData'), 'data', 'crashes', `mc-${ts}.log`)
}

async function writeCrashLog(): Promise<string | undefined> {
  try {
    const file = crashLogPath()
    await fs.mkdir(path.dirname(file), { recursive: true })
    const banner = `=== Bocas Murchas Launcher crash log ${new Date().toISOString()} ===\n`
    const stdout = state.stdoutBuffer.join('')
    const stderr = state.stderrBuffer.join('')
    await fs.writeFile(
      file,
      `${banner}\n--- STDOUT ---\n${stdout}\n--- STDERR ---\n${stderr}`
    )
    return file
  } catch {
    return undefined
  }
}

// ZIP End-of-Central-Directory signature: 0x06054b50, little endian.
const EOCD_SIGNATURE = Buffer.from([0x50, 0x4b, 0x05, 0x06])

/** Validates a single jar — confirms it isn't empty and has a valid ZIP trailer. */
async function validateJar(filepath: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const stat = await fs.stat(filepath)
    if (stat.size === 0) return { ok: false, reason: 'arquivo vazio (0 bytes)' }
    if (stat.size < 22) return { ok: false, reason: `arquivo muito pequeno (${stat.size} bytes)` }
    // Read up to last 64KB and look for the EOCD signature.
    const window = Math.min(stat.size, 65557)
    const fd = await fs.open(filepath, 'r')
    try {
      const buf = Buffer.alloc(window)
      await fd.read(buf, 0, window, stat.size - window)
      if (buf.lastIndexOf(EOCD_SIGNATURE) === -1) {
        return { ok: false, reason: `ZIP central directory ausente (provável truncamento — ${stat.size} bytes)` }
      }
      return { ok: true }
    } finally {
      await fd.close()
    }
  } catch (err) {
    return { ok: false, reason: (err as Error).message }
  }
}

interface JarValidationFailure {
  file: string
  reason: string
}

async function validateJarsInDir(dir: string): Promise<JarValidationFailure[]> {
  const failures: JarValidationFailure[] = []
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return failures
  }
  for (const name of entries) {
    if (!name.toLowerCase().endsWith('.jar')) continue
    const result = await validateJar(path.join(dir, name))
    if (!result.ok) failures.push({ file: name, reason: result.reason })
  }
  return failures
}

async function validateJarsRecursive(dir: string): Promise<JarValidationFailure[]> {
  const failures: JarValidationFailure[] = []
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return failures
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      failures.push(...(await validateJarsRecursive(full)))
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.jar')) {
      const result = await validateJar(full)
      if (!result.ok) failures.push({ file: full, reason: result.reason })
    }
  }
  return failures
}

async function dumpLaunchInfo(
  javaExe: string,
  cwd: string,
  args: string[]
): Promise<string> {
  const file = path.join(app.getPath('userData'), 'data', 'last-launch.txt')
  await fs.mkdir(path.dirname(file), { recursive: true })
  const lines = [
    `=== Launch info ${new Date().toISOString()} ===`,
    `JAVA: ${javaExe}`,
    `CWD:  ${cwd}`,
    `ARGS (${args.length}):`,
    ...args.map((a, i) => `  [${i}] ${a}`),
    ''
  ]
  await fs.writeFile(file, lines.join('\n'))
  return file
}

function extractKeyError(stderr: string): string {
  // Pick out the most informative lines: any "Exception in thread..." or
  // "Caused by:" plus their first 3 "at" frames. Falls back to the last
  // 60 lines if nothing matches.
  const lines = stderr.split('\n')
  const keyIndices: number[] = []
  lines.forEach((line, i) => {
    if (/^\s*(Exception in thread|Caused by:|java\.lang\.|[A-Za-z][A-Za-z0-9_.$]*Exception:|[A-Za-z][A-Za-z0-9_.$]*Error:)/.test(line)) {
      keyIndices.push(i)
    }
  })

  if (keyIndices.length === 0) {
    return lines.slice(-60).join('\n')
  }

  const chunks: string[] = []
  for (const i of keyIndices) {
    chunks.push(lines.slice(i, Math.min(i + 4, lines.length)).join('\n'))
  }
  return chunks.join('\n…\n')
}

export function getLaunchStatus(): LaunchStatus {
  const { process: _p, stderrBuffer: _t, stdoutBuffer: _o, ...visible } = state
  return visible
}

function broadcast(): void {
  const payload = getLaunchStatus()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('game:status', payload)
  }
}

function set(patch: Partial<InternalState>): void {
  state = { ...state, ...patch }
  broadcast()
}

function pushBuffer(buf: string[], chunk: string): void {
  buf.push(chunk)
  if (buf.length > MAX_BUFFER_LINES) buf.shift()
}

export async function launchGame(): Promise<LaunchStatus> {
  if (state.stage === 'preparing' || state.stage === 'running') return getLaunchStatus()

  set({ stage: 'preparing', error: undefined, exitCode: undefined, pid: undefined })

  try {
    const javaExe = await findExistingJava()
    if (!javaExe) throw new Error('Java 17 não encontrado. Rode a instalação primeiro.')

    const mcSession = await ensureFreshMcSession()
    if (!mcSession) throw new Error('Conta Microsoft não conectada. Conecte antes de jogar.')

    // Pre-flight: catch corrupt/truncated jars before the JVM does — Forge's
    // "zip END header not found" error doesn't tell you WHICH jar is bad.
    const { root: mcRoot, libraries: libsRoot, versions: versionsRoot } = getMcPaths()
    const allFailures = [
      ...(await validateJarsInDir(path.join(mcRoot, 'mods'))),
      ...(await validateJarsRecursive(libsRoot)),
      ...(await validateJarsRecursive(versionsRoot))
    ]
    if (allFailures.length > 0) {
      const list = allFailures.map((f) => `  • ${f.file} — ${f.reason}`).join('\n')
      throw new Error(
        `Jars inválidos detectados:\n${list}\n\n` +
        `Apaga esses arquivos e roda "Re-verificar" — eles serão baixados de novo.`
      )
    }

    const version = await loadMergedVersion(FORGE_VERSION_ID)
    const settings = await loadSettings()
    const { jvmArgs, gameArgs, mainClass } = buildLaunchArgs({
      version,
      player: {
        name: mcSession.profile.name,
        uuid: mcSession.profile.id,
        accessToken: mcSession.accessToken
      },
      server: MC_SERVER,
      maxRamMb: settings.maxRamMb,
      minRamMb: settings.minRamMb
    })

    const { root: cwd } = getMcPaths()
    await fs.mkdir(cwd, { recursive: true })

    const args = [...jvmArgs, mainClass, ...gameArgs]
    console.log('[launcher] spawning java with', args.length, 'args, mainClass=', mainClass)
    const launchInfoPath = await dumpLaunchInfo(javaExe, cwd, args)
    console.log('[launcher] full args dumped to', launchInfoPath)

    const child = spawn(javaExe, args, {
      cwd,
      detached: false,
      windowsHide: false,
      env: { ...process.env, _JAVA_OPTIONS: '' }
    })

    state.stderrBuffer = []
    state.stdoutBuffer = []
    child.stdout?.on('data', (chunk: Buffer) => {
      const line = chunk.toString()
      console.log('[mc:stdout]', line.trim())
      pushBuffer(state.stdoutBuffer, line)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString()
      console.log('[mc:stderr]', line.trim())
      pushBuffer(state.stderrBuffer, line)
    })

    child.on('error', (err) => {
      set({
        stage: 'error',
        error: `Falha ao iniciar Java: ${err.message}`,
        process: undefined
      })
    })

    child.on('exit', async (code) => {
      const wasRunning = state.stage === 'running'
      const exitOk = code === 0 || code === null
      if (exitOk && wasRunning) {
        set({ stage: 'exited', exitCode: code ?? undefined, process: undefined, pid: undefined })
        return
      }

      const stderr = state.stderrBuffer.join('')
      const key = extractKeyError(stderr)
      const logPath = await writeCrashLog()
      set({
        stage: 'error',
        exitCode: code ?? undefined,
        process: undefined,
        pid: undefined,
        logPath,
        error: `Minecraft saiu com código ${code}.\n\n${key}`
      })
    })

    set({
      stage: 'running',
      process: child,
      pid: child.pid,
      serverTarget: `${MC_SERVER.host}:${MC_SERVER.port}`,
      startedAt: new Date().toISOString()
    })

    return getLaunchStatus()
  } catch (err) {
    set({
      stage: 'error',
      error: err instanceof Error ? err.message : String(err),
      process: undefined,
      pid: undefined
    })
    return getLaunchStatus()
  }
}

export function isGameRunning(): boolean {
  return state.stage === 'running' || state.stage === 'preparing'
}
