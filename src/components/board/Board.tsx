import * as React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { sideIsLight, type GridGame, type DraughtsVariant, type Side } from '@/lib/api-board'
import {
  capturedSquares,
  movableSquares,
  moveEnds,
  movePath,
  movesFrom,
  parsePosition,
  squareIndex,
  squareName,
  type Piece
} from '@/lib/board-position'
import { PROMOTION_ORDER, premoveMoves, readChess } from '@/lib/board-local'
import { cn } from '@/lib/utils'
import { HOP_MS, PieceGlyph, type PieceMotion } from './pieces'
import './board.css'

/**
 * O TABULEIRO — a moldura com as coordenadas gravadas e a grade 8×8, com a
 * mecânica do chess.com:
 *
 *  - ARRASTAR: a peça sai da casa e segue o cursor (desenhada fora da grade,
 *    num portal no <body>, pra poder passar da borda). A MIRA marca onde ela
 *    cai: acende na cor do lance sobre um destino e é só um contorno fora
 *    dele. O destino tem ímã: soltar perto da borda dele (ou um pouco além da
 *    beira do tabuleiro) conta como soltar nele, e a mira já mostra isso.
 *    Soltar longe de destino devolve a peça; na própria casa, ela continua
 *    escolhida. O botão direito com a peça na mão cancela o arrasto.
 *  - CLICAR: clica a peça (bolinhas nos destinos, aro nas capturas) e clica o
 *    destino. Clicar a peça escolhida de novo desmarca.
 *  - PRÉ-LANCE: na vez do outro as minhas peças continuam pegáveis; o destino
 *    vale pela geometria (lib/board-local) e o lance vai pra fila do contexto.
 *    A fila aparece no tabuleiro (a peça já no destino, as casas em vermelho)
 *    e o botão direito cancela tudo.
 *  - BOTÃO DIREITO: clicar marca a casa, arrastar desenha uma seta (em L no
 *    salto do cavalo). Shift e Ctrl/Alt trocam a cor. Clique esquerdo limpa.
 *  - XEQUE: o rei ganha o brilho vermelho; pegar uma peça sem saída com o rei
 *    em xeque pisca o rei (e `onIllegal` toca o aviso).
 *
 * Nenhuma regra mora aqui: os lances legais vêm do servidor e o servidor
 * confere de novo. Sem `onMove`/`onPremove` o tabuleiro é só leitura (mas as
 * setas continuam valendo, menos com `annotations={false}`).
 *
 * Os ouvintes de arrasto e de seta ficam no `window` enquanto o gesto dura:
 * soltar fora do tabuleiro, mouse rápido e alt-tab chegam todos lá. Cada casa
 * continua sendo um `button` com `aria-label` ("e4, peão branco"), e Enter
 * joga pelo teclado.
 */

const CHESS_NAME: Record<string, string> = {
  p: 'peão',
  n: 'cavalo',
  b: 'bispo',
  r: 'torre',
  q: 'dama',
  k: 'rei'
}
/** Gênero da cor concorda com a peça: torre/dama/pedra são femininas. */
const FEMININE = new Set(['r', 'q', 'man', 'king'])

