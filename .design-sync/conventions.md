# Bocas Murchas — como construir com este design system

Sistema **dark-first** de um launcher desktop (Electron + React 18 + Tailwind +
Radix). Verde ácido sobre grafite, tipografia condensada nos títulos, mono para
todo dado seco.

## Envolva a árvore em `TooltipProvider`

`Tooltip` e `Hint` lançam erro sem ele (`Tooltip must be used within
TooltipProvider`). Não há provider de tema: os tokens são variáveis CSS no
`:root` de `styles.css`, então basta a folha estar carregada.

```jsx
<TooltipProvider>
  <div className="min-h-screen bg-background text-foreground">…</div>
</TooltipProvider>
```

O `body` já recebe `background-color: hsl(var(--background))`, `color:
hsl(var(--foreground))` e a família Inter da própria folha. Fontes (Inter,
JetBrains Mono, Anton) vêm de um `@import` remoto do Google Fonts no topo de
`styles.css`.

## O idioma: utilitários Tailwind com vocabulário próprio

Não há props de estilo. Tudo é `className` com o preset do DS. As famílias que
o DS acrescenta ao Tailwind padrão:

| Família | Nomes reais |
|---|---|
| Marca | `acid` (`bg-acid`, `text-acid`), `acid-text` (verde de texto corrido, mais suave), `acid-dark`, `slime`, `burn` / `burn-dark` (âmbar) |
| Fundos em profundidade | `background` (1), `depth-2` (coluna/composer), `depth-3` (área de chat), `void` / `void-light` / `void-card` |
| Superfície e traço | `surface`, `surface-raised`, `surface-strong`, `line`, `line-strong`, `card`, `popover`, `muted`, `destructive` |
| Raio | `rounded-brutal` (6px — botão, campo, card, avatar), `rounded-lg/md/sm` derivados de `--radius` |
| Tipografia | `font-display` (Anton, só título/wordmark), `font-mono` (JetBrains — saldo, versão, latência, hex, timer, atalho), `font-sans` (Inter, o resto) |
| Halo neon | `shadow-neon-1` (contorno), `shadow-neon-2` (destaque), `shadow-neon-3` (botão primário) |
| Animação | `animate-glow-pulse`, `animate-shake`, `animate-glitch`, `animate-flicker`, `animate-scan`, `animate-float`, `animate-rainbow` |

Classes de componente prontas em `styles.css` (use-as em vez de recriar):
`.btn-acid` (o preenchimento neon do botão primário), `.card-gradient`,
`.card-acid`, `.input-terminal`, `.title-brutal`, `.terminal-cursor`,
`.brand-wordmark`, `.frame-*` (molduras cosméticas do avatar).

Cinco temas convivem com os MESMOS nomes de token, trocados por
`<html data-theme="…">`. Nunca escreva cor literal: sempre o token.

## Regras que o DS trata como suas

- **Um `<Button>` primário por tela.** `variant`: `default` (neon) · `secondary`
  /`outline` (contorno) · `ghost` (só texto) · `destructive` (contorno vermelho;
  preenchido só no passo de confirmar) · `link`. `size`: `sm` · `default` · `lg`
  · `icon`.
- **Caixa alta espaçada é rótulo, não botão.** `Label` é `text-xs font-bold
  uppercase tracking-widest`; botão diz o verbo em caixa normal.
- **Mono para dado, não para texto.** Número, versão, caminho, atalho.
- **Anton só em título** (`CardTitle`, `DialogTitle`, wordmark).

## Onde está a verdade

- `_ds/<pasta>/styles.css` e o `@import` dele — todos os tokens dos cinco temas,
  a camada base e as classes de componente. Leia antes de estilizar.
- `components/<grupo>/<Nome>/<Nome>.prompt.md` e `.d.ts` — API por componente.
- Ícones: o launcher usa **lucide-react**, que **não** está neste bundle. Importe
  a lib separadamente ou use SVG inline.

## Exemplo idiomático

```jsx
<TooltipProvider>
  <div className="flex flex-col gap-4 bg-depth-3 p-6">
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Servidor Bocas</CardTitle>
        <CardDescription>mc.bocasmurchas.com.br — modpack 1.20.1</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Jogadores online</span>
        <span className="font-mono text-2xl text-acid">4 / 20</span>
      </CardContent>
      <CardFooter className="gap-3">
        <Button>Entrar</Button>
        <Button variant="ghost">Copiar IP</Button>
      </CardFooter>
    </Card>
  </div>
</TooltipProvider>
```
