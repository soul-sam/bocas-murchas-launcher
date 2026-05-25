import path from 'node:path'
import { getMcPaths } from './minecraft.js'
import type { ArgEntry, Library, MergedVersion, OsRule } from './version-loader.js'

const SEP = path.delimiter // ';' on Windows, ':' elsewhere

export interface LaunchVariables {
  auth_player_name: string
  version_name: string
  game_directory: string
  assets_root: string
  assets_index_name: string
  auth_uuid: string
  auth_access_token: string
  auth_xuid: string
  clientid: string
  user_type: string
  version_type: string
  user_properties: string
  classpath: string
  natives_directory: string
  launcher_name: string
  launcher_version: string
  library_directory: string
  classpath_separator: string
  resolution_width: string
  resolution_height: string
}

function osMatchesRule(rule: OsRule): boolean {
  if (rule.os?.name) {
    const target = rule.os.name
    if (process.platform === 'win32' && target !== 'windows') return false
    if (process.platform === 'darwin' && target !== 'osx') return false
    if (process.platform === 'linux' && target !== 'linux') return false
  }
  if (rule.os?.arch) {
    if (rule.os.arch === 'x86' && process.arch !== 'ia32') return false
    if (rule.os.arch === 'x64' && process.arch !== 'x64') return false
    if (rule.os.arch === 'arm64' && process.arch !== 'arm64') return false
  }
  return true
}

function rulesAllow(rules: OsRule[] | undefined, features: Record<string, boolean>): boolean {
  if (!rules || rules.length === 0) return true
  let allow = false
  for (const rule of rules) {
    const featuresMatch =
      !rule.features ||
      Object.entries(rule.features).every(([key, val]) => features[key] === val)
    const match = osMatchesRule(rule) && featuresMatch
    if (match) allow = rule.action === 'allow'
  }
  return allow
}

function substituteVars(input: string, vars: LaunchVariables): string {
  return input.replace(/\$\{([a-z_]+)\}/g, (_, key) => {
    const value = (vars as unknown as Record<string, string>)[key]
    return value ?? `\${${key}}`
  })
}

function flattenArgs(entries: ArgEntry[], vars: LaunchVariables, features: Record<string, boolean>): string[] {
  const out: string[] = []
  for (const entry of entries) {
    if (typeof entry === 'string') {
      out.push(substituteVars(entry, vars))
      continue
    }
    if (!rulesAllow(entry.rules, features)) continue
    const value = entry.value
    if (Array.isArray(value)) {
      for (const v of value) out.push(substituteVars(v, vars))
    } else {
      out.push(substituteVars(value, vars))
    }
  }
  return out
}

function libArtifactPath(lib: Library): string | null {
  const explicit = lib.downloads?.artifact?.path
  if (explicit) return explicit
  // Derive from name (Maven format group:artifact:version[:classifier])
  const parts = lib.name.split(':')
  if (parts.length < 3) return null
  const [group, artifact, version, classifier] = parts
  const suffix = classifier ? `-${classifier}` : ''
  return `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}${suffix}.jar`
}

function libraryAllowed(lib: Library, features: Record<string, boolean>): boolean {
  return rulesAllow(lib.rules, features)
}

function buildClasspath(version: MergedVersion): string {
  const { libraries: libsRoot } = getMcPaths()
  const seen = new Set<string>()
  const parts: string[] = []
  for (const lib of version.libraries) {
    if (!libraryAllowed(lib, {})) continue
    const rel = libArtifactPath(lib)
    if (!rel) continue
    if (seen.has(rel)) continue
    seen.add(rel)
    parts.push(path.join(libsRoot, rel))
  }
  parts.push(version.clientJarPath)
  return parts.join(SEP)
}

export interface BuildArgsInput {
  version: MergedVersion
  player: { name: string; uuid: string; accessToken: string }
  server?: { host: string; port: number }
  maxRamMb?: number
  minRamMb?: number
}

export interface BuiltArgs {
  jvmArgs: string[]
  gameArgs: string[]
  mainClass: string
}

export function buildLaunchArgs(input: BuildArgsInput): BuiltArgs {
  const paths = getMcPaths()
  const classpath = buildClasspath(input.version)

  const vars: LaunchVariables = {
    auth_player_name: input.player.name,
    version_name: input.version.id,
    game_directory: paths.root,
    assets_root: paths.assets,
    assets_index_name: input.version.assetIndex.id,
    auth_uuid: input.player.uuid,
    auth_access_token: input.player.accessToken,
    // We don't get xuid/clientid from the device-code flow. Empty strings are
    // safer than letting `${...}` leak through to the JVM literally.
    auth_xuid: '0',
    clientid: '',
    user_type: 'msa',
    version_type: 'release',
    user_properties: '{}',
    classpath,
    natives_directory: path.join(paths.versions, input.version.id, 'natives'),
    launcher_name: 'BocasMurchas',
    launcher_version: '0.1.0',
    library_directory: paths.libraries,
    classpath_separator: SEP,
    resolution_width: '1280',
    resolution_height: '720'
  }

  const features: Record<string, boolean> = {}

  const memMax = input.maxRamMb ?? 4096
  const memMin = input.minRamMb ?? 1024

  const baseJvm: string[] = [
    `-Xmx${memMax}M`,
    `-Xms${memMin}M`,
    '-XX:+UseG1GC',
    '-XX:+UnlockExperimentalVMOptions',
    `-Dminecraft.launcher.brand=${vars.launcher_name}`,
    `-Dminecraft.launcher.version=${vars.launcher_version}`
  ]

  const manifestJvm = flattenArgs(input.version.arguments.jvm, vars, features)
  // Ensure -cp/-classpath fallback when manifest doesn't provide one (older formats)
  const hasCp = manifestJvm.some((arg) => arg === '-cp' || arg === '-classpath')
  if (!hasCp) {
    manifestJvm.push('-cp', classpath)
  }

  const game = flattenArgs(input.version.arguments.game, vars, features)
  if (input.server) {
    game.push('--server', input.server.host, '--port', String(input.server.port))
  }

  return {
    jvmArgs: [...baseJvm, ...manifestJvm],
    gameArgs: game,
    mainClass: input.version.mainClass
  }
}
