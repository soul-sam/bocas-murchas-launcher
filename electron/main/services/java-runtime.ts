import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import extract from 'extract-zip'
import { downloadFile, fetchJson, type DownloadProgressFn } from './download.js'

const execFileAsync = promisify(execFile)

const ADOPTIUM_API = 'https://api.adoptium.net/v3'

interface AdoptiumAsset {
  binary: {
    package: {
      checksum: string
      link: string
      name: string
      size: number
    }
  }
  release_name: string
}

function dataRoot(): string {
  return path.join(app.getPath('userData'), 'data')
}

function jreRoot(): string {
  return path.join(dataRoot(), 'jre-17')
}

function markerFile(): string {
  return path.join(jreRoot(), '.installed-release')
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function findJavaExe(root: string): Promise<string | null> {
  // Adoptium zip extracts to a folder like jdk-17.0.13+11-jre/ that contains bin/java.exe
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidate = path.join(root, entry.name, 'bin', 'java.exe')
    if (await pathExists(candidate)) return candidate
  }
  // Fallback: maybe it's at root level already
  const directCandidate = path.join(root, 'bin', 'java.exe')
  if (await pathExists(directCandidate)) return directCandidate
  return null
}

export async function findExistingJava(): Promise<string | null> {
  if (!(await pathExists(jreRoot()))) return null
  return findJavaExe(jreRoot())
}

export async function verifyJava(javaExe: string): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    // `java -version` prints to stderr
    const { stderr } = await execFileAsync(javaExe, ['-version'])
    const match = stderr.match(/version "([^"]+)"/)
    if (!match) return { ok: false, error: 'Não foi possível ler a versão do Java' }
    return { ok: true, version: match[1] }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

async function fetchLatestJreAsset(): Promise<AdoptiumAsset> {
  const url = `${ADOPTIUM_API}/assets/latest/17/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse`
  const list = await fetchJson<AdoptiumAsset[]>(url)
  if (!list.length) throw new Error('Adoptium não retornou nenhum release Java 17 jre/windows/x64')
  const pkg = list[0].binary.package
  console.log(`[java-runtime] Adoptium release=${list[0].release_name}`)
  console.log(`[java-runtime]   name=${pkg.name}`)
  console.log(`[java-runtime]   size=${pkg.size}  sha256=${pkg.checksum}`)
  console.log(`[java-runtime]   url=${pkg.link}`)
  return list[0]
}

export interface InstallJavaResult {
  javaExe: string
  releaseName: string
}

/**
 * Ensures a Java 17 JRE is installed in `userData/data/jre-17/`. If already
 * installed (marker file present and java.exe runs), returns immediately.
 * Otherwise downloads from Adoptium, verifies SHA-256, extracts.
 */
export async function ensureJavaRuntime(onProgress?: DownloadProgressFn): Promise<InstallJavaResult> {
  const existing = await findExistingJava()
  if (existing) {
    const verify = await verifyJava(existing)
    if (verify.ok) {
      const release = await fs.readFile(markerFile(), 'utf-8').catch(() => 'unknown')
      return { javaExe: existing, releaseName: release.trim() }
    }
    // Broken install — wipe and reinstall
    await fs.rm(jreRoot(), { recursive: true, force: true })
  }

  const asset = await fetchLatestJreAsset()
  await fs.mkdir(jreRoot(), { recursive: true })

  const downloadPath = path.join(dataRoot(), 'tmp', asset.binary.package.name)
  await fs.mkdir(path.dirname(downloadPath), { recursive: true })

  await downloadFile({
    url: asset.binary.package.link,
    destination: downloadPath,
    sha256: asset.binary.package.checksum,
    size: asset.binary.package.size,
    onProgress
  })

  await extract(downloadPath, { dir: jreRoot() })
  await fs.unlink(downloadPath).catch(() => undefined)

  const javaExe = await findJavaExe(jreRoot())
  if (!javaExe) throw new Error('Java extraído mas java.exe não foi encontrado')

  const verify = await verifyJava(javaExe)
  if (!verify.ok) throw new Error(`Java instalado mas não roda: ${verify.error}`)

  await fs.writeFile(markerFile(), asset.release_name)
  return { javaExe, releaseName: asset.release_name }
}
