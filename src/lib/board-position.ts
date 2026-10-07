/**
 * Leitura de posição e relógio do tabuleiro. Puro: sem React, sem '@/', pra
 * rodar no `node --test`. O servidor decide tudo (posição e lances legais);
 * aqui só se traduz o que ele mandou em casas, peças e tempo na tela.
 */

export type Piece = {
  side: 'white' | 'black'
  kind: 'p' | 'n' | 'b' | 'r' | 'q' | 'k' | 'man' | 'king'
}

const FILES = 'abcdefgh'

/** 0 -> 'a8', 63 -> 'h1' (fileira 8→1, coluna a→h). */
export function squareName(index: number): string {
  return `${FILES[index % 8]}${8 - Math.floor(index / 8)}`
}

export function squareIndex(name: string): number {
  return (8 - Number(name[1])) * 8 + FILES.indexOf(name[0])
}

/** 64 casas, índice 0 = a8, 63 = h1. */
export function parsePosition(game: 'chess' | 'draughts', position: string): Array<Piece | null> {
  const board: Array<Piece | null> = new Array(64).fill(null)
  if (game === 'chess') {
    const rows = position.split(' ')[0].split('/')
    for (let r = 0; r < 8 && r < rows.length; r++) {
      let c = 0
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') {
          c += Number(ch)
          continue
        }
        if (c > 7) break
        const lower = ch.toLowerCase()
        if ('pnbrqk'.includes(lower)) {
          board[r * 8 + c] = { side: ch === lower ? 'black' : 'white', kind: lower as Piece['kind'] }
        }
        c++
      }
    }
    return board
  }
  for (let i = 0; i < 64; i++) {
    const ch = position[i]
    if (ch === 'w') board[i] = { side: 'white', kind: 'man' }
    else if (ch === 'W') board[i] = { side: 'white', kind: 'king' }
    else if (ch === 'b') board[i] = { side: 'black', kind: 'man' }
    else if (ch === 'B') board[i] = { side: 'black', kind: 'king' }
  }
  return board
}

/**
 * Origem e destino de um lance. UCI (`e2e4`, `e7e8q`): dois primeiros e dois
 * seguintes. Dama (`c3-d4`, `c3xe5xg7`): primeira e última casa do caminho.
 */
export function moveEnds(move: string): { from: string; to: string } {
  if (move.includes('-') || move.includes('x')) {
    const squares = move.split(/[-x]/)
    return { from: squares[0], to: squares[squares.length - 1] }
  }
  return { from: move.slice(0, 2), to: move.slice(2, 4) }
}

/** Casas de origem que têm lance legal. */
export function movableSquares(legalMoves: string[]): Set<string> {
  return new Set(legalMoves.map((m) => moveEnds(m).from))
}

/** Lances legais que saem de `from`, com a casa final de cada um. */
export function movesFrom(legalMoves: string[], from: string): Array<{ move: string; to: string }> {
  const out: Array<{ move: string; to: string }> = []
  for (const move of legalMoves) {
    const ends = moveEnds(move)
    if (ends.from === from) out.push({ move, to: ends.to })
  }
  return out
}

/** Tempo restante agora, dado o retrato do servidor. */
export function clockNow(
  clocks: { white: number; black: number },
  clockAt: number,
  running: boolean,
  turn: 'white' | 'black',
  now: number
): { white: number; black: number } {
  if (!running) return { white: clocks.white, black: clocks.black }
  const spent = Math.max(0, now - clockAt)
  return { ...clocks, [turn]: Math.max(0, clocks[turn] - spent) }
}

/** '3:02'; abaixo de 10 s, com décimos: '0:09.4'. */
export function formatClock(ms: number): string {
  const safe = Math.max(0, ms)
  if (safe < 10_000) {
    const tenths = Math.floor(safe / 100)
    return `0:0${Math.floor(tenths / 10)}.${tenths % 10}`
  }
  const total = Math.floor(safe / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

// ============================================
// O que a tela desenha além da posição
// ============================================

/** Posição inicial de cada jogo: a mesa aparece montada antes da partida começar. */
export const START_POSITION: Record<'chess' | 'draughts', string> = {
  chess: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  draughts: '.b.b.b.b' + 'b.b.b.b.' + '.b.b.b.b' + '........' + '........' + 'w.w.w.w.' + '.w.w.w.w' + 'w.w.w.w. w'
}

type ChessKind = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

const CHESS_START: Record<ChessKind, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }
const CHESS_VALUE: Record<ChessKind, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
/** Ordem em que as capturadas aparecem na placa: da mais valiosa pra menos. */
const CAPTURE_ORDER: ChessKind[] = ['q', 'r', 'b', 'n', 'p']
const DRAUGHTS_START = 12

export interface Material {
  /** Peças do adversário que cada lado já tirou do tabuleiro, da mais valiosa pra menos. */
  captured: { white: Piece['kind'][]; black: Piece['kind'][] }
  /** Vantagem em pontos (peão 1, cavalo e bispo 3, torre 5, dama 9; na dama, pedra 1 e dama 2). Positivo = brancas na frente. */
  advantage: number
}

/**
 * O que cada lado já capturou, lido da posição atual contra a inicial. Uma
 * promoção faz a conta de "capturadas" de uma peça dar negativo; aí ela
 * simplesmente não aparece (a vantagem em pontos continua certa).
 */
export function material(game: 'chess' | 'draughts', position: string): Material {
  const squares = parsePosition(game, position)
  if (game === 'draughts') {
    let white = 0
    let black = 0
    let points = 0
    for (const piece of squares) {
      if (!piece) continue
      const value = piece.kind === 'king' ? 2 : 1
      if (piece.side === 'white') {
        white++
        points += value
      } else {
        black++
        points -= value
      }
    }
    return {
      captured: {
        white: new Array(Math.max(0, DRAUGHTS_START - black)).fill('man'),
        black: new Array(Math.max(0, DRAUGHTS_START - white)).fill('man')
      },
      advantage: points
    }
  }
  const count = { white: { ...CHESS_START }, black: { ...CHESS_START } }
  for (const kind of Object.keys(CHESS_START) as ChessKind[]) {
    count.white[kind] = 0
    count.black[kind] = 0
  }
  let points = 0
  for (const piece of squares) {
    if (!piece || piece.kind === 'man' || piece.kind === 'king') continue
    count[piece.side][piece.kind]++
    points += piece.side === 'white' ? CHESS_VALUE[piece.kind] : -CHESS_VALUE[piece.kind]
  }
  const taken = (victim: 'white' | 'black'): Piece['kind'][] => {
    const out: Piece['kind'][] = []
    for (const kind of CAPTURE_ORDER) {
      const missing = CHESS_START[kind] - count[victim][kind]
      for (let i = 0; i < missing; i++) out.push(kind)
    }
    return out
  }
  return { captured: { white: taken('black'), black: taken('white') }, advantage: points }
}

/** Letra da peça de promoção como se escreve em português (D, T, B, C). */
const PROMOTION_LETTER: Record<string, string> = { q: 'D', r: 'T', b: 'B', n: 'C' }

/** Lance como a lista mostra: 'e2e4' vira 'e2–e4', 'e7e8q' vira 'e7–e8=D'. Dama já vem legível. */
export function formatMove(game: 'chess' | 'draughts', move: string): string {
  if (game === 'draughts') return move
  const promotion = move[4] ? `=${PROMOTION_LETTER[move[4]] ?? move[4].toUpperCase()}` : ''
  return `${move.slice(0, 2)}–${move.slice(2, 4)}${promotion}`
}
