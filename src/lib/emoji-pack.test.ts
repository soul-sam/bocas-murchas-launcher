import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assignNames,
  emojiNameFromFile,
  isJunkEntry,
  looksAnimated,
  nameProblems,
  packNameFromFile,
  readZipImages,
  uniqueName,
  ZipError
} from './emoji-pack.ts'

// ---------- zip de verdade, montado aqui ----------

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Zip mínimo (CRC zerado — o leitor não confere). `deflate` escolhe o método. */
async function makeZip(
  entries: { path: string; bytes: Uint8Array; deflate?: boolean; localExtra?: number }[]
): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const e of entries) {
    const name = enc.encode(e.path)
    const data = e.deflate ? await deflateRaw(e.bytes) : e.bytes
    const extra = e.localExtra ?? 0
    const local = new Uint8Array(30 + name.length + extra + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(8, e.deflate ? 8 : 0, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, e.bytes.length, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, extra, true)
    local.set(name, 30)
    local.set(data, 30 + name.length + extra)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(8, 0x800, true) // nome em UTF-8
    cv.setUint16(10, e.deflate ? 8 : 0, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, e.bytes.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)

    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const cdSize = centrals.reduce((s, c) => s + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, offset, true)

  const out = new Uint8Array(offset + cdSize + 22)
  let at = 0
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, at)
    at += part.length
  }
  return out
}

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function pngWith(chunks: string[]): Uint8Array {
  const out: number[] = [...PNG_HEAD]
  for (const type of chunks) {
    out.push(0, 0, 0, 1, ...[...type].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, 0)
  }
  return new Uint8Array(out)
}

// ---------- nomes ----------

test('emoji-pack: nome sai do arquivo, sem acento, espaço vira _', () => {
  assert.equal(emojiNameFromFile('Pepe Triste.png'), 'pepe_triste')
  assert.equal(emojiNameFromFile('pack/coração-partido.GIF'), 'coracao_partido')
  assert.equal(emojiNameFromFile('C:\\fotos\\KEKW!!.webp'), 'kekw')
  assert.equal(emojiNameFromFile('__pog..champ__.png'), 'pog_champ')
  assert.equal(emojiNameFromFile('😀.png'), 'emoji')
  assert.equal(emojiNameFromFile('x.png'), 'emoji')
  const long = emojiNameFromFile('a'.repeat(31) + ' b.png')
  assert.equal(long, 'a'.repeat(31)) // corta em 32 sem _ pendurado
})

test('emoji-pack: nome repetido ganha _2, _3 e nunca passa de 32', () => {
  assert.equal(uniqueName('kekw', new Set()), 'kekw')
  assert.equal(uniqueName('kekw', new Set(['kekw'])), 'kekw_2')
  assert.equal(uniqueName('kekw', new Set(['kekw', 'kekw_2'])), 'kekw_3')
  const full = 'z'.repeat(32)
  const next = uniqueName(full, new Set([full]))
  assert.equal(next.length, 32)
  assert.ok(next.endsWith('_2'))
})

test('emoji-pack: a leva não colide com o servidor nem consigo mesma', () => {
  const names = assignNames(['kekw.png', 'KEKW.gif', 'pog.png', 'a/kekw.webp'], new Set(['pog']))
  assert.deepEqual(names, ['kekw', 'kekw_2', 'pog_2', 'kekw_3'])
})

test('emoji-pack: problema de nome só conta o que está marcado', () => {
  const server = new Set(['pog'])
  const problems = nameProblems(
    [
      { name: 'kekw', include: true },
      { name: 'kekw', include: true },
      { name: 'pog', include: true },
      { name: 'X', include: true },
      { name: 'pog', include: false },
      { name: 'ok_1', include: true }
    ],
    server
  )
  assert.equal(problems[0], 'repetido no pack')
  assert.equal(problems[1], 'repetido no pack')
  assert.equal(problems[2], 'já existe no servidor')
  assert.ok(problems[3])
  assert.equal(problems[4], null)
  assert.equal(problems[5], null)

  // Desmarcar um dos repetidos libera o outro.
  const fixed = nameProblems(
    [
      { name: 'kekw', include: true },
      { name: 'kekw', include: false }
    ],
    server
  )
  assert.deepEqual(fixed, [null, null])
})

