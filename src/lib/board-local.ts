/**
 * O TABULEIRO NO LAUNCHER — o que a tela precisa saber além da posição que o
 * servidor manda. Puro: sem React, sem '@/', pra rodar no `node --test`.
 *
 * O servidor continua sendo a autoridade (legalidade, resultado, relógio).
 * Aqui ficam só coisas de TELA:
 *
 *  1. o pré-lance: pra onde uma peça PODE ir quando chegar a vez, pela
 *     geometria (sem saber o que o adversário vai fazer), e o tabuleiro "como
 *     vai ficar" com os pré-lances aplicados por cima;
 *  2. o lance otimista: a peça pousa na hora, antes do servidor confirmar;
 *  3. a história em SAN (Cf3, exd5, O-O, e8=D+), o xeque e o tipo de cada
 *     lance (pro som) — pela chess.js, a MESMA biblioteca do servidor, então
 *     a notação e o xeque batem com os dele.
 */

import { Chess, type Move } from 'chess.js'
import { parsePosition, squareIndex, START_POSITION, type Piece } from './board-position.ts'

type Side = 'white' | 'black'
type Game = 'chess' | 'draughts'

// ============================================
// Xadrez: tabuleiro de tela
// ============================================

/** O tabuleiro como a tela usa: 64 casas (0 = a8), roque e en passant. */
export interface ChessBoard {
  squares: Array<Piece | null>
  turn: Side
  /** Direitos de roque no formato do FEN ('KQkq'); vazio = nenhum. */
  castling: string
  /** Casa de en passant do FEN, ou null. */
  ep: string | null
}

export function readChess(fen: string): ChessBoard {
  const parts = fen.split(' ')
  return {
    squares: parsePosition('chess', fen),
    turn: parts[1] === 'b' ? 'black' : 'white',
    castling: parts[2] && parts[2] !== '-' ? parts[2] : '',
    ep: parts[3] && parts[3] !== '-' ? parts[3] : null
  }
}

export function writeChess(board: ChessBoard): string {
  const rows: string[] = []
  for (let r = 0; r < 8; r++) {
    let row = ''
    let empty = 0
    for (let c = 0; c < 8; c++) {
      const piece = board.squares[r * 8 + c]
      if (!piece) {
        empty++
        continue
      }
      if (empty) {
        row += empty
        empty = 0
      }
      row += piece.side === 'white' ? piece.kind.toUpperCase() : piece.kind
    }
    if (empty) row += empty
    rows.push(row)
  }
  return `${rows.join('/')} ${board.turn === 'white' ? 'w' : 'b'} ${board.castling || '-'} ${board.ep ?? '-'} 0 1`
}

const fileOf = (square: string): number => square.charCodeAt(0) - 97
const inside = (r: number, c: number): boolean => r >= 0 && r < 8 && c >= 0 && c < 8
const validSquare = (square: string): boolean => /^[a-h][1-8]$/.test(square)

/** Direito de roque que some quando a torre do canto sai (ou é tomada). */
const ROOK_CORNER_RIGHT: Record<string, string> = { a1: 'Q', h1: 'K', a8: 'q', h8: 'k' }

/**
 * Aplica o lance NO DESENHO, sem conferir regra: pré-lance pode ser ilegal
 * agora (e vira legal depois do lance do adversário). Move a peça, a torre no
 * roque, tira o peão no en passant (só se a casa bate com a do FEN) e promove.
 * Sem peça na origem, devolve o tabuleiro igual.
 */
