/**
 * JANELA DO INSTALADOR — gerador de `build/installer-splash-<escala>.bmp`.
 *
 * O instalador (NSIS, ver build/installer.nsh) troca a janelinha cinza de
 * progresso por uma janela sem borda com esta imagem e uma barra animada por
 * cima. O NSIS só desenha BMP, e o BMP não escala sem borrar: por isso sai uma
 * imagem por escala de tela (100%, 150% e 200%) e o instalador escolhe pelo
 * DPI do Windows.
 *
 * A barra NÃO está na imagem — é um controle de verdade, posicionado pelo
 * installer.nsh em BAR (abaixo), multiplicado pela escala. Mexeu no layout
 * aqui, mexa lá.
 *
 * Só roda na mão, quando a arte mudar:
 *
 *   npm i --no-save sharp
 *   node scripts/gen-installer-splash.mjs
 *
 * O `sharp` de propósito NÃO está no package.json (mesmo motivo do
 * gen-splash.mjs). O que vai pro git é o BMP gerado.
 */
import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const LOGO = join(root, 'public', 'logo-login.png')

/** Tamanho em 100%. */
const W = 420
const H = 260
/** Onde o installer.nsh põe a barra (em 100%). */
export const BAR = { x: 64, y: 222, w: 292, h: 4 }
const SCALES = [100, 150, 200]

// Cores do tema Grafite (src/styles/globals.css).
const BG = '#0e0f10'
const EDGE = '#24282c'
const TEXT = '#e9ebee'
const MUTED = '#8b939b'
const ACID = '#6aff00'

function svg(s) {
  const px = (n) => Math.round(n * s)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px(W)}" height="${px(H)}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="34%" r="46%">
      <stop offset="0%" stop-color="${ACID}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="${ACID}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="${BG}"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <rect x="${px(0.5)}" y="${px(0.5)}" width="${px(W) - px(1)}" height="${px(H) - px(1)}"
        fill="none" stroke="${EDGE}" stroke-width="${Math.max(1, px(1))}"/>
  <text x="50%" y="${px(184)}" text-anchor="middle" fill="${TEXT}"
        font-family="Segoe UI Semibold, Segoe UI, sans-serif" font-weight="600" font-size="${px(15)}">Instalando o Bocas Murchas</text>
  <text x="50%" y="${px(204)}" text-anchor="middle" fill="${MUTED}"
        font-family="Segoe UI, sans-serif" font-size="${px(12)}">leva só uns segundinhos</text>
  <rect x="${px(BAR.x)}" y="${px(BAR.y)}" width="${px(BAR.w)}" height="${px(BAR.h)}" rx="${px(2)}" fill="#1b1e21"/>
</svg>`
}

/** BMP 24 bits, de baixo pra cima, linha alinhada em 4 bytes. */
function toBmp(rgb, width, height) {
  const row = Math.ceil((width * 3) / 4) * 4
  const size = 54 + row * height
  const out = Buffer.alloc(size)
  out.write('BM', 0)
  out.writeUInt32LE(size, 2)
  out.writeUInt32LE(54, 10)
  out.writeUInt32LE(40, 14)
  out.writeInt32LE(width, 18)
  out.writeInt32LE(height, 22)
  out.writeUInt16LE(1, 26)
  out.writeUInt16LE(24, 28)
  out.writeUInt32LE(row * height, 34)
  for (let y = 0; y < height; y++) {
    const dst = 54 + (height - 1 - y) * row
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 3
      out[dst + x * 3] = rgb[src + 2]
      out[dst + x * 3 + 1] = rgb[src + 1]
      out[dst + x * 3 + 2] = rgb[src]
    }
  }
  return out
}

for (const scale of SCALES) {
  const s = scale / 100
  const width = Math.round(W * s)
  const height = Math.round(H * s)
  const logoSize = Math.round(132 * s)
  const logo = await sharp(LOGO).resize(logoSize, logoSize).png().toBuffer()

  const { data } = await sharp(Buffer.from(svg(s)))
    .composite([{ input: logo, left: Math.round((width - logoSize) / 2), top: Math.round(26 * s) }])
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const file = join(root, 'build', `installer-splash-${scale}.bmp`)
  await writeFile(file, toBmp(data, width, height))
  // Prévia em PNG pra conferir sem abrir o instalador.
  await sharp(data, { raw: { width, height, channels: 3 } }).png().toFile(file.replace(/\.bmp$/, '.preview.png'))
  console.log(`${file} (${width}x${height})`)
}
