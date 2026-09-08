import * as React from 'react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from 'bocas-murchas-launcher'

// `open` fixo pelo mesmo motivo do Dialog: sem clique nao ha menu. Conteudo em
// portal -> cardMode "single" (ver overrides no config).

/** Menu de contexto de membro — rotulo, grupo de itens e separador. */
export function MenuDeMembro() {
  return (
    <div style={{ padding: 24 }}>
      <DropdownMenu open>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary">Guizao</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Guizao</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem>Ver perfil</DropdownMenuItem>
            <DropdownMenuItem>Mandar mensagem</DropdownMenuItem>
            <DropdownMenuItem>Convidar pra call</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Silenciar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Menu curto, sem rotulo — o caso do botao de mais opcoes. */
export function MenuCurto() {
  return (
    <div style={{ padding: 24 }}>
      <DropdownMenu open>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Mais opcoes">
            {/* SVG inline: o lucide-react do app nao esta no bundle do DS. */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem>Copiar link</DropdownMenuItem>
          <DropdownMenuItem>Fixar mensagem</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Apagar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