export function forceChessMove(board: ChessBoard, uci: string): ChessBoard {
  const from = uci.slice(0, 2)
  const to = uci.slice(2, 4)
  if (!validSquare(from) || !validSquare(to)) return board
  const fromIndex = squareIndex(from)
  const toIndex = squareIndex(to)
  const piece = board.squares[fromIndex]
  if (!piece) return board

  const squares = board.squares.slice()
  if (piece.kind === 'p' && from[0] !== to[0] && !squares[toIndex] && board.ep === to) {
    squares[squareIndex(to[0] + from[1])] = null
  }
  if (piece.kind === 'k' && Math.abs(fileOf(to) - fileOf(from)) === 2) {
    const kingside = fileOf(to) > fileOf(from)
    const rookFrom = (kingside ? 'h' : 'a') + from[1]
    const rookTo = (kingside ? 'f' : 'd') + from[1]
    const rook = squares[squareIndex(rookFrom)]
    if (rook && rook.kind === 'r' && rook.side === piece.side) {
      squares[squareIndex(rookFrom)] = null
      squares[squareIndex(rookTo)] = rook
    }
  }
  squares[fromIndex] = null
  const promotion = uci[4]
  squares[toIndex] =
    promotion && piece.kind === 'p' && 'qrbn'.includes(promotion)
      ? { side: piece.side, kind: promotion as Piece['kind'] }
      : piece

  let castling = board.castling
  if (piece.kind === 'k') castling = castling.replace(piece.side === 'white' ? /[KQ]/g : /[kq]/g, '')
  for (const square of [from, to]) {
    const right = ROOK_CORNER_RIGHT[square]
    if (right) castling = castling.replace(right, '')
  }
  return { squares, turn: piece.side === 'white' ? 'black' : 'white', castling, ep: null }
}

const KNIGHT_JUMPS: ReadonlyArray<readonly [number, number]> = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]
]
const KING_STEPS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]
]
const ROOK_LINES: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const BISHOP_LINES: ReadonlyArray<readonly [number, number]> = [[-1, -1], [-1, 1], [1, -1], [1, 1]]

/** Ordem em que a escolha de promoção aparece (a do chess.com). */
export const PROMOTION_ORDER = ['q', 'n', 'r', 'b'] as const

/**
 * Pré-lances de uma peça: as casas que ela alcança pela GEOMETRIA, como no
 * chess.com. Peça do adversário no caminho não barra (ela pode sair); peça
 * MINHA barra e não pode ser destino (ela não sai antes do meu lance).
 * Peão: uma e duas casas pra frente e as duas diagonais. Rei: vizinhas e o
 * roque, se o direito ainda existe e a torre está no canto. Peão chegando na
 * última fileira volta um lance por peça de promoção.
 */
export function premoveMoves(board: ChessBoard, from: string, side: Side): Array<{ move: string; to: string }> {
  if (!validSquare(from)) return []
  const fromIndex = squareIndex(from)
  const piece = board.squares[fromIndex]
  if (!piece || piece.side !== side) return []
  const row = Math.floor(fromIndex / 8)
  const col = fromIndex % 8
  const mine = (r: number, c: number): boolean => board.squares[r * 8 + c]?.side === side
  const targets: number[] = []
  const add = (r: number, c: number): void => {
    if (inside(r, c) && !mine(r, c)) targets.push(r * 8 + c)
  }

  switch (piece.kind) {
    case 'p': {
      const dir = side === 'white' ? -1 : 1
      const startRow = side === 'white' ? 6 : 1
      if (inside(row + dir, col) && !mine(row + dir, col)) {
        targets.push((row + dir) * 8 + col)
        if (row === startRow && !mine(row + 2 * dir, col)) targets.push((row + 2 * dir) * 8 + col)
      }
      add(row + dir, col - 1)
      add(row + dir, col + 1)
      break
    }
    case 'n':
      for (const [dr, dc] of KNIGHT_JUMPS) add(row + dr, col + dc)
      break
    case 'k': {
      for (const [dr, dc] of KING_STEPS) add(row + dr, col + dc)
      const home = side === 'white' ? 7 : 0
      if (row === home && col === 4) {
        const [short, long] = side === 'white' ? ['K', 'Q'] : ['k', 'q']
        const rookAt = (c: number): boolean => {
          const rook = board.squares[home * 8 + c]
          return !!rook && rook.kind === 'r' && rook.side === side
        }
        if (board.castling.includes(short) && rookAt(7) && !mine(home, 5) && !mine(home, 6)) {
          targets.push(home * 8 + 6)
        }
        if (board.castling.includes(long) && rookAt(0) && !mine(home, 1) && !mine(home, 2) && !mine(home, 3)) {
          targets.push(home * 8 + 2)
        }
      }
      break
    }
    case 'b':
    case 'r':
    case 'q': {
      const lines =
        piece.kind === 'b' ? BISHOP_LINES : piece.kind === 'r' ? ROOK_LINES : [...ROOK_LINES, ...BISHOP_LINES]
      for (const [dr, dc] of lines) {
        let r = row + dr
        let c = col + dc
        while (inside(r, c) && !mine(r, c)) {
          targets.push(r * 8 + c)
          r += dr
          c += dc
        }
      }
      break
    }
    default:
      return []
  }

  const lastRow = side === 'white' ? 0 : 7
  const out: Array<{ move: string; to: string }> = []
  for (const index of targets) {
    const to = `${String.fromCharCode(97 + (index % 8))}${8 - Math.floor(index / 8)}`
    if (piece.kind === 'p' && Math.floor(index / 8) === lastRow) {
      for (const kind of PROMOTION_ORDER) out.push({ move: from + to + kind, to })
    } else {
      out.push({ move: from + to, to })
    }
  }
  return out
}

