import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

/**
 * TOOLTIP — a dica que substitui o `title=` do sistema.
 *
 * O `title` nativo era o último pedaço de interface que o Windows desenhava
 * pra gente, e ele quebrava tudo o que a desintoxicação visual arrumou:
 * caixa branca com Segoe UI 12px sobre um app de tema roxo, um segundo inteiro
 * de espera antes de aparecer, texto de descrição de cosmético cortado sem
 * aviso, e nada em foco de teclado — quem navega por Tab nunca lia nenhuma.
 * Pior: um `title` grande é uma única linha, então "Nome — descrição" (o
 * padrão que badge, cargo e sticker usavam) saía como uma tira de 400px.
 *
 * Aqui a dica tem HIERARQUIA: `label` é o nome, `description` é a explicação
 * em cima de uma segunda linha, `shortcut` é a tecla num chip. É o que faz a
 * mesma dica servir pra um botão de ícone ("Buscar · Ctrl+F") e pra um item da
 * lojinha (nome + o que o item faz).
 *
 * Escolhas que valem uma linha:
 *
 * - Superfície de POPOVER, borda `line-strong`, sem verde. Dica não é ação —
 *   se ela levasse borda ácida competiria com o botão que a abriu.
 * - `z-[60]`: acima do `z-50` de Dialog/Dropdown, senão a dica de um botão
 *   dentro de modal nasce atrás do modal.
 * - Seta pequena: numa fileira de seis botões de ícone (o cabeçalho do chat)
 *   sem seta não dá pra saber de qual botão é a dica.
 * - `collisionPadding`: perto da borda da janela a dica vira pro outro lado
 *   em vez de sair da tela — o `title` nativo fazia isso e a gente perdeu de
 *   graça ao trocar.
 */

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & { arrow?: boolean }
>(({ className, sideOffset = 6, arrow = true, children, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={8}
      className={cn(
        'z-[60] max-w-[17rem] rounded-brutal border border-line-strong bg-popover',
        // O texto tem tamanho próprio nas duas linhas, mas a CAIXA precisa de
        // um também: sem isto ela herda os 16px da raiz e a quebra de linha é
        // calculada num tamanho que não existe na tela.
        'px-2.5 py-1.5 text-[11.5px] text-popover-foreground shadow-[0_10px_28px_rgba(0,0,0,0.45)]',
        'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
        'data-[state=delayed-open]:fade-in-0 data-[state=closed]:fade-out-0',
        'data-[state=delayed-open]:zoom-in-95',
        className
      )}
      {...props}
    >
      {children}
      {arrow && (
        // Sem sombra: o Radix GIRA a seta conforme o lado, e `drop-shadow`
        // desenha em coordenada de tela — a mesma sombra que fica embaixo numa
        // dica de cima aparece por cima numa dica de baixo. Triângulo chapado
        // na cor da superfície é o que funciona nos cinco temas.
        <TooltipPrimitive.Arrow width={10} height={5} className="fill-popover" />
      )}
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = 'TooltipContent'

export interface HintProps {
  /** O nome da coisa, ou o verbo do botão. Primeira linha. */
  label: React.ReactNode
  /** A explicação. Segunda linha, em texto apagado — opcional. */
  description?: React.ReactNode
  /** Tecla de atalho, num chip no fim da primeira linha. Ex.: `Ctrl + F`. */
  shortcut?: string
  side?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>['side']
  align?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>['align']
  sideOffset?: number
  /** Sem isso a dica não aparece — pra quando o alvo está desabilitado. */
  disabled?: boolean
  /**
   * Atraso próprio. O padrão do Provider serve pra quase tudo; item de grade
   * (lojinha, sticker) pede um pouco mais, senão a dica pisca sozinha
   * enquanto o mouse atravessa a grade.
   */
  delayDuration?: number
  children: React.ReactNode
}

/**
 * O jeito curto de pôr uma dica em qualquer coisa.
 *
 * O filho tem que ser UM elemento (vai como `asChild`), e continua dono do
 * `aria-label`/`alt` dele: a dica é `aria-describedby`, não substitui o nome
 * acessível — foi por isso que trocar `title` por dica não tirou nada de quem
 * usa leitor de tela.
 */
export function Hint({
  label,
  description,
  shortcut,
  side = 'top',
  align = 'center',
  sideOffset,
  disabled,
  delayDuration,
  children
}: HintProps) {
  if (disabled) return <>{children}</>

  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align} sideOffset={sideOffset}>
        <span className="flex items-baseline gap-2">
          <span className="text-[11.5px] font-medium leading-snug">{label}</span>
          {shortcut && (
            <kbd
              className={cn(
                'shrink-0 rounded border border-line-strong bg-surface-raised px-1',
                'font-mono text-[11px] leading-[1.4] text-muted-foreground'
              )}
            >
              {shortcut}
            </kbd>
          )}
        </span>
        {description && (
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
            {description}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
