/**
 * Importar pack de emojis — a parte que nao precisa de tela.
 *
 * Pack chega de dois jeitos: um .zip (o formato em que pack de Discord
 * circula por ai) ou varios arquivos escolhidos/arrastados de uma vez. Nos dois
 * casos o nome de cada emoji sai do nome do arquivo, igual ao Discord.
 *
 * O .zip e lido aqui mesmo, sem biblioteca: diretorio central + entradas
 * "stored" ou "deflate", e o deflate sai do `DecompressionStream`, que o
 * Chromium do Electron, o Safari do iPhone e o Node (onde roda o teste) ja tem.
 * ZIP64, criptografia e os outros metodos ficam de fora — pack de emoji e
 * pequeno e nunca vem assim.
 *
 * Sem import de `@/` de proposito: o `node --test` roda este arquivo cru.
 */

/** Mesmas regras da API: 2 a 32 de a-z, 0-9 e _. */
export const EMOJI_NAME_RE = /^[a-z0-9_]{2,32}$/
export const MAX_EMOJI_BYTES = 256_000
export const MAX_SERVER_EMOJIS = 300
export const MAX_PACK_NAME = 32

/** Mais que isso num pack e engano (ou zip de outra coisa). */
export const MAX_PACK_ENTRIES = 400
/**
 * Teto por imagem ANTES de encolher. Um PNG de 2048px passa disso as vezes,
 * mas o que importa e nao inflar um zip-bomba ate encher a memoria.
 */
export const MAX_RAW_IMAGE_BYTES = 12_000_000

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg'
}

/** "pasta/Pepe.PNG" -> "png"; sem extensao -> "". */
export function extOf(path: string): string {
  const base = baseName(path)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function mimeForName(path: string): string | null {
  return MIME_BY_EXT[extOf(path)] ?? null
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] ?? ''
}

/**
 * Lixo que todo zip feito no Mac ou no Windows carrega: `__MACOSX/._x.png`,
 * `.DS_Store`, `Thumbs.db`. Entra na conta como "nao e imagem" se deixar.
 */
export function isJunkEntry(path: string): boolean {
  if (/(^|[\\/])__MACOSX[\\/]/.test(path)) return true
  const base = baseName(path)
  return base.startsWith('.') || base.toLowerCase() === 'thumbs.db' || base === ''
}

/**
 * "Pepe Triste.png" -> "pepe_triste"; "coração-partido.gif" ->
 * "coracao_partido". Acento vira a letra sem acento (o Discord faz igual) e o
 * resto que a regra nao aceita some. Menos de 2 letras sobrando -> "emoji",
 * que o `uniqueName` numera.
 */
export function emojiNameFromFile(path: string): string {
  const stem = baseName(path).replace(/\.[^.]+$/, '')
  const clean = stem
    .normalize('NFD') // separa o acento da letra; o filtro de a-z some com ele
    .toLowerCase()
    .replace(/[\s.\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)
    .replace(/_+$/, '')
  return clean.length >= 2 ? clean : 'emoji'
}

/**
 * Primeiro nome livre: "kekw", "kekw_2", "kekw_3"... O sufixo come o fim do
 * nome quando ele ja tem 32 letras, pra nunca passar do limite.
 */
export function uniqueName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const suffix = '_' + n
    const candidate = base.slice(0, 32 - suffix.length) + suffix
    if (!taken.has(candidate)) return candidate
  }
}

/** "Pack do Pepe.zip" -> "Pack do Pepe" — chute pro nome do pack. */
export function packNameFromFile(path: string): string {
  return baseName(path)
    .replace(/\.zip$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PACK_NAME)
    .trim()
}

/**
 * Nomes de uma leva inteira, sem colidir com o servidor nem entre si. Quem
 * aparece primeiro fica com o nome limpo — a ordem e a do zip, que costuma
 * ser alfabetica.
 */
export function assignNames(paths: string[], serverNames: ReadonlySet<string>): string[] {
  const taken = new Set(serverNames)
  return paths.map((p) => {
    const name = uniqueName(emojiNameFromFile(p), taken)
    taken.add(name)
    return name
  })
}

/**
 * Problema de nome de cada item marcado, depois que a pessoa editou. `null`
 * = pode subir. Itens desmarcados nao entram na conta (nem ocupam nome).
 */
export function nameProblems(
  items: { name: string; include: boolean }[],
  serverNames: ReadonlySet<string>
): (string | null)[] {
  const count = new Map<string, number>()
  for (const item of items) {
    if (item.include) count.set(item.name, (count.get(item.name) ?? 0) + 1)
  }
  return items.map((item) => {
    if (!item.include) return null
    if (!EMOJI_NAME_RE.test(item.name)) return '2 a 32 letras minúsculas, números ou _'
    if (serverNames.has(item.name)) return 'já existe no servidor'
    if ((count.get(item.name) ?? 0) > 1) return 'repetido no pack'
    return null
  })
}

// ============================================
// ANIMACAO
// ============================================

/**
 * Imagem animada nao pode ser encolhida no canvas (sairia so o 1o quadro),
 * entao precisa saber antes. GIF conta sempre como animado: GIF parado acima
 * de 256 KB praticamente nao existe, e contar quadro exige ler o LZW.
 * PNG animado (APNG) tem o pedaco `acTL` antes do `IDAT`; WebP animado
 * tem o bit de animacao no cabecalho VP8X.
 */