// ============================================
// Xadrez: regras de verdade (chess.js), só pra tela
// ============================================

/** Um lance já resolvido pelas regras. */
export interface ChessPly {
  move: string
  /** Notação algébrica em inglês (K Q R B N); a tela troca a letra pela figura. */
  san: string
  /** FEN depois do lance. */
  fen: string
  side: Side
  capture: boolean
  castle: boolean
  promotion: boolean
  check: boolean
  mate: boolean
}

function plyOf(uci: string, move: Move): ChessPly {
  return {
    move: uci,
    san: move.san,
    fen: move.after,
    side: move.color === 'w' ? 'white' : 'black',
    capture: move.flags.includes('c') || move.flags.includes('e'),
    castle: move.flags.includes('k') || move.flags.includes('q'),
    promotion: move.flags.includes('p'),
    check: move.san.endsWith('+') || move.san.endsWith('#'),
    mate: move.san.endsWith('#')
  }
}

const uciInput = (uci: string): { from: string; to: string; promotion?: string } => ({
  from: uci.slice(0, 2),
  to: uci.slice(2, 4),
  promotion: uci.length > 4 ? uci[4] : undefined
})

/** O lance a partir de uma posição, ou null se não for legal ali. */
export function describeChessMove(fen: string, uci: string): ChessPly | null {
  try {
    const game = new Chess(fen)
    return plyOf(uci, game.move(uciInput(uci)))
  } catch {
    return null
  }
}

/** Casa do rei em xeque (o do lado da vez), ou null. */
export function checkSquare(fen: string): string | null {
  try {
    const game = new Chess(fen)
    if (!game.inCheck()) return null
    return game.findPiece({ type: 'k', color: game.turn() })[0] ?? null
  } catch {
    return null
  }
}

// ============================================
// Dama: lance aplicado no desenho
// ============================================

/**
 * Aplica um lance de dama (`c3-d4`, `c3xe5xg7`) na posição de 64 casas: tira
 * as peças do adversário que ficam entre cada par de casas do caminho, move a
 * peça e promove quem termina na última fileira. É o lance que o servidor
 * acabou de aceitar como legal, então não confere regra.
 */
export function forceDraughtsMove(position: string, move: string): string {
  const [board, turn] = position.split(' ')
  if (!board || board.length !== 64) return position
  const squares = board.split('')
  const path = move.split(/[-x]/)
  if (path.length < 2 || !path.every(validSquare)) return position
  const indices = path.map(squareIndex)
  const piece = squares[indices[0]]
  if (piece === '.') return position
  const white = piece === 'w' || piece === 'W'
  const isEnemy = (c: string): boolean => (white ? c === 'b' || c === 'B' : c === 'w' || c === 'W')

  if (move.includes('x')) {
    for (let k = 1; k < indices.length; k++) {
      const a = indices[k - 1]
      const b = indices[k]
      const dr = Math.floor(b / 8) - Math.floor(a / 8)
      const dc = (b % 8) - (a % 8)
      if (Math.abs(dr) !== Math.abs(dc) || dr === 0) continue
      const sr = Math.sign(dr)
      const sc = Math.sign(dc)
      for (let step = 1; step < Math.abs(dr); step++) {
        const i = (Math.floor(a / 8) + sr * step) * 8 + (a % 8) + sc * step
        if (isEnemy(squares[i])) squares[i] = '.'
      }
    }
  }
  squares[indices[0]] = '.'
  const last = indices[indices.length - 1]
  const lastRow = Math.floor(last / 8)
  const promotes = (piece === 'w' && lastRow === 0) || (piece === 'b' && lastRow === 7)
  squares[last] = promotes ? piece.toUpperCase() : piece
  return squares.join('') + ' ' + (turn === 'w' ? 'b' : 'w')
}

