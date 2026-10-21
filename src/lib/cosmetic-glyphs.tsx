import type { ReactNode, SVGProps } from 'react'

/**
 * ARTE DOS ÍCONES DOS COSMÉTICOS — só o traço; o mapa id→ícone e os chips
 * moram em `cosmetic-icons.tsx`.
 *
 * Cada ícone aqui é apenas a lista de formas. O `<svg>` que embrulha todas
 * elas é o `Glyph` no fim do arquivo, e isso é de propósito: quando cada
 * ícone trazia o seu próprio `<svg>`, bastava um `stroke-width` diferente em
 * um deles pra fileira de badges sair visivelmente remendada.
 *
 * REGRAS DA ARTE (valem pra qualquer ícone novo aqui):
 *
 *  - desenho dentro de uma área segura de 20x20 no viewBox de 24 — o Windows
 *    e o chip da badge cortam quem encosta na borda;
 *  - traço e nada mais: sem cor literal, sem gradiente, sem filtro, sem `id`
 *    (dois `id` iguais em telas diferentes brigam no mesmo documento);
 *  - a cor NUNCA vem do ícone, vem de fora por `currentColor` — é a raridade
 *    do cosmético que manda (`RARITY_COLOR`);
 *  - tem que ler a 14px, que é o tamanho real na tela: badge é um chip de 24
 *    com ícone de 14 dentro. Prêmio do recap sai a 16.
 *
 * A prova visual — todos os ícones nos quatro tamanhos e nas quatro cores de
 * raridade sobre o fundo do app — está em `docs/icones-preview.html`. É lá que
 * se aprova ícone novo, não no editor com zoom de 400%.
 */

// ============================================
// BADGES (ids de lib/gamification/rules.ts na API)
// ============================================

