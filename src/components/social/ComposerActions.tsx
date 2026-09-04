import { Plus, BarChart3, CalendarPlus, Swords, Megaphone, Store } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useOverlays } from '@/lib/overlay-context'
import { useAuth } from '@/lib/auth-context'

/**
 * O "+" do compositor: tudo que não é texto nem anexo.
 *
 * Enquete, marcar na agenda, "bora?" e (admin) drop. Cada item só ABRE uma
 * camada do overlay-context; quem implementa a camada é o componente dela.
 * Os mesmos atalhos existem como comando de barra no compositor
 * (/enquete, /marcar, /bora, /drop) — ver slash-commands.ts.
 */
export function ComposerActions({ onDrop }: { onDrop?: () => void }) {
  const { openPollComposer, openEventComposer, openPartyComposer, openShop } = useOverlays()
  const { user } = useAuth()

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Mais (enquete, marcar, bora…)"
          className="shrink-0 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-acid"
        >
          <Plus className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-52">
        <DropdownMenuLabel>Mandar</DropdownMenuLabel>
        <DropdownMenuItem onSelect={openPollComposer}>
          <BarChart3 className="h-3.5 w-3.5 text-acid" />
          Enquete
          <span className="ml-auto font-mono text-[9px] text-muted-foreground">/enquete</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openEventComposer()}>
          <CalendarPlus className="h-3.5 w-3.5 text-acid" />
          Marcar na agenda
          <span className="ml-auto font-mono text-[9px] text-muted-foreground">/marcar</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openPartyComposer()}>
          <Swords className="h-3.5 w-3.5 text-burn" />
          Bora jogar?
          <span className="ml-auto font-mono text-[9px] text-muted-foreground">/bora</span>
        </DropdownMenuItem>
        {user?.role === 'admin' && onDrop && (
          <DropdownMenuItem onSelect={onDrop}>
            <Megaphone className="h-3.5 w-3.5 text-burn" />
            Drop (anúncio)
            <span className="ml-auto font-mono text-[9px] text-muted-foreground">/drop</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={openShop}>
          <Store className="h-3.5 w-3.5" />
          Lojinha
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
