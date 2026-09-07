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
 *    com ícone de 14 dentro. Prêmio do recap sai a 16, título a 10.
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
}

// ============================================
// TÍTULOS (chave dos ids `title:*` da lojinha)
// ============================================

/**
 * O título é desenhado a 10px dentro da etiqueta, e a 10px o que sobra de um
 * ícone é a silhueta — por isso existem duas versões da mesma arte. `TitleIcon`
 * usa a `_SM` (menos formas, traço 2.5); a detalhada fica pronta pro dia em que
 * a etiqueta crescer.
 */
export const TITLE_GLYPH: Record<string, ReactNode> = {
  // espinha de peixe
  feeder: <path d="M4 12h12l4-4v8l-4-4M4 12l4-5v10ZM12 8v8" />,
  // escudo de cura
  suporte: <path d="M4 4.5h16v8l-3 5-5 3-5-3-3-5ZM12 8v7M8.5 11.5h7" />,
  // boca de perfil
  'boca-de-ouro': <path d="M4 4.5h5l5 6-5 2 5 2-5 6H4M18 7.5q5 5 0 10" />,
  // nota quadrada
  dj: <path d="M10 16.5v-13l10 3v5l-10-3M10 16.5H4v4h6Z" />,
  // dedo insistente
  cutucador: <path d="M4 20V9.5a2 2 0 0 1 4 0v4h6l2 3v3.5ZM5 3.5v2M11.5 5.5l2-2" />,
  // lua sonolenta
  coruja: <path d="M15 3.5a8.5 8.5 0 1 0 5.5 14A10 10 0 0 1 15 3.5ZM7 12.5h3" />,
  // coroa murcha
  lenda: <path d="M5 20 3.5 7.5 9 10l3-6.5 3 5 5.5-4-2 15.5ZM8.5 16q3.5-3 7 0" />,
}

export const TITLE_GLYPH_SM: Record<string, ReactNode> = {
  // espinha de peixe
  feeder: <path d="M4 12l4-5v10ZM8 12h8l4-4v8l-4-4" />,
  // escudo de cura
  suporte: (
    <>
      <path d="M4 4.5h16v8l-3 5-5 3-5-3-3-5Z" />
      <path d="M12 8v7m-3.5-3.5h7" />
    </>
  ),
  // boca de perfil
  'boca-de-ouro': (
    <>
      <path d="M4 4.5h5l5 6-5 2 5 2-5 6H4" />
      <path d="M18 7.5q5 5 0 10" />
    </>
  ),
  // nota quadrada
  dj: <path d="M10 16.5v-13l10 3v5l-10-3v8H4v4h6Z" />,
  // dedo insistente
  cutucador: (
    <>
      <path d="M4 20V9.5a2 2 0 0 1 4 0v4h6l2 3v3.5Z" />
      <path d="M6 3.5v2" />
    </>
  ),
  // lua sonolenta
  coruja: (
    <>
      <path d="M15 3.5a8.5 8.5 0 1 0 5.5 14A10 10 0 0 1 15 3.5Z" />
      <path d="M7 12.5h3" />
    </>
  ),
  // coroa murcha
  lenda: (
    <>
      <path d="M5 20 3.5 7.5 9 10l3-6.5 3 5 5.5-4-2 15.5Z" />
      <path d="M8.5 16q3.5-3 7 0" />
    </>
  ),
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

// ============================================
// GENÉRICOS (id desconhecido)
// ============================================

/**
 * Badge nova criada direto no banco, ou launcher antigo que não conhece a
 * badge de hoje: aparece com cara de badge, não com um buraco na fileira.
 */
/** Selo recortado */
export const GENERIC_BADGE: ReactNode = <path d="M8 3.5h8l4.5 4.5v8l-4.5 4.5-4-3-4 3L3.5 16V8Z" />

/** Etiqueta */
export const GENERIC_TITLE: ReactNode = (
  <>
    <path d="M3.5 7.5h12l5 5-5 5h-12Z" />
    <circle cx="7.5" cy="12.5" r="1" />
  </>
)

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
