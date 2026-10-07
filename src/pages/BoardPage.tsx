import * as React from 'react'
import type { BoardGame } from '@/lib/api-board'
import { useAuth } from '@/lib/auth-context'
import { amPlayer, useBoard } from '@/lib/board-context'
import { BackToHall } from '@/components/games/BackToHall'
import { BoardLobby } from '@/components/board/BoardLobby'
import { BoardTable } from '@/components/board/BoardTable'
import { BetPanel } from '@/components/board/BetPanel'
import { GameIcon } from '@/components/social/GameIcon'
import '@/components/board/board.css'

/**
 * XADREZ E DAMA — uma tela por jogo (`/xadrez`, `/dama`), do lado do pôquer.
 *
 * Mesma ideia do PokerPage: o estado mora no board-context, acima das rotas.
 * Sair da tela não tira ninguém da partida; quem só ASSISTIA sai da sala do
 * socket, pra não receber a mesa inteira a cada lance de uma tela que não
 * está vendo. Com mesa aberta deste jogo o cabeçalho some e a tela é dela.
 */

const TITLE: Record<BoardGame, string> = { chess: 'Xadrez', draughts: 'Dama', pool: 'Bilhar' }

export function BoardPage({ game }: { game: BoardGame }) {
  const { table, myTable, openTable, closeTable } = useBoard()
  const { user } = useAuth()

  const here = !!table && table.game === game

  // Tenho mesa deste jogo e nada aberto na tela: cai nela (voltar pra aba é
  // voltar pra partida, não pro saguão).
  React.useEffect(() => {
    if (myTable && myTable.game === game && !table) void openTable(myTable.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTable?.id, game])

  // Saindo da tela (ou trocando de jogo, que reaproveita esta instância):
  // quem só assistia sai da sala; jogador e host ficam (sair cancelaria a
  // mesa). Resultado antigo também fecha, pra não reaparecer na volta.
  // "Assistia" é `!amPlayer`: o host de mesa aberta/convite tem mySide null.
  const tableRef = React.useRef(table)
  tableRef.current = table
  const userIdRef = React.useRef(user?.id)
  userIdRef.current = user?.id
  const closeRef = React.useRef(closeTable)
  closeRef.current = closeTable
  React.useEffect(
    () => () => {
      const t = tableRef.current
      if (!t) return
      if (!amPlayer(t, userIdRef.current) || t.phase === 'finished') closeRef.current()
    },
    [game]
  )

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div aria-hidden className="board-sala" />

      {/* Cabeçalho só fora da mesa. */}
      {!here && (
        <header className="relative z-conteudo flex shrink-0 items-center gap-3 border-b border-line/70 px-4 py-3 sm:px-6">
          <GameIcon game={game} className="h-8 w-8 text-acid" />
          <div className="min-w-0 flex-1">
            <h1 className="title-brutal text-2xl leading-none">{TITLE[game]}</h1>
            <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">PvP valendo murchos</p>
          </div>
          <BackToHall />
        </header>
      )}

      {/* `key={game}`: trocar de jogo reinicia o estado interno do saguão. */}
      <div key={game} className="relative z-conteudo flex min-h-0 min-w-0 flex-1 flex-col">
        {here ? (
          <BoardTable>
            <BetPanel />
          </BoardTable>
        ) : (
          <BoardLobby game={game} />
        )}
      </div>
    </div>
  )
}
