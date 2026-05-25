import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { downloadFile, type DownloadProgressFn } from './download.js'
import { getMcPaths } from './minecraft.js'

const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge'

export const TARGET_MC = '1.20.1'
export const TARGET_FORGE = '47.4.10'
export const FORGE_VERSION_ID = `${TARGET_MC}-forge-${TARGET_FORGE}`
const FORGE_FULL = `${TARGET_MC}-${TARGET_FORGE}`

function dataRoot(): string {
  return path.join(app.getPath('userData'), 'data')
}

function installerPath(): string {
  return path.join(dataRoot(), 'tmp', `forge-${FORGE_FULL}-installer.jar`)
}

function installerUrl(): string {
  return `${FORGE_MAVEN}/${FORGE_FULL}/forge-${FORGE_FULL}-installer.jar`
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function ensureLauncherProfiles(mcDir: string): Promise<void> {
  // Forge installer writes to launcher_profiles.json. If missing, it errors.
  const file = path.join(mcDir, 'launcher_profiles.json')
  if (await pathExists(file)) return
  const placeholder = {
    profiles: {},
    selectedProfileName: '',
    clientToken: '00000000-0000-0000-0000-000000000000'
  }
  await fs.writeFile(file, JSON.stringify(placeholder, null, 2))
}

async function isForgeAlreadyInstalled(): Promise<boolean> {
  const { versions } = getMcPaths()
  const forgeJson = path.join(versions, FORGE_VERSION_ID, `${FORGE_VERSION_ID}.json`)
  return pathExists(forgeJson)
}

function runInstaller(javaExe: string, installerJar: string, mcDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(javaExe, ['-jar', installerJar, '--installClient', mcDir], {
      cwd: path.dirname(installerJar),
      windowsHide: true
    })

    let stderrBuf = ''
    child.stdout.on('data', (data: Buffer) => {
      console.log('[forge-installer]', data.toString().trim())
    })
    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString()
      stderrBuf += text
      console.log('[forge-installer:stderr]', text.trim())
    })
    child.on('error', (err) => reject(new Error(`Forge installer falhou ao iniciar: ${err.message}`)))
    child.on('close', (code) => {
      if (code === 0) return resolve()
      reject(new Error(
        `Forge installer saiu com código ${code}.\n${stderrBuf.slice(0, 800)}`
      ))
    })
  })
}

/**
 * Installs Forge for the configured MC version. Idempotent — if the version
 * folder already exists with the JSON manifest, returns immediately.
 *
 * Requires:
 *  - Java 17 already installed (see java-runtime.ensureJavaRuntime)
 *  - Vanilla MC already installed (see minecraft.installVanilla) — Forge
 *    inherits from the vanilla version JSON.
 */
export async function ensureForge(
  javaExe: string,
  onProgress?: DownloadProgressFn
): Promise<{ versionId: string; versionJsonPath: string }> {
  const { versions, root: mcDir } = getMcPaths()
  const versionJsonPath = path.join(versions, FORGE_VERSION_ID, `${FORGE_VERSION_ID}.json`)

  if (await isForgeAlreadyInstalled()) {
    return { versionId: FORGE_VERSION_ID, versionJsonPath }
  }

  await fs.mkdir(path.dirname(installerPath()), { recursive: true })
  await fs.mkdir(mcDir, { recursive: true })
  await ensureLauncherProfiles(mcDir)

  const installer = installerPath()
  await downloadFile({
    url: installerUrl(),
    destination: installer,
    onProgress
  })

  await runInstaller(javaExe, installer, mcDir)

  if (!(await isForgeAlreadyInstalled())) {
    throw new Error(
      `Forge installer terminou OK mas ${FORGE_VERSION_ID}.json não foi criado em versions/`
    )
  }

  await fs.unlink(installer).catch(() => undefined)
  await mirrorVanillaJarToForgeDir()

  return { versionId: FORGE_VERSION_ID, versionJsonPath }
}

/**
 * Forge's runtime expects the primary jar on classpath to be named after the
 * Forge version (e.g. 1.20.1-forge-47.4.10.jar) so that its `-DignoreList=…,
 * ${version_name}.jar` arg can match it. Mojang's launcher achieves this by
 * copying versions/1.20.1/1.20.1.jar to versions/1.20.1-forge-47.4.10/<same name>.jar.
 * We mirror the same behavior. Without this, all `net.minecraft.*` classes
 * become inaccessible to Forge's ASM transformer and every mod errors with
 * ClassMetadataNotFoundException.
 */
async function mirrorVanillaJarToForgeDir(): Promise<void> {
  const { versions } = getMcPaths()
  const forgeJar = path.join(versions, FORGE_VERSION_ID, `${FORGE_VERSION_ID}.jar`)
  const vanillaJar = path.join(versions, TARGET_MC, `${TARGET_MC}.jar`)
  if (await pathExists(forgeJar)) return
  if (!(await pathExists(vanillaJar))) {
    throw new Error(`Jar vanilla ${vanillaJar} não existe — esperado depois da Fase 3`)
  }
  await fs.mkdir(path.dirname(forgeJar), { recursive: true })
  await fs.copyFile(vanillaJar, forgeJar)
}
