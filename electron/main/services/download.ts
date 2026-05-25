import { promises as fs, createWriteStream } from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

export type DownloadProgressFn = (bytes: number, total: number) => void

interface DownloadOptions {
  url: string
  destination: string
  sha1?: string
  sha256?: string
  size?: number
  onProgress?: DownloadProgressFn
  // If true: existing files are accepted when their size matches (no SHA verify).
  // Use for launcher startup re-checks. Set false for first install or
  // user-requested re-verify (where we want to catch silent corruption).
  quickCheck?: boolean
}

const USER_AGENT = 'BocasMurchasLauncher/0.1 (+https://github.com/soul-sam/bocas-murchas-launcher)'

async function sha1File(file: string): Promise<string> {
  const hash = crypto.createHash('sha1')
  const data = await fs.readFile(file)
  hash.update(data)
  return hash.digest('hex')
}

async function sha256File(file: string): Promise<string> {
  const hash = crypto.createHash('sha256')
  const data = await fs.readFile(file)
  hash.update(data)
  return hash.digest('hex')
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

async function verifyChecksum(file: string, sha1?: string, sha256?: string): Promise<boolean> {
  if (sha1) return (await sha1File(file)) === sha1.toLowerCase()
  if (sha256) return (await sha256File(file)) === sha256.toLowerCase()
  return true
}

async function checksumDiagnostic(file: string, sha1?: string, sha256?: string, expectedSize?: number): Promise<string> {
  const stat = await fs.stat(file).catch(() => null)
  const algo = sha256 ? 'sha256' : sha1 ? 'sha1' : 'none'
  const expected = (sha256 ?? sha1 ?? '').toLowerCase()
  const actual = sha256 ? await sha256File(file) : sha1 ? await sha1File(file) : 'n/a'
  return [
    `  algo:     ${algo}`,
    `  esperado: ${expected}`,
    `  obtido:   ${actual}`,
    `  tamanho:  ${stat?.size ?? '?'} bytes (esperado: ${expectedSize ?? '?'})`
  ].join('\n')
}

class TruncationError extends Error {
  constructor(public received: number, public expected: number) {
    super(`Download truncado: ${received} de ${expected} bytes (faltou ${expected - received})`)
    this.name = 'TruncationError'
  }
}

function pickTimeoutMs(expectedSize: number | undefined): number {
  // Tiny assets: 15s. Medium (forge installer, libs): 60s. Big (JRE, MC client): 180s.
  if (!expectedSize) return 60_000
  if (expectedSize < 1_000_000) return 15_000
  if (expectedSize < 20_000_000) return 60_000
  return 180_000
}

async function downloadOnce(
  url: string,
  partial: string,
  size: number | undefined,
  onProgress: DownloadProgressFn | undefined
): Promise<void> {
  await fs.unlink(partial).catch(() => undefined)

  // Abort the request if no progress is made within the timeout. The
  // controller is re-armed every time we receive a chunk — so a slow but
  // steady download won't trip it, only a truly stuck connection will.
  const timeoutMs = pickTimeoutMs(size)
  const controller = new AbortController()
  let inactivityTimer = setTimeout(() => controller.abort(new Error('inatividade > timeout')), timeoutMs)
  const resetInactivity = () => {
    clearTimeout(inactivityTimer)
    inactivityTimer = setTimeout(() => controller.abort(new Error('inatividade > timeout')), timeoutMs)
  }

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: '*/*'
      }
    })
    if (!res.ok || !res.body) {
      throw new Error(`Download falhou (HTTP ${res.status}) — ${url}`)
    }

    const contentLength = Number(res.headers.get('content-length')) || 0
    const total = contentLength || size || 0
    let received = 0

    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length
        resetInactivity()
        onProgress?.(received, total)
        callback(null, chunk)
      }
    })

    const readable = Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream)
    await pipeline(readable, counter, createWriteStream(partial))

    // Fail fast on truncation BEFORE we waste time hashing a bad file.
    const expectedSize = size || contentLength
    if (expectedSize && received !== expectedSize) {
      throw new TruncationError(received, expectedSize)
    }
  } finally {
    clearTimeout(inactivityTimer)
  }
}

/**
 * Downloads a URL to a file with size + checksum verification.
 * - Skips download if existing file already matches checksum.
 * - Streams to a `.partial` file then atomic-renames on success.
 * - Validates final byte count before hashing (catches CDN truncation).
 * - Retries up to 3× with backoff on truncation/hash failure.
 */
export async function downloadFile(opts: DownloadOptions): Promise<void> {
  const { url, destination, sha1, sha256, size, onProgress, quickCheck } = opts

  if (await fileExists(destination)) {
    if (quickCheck) {
      // Fast path: trust files we previously verified — just confirm size.
      const stat = await fs.stat(destination).catch(() => null)
      if (stat && (!size || stat.size === size)) {
        if (onProgress && size) onProgress(size, size)
        return
      }
    } else if (await verifyChecksum(destination, sha1, sha256)) {
      if (onProgress && size) onProgress(size, size)
      return
    }
    await fs.unlink(destination)
  }

  await fs.mkdir(path.dirname(destination), { recursive: true })
  const partial = `${destination}.partial`

  const MAX_ATTEMPTS = 3
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await downloadOnce(url, partial, size, onProgress)
    } catch (err) {
      lastError = err as Error
      if (err instanceof TruncationError) {
        console.warn(`[download] ${path.basename(destination)} truncado na tentativa ${attempt}: ${err.message}`)
      } else {
        console.warn(`[download] ${path.basename(destination)} falhou na tentativa ${attempt}: ${(err as Error).message}`)
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, attempt * 1500))
        continue
      }
      break
    }

    if (await verifyChecksum(partial, sha1, sha256)) {
      await fs.rename(partial, destination)
      return
    }

    lastError = new Error(`Checksum incorreto após download completo`)
    console.warn(`[download] ${path.basename(destination)} checksum errado na tentativa ${attempt}`)
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, attempt * 1500))
    }
  }

  // Final failure: dump diagnostics
  const diag = await checksumDiagnostic(partial, sha1, sha256, size).catch(() => 'arquivo .partial ausente')
  await fs.unlink(partial).catch(() => undefined)
  throw new Error(
    `Falha ao baixar ${path.basename(destination)} após ${MAX_ATTEMPTS} tentativas\n` +
    `Último erro: ${lastError?.message ?? 'desconhecido'}\n${diag}\n` +
    `URL: ${url}`
  )
}

interface BatchTask<T> {
  task: T
  run: () => Promise<void>
}

/**
 * Runs an array of tasks with limited concurrency. Used for downloading
 * thousands of small asset files quickly without saturating the connection.
 */
export async function runBatched<T>(tasks: BatchTask<T>[], concurrency = 8): Promise<void> {
  let index = 0
  const workers: Promise<void>[] = []
  const next = async (): Promise<void> => {
    while (index < tasks.length) {
      const i = index++
      await tasks[i].run()
    }
  }
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    workers.push(next())
  }
  await Promise.all(workers)
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar ${url}`)
  return (await res.json()) as T
}
