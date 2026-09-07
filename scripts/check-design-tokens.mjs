// Guarda do design system. Roda no `npm run typecheck` (que o CI de release
// chama) e reprova se voltar ao codigo algo que a desintoxicacao visual de
// set/2026 tirou. Cada regra aponta o arquivo:linha e diz o que usar.
//
// Nao e ESLint de proposito: sao meia duzia de regexes sobre className/CSS,
// e um arquivo de 80 linhas que qualquer um le inteiro vale mais que um
// plugin que ninguem abre.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../src/', import.meta.url))

const RULES = [
  {
    id: 'font-floor',
    // text-[0px] fica de fora: e o truque de esconder texto mantendo-o pra
    // leitor de tela.
    test: /\btext-\[(?:[1-9]|10)(?:\.\d+)?px\]/g,
    why: 'piso tipografico e 11px — use text-[11px], text-[11.5px] ou text-xs'
  },
  {
    id: 'brand-hex',
    test: /#(?:6AFF00|3A5F0B|8FFF40|4CAF00|F2B705|D4A005|0B0B0B|0F0F0F|151515|EAEAEA|1A1A1A|2A2A2A|1F1F1F)\b/gi,
    why: 'cor da marca escrita a mao quebra os temas — use o token (acid, burn, void, line, surface, foreground)',
    // O vermelho do YouTube (#FF0033) e marca de terceiro e nem esta na lista.
    // effects.css sao COSMETICOS (arco-iris, fogo, moldura acida/dourada):
    // cor fixa ali e conteudo, nao cromo. DEFAULT_NAME_COLOR e um dado que
    // vai pro servidor, nao um estilo — idem os presets de cor de cargo.
    allowFiles: ['styles/effects.css', 'lib/api-gamification.ts', 'components/admin/CargosTab.tsx']
  },
  {
    id: 'raw-neon',
    test: /rgba?\(\s*106\s*,\s*255\s*,\s*0/g,
    why: 'halo neon fixo — use rgb(var(--neon-rgb)/a) ou shadow-neon-1/2/3',
    allowFiles: ['styles/effects.css']
  },
  {
    id: 'grey-hex',
    test: /\b(?:bg|border|divide|text)-\[#(?:0[0-9A-F]|1[0-9A-F]|2[0-9A-F]|3[0-9A-F])[0-9A-F]{4}\]/gi,
    why: 'cinza escrito a mao — use bg-void, bg-surface-raised, border-line, border-line-strong'
  },
  {
    id: 'terminal-label',
    // p/span com o trio mono + caixa-alta + espacamento largo: era o rotulo
    // "terminal" que virou observacao. Cabecalho de secao (h3, Label) pode.
    test: /<(?:p|span)\b[^>]*className="[^"]*\bfont-mono\b[^"]*\buppercase\b[^"]*\btracking-widest\b/g,
    why: 'rotulo em mono caixa-alta espacada em <p>/<span> — observacao e Inter em caixa normal'
  }
]

const SKIP_DIRS = new Set(['node_modules', 'generated'])
const EXT = /\.(tsx?|css|html)$/

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (EXT.test(name)) yield full
  }
}

// Apaga comentarios preservando as quebras de linha, pra que arquivo:linha
// continue certo — comentario pode citar o hex antigo pra explicar a troca.
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/^(\s*)\/\/.*$/gm, (c) => c.replace(/[^\n]/g, ' '))
}

const problems = []
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const code = stripComments(readFileSync(file, 'utf8'))
  for (const rule of RULES) {
    if (rule.allowFiles?.includes(rel)) continue
    for (const match of code.matchAll(rule.test)) {
      const line = code.slice(0, match.index).split('\n').length
      problems.push(`${rel}:${line}  [${rule.id}]  ${match[0]}  → ${rule.why}`)
    }
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problema(s) de design system:\n`)
  for (const p of problems) console.error('  ' + p)
  console.error('')
  process.exit(1)
}
console.log('design tokens ok')
