/**
 * BUILD DO NAVEGADOR — o mesmo renderer do launcher, servido como site.
 *
 * O `electron.vite.config.ts` continua mandando no app de desktop e não sabe
 * que este arquivo existe. A diferença entre os dois é pequena de propósito:
 *
 *   - a entrada é `src/index.web.html` → `src/main.web.tsx`, que instala a
 *     ponte de mentira (`lib/bridge-web.ts`) antes de subir o app;
 *   - não existe a segunda página (`overlay.html`): sobreposição em partida é
 *     uma janela transparente por cima do jogo, coisa que navegador não tem;
 *   - sai em `dist-web/`, que é o que vai pro nginx.
 *
 * Tudo o mais — aliases, plugin do React, `public/` — é igual, e é esse o
 * ponto: um código só, duas cascas.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const raiz = __dirname
const pkg = JSON.parse(readFileSync(resolve(raiz, 'package.json'), 'utf8')) as { version: string }

/**
 * O Vite nomeia o HTML de saída pelo caminho dele dentro do `root`, então
 * `src/index.web.html` sairia como `dist-web/index.web.html` — e o nginx
 * procura `index.html`. Renomear aqui é mais honesto que ter dois arquivos
 * chamados `index.html` no mesmo diretório (um do Electron, outro da web) e
 * depender de qual config leu qual.
 */
function renomearParaIndexHtml(): Plugin {
  return {
    name: 'bocas-renomeia-index-web',
    enforce: 'post',
    generateBundle(_opcoes, bundle) {
      const chave = Object.keys(bundle).find((k) => k.endsWith('index.web.html'))
      if (!chave) return
      const arquivo = bundle[chave]
      delete bundle[chave]
      arquivo.fileName = 'index.html'
      bundle['index.html'] = arquivo
    },
  }
}

export default defineConfig({
  root: resolve(raiz, 'src'),
  publicDir: resolve(raiz, 'public'),
  // base relativa não serve: o app usa rotas do react-router (/, /impressao),
  // e num caminho fundo o asset relativo quebraria. O site mora na raiz.
  base: '/',
  plugins: [react(), renomearParaIndexHtml()],
  define: {
    // O `app.version()` da ponte responde isto. No desktop a versão vem do
    // processo principal; aqui ela é assada no bundle.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: resolve(raiz, 'dist-web'),
    emptyOutDir: true,
    rollupOptions: {
      input: { index: resolve(raiz, 'src/index.web.html') },
    },
  },
  resolve: {
    alias: {
      '@': resolve(raiz, 'src'),
    },
  },
  server: {
    port: 5174,
  },
})
