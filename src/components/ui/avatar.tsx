import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cn } from '@/lib/utils'
import { cosmeticKey } from '@/lib/api-gamification'
import '@/styles/effects.css'

export const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      'relative flex h-10 w-10 shrink-0 overflow-hidden rounded-brutal border border-line',
      className
    )}
    {...props}
  />
))
Avatar.displayName = 'Avatar'

export const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn('aspect-square h-full w-full object-cover', className)}
    {...props}
  />
))
AvatarImage.displayName = 'AvatarImage'

export const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      'flex h-full w-full items-center justify-center bg-void-light font-display text-sm uppercase text-acid',
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = 'AvatarFallback'

const STATUS_STYLES: Record<string, string> = {
  online: 'bg-acid shadow-neon-2',
  away: 'bg-burn',
  dnd: 'bg-destructive',
  offline: 'bg-surface-strong'
}

/**
 * Molduras compradas na lojinha (ids `frame:*`). As classes estão em
 * styles/effects.css. Moldura ganha da cor do perfil na borda: quem pagou por
 * ela quer que apareça.
 */
const FRAME_STYLES: Record<string, string> = {
  // raras (azul)
  pixel: 'frame-pixel',
  ice: 'frame-ice',
  steel: 'frame-steel',
  dashed: 'frame-dashed',
  wave: 'frame-wave',
  // épicas (roxo)
  arcane: 'frame-arcane',
  amethyst: 'frame-amethyst',
  'violet-neon': 'frame-violet-neon',
  // lendária (fogo, a única animada)
  fire: 'frame-fire'
}

export const AVATAR_FRAME_KEYS = Object.keys(FRAME_STYLES)

/**
 * A moldura fora do avatar.
 *
 * As classes `frame-*` só mexem em borda e sombra, então servem pra qualquer
 * caixa — e é o que faz a moldura comprada aparecer TAMBÉM em volta da webcam
 * na call, não só no quadradinho do avatar. Sem isso, quem pagou por uma
 * moldura perdia ela justamente na hora em que todo mundo está olhando.
 *
 * A lendária (`fire`) tem um extra: uma coroa em cima da borda, que é um
 * irmão posicionado (`frame-fire-ring`, ver styles/effects.css). Quem usa isto
 * precisa saber se tem que desenhar esse irmão — daí as duas funções.
 */
export function frameClass(frame: string | null | undefined): string | undefined {
  const key = cosmeticKey(frame)
  return key ? FRAME_STYLES[key] : undefined
}

export function frameNeedsRing(frame: string | null | undefined): boolean {
  return cosmeticKey(frame) === 'fire'
}

/** Avatar com bolinha de status no canto, igual Discord. */
export function UserAvatar({
  src,
  name,
  status,
  className,
  ringColor,
  speaking,
  frame,
  style
}: {
  src?: string
  name: string
  status?: string
  className?: string
  ringColor?: string | null
  speaking?: boolean
  /** Id do cosmético de moldura (`frame:gold`) ou só a chave (`gold`). */
  frame?: string | null
  /**
   * Estilo extra no avatar. Existe pro tamanho vindo de MEDIÇÃO, e não de
   * classe: na call o avatar acompanha o tamanho do card, que é calculado em
   * pixels em tempo de execução (ver components/social/CallStage.tsx).
   */
  style?: React.CSSProperties
}) {
  const frameStyle = frameClass(frame)

  return (
    <div className="relative shrink-0">
      {/* Coroa da moldura lendária, por cima da borda (z-index no CSS). */}
      {frameNeedsRing(frame) && <span aria-hidden className="frame-fire-ring" />}

      <Avatar
        className={cn(className, frameStyle, speaking && 'ring-2 ring-acid')}
        style={{
          ...(ringColor && !speaking && !frameStyle ? { borderColor: ringColor } : {}),
          ...style
        }}
      >
        {src && <AvatarImage src={src} alt="" />}
        <AvatarFallback>{name.slice(0, 2)}</AvatarFallback>
      </Avatar>

      {status && (
        <span
          aria-label={status}
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-void',
            STATUS_STYLES[status] ?? STATUS_STYLES.offline
          )}
        />
      )}
    </div>
  )
}