export const BADGE_GLYPH: Record<string, ReactNode> = {
  // gota cortada
  'primeiro-sangue': <path d="M12 3.5 5.5 12C1 22 22 24 18.5 12L16 9.5l-3 1 1-4Z" />,
  // caveira coroada
  pentakill: <path d="M4 10V5l4 2 2-3.5 2 3 2-3 2 3.5 4-2v5M4 10h16v6l-4 2v2H8v-2l-4-2Z M8 13h1M15 13h1" />,
  // chama arcade
  'streak-7': <path d="M12 3.5v6l4-3 4 7v4l-4 3H8l-4-3v-5l4-5v5Z" />,
  // calendário murcho
  'streak-30': <path d="M4.5 6.5h15v14h-15ZM8.5 3.5v3M15.5 3.5v3M5 10.5h14M8 16.5q4-3 8 0" />,
  // microfone com a marquinha do mês
  'streak-call-30': <path d="M9.5 3.5h5v9h-5ZM6.5 10.5q0 5.5 5.5 5.5t5.5-5.5M12 16v4.5M8.5 20.5h7M17.5 3.5h3M17.5 6.5h3" />,
  // microfone coroado
  'streak-call-180': <path d="M6.5 7.5V3.5l2.5 2 3-2.5 3 2.5 2.5-2v4ZM9.5 9.5h5v5h-5ZM7 12.5q0 4.5 5 4.5t5-4.5M12 17v3.5M8.5 20.5h7" />,
  // coruja sonolenta
  coruja: <path d="M4 3.5 8 6h8l4-2.5V15l-4 5H8l-4-5ZM7.5 10.5h2M14.5 10.5h2M10.5 15l1.5 1.5 1.5-1.5" />,
  // vinil e agulha
  dj: (
    <>
      <circle cx="10" cy="12" r="6.5" />
      <circle cx="10" cy="12" r="2" />
      <path d="M20 3.5v10l-3 3" />
    </>
  ),
  // buzina
  cutucador: (
    <>
      <path d="M3.5 7.5h5l9-4v11l-9-4h-5ZM7 11v4" />
      <path d="M7 15c-5 0-5 5.5 0 5.5s5-5.5 0-5.5Z" />
    </>
  ),
  // balão berrando
  'tagarela-1000': <path d="M4 4.5h16v12H10l-6 4ZM8 8.5h8v4H8Z" />,
  // tênis conectado
  maratonista: <path d="M4 10.5h5l3 4 7 1 1 5H4ZM7 7.5V5h8M15 3.5v3" />,
  // headset coroado
  'mil-horas': <path d="M5 14v-3l3-3.5h8l3 3.5v3M3.5 14h4v6h-4ZM16.5 14h4v6h-4ZM9 7.5v-4l3 2 3-2v4" />,
  // estrela cheia
  'cem-mil-xp': <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z" />,
  // coroa
  'meio-milhao-xp': <path d="M4 17.5 3.5 7l5 4 3.5-6.5 3.5 6.5 5-4-.5 10.5ZM4 20.5h16" />,
  // dado diagonal
  apostador: (
    <>
      <path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
    </>
  ),
  // ferradura brilhante
  sortudo: <path d="M4 4.5v9a8 7 0 0 0 16 0v-9h-4v9a4 3 0 0 1-8 0v-9ZM12 4.5v4M10 6.5h4" />,
  // carteira rasgada
  falido: <path d="M4 8.5 17 3.5v5M4 8.5h16v12l-4-3-4 3-4-3-4 3ZM16 12.5h4" />,
  // coroa sobre a taça: o primeiro do Prêmio do Ano
  'bocas-do-ano': <path d="M7 3.5 8.5 6 12 3.5 15.5 6 17 3.5v4H7ZM6 9.5h12v2a6 6 0 0 1-12 0ZM12 17.5v3M8.5 20.5h7" />,
  // flor caída: o Murcho do Ano (feeder e falido no recap)
  'murcho-do-ano': (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M11.5 10.5 19 18M15 14l-1.5 3.5M19 18l1.5 2.5" />
    </>
  ),
  // cinco cabeças
  fivestack: (
    <>
      <circle cx="5.5" cy="7" r="2" />
      <circle cx="12" cy="7" r="2" />
      <circle cx="18.5" cy="7" r="2" />
      <circle cx="8.5" cy="16" r="2" />
      <circle cx="15.5" cy="16" r="2" />
    </>
  ),
  // peão em movimento
  'chess-primeiro-lance': (
    <>
      <circle cx="9" cy="6" r="2.5" />
      <path d="M7 11.5 4 20.5h10l-3-9M16 11.5h4M17.5 9l2.5 2.5-2.5 2.5" />
    </>
  ),
  // rei tombado
  'chess-xeque-mate': <path d="M4 9v7M3.5 12.5h5M8.5 8.5v8h4l5 3v-14l-5 3ZM20.5 5.5v14" />,
  // medalha estelar
  'mvp-da-semana': <path d="M7 15.5 5 20.5l7-2 7 2-2-5M12 3.5l2.5 4 4.5 1-3 3.5.5 4.5-4.5-2-4.5 2 .5-4.5-3-3.5 4.5-1Z" />,
  // prato murcho
  'feeder-da-semana': (
    <>
      <circle cx="14" cy="12" r="6.5" />
      <path d="M11.5 13.5q2.5-3 5 0M3.5 4.5v16M3.5 9.5h2v-5" />
    </>
  ),
  // lábios brilhantes
  'boca-de-ouro': <path d="M3.5 13.5 8 8.5l4 2 4-2 4.5 5-4.5 6H8ZM4 13.5h16M18 3.5v2M17 4.5h2" />,
  // caixa coroada
  'dj-da-semana': (
    <>
      <path d="M5 8.5 3.5 3.5 9 6l3-2.5L15 6l5.5-2.5L19 8.5ZM5 8.5h14v12H5Z" />
      <circle cx="12" cy="14.5" r="3" />
    </>
  ),
  // martelo de impacto
  'cutucador-da-semana': <path d="M5 4.5h14v6H5ZM10 10.5v10h4v-10M3.5 15.5l2 2M20.5 15.5l-2 2" />,

  // ---- impressora 3D (modules/print-extras.ts na API) ----
  // bico soltando a primeira camada
  'primeira-peca': <path d="M8.5 3.5h7v4l-2 3h-3l-2-3ZM12 10.5v3M5 16.5h14M3.5 20.5h17" />,
  // chave cruzada com o bico
  maker: <path d="M4 20 11 13M9.5 11.5a4 4 0 1 1 3 3M14 4.5l5.5 5.5M16.5 3.5l4 4-2 2-4-4Z" />,
  // chaminé de fábrica
  fabrica: <path d="M3.5 20.5v-9l5 3v-3l5 3v-3l5 3V3.5h2v17ZM7 17.5h2M11 17.5h2M15 17.5h2" />,
  // ampulheta
  'cem-horas': <path d="M6.5 3.5h11M6.5 20.5h11M7.5 3.5c0 5 9 5 9 8.5s-9 3.5-9 8.5M16.5 3.5c0 5-9 5-9 8.5s9 3.5 9 8.5" />,
  // carretel de filamento
  'quilo-de-plastico': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 3.5v6M19 16.5l-4.5-3" />
    </>
  ),
  // espátula raspando a mesa
  'faxina-de-mesa': <path d="M3.5 18.5h17M6 18.5l8-10 3.5 3-8 7M14 8.5l3-4 3.5 3-3 4" />,
  // caixa com a peça
  encomendeiro: <path d="M3.5 8 12 3.5 20.5 8v8.5L12 20.5 3.5 16.5ZM3.5 8 12 12.5 20.5 8M12 12.5v8" />,

  // ---- escadas novas (out/2026, nível Murcho Supremo) ----
  // Cada família tem UMA arte, repetida em todos os degraus (ver
  // LADDER_FAMILIES abaixo): o que separa "Mil" de "Meio Milhão" é a cor da
  // raridade e o nome, como no resto do app. Aqui ficam só as famílias que
  // ainda não tinham desenho nenhum.

  // nota dupla — músicas postas no "Tocando"
  'pede-uma-ai': (
    <>
      <path d="M9 17V5.5l10-2V15" />
      <circle cx="6.5" cy="17" r="2.5" />
      <circle cx="16.5" cy="15" r="2.5" />
    </>
  ),
  // claquete — clipes da call
  cineasta: <path d="M3.5 9.5h17v11h-17ZM3.5 9.5 5 4l15.5-.5-1 5.5M8.5 4.5l1.5 4.5M14 4l1.5 5" />,
  // nuvem de fumaça subindo
  fumaceiro: <path d="M6.5 20.5h10a3.5 3.5 0 0 0 0-7 4.5 4.5 0 0 0-8.5-1A4 4 0 0 0 6.5 20.5ZM11 8.5q-2-2.5 0-5M15 9q2-2 0-4.5" />,
  // relógio com o tique de "apareci"
  pontual: (
    <>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 9v4l2.5 2M9.5 3.5h5" />
    </>
  ),
  // moeda com brilho — gorjeta
  'mao-aberta': (
    <>
      <circle cx="11" cy="13" r="7.5" />
      <path d="M11 9.5v7M9 11h3.5a1.5 1.5 0 0 1 0 3H9M18.5 3.5v3M17 5h3" />
    </>
  ),
  // duas cartas abertas — mãos do pôquer
  'poker-quadra': <path d="M4 7.5 10 5l3.5 12-6 2.5ZM13 4.5h6.5v13H13M7.5 11.5l1 3M16 9v4" />,
  // pilha de fichas — potes do pôquer
  'poker-tubarao': (
    <>
      <ellipse cx="12" cy="6.5" rx="7.5" ry="3" />
      <path d="M4.5 6.5v5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-5M4.5 11.5v5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-5" />
    </>
  ),
  // sacola de compras — lojinha
  'primeira-compra': <path d="M5 8.5h14l-1 12H6ZM9 8.5V7a3 3 0 0 1 6 0v1.5M9.5 13h5" />,
  // sacola coroada — Kit Supremo e "Eu quero, eu posso!"
  'kit-supremo': <path d="M5 10.5h14l-1 10H6ZM9 10.5V9a3 3 0 0 1 6 0v1.5M7.5 6.5 6.5 3l3 1.5L12 2.5l2.5 2 3-1.5-1 3.5" />,
  // servidor em rack — vaquinha da hospedagem
  'paga-boleto': <path d="M4.5 4.5h15v6h-15ZM4.5 13.5h15v6h-15ZM8 7.5h1M8 16.5h1M13 7.5h3M13 16.5h3" />,
  // três cartas em leque com um ouro no meio — truco
  'truco-doze': (
    <path d="M9.5 4h5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM8.5 7.2 5.3 8.1a1 1 0 0 0-.7 1.2l2.4 8.8a1 1 0 0 0 1.2.7M15.5 7.2l3.2.9a1 1 0 0 1 .7 1.2l-2.4 8.8a1 1 0 0 1-1.2.7M12 8.5l1.5 2.5-1.5 2.5-1.5-2.5Z" />
  ),
  // a mão aberta em escada — cacheta
  'cacheta-dez': (
    <path d="M12 6h7a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM11 5H9a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h2M8 4H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h2M15.5 13h.01" />
  ),
}

