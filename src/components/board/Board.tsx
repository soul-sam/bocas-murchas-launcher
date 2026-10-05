import * as React from 'react'
import type { BoardGame, Side } from '@/lib/api-board'
import {
  movableSquares,
  moveEnds,
  movesFrom,
  parsePosition,
  squareIndex,
  squareName,
  type Piece
} from '@/lib/board-position'
import { cn } from '@/lib/utils'
import { PieceGlyph } from './pieces'
import './board.css'

/**
 * O TABULEIRO — 8×8 quadrado, desenhado a partir da posição e dos lances
 * legais que o servidor mandou. Nenhuma regra mora aqui: clicar numa peça com
 * lance legal seleciona e mostra os destinos; clicar num destino devolve o
 * lance (`onMove`); o servidor confere de novo.
 *
 * Duas escolhas extras quando o destino não basta pra identificar o lance:
 * promoção no xadrez (quatro peças sobre a casa) e dama com mais de um
 * caminho até a mesma casa (um seletor com os caminhos).
 *
 * Sem `onMove` o tabuleiro é só leitura. Cada casa é um `button` com
 * `aria-label` ("e4, peão branco", "e5, vazia"), então dá pra jogar no teclado.
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

function pieceLabel(piece: Piece): string {
  const name =
    piece.kind === 'man' ? 'pedra' : piece.kind === 'king' ? 'dama' : (CHESS_NAME[piece.kind] ?? piece.kind)
  const color = piece.side === 'white' ? 'branc' : 'pret'
  return `${name} ${color}${FEMININE.has(piece.kind) ? 'a' : 'o'}`
}

/** Opções de promoção, na ordem em que aparecem. */
const PROMOTIONS: Array<'q' | 'r' | 'b' | 'n'> = ['q', 'r', 'b', 'n']

interface Choice {
  to: string
  moves: Array<{ move: string; to: string }>
  kind: 'promotion' | 'path'
  /** Lado de quem promove (a cor das peças oferecidas). */
  side: Side
}

