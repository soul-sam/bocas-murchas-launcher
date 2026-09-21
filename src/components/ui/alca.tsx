import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * A DIVISÓRIA QUE SE ARRASTA — largura das colunas laterais.
 *
 * As duas colunas da tela social nasceram com largura fixa: 240px de canais à
 * esquerda, 224/288px de painel à direita. Número fixo é sempre errado pra
 * alguém — quem tem nome de canal comprido vive lendo "escrever-no-cana…", e
 * quem tem monitor grande quer a lista de membros larga o bastante pra ler a
 * atividade de cada um.
 *
 * Esta é a barrinha entre as colunas. Ela é um `separator` de verdade, então
 * também anda pelo teclado (setas, Shift pra passo grande) — arrastar com o
 * mouse não pode ser o ÚNICO jeito de mexer no layout.
 *
 * ## QUEM ESCUTA O ARRASTO É A JANELA, NÃO A BARRINHA
 *
 * O caminho óbvio — `onPointerMove` na própria alça com `setPointerCapture` —
 * NÃO FUNCIONA, e falha do jeito mais chato: o `pointerdown` chega, e nenhum
 * `pointermove` depois dele. Sem a captura valendo, o ponteiro sai de uma
 * faixa de 8px no primeiro movimento e os eventos passam a ser de quem está
 * embaixo do cursor. O resultado é uma alça que acende e não anda.
 *
 * Então, enquanto o botão está apertado, quem escuta é o `window`. De quebra
 * isso resolve os dois casos que a captura também não resolveria: mouse
 * rápido que sai pela borda da janela, e alt+tab no meio do arrasto (o `blur`
 * solta).
 *
 * O outro cuidado que não é enfeite: o `<body>` ganha cursor e trava a seleção
 * de texto enquanto arrasta, e isso é DESFEITO no desmonte também. Estilo
 * global grudado no body é como o app inteiro trava (ver
 * lib/interaction-guard.ts).
 *
 * O limite de largura mora em quem chama (ver lib/layout-context.tsx): sem
 * teto, o chat vira uma tira de 100px; sem piso, a coluna some e não há mais o
 * que agarrar pra trazê-la de volta. Duplo clique devolve a largura padrão —
 * dá pra experimentar sem medo de não saber voltar.
 */

interface AlcaDeLarguraProps {
  /** Em que borda da coluna ela mora. A coluna da direita usa 'esquerda'. */
  lado: 'esquerda' | 'direita'
  /** Largura atual em px, ou `null` quando ainda vale a padrão do CSS. */
  largura: number | null
  /** `null` = voltar ao padrão (duplo clique). */
  aoMudar: (largura: number | null) => void
  min: number
  max: number
  /** Vai pro leitor de tela: "Largura da barra de canais". */
  rotulo: string
}

/** Passo do teclado, em px. Shift anda mais rápido. */
const PASSO = 16
const PASSO_LARGO = 48

function travarCorpo(): void {
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function soltarCorpo(): void {
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

export function AlcaDeLargura({ lado, largura, aoMudar, min, max, rotulo }: AlcaDeLarguraProps) {
  const [arrastando, setArrastando] = React.useState(false)
  const inicioRef = React.useRef<{ x: number; largura: number } | null>(null)

  /**
   * Quanto a coluna mede AGORA.
   *
   * Enquanto ninguém arrastou, a largura é a do CSS (`w-60`, `w-72`) e este
   * componente não a conhece — perguntar ao pai é o que faz o primeiro arrasto
   * continuar de onde a coluna está, em vez de saltar pro mínimo.
   */
  const medir = React.useCallback(
    (alca: HTMLElement): number => {
      const coluna = alca.parentElement
      if (!coluna) return largura ?? min
      return Math.round(coluna.getBoundingClientRect().width)
    },
    [largura, min]
  )

  const limitar = React.useCallback(
    (valor: number): number => Math.round(Math.min(max, Math.max(min, valor))),
    [max, min]
  )

  // Desmontar no meio do arrasto (a janela encolheu e a coluna virou gaveta,
  // por exemplo) não pode deixar o cursor de redimensionar preso na tela toda.
  React.useEffect(() => soltarCorpo, [])

  React.useEffect(() => {
    if (!arrastando) return

    const mover = (event: PointerEvent): void => {
      const inicio = inicioRef.current
      if (!inicio) return
      const delta = event.clientX - inicio.x
      aoMudar(limitar(lado === 'esquerda' ? inicio.largura - delta : inicio.largura + delta))
    }

    const acabar = (): void => {
      inicioRef.current = null
      setArrastando(false)
      soltarCorpo()
    }

    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', acabar)
    window.addEventListener('pointercancel', acabar)
    // Alt+tab no meio do arrasto: sem isto a coluna continuaria seguindo o
    // mouse quando a janela voltasse, sem ninguém estar segurando nada.
    window.addEventListener('blur', acabar)

    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', acabar)
      window.removeEventListener('pointercancel', acabar)
      window.removeEventListener('blur', acabar)
    }
  }, [arrastando, aoMudar, lado, limitar])

  const comecar = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    inicioRef.current = { x: event.clientX, largura: largura ?? medir(event.currentTarget) }
    setArrastando(true)
    travarCorpo()
  }

  const pelaTecla = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const direcao = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (direcao === 0) return
    event.preventDefault()
    const passo = (event.shiftKey ? PASSO_LARGO : PASSO) * direcao
    const base = largura ?? medir(event.currentTarget)
    aoMudar(limitar(lado === 'esquerda' ? base - passo : base + passo))
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={rotulo}
      aria-valuenow={largura ?? undefined}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={comecar}
      onKeyDown={pelaTecla}
      onDoubleClick={() => aoMudar(null)}
      title="Arraste pra mudar a largura — dois cliques volta ao padrão"
      className={cn(
        // A faixa de agarre é larga (8px) e a linha acesa é fina (1px): o alvo
        // do mouse não precisa ser do tamanho do desenho.
        'absolute inset-y-0 z-conteudo w-2 cursor-col-resize touch-none',
        'after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2',
        'after:transition-colors hover:after:bg-acid/60 focus-visible:outline-none focus-visible:after:bg-acid',
        arrastando ? 'after:bg-acid' : 'after:bg-transparent',
        lado === 'esquerda' ? '-left-1' : '-right-1'
      )}
    />
  )
}