// ============================================
// O que a tela desenha
// ============================================

/**
 * A posição da tela: a do servidor, mais o meu lance que ainda não voltou
 * (`afterPending`, que vale pro xeque), mais os pré-lances por cima
 * (`shown`, o que se desenha). Pré-lance só existe no xadrez.
 */
export function displayPosition(
  game: Game,
  position: string,
  pending: string | null,
  premoves: readonly string[]
): { afterPending: string; shown: string } {
  if (game === 'draughts') {
    const afterPending = pending ? forceDraughtsMove(position, pending) : position
    return { afterPending, shown: afterPending }
  }
  const afterPending = pending ? (describeChessMove(position, pending)?.fen ?? position) : position
  if (premoves.length === 0) return { afterPending, shown: afterPending }
  let board = readChess(afterPending)
  for (const premove of premoves) board = forceChessMove(board, premove)
  return { afterPending, shown: writeChess(board) }
}

/** Uma posição da história: o lance, como se escreve e a posição depois dele. */
export interface HistoryPly {
  move: string
  /** SAN no xadrez; a própria notação na dama. */
  text: string
  position: string
  side: Side
}

export interface History {
  start: string
  plies: HistoryPly[]
  /** Falso quando a reconstrução não bate com o servidor: aí a tela não navega. */
  complete: boolean
}

const placement = (position: string): string => position.split(' ')[0]

/**
 * Reconstrói a partida lance a lance, a partir da posição inicial. Confere o
 * fim contra a posição que o servidor mandou (só as casas): se não bater, a
 * história vem marcada como incompleta e a tela não deixa navegar.
 */
export function buildHistory(game: Game, moves: readonly string[], current: string): History {
  const start = START_POSITION[game]
  const plies: HistoryPly[] = []
  if (game === 'chess') {
    const chess = new Chess(start)
    for (const move of moves) {
      try {
        const ply = plyOf(move, chess.move(uciInput(move)))
        plies.push({ move, text: ply.san, position: ply.fen, side: ply.side })
      } catch {
        return { start, plies, complete: false }
      }
    }
  } else {
    let position = start
    moves.forEach((move, i) => {
      position = forceDraughtsMove(position, move)
      plies.push({ move, text: move, position, side: i % 2 === 0 ? 'white' : 'black' })
    })
  }
  const last = plies.length > 0 ? plies[plies.length - 1].position : start
  return { start, plies, complete: placement(last) === placement(current) }
}

/** O som de um lance que chegou: xeque, promoção, captura, roque ou lance simples. */
export type MoveSound = 'move' | 'capture' | 'castle' | 'check' | 'promote'

export function moveSound(game: Game, before: string, move: string): MoveSound {
  if (game === 'draughts') {
    // Promoveu = era pedra na origem e chegou dama no destino.
    const path = move.split(/[-x]/)
    const from = path[0]
    const to = path[path.length - 1]
    if (validSquare(from) && validSquare(to)) {
      const wasMan = 'wb'.includes(before[squareIndex(from)] ?? '')
      const isKing = 'WB'.includes(forceDraughtsMove(before, move)[squareIndex(to)] ?? '.')
      if (wasMan && isKing) return 'promote'
    }
    return move.includes('x') ? 'capture' : 'move'
  }
  const ply = describeChessMove(before, move)
  if (!ply) return 'move'
  if (ply.check) return 'check'
  if (ply.promotion) return 'promote'
  if (ply.capture) return 'capture'
  if (ply.castle) return 'castle'
  return 'move'
}
