/**
 * Config do Tailwind usada SO' pelo design-sync (via .design-sync/build-css.mjs).
 *
 * Herda tudo de tailwind.config.js — mesmos tokens, mesmas cores, mesmas
 * fontes — e acrescenta um `safelist`.
 *
 * Por que o safelist existe: a folha que o app serve e' purgada contra
 * ./src/**, entao ela contem so' as utilidades que o launcher JA usa. Isso
 * basta pro app e nao basta pro design system: quem consome o DS no
 * claude.ai/design escreve o proprio layout, e uma classe que o launcher nunca
 * usou (`gap-7`, `grid-cols-7`, `p-9`) simplesmente nao existiria na folha —
 * sem erro, so' sem efeito. As faixas abaixo cobrem a escala inteira das
 * familias de LAYOUT; cor e tipografia continuam vindo dos tokens do DS, que
 * ja' estao todos na folha.
 */

import base from '../tailwind.config.js'

const SPACING = '0|0\\.5|1|1\\.5|2|2\\.5|3|3\\.5|4|5|6|7|8|9|10|11|12|14|16|20|24|28|32|40|48|56|64|px'
const NUM_1_12 = '1|2|3|4|5|6|7|8|9|10|11|12'

export default {
  ...base,
  content: [
    './src/**/*.{js,ts,jsx,tsx,html}',
    './src/index.html',
    // As previews autorais tambem entram: elas usam classes do DS que o app
    // pode nao usar em lugar nenhum.
    './.design-sync/previews/**/*.tsx'
  ],
  safelist: [
    { pattern: new RegExp(`^-?(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml)-(${SPACING})$`) },
    { pattern: new RegExp(`^(gap|gap-x|gap-y|space-x|space-y)-(${SPACING})$`) },
    { pattern: new RegExp(`^(w|h|min-w|min-h|max-w|max-h)-(${SPACING}|full|screen|min|max|fit|auto)$`) },
    { pattern: /^(max-w)-(xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|prose)$/ },
    { pattern: new RegExp(`^(grid-cols|grid-rows|col-span|row-span)-(${NUM_1_12})$`) },
    { pattern: /^(flex|inline-flex|grid|inline-grid|block|inline-block|hidden|contents)$/ },
    { pattern: /^(flex)-(row|row-reverse|col|col-reverse|wrap|nowrap|1|auto|initial|none)$/ },
    { pattern: /^(items|justify|content|self|place-items|place-content)-(start|end|center|between|around|evenly|stretch|baseline)$/ },
    { pattern: /^(text)-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|left|center|right|justify)$/ },
    { pattern: /^(font)-(thin|light|normal|medium|semibold|bold|extrabold|black|sans|mono|display)$/ },
    { pattern: /^(leading|tracking)-(none|tight|snug|normal|relaxed|loose|tighter|wide|wider|widest)$/ },
    { pattern: /^(rounded)(-(sm|md|lg|xl|2xl|3xl|full|none|brutal))?$/ },
    { pattern: /^(border)(-(0|2|4|8))?$/ },
    { pattern: /^(opacity)-(0|5|10|20|25|30|40|50|60|70|75|80|90|95|100)$/ },
    { pattern: /^(overflow|overflow-x|overflow-y)-(auto|hidden|visible|scroll|clip)$/ },
    { pattern: /^(absolute|relative|fixed|sticky|static)$/ },
    { pattern: /^(truncate|shrink-0|grow|min-w-0|whitespace-nowrap|sr-only)$/ },
    // Cores da marca em todos os prefixos que fazem sentido. Sem isto, um
    // `border-acid-dark` que o launcher nunca usou nao existe na folha.
    // NAO cobre o modificador de opacidade (`bg-acid/20`): o Tailwind so' gera
    // esses sob demanda, entao eles existem apenas onde o app ja' os usa.
    {
      pattern: new RegExp(
        '^(bg|text|border|ring|divide|fill|stroke|from|via|to)-(' +
          [
            'acid', 'acid-dark', 'acid-text', 'acid-glow',
            'slime', 'slime-dark', 'slime-light',
            'burn', 'burn-dark',
            'void', 'void-light', 'void-card',
            'depth-2', 'depth-3',
            'surface', 'surface-raised', 'surface-strong',
            'line', 'line-strong',
            'dirty-white', 'dirty-gray',
            'background', 'foreground', 'card', 'card-foreground',
            'popover', 'popover-foreground', 'muted', 'muted-foreground',
            'primary', 'primary-foreground', 'secondary', 'secondary-foreground',
            'accent', 'accent-foreground', 'destructive', 'destructive-foreground',
            'border', 'input', 'ring',
          ].join('|') +
          ')$',
      ),
    },
    { pattern: /^shadow-(neon-1|neon-2|neon-3|glow-acid|glow-burn|sm|md|lg|xl|2xl|none)$/ }
  ]
}