export function Board({
  game,
  position,
  orientation,
  legalMoves,
  lastMove,
  onMove
}: {
  game: BoardGame
  position: string
  /** De que lado se vê: pretas embaixo quando 'black'. */
  orientation: Side
  legalMoves: string[]
  lastMove: string | null
  /** Sem isto o tabuleiro é só leitura. */
  onMove?: (move: string) => void
}) {
  const [selected, setSelected] = React.useState<string | null>(null)
  const [choice, setChoice] = React.useState<Choice | null>(null)

  const squares = React.useMemo(() => parsePosition(game, position), [game, position])
  const movable = React.useMemo(() => movableSquares(legalMoves), [legalMoves])
  const targets = React.useMemo(
    () => (selected ? movesFrom(legalMoves, selected) : []),
    [legalMoves, selected]
  )
  const targetSet = React.useMemo(() => new Set(targets.map((t) => t.to)), [targets])
  const last = React.useMemo(() => (lastMove ? moveEnds(lastMove) : null), [lastMove])

  // Posição ou lances novos: a seleção antiga não vale mais.
  React.useEffect(() => {
    setSelected(null)
    setChoice(null)
  }, [position, legalMoves])

  const interactive = !!onMove

  // Seletor aberto: o foco vai pra primeira opção e Esc fecha tudo.
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

  const play = (move: string): void => {
    setSelected(null)
    setChoice(null)
    onMove?.(move)
  }

  const clickSquare = (name: string, index: number): void => {
    if (!interactive) return
    if (selected && targetSet.has(name)) {
      const moves = targets.filter((t) => t.to === name)
      if (moves.length === 1) return play(moves[0].move)
      const promotion = game === 'chess' && moves.every((m) => m.move.length === 5)
      const piece = squares[squareIndex(selected)]
      setChoice({ to: name, moves, kind: promotion ? 'promotion' : 'path', side: piece?.side ?? 'white' })
      return
    }
    setChoice(null)
    // Peça com lance legal: seleciona (ou troca de seleção; a mesma desseleciona).
    if (movable.has(name) && squares[index]) {
      setSelected(selected === name ? null : name)
      return
    }
    setSelected(null)
  }

  // Ordem de desenho: de baixo pra cima como o jogador vê. Pretas embaixo
  // giram o tabuleiro 180°.
  const flipped = orientation === 'black'
  const cells = Array.from({ length: 64 }, (_, k) => (flipped ? 63 - k : k))

  // Casa de destino da escolha, em % da grade (de onde nasce o seletor).
  let choiceStyle: React.CSSProperties | undefined
  if (choice) {
    const shown = cells.indexOf(squareIndex(choice.to))
    const row = Math.floor(shown / 8)
    const col = shown % 8
    choiceStyle = {
      // Promoção: coluna de 4 casas, descendo da casa (ou subindo, se ela é de baixo).
      top: `${(choice.kind === 'promotion' && row > 3 ? row - 3 : row) * 12.5}%`,
      ...(col >= 4 ? { right: `${(7 - col) * 12.5}%` } : { left: `${col * 12.5}%` })
    }
  }

  return (
    <div className="board-grade" role="group" aria-label={game === 'chess' ? 'Tabuleiro de xadrez' : 'Tabuleiro de dama'}>
      {cells.map((index, k) => {
        const name = squareName(index)
        const piece = squares[index]
        const row = Math.floor(index / 8)
        const col = index % 8
        const dark = (row + col) % 2 === 1
        const isTarget = targetSet.has(name)
        const clickable = interactive && (isTarget || (movable.has(name) && !!piece))
        const label = piece ? `${name}, ${pieceLabel(piece)}` : `${name}, vazia`
        return (
          <button
            key={index}
            type="button"
            disabled={!interactive}
            aria-label={isTarget ? `${label}, lance possível` : label}
            aria-pressed={selected === name}
            onClick={() => clickSquare(name, index)}
            className={cn(
              'board-casa',
              dark && 'board-casa--escura',
              clickable && 'board-casa--ativa',
              last && (name === last.from || name === last.to) && 'board-casa--ultimo',
              selected === name && 'board-casa--escolhida',
              isTarget && 'board-casa--destino',
              isTarget && piece && 'board-casa--ocupada'
            )}
          >
            {/* Coordenadas só na borda de baixo (colunas) e na da esquerda (fileiras). */}
            {Math.floor(k / 8) === 7 && (
              <span aria-hidden className="board-coord board-coord--coluna">
                {name[0]}
              </span>
            )}
            {k % 8 === 0 && (
              <span aria-hidden className="board-coord board-coord--fileira">
                {name[1]}
              </span>
            )}
            {piece && <PieceGlyph piece={piece} />}
          </button>
        )
      })}

      {choice && choiceStyle && (
        <div
          ref={choiceRef}
          className={cn('board-escolha', choice.kind === 'promotion' ? 'board-escolha--promocao' : 'board-escolha--caminho')}
          style={choiceStyle}
          role="group"
          aria-label={choice.kind === 'promotion' ? 'Promover para' : 'Escolha o caminho'}
        >
          {choice.kind === 'promotion'
            ? PROMOTIONS.map((kind) => {
                const m = choice.moves.find((x) => x.move.endsWith(kind))
                if (!m) return null
                return (
                  <button
                    key={kind}
                    type="button"
                    className="board-escolha-opcao"
                    aria-label={`Promover para ${CHESS_NAME[kind]}`}
                    onClick={() => play(m.move)}
                  >
                    <PieceGlyph piece={{ side: choice.side, kind }} />
                  </button>
                )
              })
            : choice.moves.map((m) => (
                <button key={m.move} type="button" className="board-escolha-opcao" onClick={() => play(m.move)}>
                  {m.move.split(/[-x]/).join(' › ')}
                </button>
              ))}
        </div>
      )}
    </div>
  )
}
