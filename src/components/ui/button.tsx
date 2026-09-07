import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Quatro pesos de botao, e a tela so pode ter UM do primeiro:
 *
 *  default      primario — preenchido neon (.btn-acid). A acao central.
 *  secondary    contorno — borda 1px, texto principal, sem neon. Alternativa
 *               legitima ("Reverificar", "Cancelar compra").
 *  outline      sinonimo de secondary (nome antigo, muitos usos).
 *  ghost        terciario — so texto; hover ganha fundo. Sair, Config, Fechar.
 *  destructive  contorno vermelho; preenchimento so no passo de confirmar,
 *               que e quem chama que decide passando `variant="destructive"`
 *               com a classe `bg-destructive`.
 *
 * O que saiu da base: `uppercase tracking-wider`. Botao diz o verbo em caixa
 * normal ("Painel admin", nao "PAINEL ADMIN") — a caixa-alta espacada ficou
 * reservada a rotulo de secao (ver docs/tipografia).
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-brutal text-sm font-semibold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'btn-acid',
        secondary:
          'border border-line-strong bg-transparent text-foreground hover:border-acid/60 hover:bg-acid/5',
        outline:
          'border border-line-strong bg-transparent text-foreground hover:border-acid/60 hover:bg-acid/5',
        ghost:
          'text-muted-foreground hover:bg-muted hover:text-foreground',
        destructive:
          'border border-destructive/60 bg-transparent text-destructive hover:bg-destructive/10',
        link:
          'text-acid underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-8 text-base',
        icon: 'h-10 w-10'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { buttonVariants }
