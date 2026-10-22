import * as React from 'react'
import { Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CropRect } from '@/lib/api'

/**
 * ESCOLHER O PEDAÇO DA IMAGEM — o recorte da capa, do jeito do Discord.
 *
 * A moldura fica PARADA no meio e a imagem anda por baixo dela: arrasta pra
 * posicionar, roda/régua pra aproximar. O que fica dentro da moldura é o que
 * vira capa. GIF continua animando aqui dentro, então dá pra escolher o
 * pedaço onde a coisa acontece.
 *
 * Este componente só ESCOLHE: devolve o pedaço em frações da imagem original
 * (`CropRect`), e quem recorta de verdade é o servidor — inclusive GIF, que
 * no navegador exigiria recodificar quadro a quadro (ver lib/crop-image.ts
 * na API).
 *
 * A imagem nunca deixa buraco dentro da moldura: o zoom mínimo é o que
 * cobre a moldura inteira, e o arrasto para na borda.
 */

const MAX_ZOOM = 4
/** Respiro em volta da moldura, pra ver o que fica de fora (escurecido). */
const PAD = 28

interface Props {
  /** URL que o <img> consegue mostrar: blob: do arquivo escolhido ou o link do GIF. */
  src: string
  /** Largura ÷ altura da moldura. */
  aspect: number
  working?: boolean
  onCancel: () => void
  onConfirm: (crop: CropRect) => void
}

export function ImageCropper({ src, aspect, working, onCancel, onConfirm }: Props) {
  const boxRef = React.useRef<HTMLDivElement | null>(null)
  const [boxWidth, setBoxWidth] = React.useState(0)
  const [natural, setNatural] = React.useState<{ w: number; h: number } | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [zoom, setZoom] = React.useState(1)
  /** Canto de cima-esquerda da imagem em relação ao da moldura (≤ 0). */
  const [offset, setOffset] = React.useState({ x: 0, y: 0 })

  React.useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setBoxWidth(el.clientWidth))
    observer.observe(el)
    setBoxWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  const frameW = Math.max(0, boxWidth - PAD * 2)
  const frameH = frameW / aspect

  /** Escala em que a imagem cobre a moldura exatamente (zoom 1). */
  const cover = natural ? Math.max(frameW / natural.w, frameH / natural.h) : 1
  const scale = cover * zoom
  const drawW = natural ? natural.w * scale : 0
  const drawH = natural ? natural.h * scale : 0

  const clamp = React.useCallback(
    (x: number, y: number, w = drawW, h = drawH) => ({
      x: Math.min(0, Math.max(frameW - w, x)),
      y: Math.min(0, Math.max(frameH - h, y))
    }),
    [drawW, drawH, frameW, frameH]
  )

  // Imagem nova (ou moldura que mudou de tamanho): começa centralizada.
  const centeredFor = React.useRef('')
  React.useEffect(() => {
    if (!natural || frameW <= 0) return
    const key = `${src}|${frameW}`
    if (centeredFor.current === key) return
    centeredFor.current = key
    setZoom(1)
    const w = natural.w * cover
    const h = natural.h * cover
    setOffset({ x: (frameW - w) / 2, y: (frameH - h) / 2 })
  }, [natural, frameW, frameH, cover, src])

  /**
   * Aproximar mantendo o CENTRO da moldura no mesmo ponto da imagem — senão
   * o zoom puxa tudo pro canto e a pessoa perde o que estava enquadrando.
   */
  const applyZoom = (next: number): void => {
    if (!natural) return
    const z = Math.min(MAX_ZOOM, Math.max(1, next))
    const nextScale = cover * z
    const cx = (frameW / 2 - offset.x) / scale
    const cy = (frameH / 2 - offset.y) / scale
    const w = natural.w * nextScale
    const h = natural.h * nextScale
    setZoom(z)
    setOffset(clamp(frameW / 2 - cx * nextScale, frameH / 2 - cy * nextScale, w, h))
  }

  /**
   * Roda = zoom. Listener nativo, não `onWheel`: o do React é passivo, não
   * pode `preventDefault`, e a roda rolaria o editor inteiro junto.
   */
  const zoomRef = React.useRef(applyZoom)
  zoomRef.current = applyZoom
  const zoomNow = React.useRef(zoom)
  zoomNow.current = zoom
  React.useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      zoomRef.current(zoomNow.current * (event.deltaY < 0 ? 1.1 : 1 / 1.1))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /**
   * Arrasto escutando a JANELA, e não o elemento: pointer capture falha em
   * alguns caminhos (e o mouse rápido sai pela borda) — o `window` pega tudo.
   */
  const startDrag = (event: React.PointerEvent): void => {
    if (event.button !== 0 || !natural) return
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const from = offset
    const move = (e: PointerEvent): void => {
      setOffset(clamp(from.x + e.clientX - startX, from.y + e.clientY - startY))
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const confirm = (): void => {
    if (!natural || drawW <= 0) return
    onConfirm({
      x: -offset.x / drawW,
      y: -offset.y / drawH,
      w: frameW / drawW,
      h: frameH / drawH
    })
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div
        ref={boxRef}
        data-cropper
        onPointerDown={startDrag}
        className="relative w-full touch-none select-none overflow-hidden rounded-brutal border border-line bg-black"
        style={{ height: frameH + PAD * 2, cursor: natural ? 'grab' : 'default' }}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget
            setFailed(false)
            setNatural({ w: img.naturalWidth, h: img.naturalHeight })
          }}
          onError={() => setFailed(true)}
          className="pointer-events-none absolute max-w-none"
          style={
            natural
              ? { left: PAD + offset.x, top: PAD + offset.y, width: drawW, height: drawH }
              : { opacity: 0 }
          }
        />

        {/* A moldura: o que está fora dela fica escurecido pela sombra. */}
        {frameW > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-brutal border-2 border-acid"
            style={{
              left: PAD,
              top: PAD,
              width: frameW,
              height: frameH,
              boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.6)'
            }}
          />
        )}

        {!natural && !failed && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </span>
        )}
        {failed && (
          <span className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Não deu pra abrir essa imagem.
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          disabled={!natural}
          onChange={(e) => applyZoom(Number(e.target.value))}
          aria-label="Aproximar"
          className="h-1 min-w-0 flex-1 accent-[rgb(var(--neon-rgb))]"
        />
        <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>

      <p className="text-xs text-muted-foreground">
        Arraste a imagem pra escolher o pedaço que vira capa. GIF continua animado.
      </p>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={working}>
          Cancelar
        </Button>
        <Button type="button" onClick={confirm} disabled={!natural || working}>
          {working && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Aplicar
        </Button>
      </div>
    </div>
  )
}