export function looksAnimated(bytes: Uint8Array): boolean {
  if (bytes.length >= 6 && ascii(bytes, 0, 3) === 'GIF') return true

  if (bytes.length >= 21 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return ascii(bytes, 12, 4) === 'VP8X' && (bytes[20] & 0x02) !== 0
  }

  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') {
    let at = 8
    while (at + 8 <= bytes.length) {
      const len = readU32BE(bytes, at)
      const type = ascii(bytes, at + 4, 4)
      if (type === 'acTL') return true
      if (type === 'IDAT' || type === 'IEND') return false
      at += 12 + len
    }
  }
  return false
}

function ascii(bytes: Uint8Array, at: number, len: number): string {
  let out = ''
  for (let i = 0; i < len && at + i < bytes.length; i++) out += String.fromCharCode(bytes[at + i])
  return out
}

function readU32BE(b: Uint8Array, at: number): number {
  return ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
}

// ============================================
// ZIP
// ============================================

export interface ZipImage {
  /** Caminho dentro do zip ("pepe/triste.png"). */
  path: string
  bytes: Uint8Array
}

export interface ZipReadResult {
  images: ZipImage[]
  /** Arquivo que nao e imagem (ou nao deu pra abrir), com o motivo. */
  skipped: { path: string; reason: string }[]
}

export type InflateRaw = (data: Uint8Array) => Promise<Uint8Array>

/** Deflate cru pelo `DecompressionStream` — Chromium 123+, Safari 16.4+, Node 18+. */
export const inflateRaw: InflateRaw = async (data) => {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const EOCD_SIG = 0x06054b50
const CENTRAL_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50

export class ZipError extends Error {}

/**
 * Le as imagens de um .zip. Pastas viram so prefixo do caminho (pack com
 * subpasta "pepe/" entra igual); lixo de sistema some calado; o resto que nao
 * e png/gif/webp/jpg volta em `skipped` pra tela poder contar.
 */
export async function readZipImages(
  zip: Uint8Array,
  inflate: InflateRaw = inflateRaw
): Promise<ZipReadResult> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const eocd = findEocd(view)
  if (eocd < 0) throw new ZipError('Isso não parece um .zip')

  const total = view.getUint16(eocd + 10, true)
  const cdOffset = view.getUint32(eocd + 16, true)
  if (total === 0xffff || cdOffset === 0xffffffff) {
    throw new ZipError('Zip grande demais (ZIP64) — descompacta e escolhe as imagens')
  }

  const images: ZipImage[] = []
  const skipped: { path: string; reason: string }[] = []
  const utf8 = new TextDecoder('utf-8')

  let at = cdOffset
  for (let i = 0; i < total; i++) {
    if (at + 46 > zip.length || view.getUint32(at, true) !== CENTRAL_SIG) {
      throw new ZipError('Zip corrompido')
    }
    const flags = view.getUint16(at + 8, true)
    const method = view.getUint16(at + 10, true)
    const compSize = view.getUint32(at + 20, true)
    const rawSize = view.getUint32(at + 24, true)
    const nameLen = view.getUint16(at + 28, true)
    const extraLen = view.getUint16(at + 30, true)
    const commentLen = view.getUint16(at + 32, true)
    const localOffset = view.getUint32(at + 42, true)
    const path = utf8.decode(zip.subarray(at + 46, at + 46 + nameLen))
    at += 46 + nameLen + extraLen + commentLen

    if (path.endsWith('/') || isJunkEntry(path)) continue
    if (!mimeForName(path)) {
      skipped.push({ path, reason: 'não é imagem' })
      continue
    }
    if (images.length >= MAX_PACK_ENTRIES) {
      skipped.push({ path, reason: `pack passa de ${MAX_PACK_ENTRIES} imagens` })
      continue
    }
    if (flags & 0x1) {
      skipped.push({ path, reason: 'zip com senha' })
      continue
    }
    if (rawSize > MAX_RAW_IMAGE_BYTES) {
      skipped.push({ path, reason: 'imagem grande demais' })
      continue
    }

    if (localOffset + 30 > zip.length || view.getUint32(localOffset, true) !== LOCAL_SIG) {
      skipped.push({ path, reason: 'entrada corrompida' })
      continue
    }
    // O tamanho do nome/extra do cabecalho LOCAL pode diferir do central.
    const dataStart =
      localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
    const data = zip.subarray(dataStart, dataStart + compSize)

    try {
      let bytes: Uint8Array
      if (method === 0) bytes = data.slice()
      else if (method === 8) bytes = await inflate(data)
      else {
        skipped.push({ path, reason: 'compressão não suportada' })
        continue
      }
      if (bytes.length > MAX_RAW_IMAGE_BYTES) {
        skipped.push({ path, reason: 'imagem grande demais' })
        continue
      }
      images.push({ path, bytes })
    } catch {
      skipped.push({ path, reason: 'não deu pra descompactar' })
    }
  }

  return { images, skipped }
}

/** O fim do diretorio central fica nos ultimos 22 bytes + ate 64 KB de comentario. */
function findEocd(view: DataView): number {
  const min = Math.max(0, view.byteLength - 22 - 0xffff)
  for (let i = view.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) return i
  }
  return -1
}
