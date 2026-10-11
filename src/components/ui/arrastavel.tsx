import * as React from 'react'
import { createPortal } from 'react-dom'
import { NaFila } from '@/components/ui/filas'

/**
 * O CARTÃO QUE SE ARRASTA PRA QUALQUER CANTO.
 *
 * Quem nasce na fila do canto (ver filas.tsx) fica lá até a pessoa agarrar.
 * Arrastou, sai da fila e vira `fixed` no ponto onde foi solto — e o ponto é
 * lembrado entre aberturas. Dois cliques na alça devolvem pra fila.
 *
 * Mesma regra da AlcaDeLargura (ver ui/alca.tsx): enquanto o botão está
 * apertado quem escuta é o `window`, não a alça — com captura o ponteiro sai
 * da alça no primeiro movimento e o arrasto morre. O `blur` solta.
 *
 * Só anda depois de alguns pixels: clique simples na alça (no título, por
 * exemplo) continua sendo clique.
 *
 * A posição guardada é o canto de cima à esquerda, em px, e é SEMPRE
 * limitada à área útil: a janela encolheu, o cartão cresceu (a fila de
 * músicas abre por cima) — ele volta pra dentro sozinho. Em cima da barra de
 * título não pode: ela é área de arrastar a JANELA e engole o clique.
 *
 * No celular (≤640px) a fila estica o cartão de borda a borda e arrastar não
 * faz sentido — fica sempre na fila.
 */

interface Ponto {
  x: number
  y: number
}

/** Quanto o ponteiro anda antes de virar arrasto. */
const LIMIAR = 4
/** Folga das bordas da janela. */
const MARGEM = 8

function lerPonto(chave: string): Ponto | null {
  try {
    const bruto = localStorage.getItem(chave)
    if (!bruto) return null
    const ponto = JSON.parse(bruto) as Ponto
    return Number.isFinite(ponto?.x) && Number.isFinite(ponto?.y) ? ponto : null
  } catch {
    return null
  }
}

function gravarPonto(chave: string, ponto: Ponto | null): void {
  try {
    if (ponto) localStorage.setItem(chave, JSON.stringify(ponto))
    else localStorage.removeItem(chave)
  } catch {
    // Sem armazenamento (janela privada etc.): só não lembra.
  }
}

function varPx(nome: string): number {
  const valor = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(nome))
  return Number.isFinite(valor) ? valor : 0
}

function limitar(ponto: Ponto, el: HTMLElement | null): Ponto {
  const largura = el?.offsetWidth ?? 0
  const altura = el?.offsetHeight ?? 0
  const topo = varPx('--altura-titulo') + MARGEM
  const base = window.innerHeight - varPx('--altura-rail') - MARGEM
  return {
    x: Math.round(Math.min(Math.max(MARGEM, ponto.x), window.innerWidth - largura - MARGEM)),
    y: Math.round(Math.max(topo, Math.min(ponto.y, base - altura)))
  }
}

function useEstreito(): boolean {
  const consulta = '(max-width: 640px)'
  const [estreito, setEstreito] = React.useState(() => window.matchMedia(consulta).matches)
  React.useEffect(() => {
    const mq = window.matchMedia(consulta)
    const mudar = (): void => setEstreito(mq.matches)
    mq.addEventListener('change', mudar)
    return () => mq.removeEventListener('change', mudar)
  }, [])
  return estreito
}

/** O que a alça espalha no elemento que serve de pegador. */
export interface AlcaProps {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  onDoubleClick: () => void
  title: string
  className: string
}

export function Arrastavel({
  chave,
  ordem,
  className,
  children
}: {
  /** Onde a posição fica guardada (localStorage). */
  chave: string
  /** `ordem` na fila do canto enquanto não foi arrastado. */
  ordem?: number
  className?: string
  children: (alca: AlcaProps) => React.ReactNode
}) {
  const estreito = useEstreito()
  const [ponto, setPonto] = React.useState<Ponto | null>(() => lerPonto(chave))
  const pontoRef = React.useRef(ponto)
  pontoRef.current = ponto
  const [arrastando, setArrastando] = React.useState(false)
  const cartaoRef = React.useRef<HTMLDivElement | null>(null)
  const inicioRef = React.useRef<{ px: number; py: number; ponto: Ponto; andou: boolean } | null>(
    null
  )

  const solto = ponto !== null && !estreito

  // Janela mudou de tamanho ou o cartão cresceu: volta pra dentro.
  React.useEffect(() => {
    if (!solto) return
    const el = cartaoRef.current
    const ajustar = (): void =>
      setPonto((atual) => {
        if (!atual) return atual
        const certo = limitar(atual, cartaoRef.current)
        return certo.x === atual.x && certo.y === atual.y ? atual : certo
      })
    ajustar()
    const observador = new ResizeObserver(ajustar)
    if (el) observador.observe(el)
    window.addEventListener('resize', ajustar)
    return () => {
      observador.disconnect()
      window.removeEventListener('resize', ajustar)
    }
  }, [solto])

  React.useEffect(() => {
    if (!arrastando) return

    const mover = (event: PointerEvent): void => {
      const inicio = inicioRef.current
      if (!inicio) return
      const dx = event.clientX - inicio.px
      const dy = event.clientY - inicio.py
      if (!inicio.andou) {
        if (Math.hypot(dx, dy) < LIMIAR) return
        inicio.andou = true
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
      }
      setPonto(limitar({ x: inicio.ponto.x + dx, y: inicio.ponto.y + dy }, cartaoRef.current))
    }

    const acabar = (): void => {
      const andou = inicioRef.current?.andou
      inicioRef.current = null
      setArrastando(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (andou) gravarPonto(chave, pontoRef.current)
    }

    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', acabar)
    window.addEventListener('pointercancel', acabar)
    window.addEventListener('blur', acabar)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', acabar)
      window.removeEventListener('pointercancel', acabar)
      window.removeEventListener('blur', acabar)
    }
  }, [arrastando, chave])

  // Estilo global no body não pode ficar grudado se o cartão sumir no meio
  // do arrasto (a música acabou, por exemplo) — ver lib/interaction-guard.ts.
  React.useEffect(
    () => () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    },
    []
  )

  const alca: AlcaProps = {
    onPointerDown: (event) => {
      if (estreito || event.button !== 0) return
      // Botão dentro da alça continua sendo botão.
      if ((event.target as HTMLElement).closest('button, a, input')) return
      const rect = cartaoRef.current?.getBoundingClientRect()
      if (!rect) return
      // Ainda na fila: parte de onde o cartão está desenhado agora.
      inicioRef.current = {
        px: event.clientX,
        py: event.clientY,
        ponto: { x: rect.left, y: rect.top },
        andou: false
      }
      setArrastando(true)
    },
    onDoubleClick: () => {
      setPonto(null)
      gravarPonto(chave, null)
    },
    title: estreito ? '' : 'Arraste pra mover — dois cliques volta pro canto',
    className: estreito ? '' : arrastando ? 'cursor-grabbing' : 'cursor-grab'
  }

  const cartao = (
    <div ref={cartaoRef} className={className}>
      {children(alca)}
    </div>
  )

  if (!solto) {
    return (
      <NaFila fila="canto" ordem={ordem}>
        {cartao}
      </NaFila>
    )
  }

  return createPortal(
    <div
      className="pointer-events-none fixed z-flutuante"
      style={{ left: ponto.x, top: ponto.y }}
    >
      {cartao}
    </div>,
    document.body
  )
}