test('emoji-pack: lixo de sistema não conta como imagem', () => {
  assert.equal(isJunkEntry('__MACOSX/pepe.png'), true)
  assert.equal(isJunkEntry('pack/__MACOSX/pepe.png'), true)
  assert.equal(isJunkEntry('pack/.DS_Store'), true)
  assert.equal(isJunkEntry('pack/Thumbs.db'), true)
  assert.equal(isJunkEntry('pack/._pepe.png'), true)
  assert.equal(isJunkEntry('pack/pepe.png'), false)
  assert.equal(isJunkEntry('macosx_fan/pepe.png'), false)
})

test('emoji-pack: nome do pack sai do .zip', () => {
  assert.equal(packNameFromFile('C:/x/Pack_do_Pepe.zip'), 'Pack do Pepe')
  assert.equal(packNameFromFile('reacoes.ZIP'), 'reacoes')
})

// ---------- animação ----------

test('emoji-pack: reconhece GIF, APNG e WebP animado; PNG e WebP parados não', () => {
  assert.equal(looksAnimated(new TextEncoder().encode('GIF89a......')), true)
  assert.equal(looksAnimated(pngWith(['IHDR', 'acTL', 'IDAT'])), true)
  assert.equal(looksAnimated(pngWith(['IHDR', 'IDAT', 'IEND'])), false)

  const webp = (flags: number): Uint8Array => {
    const b = new Uint8Array(30)
    b.set(new TextEncoder().encode('RIFF'), 0)
    b.set(new TextEncoder().encode('WEBP'), 8)
    b.set(new TextEncoder().encode('VP8X'), 12)
    b[20] = flags
    return b
  }
  assert.equal(looksAnimated(webp(0x02)), true)
  assert.equal(looksAnimated(webp(0x10)), false)
  assert.equal(looksAnimated(new Uint8Array([0xff, 0xd8, 0xff])), false) // jpg
})

// ---------- zip ----------

test('emoji-pack: lê stored e deflate, em subpasta, e ignora lixo do Mac', async () => {
  const pepe = pngWith(['IHDR', 'IDAT', 'IEND'])
  const big = new Uint8Array(5000).fill(7)
  const zip = await makeZip([
    { path: 'pepe/', bytes: new Uint8Array() },
    { path: 'pepe/triste.png', bytes: pepe },
    { path: 'pepe/feliz.gif', bytes: big, deflate: true, localExtra: 9 },
    { path: '__MACOSX/pepe/._triste.png', bytes: new Uint8Array([1, 2]) },
    { path: 'pepe/.DS_Store', bytes: new Uint8Array([1]) },
    { path: 'LEIA-ME.txt', bytes: new TextEncoder().encode('oi') }
  ])

  const { images, skipped } = await readZipImages(zip)
  assert.deepEqual(
    images.map((i) => i.path),
    ['pepe/triste.png', 'pepe/feliz.gif']
  )
  assert.deepEqual([...images[0].bytes], [...pepe])
  assert.equal(images[1].bytes.length, 5000)
  assert.ok(images[1].bytes.every((b) => b === 7))
  assert.deepEqual(skipped, [{ path: 'LEIA-ME.txt', reason: 'não é imagem' }])
})

test('emoji-pack: arquivo que não é zip dá erro claro', async () => {
  await assert.rejects(readZipImages(new TextEncoder().encode('isso nao e zip nenhum')), ZipError)
})

test('emoji-pack: deflate quebrado vira skipped, não derruba o pack', async () => {
  const zip = await makeZip([{ path: 'ok.png', bytes: pngWith(['IHDR']) }, { path: 'ruim.png', bytes: new Uint8Array([1]) }])
  const failing = async (): Promise<Uint8Array> => {
    throw new Error('x')
  }
  // Marca a segunda como deflate no diretório central e no local.
  const view = new DataView(zip.buffer)
  const localSecond = 30 + 'ok.png'.length + 8 + 13
  view.setUint16(localSecond + 8, 8, true)
  const cdStart = view.getUint32(zip.length - 22 + 16, true)
  const secondCentral = cdStart + 46 + 'ok.png'.length
  view.setUint16(secondCentral + 10, 8, true)

  const { images, skipped } = await readZipImages(zip, failing)
  assert.deepEqual(images.map((i) => i.path), ['ok.png'])
  assert.deepEqual(skipped, [{ path: 'ruim.png', reason: 'não deu pra descompactar' }])
})
