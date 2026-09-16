/**
 * ÍCONES DO PWA — o que aparece na tela inicial do celular.
 *
 * São três formatos com regras diferentes, e misturá-los é o erro clássico:
 *
 * - **`any` (192/512)** — usado como está. Fundo chapado em vez de
 *   transparente: o Android põe ícone transparente sobre um quadrado BRANCO, e
 *   a marca preta e verde sumiria.
 * - **`maskable` (192/512)** — o sistema RECORTA no formato dele (círculo no
 *   Pixel, quadrado arredondado no Samsung…). A arte tem que viver na "safe
 *   zone": o círculo central de 80%. Por isso o logo aqui entra menor — o que
 *   passa disso é serragem, e num ícone `any` reaproveitado como maskable o
 *   recorte come a borda do desenho.
 * - **`apple-touch-icon` (180)** — o iOS arredonda sozinho e ignora
 *   transparência, então vai chapado e sem margem extra.
 *
 * Só roda na mão, quando o logo mudar:
 *
 *   npm i --no-save sharp
 *   node scripts/gen-icons.mjs
 *
 * O `sharp` de propósito NÃO está no package.json (ver scripts/gen-splash.mjs).
 */
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'public', 'bocas-murchas-transp.png')
const OUT_DIR = join(ROOT, 'public', 'icons')

/** Mesmo preto do manifesto, do `theme-color` e das splash. */
const BACKGROUND = { r: 0x0b, g: 0x0b, b: 0x0b, alpha: 1 }

const ICONES = [
  { arquivo: 'icon-192.png', tamanho: 192, ocupacao: 0.82 },
  { arquivo: 'icon-512.png', tamanho: 512, ocupacao: 0.82 },
  // 60% e não 80%: a safe zone do maskable é o círculo central de 80% do
  // lado, e o logo é mais largo que alto — encostar no limite faz o recorte
  // circular comer as pontas do fone.
  { arquivo: 'maskable-192.png', tamanho: 192, ocupacao: 0.6 },
  { arquivo: 'maskable-512.png', tamanho: 512, ocupacao: 0.6 },
  { arquivo: 'apple-touch-icon.png', tamanho: 180, ocupacao: 0.82 },
]

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  // `trim` tira a moldura transparente do arquivo de origem: sem isso a
  // "ocupação" abaixo mede o PNG, não o desenho.
  const limpo = await sharp(SOURCE).trim().toBuffer()

  for (const { arquivo, tamanho, ocupacao } of ICONES) {
    const logoPx = Math.round((tamanho * ocupacao) / 2) * 2

    const logo = await sharp(limpo)
      .resize(logoPx, logoPx, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer()

    const { size } = await sharp({
      create: { width: tamanho, height: tamanho, channels: 4, background: BACKGROUND },
    })
      .composite([{ input: logo, gravity: 'center' }])
      .png({ palette: true, quality: 90, effort: 9 })
      .toFile(join(OUT_DIR, arquivo))

    console.log(`${arquivo.padEnd(22)} ${String(tamanho).padStart(3)}px  ${Math.round(size / 1024)} KB`)
  }
}

main().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
