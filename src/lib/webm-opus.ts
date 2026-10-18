/**
 * MUXER WEBM SÓ-ÁUDIO (opus), a partir de pacotes já codificados.
 *
 * O buffer de clipes guarda PCM e só codifica na hora de clipar (ver
 * clip-recorder.ts). O WebCodecs entrega pacotes opus soltos; isto embrulha
 * num .webm que o servidor já aceita e que toca em qualquer player — com a
 * duração no cabeçalho, coisa que o arquivo do MediaRecorder nem tinha.
 *
 * Só o necessário do Matroska: cabeçalho EBML, Info (com Duration), uma
 * faixa A_OPUS e Clusters de até 5 s com SimpleBlocks. Sem Cues: o arquivo é
 * pequeno (30 s) e o player resolve a busca lendo direto.
 *
 * Puro (sem DOM) pra rodar no `node --test`.
 */

export interface OpusPacket {
  data: Uint8Array
  /** Início do pacote, em microssegundos, relativo ao primeiro. */
  timestampUs: number
}

export interface WebmOpusInput {
  packets: OpusPacket[]
  channels: number
  /** Duração total do áudio, em ms (vai pro cabeçalho). */
  durationMs: number
  /** Amostras (a 48 kHz) que o decodificador descarta no começo. */
  preSkip: number
  /** OpusHead pronto, se o encoder entregou um; senão montamos. */
  opusHead?: Uint8Array
}

const CLUSTER_MS = 5_000

const enc = new TextEncoder()

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let length = 0
  for (const p of parts) length += p.length
  const out = new Uint8Array(length)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** Tamanho de elemento EBML: vint com o menor número de bytes. */
export function vintSize(n: number): Uint8Array {
  for (let len = 1; len <= 8; len++) {
    // 2^(7·len) − 1 é reservado ("tamanho desconhecido").
    if (n < 2 ** (7 * len) - 1) {
      const out = new Uint8Array(len)
      let v = n
      for (let i = len - 1; i >= 0; i--) {
        out[i] = v % 256
        v = Math.floor(v / 256)
      }
      out[0] |= 1 << (8 - len)
      return out
    }
  }
  throw new Error('elemento grande demais')
}

function uint(n: number): Uint8Array {
  const bytes: number[] = []
  let v = n
  do {
    bytes.unshift(v % 256)
    v = Math.floor(v / 256)
  } while (v > 0)
  return Uint8Array.from(bytes)
}

function float64(n: number): Uint8Array {
  const out = new Uint8Array(8)
  new DataView(out.buffer).setFloat64(0, n)
  return out
}

function el(id: number[], payload: Uint8Array | Uint8Array[]): Uint8Array {
  const body = Array.isArray(payload) ? concat(payload) : payload
  return concat([Uint8Array.from(id), vintSize(body.length), body])
}

/** OpusHead (RFC 7845 §5.1): versão 1, mapeamento 0 (mono/estéreo). */
export function opusHead(channels: number, preSkip: number, inputRate = 48_000): Uint8Array {
  const out = new Uint8Array(19)
  out.set(enc.encode('OpusHead'), 0)
  const view = new DataView(out.buffer)
  view.setUint8(8, 1)
  view.setUint8(9, channels)
  view.setUint16(10, preSkip, true)
  view.setUint32(12, inputRate, true)
  view.setInt16(16, 0, true)
  view.setUint8(18, 0)
  return out
}

export function muxWebmOpus(input: WebmOpusInput): Uint8Array<ArrayBuffer> {
  const header = el([0x1a, 0x45, 0xdf, 0xa3], [
    el([0x42, 0x86], uint(1)), // EBMLVersion
    el([0x42, 0xf7], uint(1)), // EBMLReadVersion
    el([0x42, 0xf2], uint(4)), // EBMLMaxIDLength
    el([0x42, 0xf3], uint(8)), // EBMLMaxSizeLength
    el([0x42, 0x82], enc.encode('webm')), // DocType
    el([0x42, 0x87], uint(4)), // DocTypeVersion
    el([0x42, 0x85], uint(2)) // DocTypeReadVersion
  ])

  const info = el([0x15, 0x49, 0xa9, 0x66], [
    el([0x2a, 0xd7, 0xb1], uint(1_000_000)), // TimecodeScale: 1 ms
    el([0x4d, 0x80], enc.encode('bocas-murchas')), // MuxingApp
    el([0x57, 0x41], enc.encode('bocas-murchas')), // WritingApp
    el([0x44, 0x89], float64(input.durationMs)) // Duration (ms)
  ])

  const tracks = el([0x16, 0x54, 0xae, 0x6b], [
    el([0xae], [
      el([0xd7], uint(1)), // TrackNumber
      el([0x73, 0xc5], uint(1)), // TrackUID
      el([0x83], uint(2)), // TrackType: áudio
      el([0x86], enc.encode('A_OPUS')), // CodecID
      el([0x63, 0xa2], input.opusHead ?? opusHead(input.channels, input.preSkip)), // CodecPrivate
      el([0x56, 0xaa], uint(Math.round((input.preSkip / 48_000) * 1e9))), // CodecDelay (ns)
      el([0x56, 0xbb], uint(80_000_000)), // SeekPreRoll: 80 ms
      el([0xe1], [
        el([0xb5], float64(48_000)), // SamplingFrequency
        el([0x9f], uint(input.channels)) // Channels
      ])
    ])
  ])

  const clusters: Uint8Array[] = []
  let blocks: Uint8Array[] = []
  let clusterStart = -1
  const flush = (): void => {
    if (clusterStart < 0) return
    clusters.push(el([0x1f, 0x43, 0xb6, 0x75], [el([0xe7], uint(clusterStart)), ...blocks]))
    blocks = []
    clusterStart = -1
  }
  for (const packet of input.packets) {
    const ms = Math.round(packet.timestampUs / 1000)
    if (clusterStart < 0 || ms - clusterStart >= CLUSTER_MS) {
      flush()
      clusterStart = ms
    }
    const head = new Uint8Array(4)
    head[0] = 0x81 // faixa 1 (vint)
    new DataView(head.buffer).setInt16(1, ms - clusterStart)
    head[3] = 0x80 // keyframe: todo pacote opus decodifica sozinho
    blocks.push(el([0xa3], [head, packet.data]))
  }
  flush()

  const segment = el([0x18, 0x53, 0x80, 0x67], [info, tracks, ...clusters])
  return concat([header, segment])
}

/** Plano B sem WebCodecs: WAV PCM 16 bits (o servidor aceita audio/wav). */
export function wavFromPcm(left: Int16Array, right: Int16Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const frames = left.length
  const out = new Uint8Array(44 + frames * 4)
  const view = new DataView(out.buffer)
  out.set(enc.encode('RIFF'), 0)
  view.setUint32(4, 36 + frames * 4, true)
  out.set(enc.encode('WAVEfmt '), 8)
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 2, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 4, true)
  view.setUint16(32, 4, true)
  view.setUint16(34, 16, true)
  out.set(enc.encode('data'), 36)
  view.setUint32(40, frames * 4, true)
  for (let i = 0; i < frames; i++) {
    view.setInt16(44 + i * 4, left[i], true)
    view.setInt16(46 + i * 4, right[i], true)
  }
  return out
}
