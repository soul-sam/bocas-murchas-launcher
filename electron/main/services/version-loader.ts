import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getMcPaths } from './minecraft.js'

export interface OsRule {
  action: 'allow' | 'disallow'
  os?: { name?: string; arch?: string; version?: string }
  features?: Record<string, boolean>
}

export type ArgEntry =
  | string
  | { rules?: OsRule[]; value: string | string[] }

export interface Arguments {
  game?: ArgEntry[]
  jvm?: ArgEntry[]
}

export interface LibraryDownload {
  path?: string
  url: string
  sha1?: string
  size?: number
}

export interface Library {
  name: string
  rules?: OsRule[]
  downloads?: {
    artifact?: LibraryDownload
    classifiers?: Record<string, LibraryDownload>
  }
}

export interface VersionJson {
  id: string
  type?: string
  mainClass: string
  inheritsFrom?: string
  arguments?: Arguments
  // Older versions use a single string "minecraftArguments"
  minecraftArguments?: string
  libraries: Library[]
  assetIndex?: { id: string; sha1: string; size: number; totalSize?: number; url: string }
  assets?: string
  downloads?: { client?: LibraryDownload }
}

export interface MergedVersion {
  id: string
  mainClass: string
  arguments: { game: ArgEntry[]; jvm: ArgEntry[] }
  libraries: Library[]
  assetIndex: NonNullable<VersionJson['assetIndex']>
  assets: string
  clientJarPath: string
}

function dedupeLibraries(libs: Library[]): Library[] {
  // Maven coords: group:artifact:version[:classifier]
  // The main jar and a natives jar share group+artifact but differ in classifier.
  // Both must be kept on the classpath, so dedupe key must include classifier.
  // Later entries win (Forge overrides vanilla when only group:artifact[:classifier] match).
  const map = new Map<string, Library>()
  for (const lib of libs) {
    const parts = lib.name.split(':')
    const [group, artifact] = parts
    const classifier = parts[3] ?? ''
    const key = classifier ? `${group}:${artifact}:${classifier}` : `${group}:${artifact}`
    map.set(key, lib)
  }
  return Array.from(map.values())
}

async function readVersionJson(versionId: string): Promise<VersionJson> {
  const { versions } = getMcPaths()
  const file = path.join(versions, versionId, `${versionId}.json`)
  const raw = await fs.readFile(file, 'utf-8')
  return JSON.parse(raw) as VersionJson
}

function normaliseArguments(v: VersionJson): { game: ArgEntry[]; jvm: ArgEntry[] } {
  if (v.arguments) {
    return { game: v.arguments.game ?? [], jvm: v.arguments.jvm ?? [] }
  }
  if (v.minecraftArguments) {
    return { game: v.minecraftArguments.split(' '), jvm: [] }
  }
  return { game: [], jvm: [] }
}

/**
 * Loads a version JSON and recursively merges with its inheritsFrom parent.
 * Forge wins for arguments/mainClass/id; vanilla provides assetIndex/assets/downloads.
 */
export async function loadMergedVersion(versionId: string): Promise<MergedVersion> {
  const child = await readVersionJson(versionId)
  let merged: VersionJson = child

  if (child.inheritsFrom) {
    const parent = await readVersionJson(child.inheritsFrom)
    const childArgs = normaliseArguments(child)
    const parentArgs = normaliseArguments(parent)
    merged = {
      ...parent,
      ...child,
      arguments: {
        game: [...parentArgs.game, ...childArgs.game],
        jvm: [...parentArgs.jvm, ...childArgs.jvm]
      },
      libraries: dedupeLibraries([...(parent.libraries ?? []), ...(child.libraries ?? [])]),
      assetIndex: child.assetIndex ?? parent.assetIndex,
      assets: child.assets ?? parent.assets,
      downloads: { ...parent.downloads, ...child.downloads }
    }
  }

  if (!merged.assetIndex) throw new Error(`Manifest mesclado de ${versionId} sem assetIndex`)
  if (!merged.assets) throw new Error(`Manifest mesclado de ${versionId} sem assets`)

  const { versions } = getMcPaths()
  // Use the requested version's own directory for the primary jar — Forge's
  // `-DignoreList=...,${version_name}.jar` arg expects the classpath to contain
  // a jar named after the Forge version, not after the inherited vanilla one.
  // ensureForge() copies the vanilla jar to this location after Forge install.
  const clientJarPath = path.join(versions, versionId, `${versionId}.jar`)

  return {
    id: versionId,
    mainClass: merged.mainClass,
    arguments: normaliseArguments(merged),
    libraries: merged.libraries ?? [],
    assetIndex: merged.assetIndex,
    assets: merged.assets,
    clientJarPath
  }
}
