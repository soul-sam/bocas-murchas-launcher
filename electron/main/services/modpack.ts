import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import extract from 'extract-zip'
import { downloadFile, fetchJson } from './download.js'
import { getMcPaths } from './minecraft.js'

const MODPACK_REPO = 'soul-sam/bocas-murchas-modpack'
const STATE_FILE = 'modpack-state.json'

interface GithubAsset {
  name: string
  browser_download_url: string
  size: number
}

interface GithubRelease {
  tag_name: string
  name: string | null
  body: string | null
  prerelease: boolean
  draft: boolean
  published_at: string
  assets: GithubAsset[]
}

export interface ModpackChangelog {
  tag: string
  publishedAt: string
  name?: string
  body?: string
}

export interface ModpackManifest {
  name?: string
  version?: string
  minecraft?: string
  forge?: string
  description?: string
}

interface State {
  tag: string
  installedAt: string
  files: string[]
}

export interface ModpackProgressEvent {
  phase: 'check' | 'download' | 'extract' | 'apply' | 'done' | 'skipped'
  current: number
  total: number
  detail?: string
}

export type ModpackProgressFn = (e: ModpackProgressEvent) => void

function dataRoot(): string {
  return path.join(app.getPath('userData'), 'data')
}

function stateFile(): string {
  return path.join(dataRoot(), STATE_FILE)
}

async function readState(): Promise<State | null> {
  try {
    return JSON.parse(await fs.readFile(stateFile(), 'utf-8')) as State
  } catch {
    return null
  }
}

async function writeState(s: State): Promise<void> {
  await fs.mkdir(path.dirname(stateFile()), { recursive: true })
  await fs.writeFile(stateFile(), JSON.stringify(s, null, 2))
}

