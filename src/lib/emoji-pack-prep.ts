import {
  MAX_EMOJI_BYTES,
  assignNames,
  extOf,
  looksAnimated,
  mimeForName,
  packNameFromFile,
  readZipImages,
  ZipError
} from './emoji-pack'

/**
 * Transforma o que a pessoa escolheu (zips e/ou imagens soltas) na lista que
 * o importador mostra — a parte do emoji-pack.ts que precisa de navegador
 * (canvas, objectURL), por isso fora do teste.
 */

/** Tamanho de emoji do Discord, e sobra pros 20px do chat em tela 4K. */
const SHRINK_TO = 128

export interface PackItem {
  key: string
  /** Caminho no zip ou nome do arquivo — mostrado quando o nome muda muito. */
  source: string
  /** Pronto pra subir (ja encolhido). null quando `blocked`. */
  file: File | null
  previewUrl: string
  name: string
  include: boolean
  /** Aviso que nao impede ("encolhido de 412 KB"). */
  note: string | null
  /** Motivo que impede subir. */
  blocked: string | null
  status: 'idle' | 'uploading' | 'done' | 'failed'
  error: string | null
}

export interface CollectResult {
  items: PackItem[]
  skipped: { path: string; reason: string }[]
  /** Nome do zip quando veio um so; senao vazio. */
  packName: string
}

function isZip(file: File): boolean {
  return extOf(file.name) === 'zip' || /zip/.test(file.type)
}

function formatKb(bytes: number): string {
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1).replace(/\.0$/, '') + ' MB'
  return Math.round(bytes / 1000) + ' KB'
}

/**
 * Cabe em 256 KB? Se nao e e parada, encolhe pra 128px (WebP; o Safari, que
 * nao gera WebP no canvas, devolve PNG — a 128px tambem cabe). Animada nao
 * da pra encolher aqui sem perder a animacao, entao fica bloqueada.
 */
async function prepare(
  source: string,
  bytes: Uint8Array
): Promise<{ file: File | null; note: string | null; blocked: string | null }> {
  const mime = mimeForName(source) ?? 'image/png'
  const fileName = source.split(/[\\/]/).pop() || 'emoji.png'

  if (bytes.length <= MAX_EMOJI_BYTES) {
    return { file: new File([bytes as BlobPart], fileName, { type: mime }), note: null, blocked: null }
  }
  if (looksAnimated(bytes)) {
    return {
      file: null,
      note: null,
      blocked: `animado e com ${formatKb(bytes.length)} (máx ${formatKb(MAX_EMOJI_BYTES)})`
    }
  }

  try {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }))
    const scale = Math.min(1, SHRINK_TO / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('sem canvas')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.92))
    if (!blob || blob.size > MAX_EMOJI_BYTES) {
      return { file: null, note: null, blocked: 'não coube em 256 KB nem encolhido' }
    }
    const ext = blob.type === 'image/webp' ? '.webp' : '.png'
    const shrunkName = fileName.replace(/\.[^.]+$/, '') + ext
    return {
      file: new File([blob], shrunkName, { type: blob.type }),
      note: `encolhido de ${formatKb(bytes.length)}`,
      blocked: null
    }
  } catch {
    return { file: null, note: null, blocked: 'imagem ilegível' }
  }
}

let keySeq = 0

export async function collectPack(
  picked: File[],
  serverNames: ReadonlySet<string>
): Promise<CollectResult> {
  const raw: { source: string; bytes: Uint8Array }[] = []
  const skipped: { path: string; reason: string }[] = []
  const zips = picked.filter(isZip)

  for (const file of picked) {
    if (isZip(file)) {
      try {
        const res = await readZipImages(new Uint8Array(await file.arrayBuffer()))
        for (const img of res.images) raw.push({ source: img.path, bytes: img.bytes })
        for (const s of res.skipped) skipped.push({ path: `${file.name}/${s.path}`, reason: s.reason })
      } catch (err) {
        skipped.push({
          path: file.name,
          reason: err instanceof ZipError ? err.message : 'não deu pra abrir o zip'
        })
      }
    } else if (mimeForName(file.name)) {
      raw.push({ source: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })
    } else {
      skipped.push({ path: file.name, reason: 'não é imagem' })
    }
  }

  const names = assignNames(
    raw.map((r) => r.source),
    serverNames
  )

  const items = await Promise.all(
    raw.map(async (r, i): Promise<PackItem> => {
      const prepared = await prepare(r.source, r.bytes)
      const previewUrl = URL.createObjectURL(
        prepared.file ?? new Blob([r.bytes as BlobPart], { type: mimeForName(r.source) ?? '' })
      )
      return {
        key: `pack-${++keySeq}`,
        source: r.source,
        file: prepared.file,
        previewUrl,
        name: names[i],
        include: !prepared.blocked,
        note: prepared.note,
        blocked: prepared.blocked,
        status: 'idle',
        error: null
      }
    })
  )

  return { items, skipped, packName: zips.length === 1 ? packNameFromFile(zips[0].name) : '' }
}

export function releasePack(items: PackItem[]): void {
  for (const item of items) URL.revokeObjectURL(item.previewUrl)
}
