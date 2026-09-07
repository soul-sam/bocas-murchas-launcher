import * as React from 'react'
import { X, ExternalLink, ZoomIn, ZoomOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { openExternal } from '@/lib/rich-text'
import { useOverlays } from '@/lib/overlay-context'

/**
 * Visualizador de imagem em tela cheia.
 *
 * NAO usa o Dialog do Radix de proposito. O Dialog escreve
 * `pointer-events: none` no <body> enquanto esta aberto e devolve na limpeza —
 * e uma limpeza pulada e exatamente o bug que trava o app inteiro (ver
 * lib/interaction-guard.ts). Uma imagem em tela cheia nao precisa de foco
 * preso nem de nada disso: e uma camada com um `fixed` e um Esc.
 */
export function ImageLightbox() {
  const { lightbox, closeLightbox } = useOverlays()
  const [zoomed, setZoomed] = React.useState(false)

  // Abrir outra imagem tem que comecar do tamanho normal.
  React.useEffect(() => {
    setZoomed(false)
  }, [lightbox])

  if (!lightbox) return null

  return (
    <div
      role="dialog"
      aria-label="Imagem"
      onClick={closeLightbox}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-6 backdrop-blur-sm"
    >
      <img
        src={lightbox}
        alt=""
        // O clique na imagem nao pode fechar: e ai que a pessoa vai clicar pra
        // dar zoom, e fechar sem querer no meio de um print e irritante.
        onClick={(event) => {
          event.stopPropagation()
          setZoomed((prev) => !prev)
        }}
        className={cn(
          'rounded-brutal border-2 border-acid-dark shadow-[0_0_60px_rgba(0,0,0,0.9)] transition-transform',
          zoomed
            ? 'max-h-none max-w-none cursor-zoom-out'
            : 'max-h-full max-w-full cursor-zoom-in object-contain'
        )}
      />

      <div
        onClick={(event) => event.stopPropagation()}
        className="absolute right-4 top-4 flex items-center gap-1 rounded-brutal border-2 border-line bg-void/90 p-1"
      >
        <button
          type="button"
          onClick={() => setZoomed((prev) => !prev)}
          title={zoomed ? 'Diminuir' : 'Tamanho real'}
          className="rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {zoomed ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={() => openExternal(lightbox)}
          title="Abrir no navegador"
          className="rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={closeLightbox}
          title="Fechar (Esc)"
          className="rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