/**
 * Degraus das escadas (API: lib/gamification/ladders.ts) -> badge cuja arte
 * eles repetem. Badge que já tinha desenho próprio (`maratonista`, `dj`…)
 * continua com o dela; só quem está aqui herda.
 */
const LADDER_FAMILIES: Record<string, readonly string[]> = {
  'cem-mil-xp': ['mil-xp', 'dez-mil-xp', 'meio-caminho-xp'],
  'mil-horas': ['semana-em-call', 'mes-em-call', 'meio-ano-em-call'],
  'streak-7': ['streak-3'],
  'streak-call-180': ['streak-call-365'],
  'tagarela-1000': ['puxa-papo', 'falante', 'matraca'],
  'boca-de-ouro': ['boca-que-nao-murcha'],
  dj: ['botao-facil', 'sonoplasta', 'efeito-especial', 'lenda-do-soundboard'],
  'pede-uma-ai': ['dono-do-aux', 'radio-murcha', 'curador', 'dj-residente'],
  cutucador: ['cutucada-de-leve', 'dedo-nervoso'],
  cineasta: ['primeiro-clipe', 'diretor', 'clipe-da-semana', 'recap-clipe-5', 'recap-clipe-15'],
  fumaceiro: ['alguem'],
  'mao-aberta': [
    'gentileza',
    'generoso',
    'patrocinado',
    'valeu-a-pena',
    'caiu-no-gosto',
    'mecenas-da-semana',
    'recap-mecenas-5',
    'recap-mecenas-15'
  ],
  sortudo: ['palpite-certo', 'vidente', 'banca-quebrada', 'apostador-nato'],
  'poker-quadra': [
    'poker-carta-alta',
    'poker-um-par',
    'poker-dois-pares',
    'poker-trinca',
    'poker-sequencia',
    'poker-flush',
    'poker-full-house',
    'poker-straight-flush',
    'poker-royal',
    'poker-primeira-mesa',
    'poker-sete-dois',
    'poker-all-in'
  ],
  'poker-tubarao': ['poker-primeiro-pote', 'poker-mao-quente', 'poker-pote-gordo'],
  'truco-doze': ['truco-primeira', 'truco-vitoria', 'truco-ferro', 'truco-virada', 'truco-capote'],
  'cacheta-dez': ['cacheta-primeira', 'cacheta-campeao', 'cacheta-de-mao', 'cacheta-invicto'],
  'cem-horas': ['dez-horas', 'cinquenta-horas'],
  'quilo-de-plastico': ['carretel-aberto', 'tres-quilos'],
  'faxina-de-mesa': ['mao-amiga', 'zelador-da-mesa'],
  encomendeiro: ['primeira-encomenda', 'empreiteiro'],
  'primeira-compra': ['fregues', 'cliente-vip'],
  'kit-supremo': ['eu-quero-eu-posso'],
  'paga-boleto': ['sustenta-o-role', 'dono-do-servidor']
}

