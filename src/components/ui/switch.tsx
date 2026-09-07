import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full',
      'border-2 border-line transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:border-acid data-[state=checked]:bg-acid/20',
      'data-[state=unchecked]:bg-void-light',
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block h-3 w-3 rounded-full bg-muted-foreground shadow-lg transition-transform',
        'data-[state=checked]:translate-x-4 data-[state=checked]:bg-acid',
        'data-[state=checked]:shadow-neon-2',
        'data-[state=unchecked]:translate-x-0.5'
      )}
    />
  </SwitchPrimitive.Root>
))
Switch.displayName = 'Switch'

/** Linha de config: rótulo + descrição à esquerda, switch à direita. */
export function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled
}: {
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center justify-between gap-4 py-2',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {hint && (
          <span className="block text-xs leading-snug text-muted-foreground">{hint}</span>
        )}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </label>
  )
}
