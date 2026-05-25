import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { downloadFile, fetchJson, runBatched, type DownloadProgressFn } from './download.js'

const VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

export const TARGET_MC_VERSION = '1.20.1'

interface VersionManifest {
  versions: Array<{
    id: string
    type: string
    url: string
    sha1: string
  }>
}

interface DownloadEntry {
  url: string
  sha1: string
  size: number
  path?: string
}

interface OsRule {
  action: 'allow' | 'disallow'
  os?: { name?: string; arch?: string; version?: string }
  features?: Record<string, boolean>
}

interface Library {
  name: string
  rules?: OsRule[]
  downloads?: {
    artifact?: DownloadEntry
    classifiers?: Record<string, DownloadEntry>
  }
  natives?: Record<string, string>
}

interface VersionJson {
  id: string
  type: string
  mainClass: string
  assetIndex: { id: string; sha1: string; size: number; totalSize: number; url: string }
  assets: string
  downloads: { client: DownloadEntry }
  libraries: Library[]
}

interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>
}

export interface InstallProgress {
  stage: 'manifest' | 'client' | 'libraries' | 'assetIndex' | 'assets' | 'done'
  current: number
  total: number
  detail?: string
}

export type ProgressFn = (p: InstallProgress) => void

export interface InstallOptions {
  quickCheck?: boolean
}

function mcRoot(): string {
  return path.join(app.getPath('userData'), 'data', 'minecraft')
}

function libsRoot(): string {
  return path.join(mcRoot(), 'libraries')
}

function assetsRoot(): string {
  return path.join(mcRoot(), 'assets')
}

function versionsRoot(): string {
  return path.join(mcRoot(), 'versions')
}

export function getMcPaths() {
  return {
    root: mcRoot(),
    libraries: libsRoot(),
    assets: assetsRoot(),
    versions: versionsRoot()
  }
}

function isLibraryAllowed(lib: Library): boolean {
  if (!lib.rules) return true
  let allowed = false
  for (const rule of lib.rules) {
    const matches =
      !rule.os ||
      (rule.os.name === 'windows' ||
        (!rule.os.name && true))
    if (matches) allowed = rule.action === 'allow'
  }
  return allowed
}

function libraryArtifactPath(lib: Library): string | null {
  if (!lib.downloads?.artifact) return null
  if (lib.downloads.artifact.path) return lib.downloads.artifact.path
  // Derive path from Maven coords (group:artifact:version)
  const [group, artifact, version] = lib.name.split(':')
  if (!group || !artifact || !version) return null
  return `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`
}

export interface InstalledMcLayout {
  versionJson: VersionJson
  clientJar: string
  assetIndexId: string
  libraryClasspath: string[]
  nativesDir: string
  gameDir: string
  assetsDir: string
}

/**
 * Installs Minecraft vanilla (client jar, libraries, assets) for the target
 * version. Idempotent — re-running only downloads what's missing or corrupt.
 */
export async function installVanilla(
  versionId: string,
  onProgress: ProgressFn,
  options: InstallOptions = {}
): Promise<InstalledMcLayout> {
  const { quickCheck } = options
  onProgress({ stage: 'manifest', current: 0, total: 1 })
  const manifest = await fetchJson<VersionManifest>(VERSION_MANIFEST_URL)
  const versionEntry = manifest.versions.find((v) => v.id === versionId)
  if (!versionEntry) throw new Error(`Versão ${versionId} não encontrada no manifest da Mojang`)
  onProgress({ stage: 'manifest', current: 1, total: 1 })

  const versionDir = path.join(versionsRoot(), versionId)
  await fs.mkdir(versionDir, { recursive: true })

  const versionJsonPath = path.join(versionDir, `${versionId}.json`)
  await downloadFile({
    url: versionEntry.url,
    destination: versionJsonPath,
    sha1: versionEntry.sha1
  })
  const versionJson = JSON.parse(await fs.readFile(versionJsonPath, 'utf-8')) as VersionJson

  // Client jar
  const clientJar = path.join(versionDir, `${versionId}.jar`)
  onProgress({ stage: 'client', current: 0, total: versionJson.downloads.client.size, detail: `${versionId}.jar` })
  await downloadFile({
    url: versionJson.downloads.client.url,
    destination: clientJar,
    sha1: versionJson.downloads.client.sha1,
    size: versionJson.downloads.client.size,
    quickCheck,
    onProgress: (b, t) => onProgress({ stage: 'client', current: b, total: t || versionJson.downloads.client.size, detail: `${versionId}.jar` })
  })

  // Libraries (skip OS-restricted ones)
  const allowedLibs = versionJson.libraries.filter(isLibraryAllowed)
  const classpath: string[] = []
  const nativesDir = path.join(versionDir, 'natives')
  let libDone = 0
  await runBatched(
    allowedLibs.map((lib) => ({
      task: lib,
      run: async () => {
        const rel = libraryArtifactPath(lib)
        if (rel && lib.downloads?.artifact) {
          const dest = path.join(libsRoot(), rel)
          await downloadFile({
            url: lib.downloads.artifact.url,
            destination: dest,
            sha1: lib.downloads.artifact.sha1,
            size: lib.downloads.artifact.size,
            quickCheck
          })
          classpath.push(dest)
        }
        libDone++
        onProgress({
          stage: 'libraries',
          current: libDone,
          total: allowedLibs.length,
          detail: lib.name
        })
      }
    })),
    8
  )

  // Asset index
  const indexPath = path.join(assetsRoot(), 'indexes', `${versionJson.assetIndex.id}.json`)
  onProgress({ stage: 'assetIndex', current: 0, total: 1, detail: `${versionJson.assetIndex.id}.json` })
  await downloadFile({
    url: versionJson.assetIndex.url,
    destination: indexPath,
    sha1: versionJson.assetIndex.sha1,
    size: versionJson.assetIndex.size,
    quickCheck
  })
  onProgress({ stage: 'assetIndex', current: 1, total: 1 })

  // Assets
  const assetIndex = JSON.parse(await fs.readFile(indexPath, 'utf-8')) as AssetIndex
  const assetEntries = Object.entries(assetIndex.objects)
  let assetDone = 0
  let lastReportedAt = 0
  await runBatched(
    assetEntries.map(([assetName, info]) => ({
      task: assetName,
      run: async () => {
        const prefix = info.hash.slice(0, 2)
        const dest = path.join(assetsRoot(), 'objects', prefix, info.hash)
        const url = `https://resources.download.minecraft.net/${prefix}/${info.hash}`
        await downloadFile({
          url,
          destination: dest,
          sha1: info.hash,
          size: info.size,
          quickCheck
        })
        assetDone++
        // Throttle updates to ~10/sec but always report the very last file
        const now = Date.now()
        if (now - lastReportedAt > 100 || assetDone === assetEntries.length) {
          lastReportedAt = now
          onProgress({
            stage: 'assets',
            current: assetDone,
            total: assetEntries.length,
            detail: assetName
          })
        }
      }
    })),
    8
  )

  onProgress({ stage: 'done', current: 1, total: 1 })

  return {
    versionJson,
    clientJar,
    assetIndexId: versionJson.assetIndex.id,
    libraryClasspath: classpath,
    nativesDir,
    gameDir: mcRoot(),
    assetsDir: assetsRoot()
  }
}