for (const [from, ids] of Object.entries(LADDER_FAMILIES)) {
  for (const id of ids) BADGE_GLYPH[id] ??= BADGE_GLYPH[from]
}

// ============================================
// PRÊMIOS DO RECAP (keys de modules/recap.ts na API)
// ============================================

/**
 * Metade dos prêmios é a versão semanal de uma badge que já existe, então
 * reaproveita a MESMA arte: "Boca de Ouro" tem que ter a mesma cara no perfil
 * e no recap de domingo, senão parecem duas conquistas diferentes.
 */
export const AWARD_GLYPH: Record<string, ReactNode> = {
  // lábios brilhantes
  mais_falou: <path d="M3.5 13.5 8 8.5l4 2 4-2 4.5 5-4.5 6H8ZM4 13.5h16M18 3.5v2M17 4.5h2" />,
  // headset real
  mais_call: <path d="M4 14v-1a8 4 0 0 1 16 0v1M4 14h3v6H4ZM17 14h3v6h-3ZM8 7l-1-3.5 5 2 5-2L16 7Z" />,
  // medalha estelar
  mvp_lol: <path d="M7 15.5 5 20.5l7-2 7 2-2-5M12 3.5l2.5 4 4.5 1-3 3.5.5 4.5-4.5-2-4.5 2 .5-4.5-3-3.5 4.5-1Z" />,
  // prato murcho
  feeder: (
    <>
      <circle cx="14" cy="12" r="6.5" />
      <path d="M11.5 13.5q2.5-3 5 0M3.5 4.5v16M3.5 9.5h2v-5" />
    </>
  ),
  // caixa coroada
  dj: (
    <>
      <path d="M5 8.5 3.5 3.5 9 6l3-2.5L15 6l5.5-2.5L19 8.5ZM5 8.5h14v12H5Z" />
      <circle cx="12" cy="14.5" r="3" />
    </>
  ),
  // martelo de impacto
  cutucador: <path d="M5 4.5h14v6H5ZM10 10.5v10h4v-10M3.5 15.5l2 2M20.5 15.5l-2 2" />,
  // chama arcade
  streak: <path d="M12 3.5v6l4-3 4 7v4l-4 3H8l-4-3v-5l4-5v5Z" />,
  // saco cheio
  rico: <path d="M8 8.5 6 3.5h12l-2 5M8 8.5h8l4 7v3l-3 2H7l-3-2v-3ZM9 13h6M9 16.5h6" />,
  // carteira rasgada
  falido: <path d="M4 8.5 17 3.5v5M4 8.5h16v12l-4-3-4 3-4-3-4 3ZM16 12.5h4" />,
  // coruja sonolenta
  corujao: <path d="M4 3.5 8 6h8l4-2.5V15l-4 5H8l-4-5ZM7.5 10.5h2M14.5 10.5h2M10.5 15l1.5 1.5 1.5-1.5" />,
  // ascensão de xp
  campeao_xp: <path d="M9 15.5v-6H5l7-6 7 6h-4v6M4 20.5h7v-3h9" />,
}

