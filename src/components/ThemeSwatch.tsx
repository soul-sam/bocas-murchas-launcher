import { cn } from '@/lib/utils'
import type { ThemeId } from '../../electron/preload/types'

/**
 * Miniatura de um tema: a janela do launcher em quarenta pixels — barra de
 * ícones, coluna de canais, área do chat com duas linhas de texto e o botão
 * primário — pintada com os tokens DO TEMA, não do tema ativo. Funciona porque
 * as folhas de globals.css valem em qualquer `[data-theme]`, não só no <html>:
 * o span redefine os tokens e tudo dentro dele herda. A luz dos cantos vem
 * junto (`.luz-do-tema`), em escala.
 *
 * É a mesma amostra na Lojinha, na aba Estilo do perfil e nas Configurações:
 * a pessoa reconhece o tema pela miniatura em qualquer lugar.
 */
export function ThemeSwatch({ theme, className }: { theme: ThemeId; className?: string }) {
  return (
    <span
      aria-hidden
      data-theme={theme}
      className={cn(
        'relative flex h-10 w-full overflow-hidden rounded-[4px] border border-border bg-background text-foreground',
        className
      )}
    >
      <span className="luz-do-tema absolute inset-0" />
      {/* barra de ícones */}
      <span className="relative flex h-full w-[14%] shrink-0 flex-col items-center gap-[3px] bg-background pt-1">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
      </span>
      {/* coluna de canais */}
      <span className="relative flex h-full w-[26%] shrink-0 flex-col gap-[3px] border-r border-border bg-depth-2 p-1">
        <span className="h-1 w-3/4 rounded-sm bg-muted-foreground/40" />
        <span className="h-1 w-1/2 rounded-sm bg-muted-foreground/40" />
        <span className="h-1 w-2/3 rounded-sm bg-muted-foreground/40" />
      </span>
      {/* chat */}
      <span className="relative flex h-full min-w-0 flex-1 flex-col justify-end gap-[3px] bg-depth-3 p-1">
        <span className="h-1 w-5/6 rounded-sm bg-foreground/70" />
        <span className="h-1 w-3/5 rounded-sm bg-muted-foreground/60" />
        <span className="mt-[2px] h-2 w-7 rounded-[2px] bg-primary" />
      </span>
    </span>
  )
}
