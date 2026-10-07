import * as React from 'react'
import { sideIsLight, type BoardGame, type DraughtsVariant, type Side } from '@/lib/api-board'
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
import { PieceGlyph, type PieceMotion } from './pieces'
import './board.css'

/**
 * O TABULEIRO — a moldura com as coordenadas gravadas e a grade 8×8,
 * desenhada a partir da posição e dos lances legais que o servidor mandou.
 * Nenhuma regra mora aqui: clicar numa peça com lance legal seleciona e
 * mostra os destinos; clicar num destino devolve o lance (`onMove`); o
 * servidor confere de novo.
 *
 * A cada lance novo a peça que chegou DESLIZA da origem até o destino: a
 * casa de chegada ganha `--dx/--dy` (em casas) e a peça nasce deslocada pra
 * trás (`.board-peca--anda`). Captura some na hora; só o que chega anda.
 *
 * Duas escolhas extras quando o destino não basta pra identificar o lance:
 * promoção no xadrez (quatro peças sobre a casa) e dama com mais de um
 * caminho até a mesma casa (um seletor com os caminhos).
 *
 * Sem `onMove` o tabuleiro é só leitura (e serve de enfeite no saguão).
 * Cada casa é um `button` com `aria-label` ("e4, peão branco", "e5,
 * vazia"), então dá pra jogar no teclado.
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

/** Opções de promoção, na ordem em que aparecem. */
const PROMOTIONS: Array<'q' | 'r' | 'b' | 'n'> = ['q', 'r', 'b', 'n']
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1']

interface Choice {
  to: string
  moves: Array<{ move: string; to: string }>
  kind: 'promotion' | 'path'
  /** Lado de quem promove (a cor das peças oferecidas). */
  side: Side
}

export const Board = React.memo(function Board({
  game,
  variant = null,
  position,
  orientation,
  legalMoves,
  lastMove,
  onMove
}: {
  game: BoardGame
  /** Na dama americana quem abre (white) tem as peças escuras. */
  variant?: DraughtsVariant | null
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

  // Posição ou lances novos: a seleção antiga não vale mais. A chave é o
  // CONTEÚDO dos lances: um array novo com os mesmos lances não derruba a seleção.
  const legalKey = legalMoves.join(',')
  React.useEffect(() => {
    setSelected(null)
    setChoice(null)
  }, [position, legalKey])

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
  const cells = React.useMemo(
    () => Array.from({ length: 64 }, (_, k) => (flipped ? 63 - k : k)),
    [flipped]
  )
  const files = flipped ? [...FILES].reverse() : FILES
  const ranks = flipped ? [...RANKS].reverse() : RANKS

  // A chegada do último lance: de quantas casas (na tela) a peça veio.
  const arrival = React.useMemo((): { to: string; motion: PieceMotion } | null => {
    if (!last) return null
    const from = cells.indexOf(squareIndex(last.from))
    const to = cells.indexOf(squareIndex(last.to))
    if (from < 0 || to < 0) return null
    return { to: last.to, motion: { dx: (from % 8) - (to % 8), dy: Math.floor(from / 8) - Math.floor(to / 8) } }
  }, [last, cells])

  // Casa de destino da escolha, em % da grade (de onde nasce o seletor).
  let choiceStyle: React.CSSProperties | undefined
  if (choice) {
    const shown = cells.indexOf(squareIndex(choice.to))
    const row = Math.floor(shown / 8)
    const col = shown % 8
    choiceStyle = {
      // Promoção: coluna de 4 casas, descendo da casa (ou subindo, se ela é de baixo).
      // Caminhos da dama: sobem a partir da casa quando ela está na metade de baixo
      // (a grade corta o que passa da borda).
      ...(choice.kind === 'path' && row > 3
        ? { bottom: `${(7 - row) * 12.5}%` }
        : { top: `${(choice.kind === 'promotion' && row > 3 ? row - 3 : row) * 12.5}%` }),
      ...(col >= 4 ? { right: `${(7 - col) * 12.5}%` } : { left: `${col * 12.5}%` })
    }
  }

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
          className="board-grade"
          role="group"
          aria-label={game === 'chess' ? 'Tabuleiro de xadrez' : 'Tabuleiro de dama'}
        >
          {cells.map((index) => {
            const name = squareName(index)
            const piece = squares[index]
            const row = Math.floor(index / 8)
            const col = index % 8
            const dark = (row + col) % 2 === 1
            const isTarget = targetSet.has(name)
            const clickable = interactive && (isTarget || (movable.has(name) && !!piece))
            const light = piece ? sideIsLight(game, variant, piece.side) : true
            const label = piece ? `${name}, ${pieceLabel(piece, light)}` : `${name}, vazia`
            const arriving = !!piece && arrival?.to === name
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
                  isTarget && piece && 'board-casa--ocupada',
                  arriving && 'board-casa--chegada'
                )}
              >
                {piece &&
                  (arriving ? (
                    // A chave muda com a posição: cada lance monta uma peça
                    // nova e a animação recomeça, mesmo caindo na mesma casa.
                    <PieceGlyph key={position} piece={piece} light={light} motion={arrival?.motion} />
                  ) : (
                    <PieceGlyph piece={piece} light={light} />
                  ))}
              </button>
            )
          })}

          {choice && choiceStyle && (
            <div
              ref={choiceRef}
              className={cn(
                'board-escolha',
                choice.kind === 'promotion' ? 'board-escolha--promocao' : 'board-escolha--caminho'
              )}
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
                        <PieceGlyph
                          piece={{ side: choice.side, kind }}
                          light={sideIsLight(game, variant, choice.side)}
                        />
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
      </div>
    </div>
  )
})
