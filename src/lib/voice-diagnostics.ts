import type { Room } from 'livekit-client'

/**
 * Raio-X da call, pra medir em vez de achar.
 *
 * Exposto em `window.__voiceStats()` enquanto existe sala. No DevTools:
 *
 *   await __voiceStats()
 *
 * O que interessa por linha:
 * - `codec`: precisa dizer H264 na tela (VP8 = software nos dois lados).
 * - `impl`: `ExternalDecoder`/`MediaFoundationVideoEncodeAccelerator` = GPU;
 *   `libvpx`/`FFmpeg`/`OpenH264` = CPU.
 * - `powerEfficient`: o Chromium confirmando que o hardware esta em uso.
 * - `limitation`: por que o encoder nao esta entregando o pedido — `cpu`
 *   e o sintoma de "o jogo travou".
 * - `lost`/`jitterMs`: rede.
 *
 * Um cliente que NAO esta assistindo nao pode ter linha `inbound video` de
 * screen share nenhuma — e isso que a assinatura sob demanda garante.
 */
export interface VoiceStatsRow {
  direction: 'inbound' | 'outbound'
  kind: 'audio' | 'video'
  codec: string | null
  width: number | null
  height: number | null
  fps: number | null
  kbps: number | null
  lost: number | null
  jitterMs: number | null
  impl: string | null
  powerEfficient: boolean | null
  limitation: string | null
}

type StatValue = Record<string, unknown>

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function readReport(
  report: RTCStatsReport,
  direction: VoiceStatsRow['direction'],
  kbps: Map<string, number>
): VoiceStatsRow[] {
  const byId = new Map<string, StatValue>()
  report.forEach((value: StatValue, key: string) => byId.set(key, value))

  const rows: VoiceStatsRow[] = []
  const wantedType = direction === 'inbound' ? 'inbound-rtp' : 'outbound-rtp'

  for (const stat of byId.values()) {
    if (stat.type !== wantedType) continue
    const kind = stat.kind === 'video' ? 'video' : 'audio'
    const codecStat = typeof stat.codecId === 'string' ? byId.get(stat.codecId) : undefined
    const mime = str(codecStat?.mimeType)

    rows.push({
      direction,
      kind,
      codec: mime ? mime.replace(/^(audio|video)\//, '') : null,
      width: num(stat.frameWidth),
      height: num(stat.frameHeight),
      fps: num(stat.framesPerSecond),
      kbps: kbps.get(`${kind}:${stat.ssrc}`) ?? null,
      lost: num(stat.packetsLost),
      jitterMs: num(stat.jitter) !== null ? Math.round((stat.jitter as number) * 1000) : null,
      impl: str(stat.decoderImplementation) ?? str(stat.encoderImplementation),
      powerEfficient:
        typeof stat.powerEfficientDecoder === 'boolean'
          ? stat.powerEfficientDecoder
          : typeof stat.powerEfficientEncoder === 'boolean'
            ? stat.powerEfficientEncoder
            : null,
      limitation: str(stat.qualityLimitationReason)
    })
  }
  return rows
}

/**
 * Duas amostras com 1 s de intervalo pra ter bitrate instantaneo em vez de
 * media desde o inicio da call.
 */
async function sampleBitrate(
  getReport: () => Promise<RTCStatsReport | undefined>,
  direction: VoiceStatsRow['direction']
): Promise<Map<string, number>> {
  const first = await getReport()
  await new Promise((resolve) => setTimeout(resolve, 1_000))
  const second = await getReport()
  const result = new Map<string, number>()
  if (!first || !second) return result

  const wantedType = direction === 'inbound' ? 'inbound-rtp' : 'outbound-rtp'
  const before = new Map<string, StatValue>()
  first.forEach((value: StatValue, key: string) => {
    if (value.type === wantedType) before.set(key, value)
  })
  second.forEach((value: StatValue, key: string) => {
    if (value.type !== wantedType) return
    const prev = before.get(key)
    if (!prev) return
    const field = direction === 'inbound' ? 'bytesReceived' : 'bytesSent'
    const delta = (num(value[field]) ?? 0) - (num(prev[field]) ?? 0)
    const seconds = ((num(value.timestamp) ?? 0) - (num(prev.timestamp) ?? 0)) / 1000
    if (seconds > 0) result.set(`${value.kind}:${value.ssrc}`, Math.round((delta * 8) / seconds / 1000))
  })
  return result
}

export async function collectVoiceStats(room: Room): Promise<VoiceStatsRow[]> {
  const engine = (room as unknown as {
    engine?: {
      pcManager?: {
        subscriber?: { getStats: () => Promise<RTCStatsReport> }
        publisher?: { getStats: () => Promise<RTCStatsReport> }
      }
    }
  }).engine
  const subscriber = engine?.pcManager?.subscriber
  const publisher = engine?.pcManager?.publisher

  const rows: VoiceStatsRow[] = []

  const [inKbps, outKbps] = await Promise.all([
    sampleBitrate(async () => subscriber?.getStats(), 'inbound'),
    sampleBitrate(async () => publisher?.getStats(), 'outbound')
  ])

  if (subscriber) rows.push(...readReport(await subscriber.getStats(), 'inbound', inKbps))
  if (publisher) rows.push(...readReport(await publisher.getStats(), 'outbound', outKbps))

  // eslint-disable-next-line no-console
  console.table(rows)
  return rows
}

declare global {
  interface Window {
    __voiceStats?: () => Promise<VoiceStatsRow[]>
  }
}

export function exposeVoiceStats(room: Room | null): () => void {
  if (!room) {
    delete window.__voiceStats
    return () => {}
  }
  window.__voiceStats = () => collectVoiceStats(room)
  return () => {
    delete window.__voiceStats
  }
}