function pieceLabel(piece: Piece, light: boolean): string {
  const name =
    piece.kind === 'man' ? 'pedra' : piece.kind === 'king' ? 'dama' : (CHESS_NAME[piece.kind] ?? piece.kind)
  const color = light ? 'branc' : 'pret'
  return `${name} ${color}${FEMININE.has(piece.kind) ? 'a' : 'o'}`
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1']
const NO_PREMOVES: readonly string[] = []

/** Quanto o ponteiro anda antes de virar arrasto (abaixo disso é clique). */
const DRAG_START_PX = 4
/**
 * Ímã do arrasto, em casas: fora de um destino, a peça cai no destino cujo
 * centro está mais perto que isto. A casa vizinha de lado (centro a 0,5 da
 * borda) atrai até ~1/5 de casa pra dentro da casa errada; a do canto (0,71)
 * quase não atrai, e o meio de uma casa errada nunca é atraído.
 */
const SNAP_SQUARES = 0.72
/** No toque o dedo cobre a casa: a peça arrastada cresce pra aparecer em volta dele. */
const TOUCH_GHOST_SCALE = 1.5
/** Quanto o rei pisca quando a peça pega não tem saída. */
const FLASH_MS = 700

type Mode = 'move' | 'premove'
type How = 'drag' | 'click'
/** Cor da marcação: a (padrão), b (Shift), c (Ctrl/Alt). */
type Paint = 'a' | 'b' | 'c'

interface Arrow {
  from: string
  to: string
  paint: Paint
}
interface Mark {
  square: string
  paint: Paint
}
interface Choice {
  to: string
  moves: Array<{ move: string; to: string }>
  kind: 'promotion' | 'path'
  /** Lado de quem promove (a cor das peças oferecidas). */
  side: Side
  mode: Mode
  how: How
}
interface Drag {
  from: string
  pointerId: number
  pointerType: string
  x0: number
  y0: number
  /** Último ponto do ponteiro (a mira se refaz nele se as regras mudarem no meio). */
  x: number
  y: number
  active: boolean
  /** A peça já estava escolhida: clique sem arrastar desmarca. */
  wasSelected: boolean
  /** Destinos da peça, refeitos quando a lista de lances muda no meio do gesto. */
  targets: Set<string>
  targetsOf: ((square: string) => Array<{ move: string; to: string }>) | null
}
/** Onde a peça arrastada cai: a casa e a posição dela na tela (coluna e linha já orientadas). */
interface Aim {
  square: string
  col: number
  row: number
  /** É destino da peça (soltar joga). */
  target: boolean
}
interface Draw {
  from: string
  to: string | null
  paint: Paint
  pointerId: number
}
interface Ghost {
  piece: Piece
  light: boolean
  size: number
  x: number
  y: number
}

const paintOf = (e: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): Paint =>
  e.shiftKey ? 'b' : e.ctrlKey || e.altKey || e.metaKey ? 'c' : 'a'

export interface BoardProps {
  game: GridGame
  /** Na dama americana quem abre (white) tem as peças escuras. */
  variant?: DraughtsVariant | null
  position: string
  /** De que lado se vê: pretas embaixo quando 'black'. */
  orientation: Side
  /** Lances que dá pra jogar agora (minha vez, ao vivo). */
  legalMoves: string[]
  lastMove: string | null
  /** Identidade do último lance (`ply:lance`): a chegada anima uma vez por chave. */
  lastMoveKey?: string | null
  /** O último lance desliza (lance do outro, clique) ou já chega pousado (arrasto, pré-lance)? */
  animateLast?: boolean
  /** Casa do rei em xeque. */
  checkSquare?: string | null
  /** Pré-lances na fila: as casas ganham a cor do pré-lance. */
  premoves?: readonly string[]
  /** De que lado eu jogo (as peças que posso pegar). */
  mySide?: Side | null
  /** Minha vez: o lance (e se saiu de arrasto ou de clique). */
  onMove?: (move: string, how: How) => void
  /** Vez do outro: o pré-lance (só xadrez). */
  onPremove?: (move: string) => void
  onCancelPremoves?: () => void
  /** Peça sem saída com o rei em xeque. */
  onIllegal?: () => void
  /** Setas e marcações do botão direito. */
  annotations?: boolean
}

export const Board = React.memo(function Board({
  game,
  variant = null,
  position,
  orientation,
  legalMoves,
  lastMove,
  lastMoveKey = null,
  animateLast = true,
  checkSquare = null,
  premoves = NO_PREMOVES,
  mySide = null,
  onMove,
  onPremove,
  onCancelPremoves,
  onIllegal,
  annotations = true
}: BoardProps) {
  const gridRef = React.useRef<HTMLDivElement>(null)
  const ghostRef = React.useRef<HTMLDivElement>(null)
  // A mira anda pelo estilo, direto no DOM: trocar de casa no meio do arrasto
  // não redesenha as 64 casas.
  const aimRef = React.useRef<HTMLDivElement>(null)
  const aimKeyRef = React.useRef('')
  const dragRef = React.useRef<Drag | null>(null)
  const drawRef = React.useRef<Draw | null>(null)

  const [selected, setSelected] = React.useState<string | null>(null)
  const [choice, setChoice] = React.useState<Choice | null>(null)
  const [dragFrom, setDragFrom] = React.useState<string | null>(null)
  const [ghost, setGhost] = React.useState<Ghost | null>(null)
  const [arrows, setArrows] = React.useState<Arrow[]>([])
  const [marks, setMarks] = React.useState<Mark[]>([])
  const [drawing, setDrawing] = React.useState<Draw | null>(null)
  const [flash, setFlash] = React.useState<string | null>(null)

  const squares = React.useMemo(() => parsePosition(game, position), [game, position])
  const mode: Mode | null =
    onMove && legalMoves.length > 0 ? 'move' : onPremove && mySide && game === 'chess' ? 'premove' : null
  const chessBoard = React.useMemo(() => (mode === 'premove' ? readChess(position) : null), [mode, position])

  const movesFromSquare = React.useCallback(
    (square: string): Array<{ move: string; to: string }> => {
      if (mode === 'move') return movesFrom(legalMoves, square)
      if (mode === 'premove' && chessBoard && mySide) return premoveMoves(chessBoard, square, mySide)
      return []
    },
    [mode, legalMoves, chessBoard, mySide]
  )
  const movable = React.useMemo((): Set<string> => {
    if (mode === 'move') return movableSquares(legalMoves)
    const out = new Set<string>()
    if (mode === 'premove' && mySide) squares.forEach((p, i) => p && p.side === mySide && out.add(squareName(i)))
    return out
  }, [mode, legalMoves, squares, mySide])
  const targets = React.useMemo(() => (selected ? movesFromSquare(selected) : []), [selected, movesFromSquare])
  const targetSet = React.useMemo(() => new Set(targets.map((t) => t.to)), [targets])
  const last = React.useMemo(() => (lastMove ? moveEnds(lastMove) : null), [lastMove])
  const premoveSquares = React.useMemo(() => {
    const out = new Set<string>()
    for (const pm of premoves) {
      const ends = moveEnds(pm)
      out.add(ends.from)
      out.add(ends.to)
    }
    return out
  }, [premoves])
  const markBySquare = React.useMemo(() => new Map(marks.map((m) => [m.square, m.paint])), [marks])

  // Ordem de desenho: de baixo pra cima como o jogador vê. Pretas embaixo
  // giram o tabuleiro 180°.
  const flipped = orientation === 'black'
  const cells = React.useMemo(() => Array.from({ length: 64 }, (_, k) => (flipped ? 63 - k : k)), [flipped])
  const files = flipped ? [...FILES].reverse() : FILES
  const ranks = flipped ? [...RANKS].reverse() : RANKS

  // O mais novo de tudo, pros ouvintes do window (que vivem mais que um render).
  const latest = { mode, movesFromSquare, squares, cells, game, variant, onMove, onPremove, premoves, onCancelPremoves }
  const live = React.useRef(latest)
  live.current = latest

  // Posição, lances ou modo novos: a escolha aberta não vale mais, e a peça
  // escolhida só continua se ainda tiver para onde ir. Arrasto em curso
  // continua: quem decide é a soltura, já com as regras novas (o adversário
  // jogou no meio do gesto e o pré-lance vira lance) — e a mira se refaz
  // com elas sem esperar o ponteiro mexer.
  const legalKey = legalMoves.join(',')
  React.useEffect(() => {
    setChoice(null)
    const d = dragRef.current
    if (d?.active) {
      paintAim(dropAt(d.x, d.y, d))
      return
    }
    setSelected((prev) => (prev && live.current.movesFromSquare(prev).length > 0 ? prev : null))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paintAim/dropAt só leem refs
  }, [position, legalKey, mode])

  // Escolha aberta: o foco vai pra primeira opção e Esc fecha tudo.
  const choiceRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!choice) return
    choiceRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      setChoice(null)
      setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [choice])

  React.useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), FLASH_MS)
    return () => clearTimeout(t)
  }, [flash])

  // --- coordenadas ---------------------------------------------------------
  const squareAt = React.useCallback((x: number, y: number): string | null => {
    const grid = gridRef.current
    if (!grid) return null
    const r = grid.getBoundingClientRect()
    if (x < r.left || x >= r.right || y < r.top || y >= r.bottom) return null
    const col = Math.min(7, Math.floor(((x - r.left) / r.width) * 8))
    const row = Math.min(7, Math.floor(((y - r.top) / r.height) * 8))
    return squareName(live.current.cells[row * 8 + col])
  }, [])

  /**
   * Onde a peça arrastada cai se for solta em (x, y): a casa sob o ponteiro
   * se for destino (ou a própria origem); senão o destino mais perto dentro
   * do ímã, que também alcança um pouco além da beira do tabuleiro. Sem
   * destino por perto, a casa sob o ponteiro (soltar ali devolve a peça);
   * fora do tabuleiro, nada.
   */
  const dropAt = (x: number, y: number, d: Drag): Aim | null => {
    const grid = gridRef.current
    if (!grid) return null
    const r = grid.getBoundingClientRect()
    const gx = ((x - r.left) / r.width) * 8
    const gy = ((y - r.top) / r.height) * 8
    const { cells: order, movesFromSquare: list } = live.current
    if (d.targetsOf !== list) {
      d.targetsOf = list
      d.targets = new Set(list(d.from).map((o) => o.to))
    }
    let under: Aim | null = null
    if (gx >= 0 && gx < 8 && gy >= 0 && gy < 8) {
      const col = Math.min(7, Math.floor(gx))
      const row = Math.min(7, Math.floor(gy))
      const square = squareName(order[row * 8 + col])
      under = { square, col, row, target: d.targets.has(square) }
      if (under.target || square === d.from) return under
    }
    let best: Aim | null = null
    let bestDist = SNAP_SQUARES
    for (let k = 0; k < 64; k++) {
      const square = squareName(order[k])
      if (!d.targets.has(square)) continue
      const col = k % 8
      const row = Math.floor(k / 8)
      const dist = Math.hypot(gx - col - 0.5, gy - row - 0.5)
      if (dist < bestDist) {
        bestDist = dist
        best = { square, col, row, target: true }
      }
    }
    return best ?? under
  }

  /** Põe a mira na casa (ou tira). Só mexe no DOM quando o lugar ou o tipo mudam. */
  const paintAim = (aim: Aim | null): void => {
    const key = aim ? `${aim.col}${aim.row}${aim.target ? '+' : ''}` : ''
    if (key === aimKeyRef.current) return
    aimKeyRef.current = key
    const el = aimRef.current
    if (!el) return
    if (!aim) {
      delete el.dataset.mira
      return
    }
    el.dataset.mira = aim.target ? 'alvo' : 'casa'
    el.style.transform = `translate(${aim.col * 100}%, ${aim.row * 100}%)`
  }

  // --- jogar ---------------------------------------------------------------
  const fire = React.useCallback((move: string, how: How, m: Mode): void => {
    setSelected(null)
    setChoice(null)
    if (m === 'move') live.current.onMove?.(move, how)
    else live.current.onPremove?.(move)
  }, [])

  /** Leva a peça de `from` pra `to`, se der: lance direto, ou a escolha (promoção, caminho da dama). */
  const commit = React.useCallback(
    (from: string, to: string, how: How): boolean => {
      const { mode: m, movesFromSquare: list, squares: sq, game: g } = live.current
      if (!m) return false
      const options = list(from).filter((o) => o.to === to)
      if (options.length === 0) return false
      if (options.length === 1) {
        fire(options[0].move, how, m)
        return true
      }
      const piece = sq[squareIndex(from)]
      const promotion = g === 'chess' && options.every((o) => o.move.length === 5)
      setChoice({ to, moves: options, kind: promotion ? 'promotion' : 'path', side: piece?.side ?? 'white', mode: m, how })
      return true
    },
    [fire]
  )

  // --- gestos no window ------------------------------------------------------
  // As funções registradas são fixas e chamam a versão mais nova do código.
  const impl = React.useRef({
    move: (_e: PointerEvent): void => {},
    up: (_e: PointerEvent): void => {},
    abort: (): void => {},
    cancel: (): void => {}
  })
  const stable = React.useRef({
    move: (e: PointerEvent): void => impl.current.move(e),
    up: (e: PointerEvent): void => impl.current.up(e),
    abort: (): void => impl.current.abort()
  })
  const listen = React.useCallback((): void => {
    const s = stable.current
    window.addEventListener('pointermove', s.move)
    window.addEventListener('pointerup', s.up)
    window.addEventListener('pointercancel', s.up)
    window.addEventListener('blur', s.abort)
  }, [])
  const unlisten = React.useCallback((): void => {
    const s = stable.current
    window.removeEventListener('pointermove', s.move)
    window.removeEventListener('pointerup', s.up)
    window.removeEventListener('pointercancel', s.up)
    window.removeEventListener('blur', s.abort)
  }, [])
  React.useEffect(() => unlisten, [unlisten])

  const endDrag = (): void => {
    dragRef.current = null
    setDragFrom(null)
    setGhost(null)
    paintAim(null)
  }

  /**
   * O botão direito que acabou de cancelar ou desenhar ainda abriria um menu
   * (o do sistema, ou o da tela embaixo se o cursor saiu do tabuleiro). Esse
   * menu chega quando o botão SOBE, então a trava espera por ele — até o
   * próximo clique ou 2 s, pra não engolir o menu de outra coisa.
   */
  const swallowNextContextMenu = (): void => {
    const done = (): void => {
      clearTimeout(timer)
      window.removeEventListener('contextmenu', kill, true)
      window.removeEventListener('pointerdown', done, true)
    }
    const kill = (ev: Event): void => {
      ev.preventDefault()
      ev.stopPropagation()
      done()
    }
    window.addEventListener('contextmenu', kill, true)
    window.addEventListener('pointerdown', done, true)
    const timer = setTimeout(done, 2000)
  }

  impl.current = {
    // Botão direito com a peça na mão: ela volta pra casa, nada fica escolhido
    // e os pré-lances da fila caem junto (no chess.com o direito cancela tudo).
    cancel: () => {
      unlisten()
      endDrag()
      setSelected(null)
      setChoice(null)
      const { premoves: queued, onCancelPremoves: dropQueue } = live.current
      if (queued.length > 0) dropQueue?.()
      swallowNextContextMenu()
    },
    // A janela perdeu o foco no meio do gesto (alt-tab): a peça volta pra casa.
    abort: () => {
      unlisten()
      if (dragRef.current) {
        endDrag()
        setSelected(null)
      }
      if (drawRef.current) {
        drawRef.current = null
        setDrawing(null)
      }
    },
    move: (e) => {
      const d = dragRef.current
      // O direito apertado com o esquerdo ainda embaixo não vira pointerdown:
      // chega aqui, como pointermove com `button` 2.
      if (d && e.pointerId === d.pointerId && e.button === 2 && (e.buttons & 2) !== 0) {
        impl.current.cancel()
        return
      }
      // Botão solto fora da janela (o pointerup não chegou): o gesto acabou.
      const held = e.pointerType !== 'mouse' || (e.buttons & (drawRef.current ? 2 : 1)) !== 0
      if (!held && (d || drawRef.current)) {
        impl.current.abort()
        return
      }
      const draw = drawRef.current
      if (draw && e.pointerId === draw.pointerId) {
        const to = squareAt(e.clientX, e.clientY)
        if (to !== draw.to) {
          draw.to = to
          setDrawing({ ...draw })
        }
        return
      }
      if (!d || e.pointerId !== d.pointerId) return
      d.x = e.clientX
      d.y = e.clientY
      if (!d.active) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_START_PX) return
        const piece = live.current.squares[squareIndex(d.from)]
        const grid = gridRef.current
        if (!piece || !grid) return
        d.active = true
        const touch = d.pointerType === 'touch'
        setGhost({
          piece,
          light: sideIsLight(live.current.game, live.current.variant, piece.side),
          size: (grid.getBoundingClientRect().width / 8) * (touch ? TOUCH_GHOST_SCALE : 1),
          x: e.clientX,
          y: e.clientY
        })
        setDragFrom(d.from)
        aimRef.current?.toggleAttribute('data-toque', touch)
      }
      const el = ghostRef.current
      if (el) el.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`
      paintAim(dropAt(e.clientX, e.clientY, d))
    },
    up: (e) => {
      const draw = drawRef.current
      if (draw && e.pointerId === draw.pointerId) {
        if (e.type === 'pointerup' && e.button !== 2) return
        unlisten()
        drawRef.current = null
        setDrawing(null)
        const to = e.type === 'pointercancel' ? null : squareAt(e.clientX, e.clientY)
        swallowNextContextMenu()
        if (!to) return
        if (to === draw.from) {
          setMarks((prev) => {
            const same = prev.find((m) => m.square === to)
            const rest = prev.filter((m) => m.square !== to)
            return same && same.paint === draw.paint ? rest : [...rest, { square: to, paint: draw.paint }]
          })
        } else {
          setArrows((prev) => {
            const same = prev.find((a) => a.from === draw.from && a.to === to)
            const rest = prev.filter((a) => !(a.from === draw.from && a.to === to))
            return same && same.paint === draw.paint ? rest : [...rest, { from: draw.from, to, paint: draw.paint }]
          })
        }
        return
      }
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      unlisten()
      // Cai onde a mira estava: a mesma conta, com o ímã.
      const target = e.type === 'pointercancel' || !d.active ? null : (dropAt(e.clientX, e.clientY, d)?.square ?? null)
      const wasActive = d.active
      endDrag()
      if (wasActive) {
        if (target && target !== d.from && commit(d.from, target, 'drag')) return
        // Soltou de volta na casa: continua escolhida (dá pra clicar o destino).
        if (target === d.from) return
        setSelected(null)
        return
      }
      if (d.wasSelected) setSelected(null)
    }
  }

  const startDraw = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    // No chess.com o botão direito cancela os pré-lances (e não desenha).
    if (premoves.length > 0 && onCancelPremoves) {
      onCancelPremoves()
      setSelected(null)
      swallowNextContextMenu()
      return
    }
    setSelected(null)
    setChoice(null)
    if (!annotations) return
    const from = squareAt(e.clientX, e.clientY)
    if (!from) return
    const draw: Draw = { from, to: from, paint: paintOf(e), pointerId: e.pointerId }
    drawRef.current = draw
    setDrawing(draw)
    listen()
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (dragRef.current || drawRef.current) return
    if (e.button === 2) return startDraw(e)
    if (e.button !== 0) return
    if (arrows.length > 0 || marks.length > 0) {
      setArrows([])
      setMarks([])
    }
    const square = squareAt(e.clientX, e.clientY)
    if (!square) return
    // Clicar fora da escolha de promoção desiste dela.
    if (choice) {
      setChoice(null)
      setSelected(null)
      return
    }
    if (!mode) {
      if (selected) setSelected(null)
      return
    }
    const piece = squares[squareIndex(square)]
    // Casa com peça minha que também é destino (recaptura em pré-lance): o
    // clique troca a peça escolhida, como no chess.com; a recaptura entra
    // soltando a peça arrastada em cima (ou por Enter, em `onSquareClick`).
    if (selected && selected !== square && targetSet.has(square) && !(piece && movable.has(square))) {
      e.preventDefault()
      commit(selected, square, 'click')
      return
    }
    if (piece && movable.has(square)) {
      e.preventDefault()
      setSelected(square)
      dragRef.current = {
        from: square,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        x0: e.clientX,
        y0: e.clientY,
        x: e.clientX,
        y: e.clientY,
        active: false,
        wasSelected: selected === square,
        targets: new Set(),
        targetsOf: null
      }
      listen()
      return
    }
    if (piece && mode === 'move' && checkSquare && mySide && piece.side === mySide) {
      setFlash(checkSquare)
      onIllegal?.()
    }
    setSelected(null)
  }

  /** Teclado (Enter/Espaço numa casa). Clique de mouse e toque passam pelo pointerdown. */
  const onSquareClick = (e: React.MouseEvent, square: string): void => {
    if (e.detail !== 0 || !mode) return
    if (selected && selected !== square && targetSet.has(square)) {
      commit(selected, square, 'click')
      return
    }
    if (movable.has(square)) {
      setSelected(selected === square ? null : square)
      return
    }
    setSelected(null)
  }

  // --- chegada do último lance ---------------------------------------------
  // A peça que chegou desliza da origem (e a torre, no roque). Uma decisão por
  // lance: a chave muda a cada lance novo, e o eco do servidor confirmando o
  // meu lance (mesma chave) não anima de novo.
  const animKey = lastMoveKey ?? lastMove
  // A posição de ANTES deste render: é nela que ainda estão as peças comidas
  // (o efeito só atualiza depois que o memo abaixo já leu).
  const prevSquaresRef = React.useRef(squares)
  React.useEffect(() => {
    prevSquaresRef.current = squares
  }, [squares])
  const { arrivals, eaten } = React.useMemo(() => {
    const arrivals = new Map<string, PieceMotion>()
    /** Peças comidas na dama: ficam na casa (já vazia) até a pedra passar e então somem. */
    const eaten = new Map<string, { piece: Piece; delay: number }>()
    if (!last) return { arrivals, eaten }
    const offset = (from: string, to: string): { dx: number; dy: number } | null => {
      const a = cells.indexOf(squareIndex(from))
      const b = cells.indexOf(squareIndex(to))
      if (a < 0 || b < 0) return null
      return { dx: (a % 8) - (b % 8), dy: Math.floor(a / 8) - Math.floor(b / 8) }
    }
    const motion = (from: string, to: string): void => {
      const o = offset(from, to)
      if (o) arrivals.set(to, o)
    }
    if (game === 'draughts' && lastMove?.includes('x')) {
      const path = movePath(lastMove)
      const hops = path.length - 1
      for (const c of capturedSquares(prevSquaresRef.current, lastMove)) {
        if (squares[squareIndex(c.square)]) continue
        // Some quando a pedra está no meio do salto que passa por cima dela.
        eaten.set(c.square, { piece: c.piece, delay: animateLast ? Math.round((c.hop + 0.5) * HOP_MS) : 0 })
      }
      if (animateLast) {
        const stops = path.map((s) => offset(s, last.to)).filter((s): s is { dx: number; dy: number } => !!s)
        if (stops.length === path.length) {
          arrivals.set(last.to, { ...stops[0], stops: hops > 1 ? stops : undefined, hopMs: HOP_MS })
        }
      }
      return { arrivals, eaten }
    }
    if (!animateLast) return { arrivals, eaten }
    motion(last.from, last.to)
    const king = squares[squareIndex(last.to)]
    if (game === 'chess' && king?.kind === 'k' && Math.abs(last.to.charCodeAt(0) - last.from.charCodeAt(0)) === 2) {
      const kingside = last.to[0] === 'g'
      motion(`${kingside ? 'h' : 'a'}${last.to[1]}`, `${kingside ? 'f' : 'd'}${last.to[1]}`)
    }
    return { arrivals, eaten }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma decisão por lance (a chave) e por lado
  }, [animKey, cells])

  // --- escolha (promoção ou caminho da dama) ---------------------------------
  let choiceStyle: React.CSSProperties | undefined
  let choiceUp = false
  if (choice) {
    const shown = cells.indexOf(squareIndex(choice.to))
    const row = Math.floor(shown / 8)
    const col = shown % 8
    choiceUp = row > 3
    choiceStyle = {
      ...(choiceUp ? { bottom: `${(7 - row) * 12.5}%` } : { top: `${row * 12.5}%` }),
      ...(choice.kind === 'path' && col >= 4 ? { right: `${(7 - col) * 12.5}%` } : { left: `${col * 12.5}%` })
    }
  }

  // --- setas -------------------------------------------------------------------
  const centerOf = (square: string): [number, number] => {
    const i = cells.indexOf(squareIndex(square))
    return [(i % 8) + 0.5, Math.floor(i / 8) + 0.5]
  }
  const preview =
    drawing && drawing.to && drawing.to !== drawing.from
      ? { from: drawing.from, to: drawing.to, paint: drawing.paint }
      : null

  const seated = !!(onMove || onPremove)

  return (
    <div className="board-caixa">
      <div className="board-moldura">
        <div aria-hidden className="board-coords board-coords--colunas">
          {files.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
        <div aria-hidden className="board-coords board-coords--fileiras">
          {ranks.map((r) => (
            <span key={r}>{r}</span>
          ))}
        </div>

        <div
          ref={gridRef}
          className={cn('board-grade', mode === 'premove' && 'board-grade--pre', seated && 'board-grade--viva')}
          role="group"
          aria-label={game === 'chess' ? 'Tabuleiro de xadrez' : 'Tabuleiro de dama'}
          onPointerDown={onPointerDown}
          onContextMenu={(e) => e.preventDefault()}
        >
          {cells.map((index) => {
            const name = squareName(index)
            const piece = squares[index]
            const row = Math.floor(index / 8)
            const col = index % 8
            const dark = (row + col) % 2 === 1
            const isTarget = targetSet.has(name)
            const grabbable = !!mode && !!piece && movable.has(name)
            const light = piece ? sideIsLight(game, variant, piece.side) : true
            const label = piece ? `${name}, ${pieceLabel(piece, light)}` : `${name}, vazia`
            const motion = piece ? arrivals.get(name) : undefined
            const gone = eaten.get(name)
            const mark = markBySquare.get(name)
            return (
              <button
                key={index}
                type="button"
                tabIndex={grabbable || isTarget ? 0 : -1}
                aria-disabled={!mode || undefined}
                aria-label={isTarget ? `${label}, ${mode === 'premove' ? 'pré-lance' : 'lance'} possível` : label}
                aria-pressed={selected === name}
                onClick={(e) => onSquareClick(e, name)}
                className={cn(
                  'board-casa',
                  dark && 'board-casa--escura',
                  (grabbable || isTarget) && 'board-casa--ativa',
                  grabbable && 'board-casa--pega',
                  last && (name === last.from || name === last.to) && 'board-casa--ultimo',
                  premoveSquares.has(name) && 'board-casa--pre',
                  selected === name && 'board-casa--escolhida',
                  isTarget && 'board-casa--destino',
                  isTarget && piece && 'board-casa--ocupada',
                  checkSquare === name && 'board-casa--xeque',
                  flash === name && 'board-casa--alerta',
                  dragFrom === name && 'board-casa--origem',
                  motion && 'board-casa--chegada'
                )}
              >
                {mark && <span aria-hidden className={cn('board-marca', `board-marca--${mark}`)} />}
                {piece &&
                  (motion ? (
                    <PieceGlyph key={`chega:${animKey}`} piece={piece} light={light} motion={motion} />
                  ) : (
                    <PieceGlyph piece={piece} light={light} />
                  ))}
                {!piece && gone && (
                  <PieceGlyph
                    key={`come:${animKey}`}
                    piece={gone.piece}
                    light={sideIsLight(game, variant, gone.piece.side)}
                    eatenDelay={gone.delay}
                  />
                )}
              </button>
            )
          })}

          {/* A mira do arrasto: posta e tirada pelo `paintAim` (data-mira), fora do React. */}
          <div ref={aimRef} aria-hidden className="board-mira" />

          {(arrows.length > 0 || preview) && (
            <svg className="board-setas" viewBox="0 0 8 8" aria-hidden focusable="false">
              {arrows.map((a) => (
                <ArrowShape key={`${a.from}${a.to}`} from={centerOf(a.from)} to={centerOf(a.to)} paint={a.paint} />
              ))}
              {preview && (
                <ArrowShape from={centerOf(preview.from)} to={centerOf(preview.to)} paint={preview.paint} preview />
              )}
            </svg>
          )}

          {choice && choiceStyle && (
            <div
              ref={choiceRef}
              className={cn(
                'board-escolha',
                choice.kind === 'promotion' ? 'board-escolha--promocao' : 'board-escolha--caminho',
                choiceUp && 'board-escolha--sobe'
              )}
              style={choiceStyle}
              role="group"
              aria-label={choice.kind === 'promotion' ? 'Promover para' : 'Escolha o caminho'}
              onPointerDown={(e) => {
                e.stopPropagation()
                // Botão direito na escolha desiste dela (e não marca a casa embaixo).
                if (e.button !== 2) return
                setChoice(null)
                setSelected(null)
              }}
            >
              {choice.kind === 'promotion'
                ? PROMOTION_ORDER.map((kind) => {
                    const m = choice.moves.find((x) => x.move.endsWith(kind))
                    if (!m) return null
                    return (
                      <button
                        key={kind}
                        type="button"
                        className="board-escolha-opcao"
                        aria-label={`Promover para ${CHESS_NAME[kind]}`}
                        onClick={() => fire(m.move, choice.how, choice.mode)}
                      >
                        <PieceGlyph
                          piece={{ side: choice.side, kind }}
                          light={sideIsLight(game, variant, choice.side)}
                        />
                      </button>
                    )
                  })
                : choice.moves.map((m) => (
                    <button
                      key={m.move}
                      type="button"
                      className="board-escolha-opcao"
                      onClick={() => fire(m.move, choice.how, choice.mode)}
                    >
                      {m.move.split(/[-x]/).join(' › ')}
                    </button>
                  ))}
              {choice.kind === 'promotion' && (
                <button
                  type="button"
                  className="board-escolha-cancela"
                  aria-label="Cancelar a promoção"
                  onClick={() => {
                    setChoice(null)
                    setSelected(null)
                  }}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {ghost &&
        createPortal(
          <div aria-hidden className="board-arrasto">
            <div
              ref={ghostRef}
              className="board-arrasto-peca"
              style={{
                width: ghost.size,
                height: ghost.size,
                transform: `translate(${ghost.x}px, ${ghost.y}px) translate(-50%, -50%)`
              }}
            >
              <PieceGlyph piece={ghost.piece} light={ghost.light} />
            </div>
          </div>,
          document.body
        )}
    </div>
  )
})

/**
 * Uma seta, em casas (viewBox 0 0 8 8). Sai do centro da origem e a ponta
 * para perto do centro do destino; no salto do cavalo faz o L (primeiro o
 * lado comprido). Haste e ponta num grupo com a opacidade no grupo: onde as
 * duas se encostam não escurece.
 */
function ArrowShape({
  from,
  to,
  paint,
  preview
}: {
  from: [number, number]
  to: [number, number]
  paint: Paint
  preview?: boolean
}) {
  const [x1, y1] = from
  const [x2, y2] = to
  const dx = x2 - x1
  const dy = y2 - y1
  const knight = (Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1)
  const corner: [number, number] | null = knight ? (Math.abs(dy) > Math.abs(dx) ? [x1, y2] : [x2, y1]) : null
  const [sx, sy] = corner ?? [x1, y1]
  const len = Math.hypot(x2 - sx, y2 - sy) || 1
  const ux = (x2 - sx) / len
  const uy = (y2 - sy) / len
  const HEAD = 0.42
  const HALF = 0.26
  const TIP_BACK = 0.1
  const tipX = x2 - ux * TIP_BACK
  const tipY = y2 - uy * TIP_BACK
  const baseX = tipX - ux * HEAD
  const baseY = tipY - uy * HEAD
  const r = (n: number): number => Math.round(n * 1000) / 1000
  const shaft = corner
    ? `M${r(x1)} ${r(y1)}L${r(corner[0])} ${r(corner[1])}L${r(baseX)} ${r(baseY)}`
    : `M${r(x1)} ${r(y1)}L${r(baseX)} ${r(baseY)}`
  const head = `${r(tipX)},${r(tipY)} ${r(baseX - uy * HALF)},${r(baseY + ux * HALF)} ${r(baseX + uy * HALF)},${r(baseY - ux * HALF)}`
  return (
    <g className={cn('board-seta', `board-seta--${paint}`, preview && 'board-seta--previa')}>
      <path d={shaft} />
      <polygon points={head} />
    </g>
  )
}
