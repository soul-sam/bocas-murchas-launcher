import { BrowserWindow, Notification } from 'electron'
import net from 'node:net'
import { loadSettings } from './settings.js'

export interface PlayerSample {
  name: string
  id: string
}

export interface ServerStatus {
  online: boolean
  host: string
  port: number
  latencyMs?: number
  versionName?: string
  protocol?: number
  motd?: string
  playersOnline?: number
  playersMax?: number
  sample?: PlayerSample[]
  favicon?: string
  error?: string
  fetchedAt: string
}

const HOST = '187.77.205.239'
const PORT = 25565
const POLL_INTERVAL_MS = 30_000
const SOCKET_TIMEOUT_MS = 5_000

let pollTimer: NodeJS.Timeout | null = null
let lastStatus: ServerStatus = {
  online: false,
  host: HOST,
  port: PORT,
  fetchedAt: new Date(0).toISOString()
}
let knownPlayers = new Set<string>()
let initialPollComplete = false

// ---------------- SLP protocol helpers ----------------

function writeVarInt(value: number): Buffer {
  const bytes: number[] = []
  let v = value >>> 0
  while (true) {
    if ((v & ~0x7f) === 0) {
      bytes.push(v)
      break
    }
    bytes.push((v & 0x7f) | 0x80)
    v >>>= 7
  }
  return Buffer.from(bytes)
}

function readVarInt(buf: Buffer, offset: number): { value: number; size: number } {
  let value = 0
  let size = 0
  let byte: number
  do {
    if (offset + size >= buf.length) throw new Error('VarInt out of bounds')
    byte = buf[offset + size]
    value |= (byte & 0x7f) << (7 * size)
    size++
    if (size > 5) throw new Error('VarInt too big')
  } while ((byte & 0x80) !== 0)
  return { value, size }
}

function encodeString(str: string): Buffer {
  const data = Buffer.from(str, 'utf-8')
  return Buffer.concat([writeVarInt(data.length), data])
}

function buildHandshake(host: string, port: number): Buffer {
  // packetId 0x00 + protocol(VarInt) + host(String) + port(uint16 BE) + state(VarInt, 1=status)
  const body = Buffer.concat([
    writeVarInt(0x00),
    writeVarInt(763), // protocol — 763 = 1.20.1 (any modern value works, server ignores)
    encodeString(host),
    Buffer.from([(port >> 8) & 0xff, port & 0xff]),
    writeVarInt(1)
  ])
  return Buffer.concat([writeVarInt(body.length), body])
}

function buildStatusRequest(): Buffer {
  // length(1) + packetId(0x00)
  return Buffer.from([0x01, 0x00])
}

function extractPlainMotd(description: unknown): string | undefined {
  if (!description) return undefined
  if (typeof description === 'string') return description
  if (typeof description === 'object' && description !== null) {
    const obj = description as { text?: string; extra?: Array<{ text?: string }> }
    let out = obj.text ?? ''
    for (const e of obj.extra ?? []) {
      out += e.text ?? ''
    }
    return out.replace(/§./g, '').trim() || undefined
  }
  return undefined
}

interface SlpResponse {
  version?: { name?: string; protocol?: number }
  players?: { online?: number; max?: number; sample?: PlayerSample[] }
  description?: unknown
  favicon?: string
}

async function querySlp(host: string, port: number): Promise<ServerStatus> {
  const startedAt = Date.now()

  return new Promise<ServerStatus>((resolve) => {
    const socket = new net.Socket()
    const chunks: Buffer[] = []
    let resolved = false

    const settle = (result: ServerStatus): void => {
      if (resolved) return
      resolved = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(SOCKET_TIMEOUT_MS)

    socket.on('timeout', () =>
      settle({ online: false, host, port, error: 'timeout', fetchedAt: new Date().toISOString() })
    )

    socket.on('error', (err) =>
      settle({ online: false, host, port, error: err.message, fetchedAt: new Date().toISOString() })
    )

    socket.on('data', (data) => {
      chunks.push(data)
      const buf = Buffer.concat(chunks)
      try {
        // Outer: length VarInt
        const lengthPrefix = readVarInt(buf, 0)
        const total = lengthPrefix.size + lengthPrefix.value
        if (buf.length < total) return // wait for more
        // Inner: packetId VarInt, then String (json)
        let cursor = lengthPrefix.size
        const packetId = readVarInt(buf, cursor)
        cursor += packetId.size
        if (packetId.value !== 0x00) {
          settle({
            online: false,
            host,
            port,
            error: `unexpected packetId ${packetId.value}`,
            fetchedAt: new Date().toISOString()
          })
          return
        }
        const strLen = readVarInt(buf, cursor)
        cursor += strLen.size
        const jsonStr = buf.slice(cursor, cursor + strLen.value).toString('utf-8')
        const parsed = JSON.parse(jsonStr) as SlpResponse

        settle({
          online: true,
          host,
          port,
          latencyMs: Date.now() - startedAt,
          versionName: parsed.version?.name,
          protocol: parsed.version?.protocol,
          motd: extractPlainMotd(parsed.description),
          playersOnline: parsed.players?.online ?? 0,
          playersMax: parsed.players?.max ?? 0,
          sample: parsed.players?.sample ?? [],
          favicon: parsed.favicon,
          fetchedAt: new Date().toISOString()
        })
      } catch {
        // not enough data yet
      }
    })

    socket.connect(port, host, () => {
      socket.write(buildHandshake(host, port))
      socket.write(buildStatusRequest())
    })
  })
}

// ---------------- Polling + diff + notification ----------------

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('server-status:status', lastStatus)
  }
}

async function notifyDiff(prev: Set<string>, next: Set<string>): Promise<void> {
  // First poll: don't spam notifications for everyone already online
  if (!initialPollComplete) return

  const settings = await loadSettings()
  if (!settings.notifyOnJoinLeave) return

  const joined: string[] = []
  const left: string[] = []
  for (const name of next) if (!prev.has(name)) joined.push(name)
  for (const name of prev) if (!next.has(name)) left.push(name)

  for (const name of joined) {
    new Notification({
      title: 'Bocas Murchas',
      body: `${name} entrou no server`,
      silent: false
    }).show()
  }
  for (const name of left) {
    new Notification({
      title: 'Bocas Murchas',
      body: `${name} saiu do server`,
      silent: false
    }).show()
  }
}

async function pollOnce(): Promise<void> {
  lastStatus = await querySlp(HOST, PORT)
  const nextNames = new Set<string>((lastStatus.sample ?? []).map((p) => p.name))
  await notifyDiff(knownPlayers, nextNames).catch(() => undefined)
  knownPlayers = nextNames
  initialPollComplete = true
  broadcast()
}

export function startServerStatusPolling(): void {
  if (pollTimer) return
  void pollOnce()
  pollTimer = setInterval(() => void pollOnce(), POLL_INTERVAL_MS)
}

export function stopServerStatusPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

export function getServerStatus(): ServerStatus {
  return lastStatus
}

export async function refreshServerStatusNow(): Promise<ServerStatus> {
  await pollOnce()
  return lastStatus
}
