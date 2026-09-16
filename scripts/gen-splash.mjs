/**
 * SPLASH SCREEN DO iPHONE — gerador dos `apple-touch-startup-image`.
 *
 * Por que existe: no Android o navegador monta a tela de abertura sozinho a
 * partir do `background_color` + ícone do manifesto. O iOS ignora isso: sem uma
 * imagem no tamanho EXATO em pixels do aparelho, o PWA abre com um flash branco
 * — que é justamente o que entrega "isso aqui é um site". Com a imagem certa,
 * abre preto com o logo, igual app de loja.
 *
 * A regra do iOS é chata: a media query tem que casar `device-width`,
 * `device-height` e `-webkit-device-pixel-ratio` do aparelho. Errou um, ele
 * descarta a imagem em silêncio e volta pro branco. Por isso a tabela abaixo é
 * em ponto CSS + DPR, e o arquivo é gerado em pixel físico (ponto × DPR).
 *
 * Só roda na mão, quando o logo mudar:
 *
 *   npm i --no-save sharp
 *   node scripts/gen-splash.mjs
 *
 * O `sharp` de propósito NÃO está no package.json: é ferramenta de uma vez só,
 * não dependência do site. O que vai pro git é o PNG gerado.
 *
 * O script também escreve o bloco de <link> em `scripts/splash-links.html` —
 * se mexer na tabela, cole a saída no lugar do bloco marcado no index.html.
 */
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'public', 'bocas-murchas-transp.png')
const OUT_DIR = join(ROOT, 'public', 'icons', 'splash')

/** Mesmo preto do `background_color` do manifesto e do `theme-color`. */
const BACKGROUND = { r: 0x0b, g: 0x0b, b: 0x0b, alpha: 1 }

/**
 * Aparelhos em ponto CSS. Modelos que compartilham ponto+DPR (o 16 Plus e o
 * 15 Pro Max, por exemplo) casam na MESMA media query, então aparecem uma vez
 * só — duplicar geraria dois <link> concorrendo pelo mesmo aparelho.
 */
const DEVICES = [
  // iPhone
  { w: 440, h: 956, dpr: 3, nome: 'iPhone 16 Pro Max' },
  { w: 430, h: 932, dpr: 3, nome: 'iPhone 16 Plus, 15 Pro Max, 14 Pro Max' },
  { w: 428, h: 926, dpr: 3, nome: 'iPhone 14 Plus, 13 Pro Max, 12 Pro Max' },
  { w: 402, h: 874, dpr: 3, nome: 'iPhone 16 Pro' },
  { w: 393, h: 852, dpr: 3, nome: 'iPhone 16, 15 Pro, 15, 14 Pro' },
  { w: 390, h: 844, dpr: 3, nome: 'iPhone 14, 13, 13 Pro, 12, 12 Pro' },
  { w: 375, h: 812, dpr: 3, nome: 'iPhone 13 mini, 12 mini, 11 Pro, XS, X' },
  { w: 414, h: 896, dpr: 3, nome: 'iPhone 11 Pro Max, XS Max' },
  { w: 414, h: 896, dpr: 2, nome: 'iPhone 11, XR' },
  { w: 414, h: 736, dpr: 3, nome: 'iPhone 8 Plus, 7 Plus, 6s Plus' },
  { w: 375, h: 667, dpr: 2, nome: 'iPhone SE (2ª/3ª), 8, 7, 6s' },
  { w: 320, h: 568, dpr: 2, nome: 'iPhone SE (1ª), 5s' },
  // iPad — o manifesto trava em portrait, então só a vertical.
  { w: 1024, h: 1366, dpr: 2, nome: 'iPad Pro 12.9"' },
  { w: 834, h: 1194, dpr: 2, nome: 'iPad Pro 11"' },
  { w: 820, h: 1180, dpr: 2, nome: 'iPad Air 10.9"' },
  { w: 810, h: 1080, dpr: 2, nome: 'iPad 10.2"' },
  { w: 768, h: 1024, dpr: 2, nome: 'iPad mini, iPad Air 9.7"' },
]

/**
 * O logo ocupa 42% da menor dimensão. Em ponto fixo ele sumiria no iPad e
 * estouraria no SE; proporcional dá o mesmo peso visual em todo mundo. O par
 * é arredondado porque composite com meio pixel borra a borda.
 */
function tamanhoDoLogo(larguraPx, alturaPx) {
  const menorLado = Math.min(larguraPx, alturaPx)
  return Math.round((menorLado * 0.42) / 2) * 2
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const links = []
  let total = 0

  for (const device of DEVICES) {
    const larguraPx = device.w * device.dpr
    const alturaPx = device.h * device.dpr
    const logoPx = tamanhoDoLogo(larguraPx, alturaPx)

    // `trim` antes do resize: o PNG de origem vem com uma faixa transparente em
    // volta, e sem aparar ela os 42% viram uns 32% de logo visível — some no
    // meio da tela. Aparando, a proporção pedida é a que aparece.
    const logo = await sharp(SOURCE)
      .trim()
      .resize(logoPx, logoPx, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer()

    // 46% da altura, não 50%: o olho lê um bloco centrado como "baixo demais",
    // e é onde a Apple posiciona o logo nas telas dela.
    const topo = Math.round(alturaPx * 0.46 - logoPx / 2)
    const esquerda = Math.round((larguraPx - logoPx) / 2)

    const nomeArquivo = `splash-${larguraPx}x${alturaPx}.png`
    const destino = join(OUT_DIR, nomeArquivo)

    const { size } = await sharp({
      create: { width: larguraPx, height: alturaPx, channels: 4, background: BACKGROUND },
    })
      .composite([{ input: logo, top: topo, left: esquerda }])
      // Fundo chapado + um logo = pouquíssima cor. A paleta de 8 bits derruba
      // o arquivo de ~300 KB pra dezenas, sem diferença visível no preto.
      .png({ palette: true, quality: 90, effort: 9 })
      .toFile(destino)

    total += size
    console.log(`${nomeArquivo.padEnd(22)} ${String(Math.round(size / 1024)).padStart(4)} KB  ${device.nome}`)

    links.push(
      `    <link rel="apple-touch-startup-image" href="/icons/splash/${nomeArquivo}"\n` +
        `      media="(device-width: ${device.w}px) and (device-height: ${device.h}px)` +
        ` and (-webkit-device-pixel-ratio: ${device.dpr}) and (orientation: portrait)" />`
    )
  }

  const bloco = links.join('\n')
  // Fica em scripts/ e não em public/: qualquer coisa dentro de public/ vira
  // arquivo público servido pelo nginx, e este aqui é só cola pro index.html.
  await writeFile(join(ROOT, 'scripts', 'splash-links.html'), bloco + '\n', 'utf8')

  console.log(`\n${DEVICES.length} telas, ${Math.round(total / 1024)} KB no total.`)
  console.log('Bloco de <link> salvo em scripts/splash-links.html — cole no index.html.')
}

main().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