/**
 * Escadas do recap (out/2026): todo prêmio vira badge de 1×, 5× e 15×, com a
 * MESMA arte do prêmio. Ids da API (lib/gamification/ladders.ts): os seis
 * prêmios que não tinham badge ganham `recap-<prêmio>`; os degraus de cima são
 * `recap-<prêmio>-5` e `-15`, com o prêmio em kebab-case.
 */
for (const key of Object.keys(AWARD_GLYPH)) {
  const slug = key.replace(/_/g, '-')
  for (const id of [`recap-${slug}`, `recap-${slug}-5`, `recap-${slug}-15`]) BADGE_GLYPH[id] ??= AWARD_GLYPH[key]
}

// ============================================
// GENÉRICOS (id desconhecido)
// ============================================

/**
 * Badge nova criada direto no banco, ou launcher antigo que não conhece a
 * badge de hoje: aparece com cara de badge, não com um buraco na fileira.
 */
/** Selo recortado */
export const GENERIC_BADGE: ReactNode = <path d="M8 3.5h8l4.5 4.5v8l-4.5 4.5-4-3-4 3L3.5 16V8Z" />

/**
 * Ovo rachado — toda badge `ovo-*` (os easter-eggs, ver
 * components/easter-eggs). Um glifo só pra todos: o ovo é o segredo, e o
 * nome dele já conta o que foi achado.
 */
export const EGG_GLYPH: ReactNode = <path d="M12 3.5c-3.8 0-7 6.3-7 10.3a7 7 0 0 0 14 0c0-4-3.2-10.3-7-10.3ZM7.5 12.5l2.2 1.8 2.3-2.3 2.3 2.3 2.2-1.8" />

// Escada de caçador (ovos achados): a mesma casca rachada, sem o segredo.
for (const id of ['farejador', 'cacador-de-ovos', 'arqueologo', 'quebra-cabeca']) BADGE_GLYPH[id] ??= EGG_GLYPH

/** Taça */
export const GENERIC_AWARD: ReactNode = <path d="M7 3.5h10v8a5 5 0 0 1-10 0ZM7 6.5H3.5v5L7 13M17 6.5h3.5v5L17 13M12 16.5v4M8 20.5h8" />

// ============================================
// O <SVG> COMPARTILHADO
// ============================================

/**
 * O único `<svg>` do conjunto. `art` é a entrada de um dos mapas acima.
 *
 * `width`/`height` em `1em` e não em pixel: quem chama passa o tamanho por
 * classe (`h-3.5 w-3.5`), e CSS ganha de atributo de apresentação — então o
 * mesmo ícone serve pro chip de 14, pro prêmio de 16 e pra etiqueta de 10.
 */
export function Glyph({
  art,
  strokeWidth = 2,
  ...props
}: { art: ReactNode; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {art}
    </svg>
  )
}

// Pentakill em dobro (2+ na mesma partida): a mesma caveira coroada.
BADGE_GLYPH['pentakill-duplo'] ??= BADGE_GLYPH.pentakill