async function fetchLatestRelease(): Promise<GithubRelease | null> {
  const url = `https://api.github.com/repos/${MODPACK_REPO}/releases/latest`
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status} para ${url}`)
  return (await res.json()) as GithubRelease
}

function pickZipAsset(release: GithubRelease): GithubAsset | null {
  const zips = release.assets.filter((a) => a.name.toLowerCase().endsWith('.zip'))
  if (!zips.length) return null
  return zips.find((a) => /modpack|pack/i.test(a.name)) ?? zips[0]
}

async function walk(dir: string, rel = ''): Promise<string[]> {
  const out: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const childRel = path.join(rel, entry.name)
    const childAbs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await walk(childAbs, childRel)))
    } else if (entry.isFile()) {
      out.push(childRel)
    }
  }
  return out
}

async function safeRemove(file: string): Promise<void> {
  await fs.unlink(file).catch(() => undefined)
}

async function copyTree(src: string, dst: string): Promise<string[]> {
  const written: string[] = []
  const files = await walk(src)
  for (const rel of files) {
    const from = path.join(src, rel)
    const to = path.join(dst, rel)
    await fs.mkdir(path.dirname(to), { recursive: true })
    await fs.copyFile(from, to)
    written.push(rel)
  }
  return written
}

export interface ModpackResult {
  status: 'installed' | 'already-current' | 'no-release'
  tag?: string
  manifest?: ModpackManifest
}

/**
 * Syncs the modpack from `bocas-murchas-modpack` GitHub Releases. Skips if
 * the current installed tag matches the latest release. On update, removes
 * files written by the previous version before installing the new one — so
 * removed mods don't linger.
 *
 * Returns 'no-release' (not an error) if the repo has no releases yet,
 * which lets the launcher still work in early development.
 */
export async function syncModpack(onProgress: ModpackProgressFn): Promise<ModpackResult> {
  onProgress({ phase: 'check', current: 0, total: 1, detail: `Verificando ${MODPACK_REPO}` })

  let release: GithubRelease | null
  try {
    release = await fetchLatestRelease()
  } catch (err) {
    // Network failure shouldn't block install if the user already has a pack
    const prev = await readState()
    if (prev) {
      onProgress({ phase: 'done', current: 1, total: 1, detail: `Offline — usando v${prev.tag}` })
      return { status: 'already-current', tag: prev.tag }
    }
    throw err
  }

  if (!release || release.draft) {
    onProgress({ phase: 'skipped', current: 1, total: 1, detail: 'Sem release publicada ainda' })
    return { status: 'no-release' }
  }

  const previous = await readState()
  if (previous?.tag === release.tag_name) {
    onProgress({ phase: 'done', current: 1, total: 1, detail: `v${release.tag_name} já instalada` })
    return { status: 'already-current', tag: previous.tag }
  }

  const asset = pickZipAsset(release)
  if (!asset) {
    throw new Error(`Release ${release.tag_name} não tem um .zip — espera um asset modpack.zip`)
  }

  const { root: mcRoot } = getMcPaths()
  const zipDest = path.join(dataRoot(), 'tmp', `modpack-${release.tag_name}.zip`)
  await fs.mkdir(path.dirname(zipDest), { recursive: true })

  onProgress({ phase: 'download', current: 0, total: asset.size, detail: asset.name })
  await downloadFile({
    url: asset.browser_download_url,
    destination: zipDest,
    size: asset.size,
    onProgress: (b, t) => onProgress({ phase: 'download', current: b, total: t || asset.size, detail: asset.name })
  })

  const extractDir = path.join(dataRoot(), 'tmp', `modpack-${release.tag_name}-extracted`)
  await fs.rm(extractDir, { recursive: true, force: true })
  await fs.mkdir(extractDir, { recursive: true })

  onProgress({ phase: 'extract', current: 0, total: 1, detail: 'Descomprimindo' })
  await extract(zipDest, { dir: extractDir })
  onProgress({ phase: 'extract', current: 1, total: 1 })

  // Optional manifest at extracted root
  let manifest: ModpackManifest | undefined
  try {
    const raw = await fs.readFile(path.join(extractDir, 'manifest.json'), 'utf-8')
    manifest = JSON.parse(raw) as ModpackManifest
  } catch {
    manifest = undefined
  }

  // Remove files written by previous version that aren't in the new payload
  // (this prevents stale mods from lingering after an update).
  if (previous) {
    for (const oldFile of previous.files) {
      await safeRemove(path.join(mcRoot, oldFile))
    }
  }

  // Copy mods/ and config/ to the .minecraft root
  onProgress({ phase: 'apply', current: 0, total: 1, detail: 'Aplicando modpack' })
  const writtenFiles: string[] = []
  for (const subdir of ['mods', 'config', 'shaderpacks']) {
    const src = path.join(extractDir, subdir)
    if (!(await fs.access(src).then(() => true).catch(() => false))) continue
    const dst = path.join(mcRoot, subdir)
    const written = await copyTree(src, dst)
    writtenFiles.push(...written.map((rel) => path.join(subdir, rel).replace(/\\/g, '/')))
  }

  await writeState({
    tag: release.tag_name,
    installedAt: new Date().toISOString(),
    files: writtenFiles
  })

  // Cleanup temp
  await fs.rm(extractDir, { recursive: true, force: true }).catch(() => undefined)
  await safeRemove(zipDest)

  onProgress({ phase: 'done', current: 1, total: 1, detail: `v${release.tag_name} instalada` })
  return { status: 'installed', tag: release.tag_name, manifest }
}

export async function getInstalledModpackVersion(): Promise<string | null> {
  const state = await readState()
  return state?.tag ?? null
}

export async function getLatestModpackChangelog(): Promise<ModpackChangelog | null> {
  try {
    const release = await fetchLatestRelease()
    if (!release || release.draft) return null
    return {
      tag: release.tag_name,
      publishedAt: release.published_at,
      name: release.name ?? undefined,
      body: release.body ?? undefined
    }
  } catch {
    return null
  }
}
