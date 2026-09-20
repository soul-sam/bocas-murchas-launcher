import * as React from 'react'
import { createPortal } from 'react-dom'

/**
 * UM CANTO, UMA FILA.
 *
 * Cinco avisos disputavam o canto de baixo à direita, cada um se ancorando
 * sozinho: o toast de XP (`bottom-4 right-4`) e a barra da música
 * (`bottom-4 right-4`) no MESMO ponto e no MESMO z, desenhando um por cima do
 * outro; o convite de lobby em `bottom-20`, um número chutado pra altura de um
 * player que muda de tamanho com a capa do vídeo.
 *
 * Agora existem duas filas — um canto e um topo — e quem quer aparecer entra
 * nelas. A fila empilha com `gap`, ninguém calcula a altura de ninguém, e a
 * ordem é declarada (`ordem`), não acidental.
 *
 * As filas também são o único lugar que sabe das bordas do aparelho: a do
 * canto soma a safe area embaixo, a do topo soma a altura real da barra de
 * título (36px no Electron, 0 na web, onde ela não existe — ver TitleBar) mais
 * o entalhe. Antes todo mundo usava `top-12` (48px) pra uma barra de 36.
 *
 * No celular a fila vira faixa de borda a borda com teto de altura — regra em
 * globals.css, `.fila-canto`.
 */

/**
 * O topo tem DUAS faixas, e não é capricho: um contêiner com z-index próprio
 * é uma caixa fechada — nenhum filho consegue passar por cima de algo que
 * esteja acima da caixa. E as duas coisas que moram no topo têm regras
 * opostas, cada uma comentada no seu arquivo:
 *
 * - drop de admin PASSA por cima de diálogo (tem prazo pra pegar);
 * - faixa de custos NÃO passa (ela manda abrir uma tela que ela mesma taparia).
 *
 * Então: a faixa urgente fica acima dos diálogos, a comum abaixo, e a comum
 * desce pela altura MEDIDA da urgente em vez de chutar um `top-N` — que é
 * exatamente o erro que as duas cometiam antes (`top-12` para uma barra de
 * título de 36px que na web nem existe).
 */
interface Filas {
  canto: HTMLElement | null
  topo: HTMLElement | null
  topoUrgente: HTMLElement | null
}

const FilasContext = React.createContext<Filas>({ canto: null, topo: null, topoUrgente: null })

export function FilasProvider({ children }: { children: React.ReactNode }) {
  const [canto, setCanto] = React.useState<HTMLElement | null>(null)
  const [topo, setTopo] = React.useState<HTMLElement | null>(null)
  const [topoUrgente, setTopoUrgente] = React.useState<HTMLElement | null>(null)
  const [alturaUrgente, setAlturaUrgente] = React.useState(0)

  // A faixa urgente muda de altura a cada drop que entra ou sai; a comum
  // acompanha. Sem observador, o único jeito seria um número fixo — e número
  // fixo de altura alheia foi o que quebrou aqui em primeiro lugar.
  React.useEffect(() => {
    if (!topoUrgente) return
    const observador = new ResizeObserver(([entrada]) => {
      const altura = entrada.target.getBoundingClientRect().height
      // Faixa vazia não empurra nada: sem filhos ela mede zero e o gap não
      // conta, mas o arredondamento do layout pode devolver frações.
      setAlturaUrgente(altura < 1 ? 0 : altura + 8)
    })
    observador.observe(topoUrgente)
    return () => observador.disconnect()
  }, [topoUrgente])

  const valor = React.useMemo<Filas>(
    () => ({ canto, topo, topoUrgente }),
    [canto, topo, topoUrgente]
  )

  return (
    <FilasContext.Provider value={valor}>
      {children}

      {/* `pointer-events-none` em todas: elas ocupam área que não é delas.
          Cada aviso devolve o clique pra si (`pointer-events-auto`). */}
      <div
        ref={setTopoUrgente}
        className="fila-topo pointer-events-none fixed inset-x-0 z-topo flex flex-col items-center gap-2 px-4"
      />
      <div
        ref={setTopo}
        style={{ marginTop: alturaUrgente }}
        className="fila-topo pointer-events-none fixed inset-x-0 z-flutuante flex flex-col items-center gap-2 px-4"
      />
      <div
        ref={setCanto}
        className="fila-canto pointer-events-none fixed z-flutuante flex flex-col items-end justify-end gap-2 overflow-y-auto"
      />
    </FilasContext.Provider>
  )
}

/**
 * Põe o conteúdo numa das filas.
 *
 * `ordem` decide a posição: MAIOR fica mais perto do canto (mais perto do
 * polegar, no celular). Ação vem antes de informação — o convite pra entrar na
 * call ganha do aviso de XP, que é só uma comemoração.
 */
export function NaFila({
  fila,
  ordem = 0,
  className,
  children
}: {
  fila: 'canto' | 'topo' | 'topo-urgente'
  ordem?: number
  className?: string
  children: React.ReactNode
}) {
  const filas = React.useContext(FilasContext)
  const alvo =
    fila === 'canto' ? filas.canto : fila === 'topo-urgente' ? filas.topoUrgente : filas.topo

  // O provider monta os contêineres no mesmo quadro em que os avisos montam;
  // no primeiro render o alvo ainda é null e o portal não tem onde ir. O
  // estado do provider re-renderiza quem consome assim que o nó existe.
  if (!alvo) return null

  return createPortal(
    <div style={{ order: ordem }} className={className}>
      {children}
    </div>,
    alvo
  )
}
