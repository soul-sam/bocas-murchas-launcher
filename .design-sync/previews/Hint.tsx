import * as React from 'react'
import { Button, Hint } from 'bocas-murchas-launcher'

// LIMITACAO CONHECIDA: `Hint` nao expoe `open` — a dica so' abre no hover ou
// no foco, e nenhum dos dois acontece num screenshot estatico. Os cards abaixo
// mostram os ALVOS compostos como o app compoe, que e' a parte verificavel; o
// balao aberto esta no card de `Tooltip`, que aceita `open`.
//
// Os icones sao SVG inline: o conjunto de icones do app e' o lucide-react, que
// NAO esta no bundle do design system (ver NOTES.md).

function Lupa() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  )
}

function Pino() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M9 2h6l-1 8 4 3v2H6v-2l4-3z" />
    </svg>
  )
}

function Membros() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 7" />
      <path d="M17 14.5c2.4.7 4 2.9 4 5.5" />
    </svg>
  )
}

/** Barra de icones: cada botao ganha sua dica — o cabecalho do chat. */
export function BarraDeIcones() {
  return (
    <div className="rounded-brutal border border-line bg-depth-2 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-sm font-medium text-foreground"># off-topic</span>
        <Hint label="Buscar" shortcut="Ctrl + F">
          <Button variant="ghost" size="icon" aria-label="Buscar">
            <Lupa />
          </Button>
        </Hint>
        <Hint label="Fixadas" description="Mensagens que o canal marcou pra ficar no topo">
          <Button variant="ghost" size="icon" aria-label="Fixadas">
            <Pino />
          </Button>
        </Hint>
        <Hint label="Membros" shortcut="Ctrl + M">
          <Button variant="ghost" size="icon" aria-label="Membros">
            <Membros />
          </Button>
        </Hint>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Cada icone carrega sua dica: "Buscar · Ctrl + F", "Fixadas" com descricao,
        "Membros · Ctrl + M". O balao so' abre no hover — ver o card de Tooltip.
      </p>
    </div>
  )
}

/** Dica com descricao — item da lojinha: nome mais o que o item faz. */
export function ComDescricao() {
  return (
    <Hint
      label="Moldura dourada"
      description="Contorna teu avatar em ouro por 30 dias. Some sozinha quando vence."
      side="right"
    >
      <Button variant="secondary">Comprar por 800</Button>
    </Hint>
  )
}

/** `disabled` desliga a dica e devolve o filho cru — pra alvo ja desabilitado. */
export function Desligada() {
  return (
    <Hint label="Nao aparece" disabled>
      <Button variant="ghost" disabled>
        Entrar na call
      </Button>
    </Hint>
  )
}
