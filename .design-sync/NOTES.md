# design-sync — notas deste repositório

Primeiro sync: 07/09/2026. Shape `package` (não existe Storybook).

## O que é peculiar aqui

- **Não existe `dist/` de biblioteca.** O launcher é um app Electron
  (`private: true`, `main` aponta pra `out/main/index.js`). O converter roda com
  `--entry ./.design-sync/ds-entry.tsx`, um barrel escrito à mão que recorta o
  que entra no design system. Sem ele o converter cai em synth-entry e faz
  `export *` de TODO o `src/` (90+ componentes, telas inteiras).
  **Mantenha `ds-entry.tsx` e `componentSrcMap` em sincronia.**

- **Comando de build completo** (a partir de `bocas-murchas-launcher/`):

  ```sh
  node .design-sync/build-css.mjs
  node .ds-sync/package-build.mjs --config .design-sync/config.json \
    --node-modules ./node_modules --entry ./.design-sync/ds-entry.tsx --out ./ds-bundle
  node .ds-sync/package-validate.mjs ./ds-bundle
  ```

- **`cfg.tsconfig` aponta pra `.design-sync/tsconfig.paths.json`, não pro
  `tsconfig.web.json`.** É contorno de um bug do converter: `lib/bundle.mjs`
  tira comentários do tsconfig por regex (`/\*` até `*/` não-guloso). Em
  `tsconfig.web.json` isso casa do `/*` dentro de `"@/*"` até o `*/` dentro de
  `"src/**/*.ts"` no `include` — o bloco `paths` inteiro é apagado, o
  `JSON.parse` quebra e o plugin de alias vira `null` (silenciosamente: o
  sintoma é `Could not resolve "@/components/..."` em todo import). O arquivo de
  contorno não tem `include`, então não existe `*/` depois do `paths`.
  Se o converter for atualizado, teste `tsconfig.web.json` de novo.

- **Alias pra diretório precisa de `/index` explícito.** O resolvedor testa o
  caminho nu antes das extensões, acha a PASTA e manda o esbuild ler um
  diretório: `Cannot read file "src/components/cards": Incorrect function`. Por
  isso o barrel importa `@/components/cards/index`.

- **CSS é compilado à parte.** `.design-sync/build-css.mjs` roda o Tailwind
  sobre `src/styles/globals.css` com `.design-sync/tailwind.design-sync.js`
  (herda a config do app + `safelist`), prefixa o `@import` das fontes do Google
  e anexa `css-tail.css`. A folha que o app serve nasce do Vite e nunca existe
  em disco. Chame `tailwindcss` como `node node_modules/tailwindcss/lib/cli.js`
  — no Windows o shim de `.bin` é um `.cmd` e `spawnSync` sem shell recusa com
  `EINVAL`.

- **O `safelist` não é enfeite.** A folha do app é purgada contra `./src/**`, ou
  seja, só tem as utilidades que o launcher já usa. O agente de design escreve o
  próprio layout: sem safelist, `gap-7`, `p-9`, `grid-cols-7` ou
  `border-acid-dark` simplesmente não existiriam na folha — sem erro, sem
  efeito. **Não cobre o modificador de opacidade** (`bg-acid/20`): o Tailwind só
  gera esses sob demanda, então existem apenas onde o app já os usa.

- **`css-tail.css` desfaz o fundo branco do card.** O emissor de preview injeta
  `body{background:#fff}` num `<style>` inline que vem depois do `<link>` da
  `styles.css`; este DS é dark-first. A regra usa `html body` (especificidade
  0,0,2 contra 0,0,1) — ganha por especificidade, sem `!important`.

- **Fix aplicado no código do app:** `src/lib/natural-date.ts` usava os
  combining marks CRUS num range de regex (`/[̀-ͯ]/`). Servido como latin-1, o
  range inverte e o bundle INTEIRO morre no parse com
  `Invalid regular expression: Range out of order in character class` — era isso
  que fazia `window.BocasMurchas` ficar `undefined`. Trocado por
  `/[\u0300-\u036f]/`, igual `api-cargos.ts` já fazia.

## Componentes fora do preview rico (floor card, de propósito)

Onze componentes ficaram no floor card porque leem contexto do app e o hook
lança erro sem Provider (`useX must be used within a XProvider`). Os Providers
reais só aceitam `children` e fazem fetch/socket no mount, e os React Contexts
crus não são exportados — não dá pra injetar valor mock sem mexer no app.
Decisão do usuário em 07/09/2026: **floor card**, sem tocar no código.

`ChessResultCard`, `EventCard`, `GameResultCard`, `PartyCard`, `PollCard`,
`RecapCard`, `SuggestionCard`, `WagerCard`, `WatchCard` (contextos de chat),
`PlayCard` (`useSettings`), `ServerStatusCard` (`useServerStatus`).

Eles continuam **importáveis e funcionais** no bundle — só não têm card rico.
Pra promover algum: exportar o Context cru em `src/lib/<x>-context.tsx` e montar
um módulo de providers mock via `cfg.extraEntries`.

## Estados que não renderizam estático

- `Hint` não expõe `open` — o balão só abre no hover/foco. O card mostra os
  alvos compostos; o estado aberto está no card de `Tooltip`, que aceita `open`.
- `MessageCard` só tem um tipo renderável fora do app (`system`); o `compact`
  não ganhou célula porque o `SystemCard` ignora a prop e sairia idêntico.

## Riscos pro próximo sync

- **`ds-entry.tsx` e `componentSrcMap` são duas listas da mesma coisa.**
  Componente novo em `src/components/ui` NÃO entra sozinho — precisa das duas.
- **`MicrosoftAccountCard` busca o avatar em `crafatar.com` durante a captura.**
  Sem rede o card renderiza sem a imagem (o resto fica igual) — não é regressão.
- **O `safelist` é uma lista escrita à mão.** Token novo em `tailwind.config.js`
  não entra sozinho: some da folha do DS embora exista no app.
- **`playwright@1.58.0` está fixado em `.ds-sync/`** porque é a versão que casa
  com o `chromium-1208` já em cache nesta máquina. Noutra máquina, confira
  `browsers.json` antes de instalar.
- **Só `provider: TooltipProvider`.** Se algum componente novo precisar de outro
  provider, aninhe por `inner` no `cfg.provider`.
- **Ícones não estão no bundle.** O app usa `lucide-react`; as previews que
  precisavam de ícone usam SVG inline. Se um dia valer a pena, `extraEntries:
  ["lucide-react"]` resolve — ao custo de engordar bastante o bundle.

## Known render warns

Nenhum. O último `package-validate.mjs` saiu limpo, 30/30 renderizando, zero
aviso. (O `[RENDER_THIN]` que o `Hint` tinha sumiu quando a célula
`BarraDeIcones` virou um cabeçalho de canal composto, com texto.)
