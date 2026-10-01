# Bocas UI — 24 ícones vetoriais

Este conjunto substitui a proposta 3D para os usos de interface. As artes PNG anteriores continuam sendo ilustrações, não ícones de botões ou contadores.

## Arquivos

- `src/lib/bocas-icons.tsx`: componentes React, com ref e propriedades SVG.
- `public/icons/bocas-ui/`: 48 SVGs independentes (24 regulares + 24 compactos).
- `scripts/generate-bocas-icons.mjs`: fonte única da geometria; gera componentes, SVGs, catálogo e inventário.
- `docs/bocas-ui-icons-preview.html`: catálogo nos tamanhos reais, com fundos claro/escuro e cores alternáveis.
- `docs/bocas-ui-icons-sheet.png`: prancha renderizada diretamente dos SVGs para revisão visual.
- `docs/bocas-ui-icons-inventory.md`: referências locais candidatas por símbolo, incluindo mapas de componentes.
- `docs/claude-bocas-icons-prompt.md`: instruções de integração.

## Uso

```tsx
import { MurchosIcon, TrophyIcon, GiftIcon } from '@/lib/bocas-icons'

<MurchosIcon className="h-3 w-3 text-burn" />
<TrophyIcon className="h-5 w-5" variant="regular" />
<GiftIcon className="h-3.5 w-3.5" />
```

Compacto é o padrão e deve ser mantido em 10–16 px. Regular pode ser usado a partir de 20 px; acrescenta apenas detalhes quando há espaço. Os ícones têm tamanho padrão de 16 px, mas classes existentes de largura/altura prevalecem. O traço padrão é 2 em um viewBox de 24. Não usar `absoluteStrokeWidth`: a espessura deve diminuir proporcionalmente ao tamanho, como o restante da UI.

Toda cor vem de `currentColor`. Reutilizar as classes/tokens de cada contexto, inclusive raridade, estado ativo e contraste. Não aplicar cores fixas da logo; a identidade está no desenho. Não há gradiente, sombra, filtro, animação, fundo, texto embutido ou IDs SVG.

Os componentes são decorativos (`aria-hidden`) por padrão. Com `aria-label` ou `aria-labelledby`, passam a ter papel de imagem acessível. Em botão sem texto, preferir nome acessível no próprio botão e ícone decorativo. Preservar tooltips e rótulos existentes.

Para herdar cor de texto, usar os componentes inline. Um SVG carregado por `<img>` não herda `currentColor` da página; os SVGs avulsos servem como fontes portáveis, não como substituição recomendada dos componentes React.

## Conjunto

Moeda, troféu, presente, XP, streak, loja, missão, medalha, coroa, aposta, leilão, chat, jogos, voz, música, soundboard, impressora 3D, servidor, badge genérica, carteira, gorjeta, quiz, perfil e TV.

A boca murcha é a assinatura onde cabe. XP, missão, dado e outras silhuetas pequenas mantêm poucos traços para preservar leitura. Não tentar colocar a logo inteira em todos os símbolos.

## Limites semânticos

Trocar moedas que representam murchos em saldo, recompensas, preços, ofertas, gorjetas e apostas. `HandCoins` em custos financeiros reais não é murchos. A coroa de uma partida de xadrez pode ser uma peça, não uma posição de líder. `Zap` pode representar um poder, não XP. Microfone/volume são controles funcionais; não trocá-los por headset. `PrinterIcon` representa impressão 3D.

Preservar os desenhos individuais de `cosmetic-glyphs.tsx`; todos os badges não devem virar a mesma badge. Aplicar o novo BadgeIcon somente ao aviso genérico e, se apropriado, ao fallback. Importar com alias `BocasBadgeIcon` onde houver conflito com o componente existente `BadgeIcon`.

Não substituir controles universais (fechar, voltar, busca, loaders, chevrons, configurações), marcas de jogos/serviços ou ícones com significado diferente só porque compartilham o mesmo import Lucide. Não mudar IDs persistidos, nomes de cargo/canal ou contratos de API. Mapas que hoje exigem `LucideIcon` podem precisar de um tipo estrutural compartilhado; resolver sem `any` e sem casts forçados.

## Validação

Checagem TypeScript web e verificador de tokens passaram após gerar o conjunto. A prancha dos 24 ícones foi renderizada diretamente dos SVGs e inspecionada visualmente em 12, 16, 20, 24 e 40 px. Nenhuma tela foi migrada. O catálogo HTML foi criado, mas a inspeção no navegador integrado não pôde ser concluída porque ele bloqueia URLs `file:`. Revisar visualmente as telas reais durante a integração, especialmente os usos de 10–12 px.
