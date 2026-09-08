// Gera .design-sync/compiled.css — o `cssEntry` do design-sync.
//
// O launcher e' um app Electron: o CSS que ele serve nasce do pipeline do
// Vite (PostCSS + Tailwind) e nunca existe como arquivo. O converter precisa
// de um .css real pra copiar, entao compilamos um aqui.
//
// Ordem do arquivo:
//   1. @import das fontes do Google (tem que ser a PRIMEIRA regra do arquivo);
//   2. saida do Tailwind sobre src/styles/globals.css (tokens dos 5 temas +
//      camada base + utilitarios usados por todo o src/);
//   3. css-tail.css (ver o comentario de la — desfaz o fundo branco do card).
//
// Rode de dentro de bocas-murchas-launcher/.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FONTS =
  "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700" +
  "&family=JetBrains+Mono:wght@400;700&family=Anton&display=swap');\n";

const tmp = mkdtempSync(join(tmpdir(), 'ds-css-'));
const out = join(tmp, 'tw.css');
try {
  // Chama lib/cli.js pelo node em vez do shim de .bin: no Windows o shim e' um
  // .cmd, e spawnSync sem shell recusa .cmd com EINVAL.
  execFileSync(
    process.execPath,
    [
      'node_modules/tailwindcss/lib/cli.js',
      // Config propria do design-sync: herda a do app e soma um safelist com a
      // escala de layout inteira (ver o arquivo pra saber por que).
      '-c', '.design-sync/tailwind.design-sync.js',
      '-i', 'src/styles/globals.css',
      '-o', out,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  const css = FONTS + readFileSync(out, 'utf8') + '\n' + readFileSync('.design-sync/css-tail.css', 'utf8');
  writeFileSync('.design-sync/compiled.css', css);
  console.log(`compiled.css: ${(css.length / 1024).toFixed(0)} KB`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
