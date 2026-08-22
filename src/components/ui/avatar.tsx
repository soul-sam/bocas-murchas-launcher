import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cn } from '@/lib/utils'

export const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      'relative flex h-10 w-10 shrink-0 overflow-hidden rounded-brutal border border-[#1a1a1a]',
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
  online: 'bg-acid shadow-[0_0_6px_#6AFF00]',
  away: 'bg-burn',
  dnd: 'bg-destructive',
  offline: 'bg-[#3A3A3A]'
}

/** Avatar com bolinha de status no canto, igual Discord. */
export function UserAvatar({
  src,
  name,
  status,
  className,
  ringColor,
  speaking
}: {
  src?: string
  name: string
  status?: string
  className?: string
  ringColor?: string | null
  speaking?: boolean
}) {
  return (
    <div className="relative shrink-0">
      <Avatar
        className={cn(className, speaking && 'ring-2 ring-acid')}
        style={ringColor && !speaking ? { borderColor: ringColor } : undefined}
      >
        {src && <AvatarImage src={src} alt="" />}
        <AvatarFallback>{name.slice(0, 2)}</AvatarFallback>
      </Avatar>

      {status && (
        <span
          aria-label={status}
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0B0B0B]',
            STATUS_STYLES[status] ?? STATUS_STYLES.offline
          )}
        />
      )}
    </div>
  )
}
