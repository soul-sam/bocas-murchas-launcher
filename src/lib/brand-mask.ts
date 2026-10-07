import type * as React from 'react'

/**
 * A boca da marca como MÁSCARA de CSS (feltro e verso da carta no pôquer,
 * medalhão e parede do xadrez). Inline, e não numa folha: `url()` de
 * arquivo do public/ dentro de um .css o Vite reescreve pra /assets/ sem
 * copiar o arquivo — a máscara falha e o elemento some. Caminho relativo,
 * como todo `<img src="bocas-murchas-transp.png">` do app: vale no site e no
 * file:// do Electron.
 */
export const BRAND_MASK_STYLE: React.CSSProperties = {
  WebkitMaskImage: 'url(bocas-murchas-transp.png)',
  maskImage: 'url(bocas-murchas-transp.png)'
}
