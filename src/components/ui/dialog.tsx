import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-dialogo bg-black/80 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = 'DialogOverlay'

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    hideClose?: boolean
  }
>(({ className, children, hideClose, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'card-gradient fixed left-1/2 top-1/2 z-dialogo flex max-h-[86dvh] w-full max-w-lg',
        '-translate-x-1/2 -translate-y-1/2 flex-col rounded-brutal p-6',
        /* NO CELULAR, DIÁLOGO É FOLHA DE BAIXO.
           Centralizado, ele sobrava pelos lados (uma caixa de 512px numa tela
           de 360) e, pior, o rodapé com Salvar/Cancelar caía fora da área
           visível. Colado embaixo ele cabe, fica na altura do polegar e soma a
           safe area — `max-sm` é o mesmo 640px do PHONE_AT em layout-context. */
        'max-sm:inset-x-0 max-sm:bottom-0 max-sm:left-0 max-sm:top-auto',
        'max-sm:max-h-[88dvh] max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0',
        'max-sm:rounded-b-none max-sm:p-4 max-sm:pb-[calc(1rem+env(safe-area-inset-bottom,0px))]',
        'border-2 border-acid-dark shadow-[0_0_40px_rgb(var(--neon-rgb)/0.12)]',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
        'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
        className
      )}
      {...props}
    >
      {children}

      {!hideClose && (
        <DialogPrimitive.Close
          className={cn(
            'absolute right-3 top-3 rounded-brutal p-1.5 text-muted-foreground',
            'transition-colors hover:bg-muted hover:text-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring'
          )}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Fechar</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
DialogContent.displayName = 'DialogContent'

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 flex flex-col gap-1 pr-8', className)} {...props} />
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mt-5 flex shrink-0 justify-end gap-2 border-t border-line pt-4', className)}
      {...props}
    />
  )
}

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('title-brutal text-xl', className)}
    {...props}
  />
))
DialogTitle.displayName = 'DialogTitle'

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('font-mono text-xs uppercase tracking-widest text-muted-foreground', className)}
    {...props}
  />
))
DialogDescription.displayName = 'DialogDescription'
