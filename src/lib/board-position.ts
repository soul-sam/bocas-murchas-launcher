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
