import { useNavigate } from 'react-router-dom'
import { GameIcon as HallIcon } from '@/lib/bocas-icons'
import { countByActivity, countPokerPlayers } from '@/lib/game-hall'
import { isWeb } from '@/lib/platform'
import { usePoker } from '@/lib/poker-context'
import { useSocket } from '@/lib/socket-context'
import { GameCard } from '@/components/games/GameCard'

/**
 * SALÃO DE JOGOS — a porta de todos os jogos do launcher.
 *
 * Cada jogo continua na sua tela (`/jogo`, `/poker`, `/lol`); aqui só se vê
 * quem está em quê e se entra. A contagem vem do que os contextos já sabem —
 * presença de jogo (socket) e saguão do pôquer — então esta tela não busca
 * nada na API. Regras de contagem em lib/game-hall.ts.
 */
export function GameHallPage() {
  const navigate = useNavigate()
  const { activities } = useSocket()
  const { tables, goToPoker } = usePoker()

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-8">
        <header className="flex items-center gap-3">
          <HallIcon className="h-8 w-8 shrink-0 text-acid" />
          <div className="min-w-0">
            <h1 className="title-brutal text-2xl leading-none sm:text-3xl">Salão de jogos</h1>
            <p className="mt-1 text-xs text-muted-foreground">Quem está jogando o quê, e a porta de cada jogo.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <GameCard
            game="minecraft"
            // Na web esta tela não abre o jogo, só mostra o servidor: o nome
            // conta isso antes do clique (mesma regra que a barra usava).
            title={isWeb() ? 'Servidor' : 'Minecraft'}
            subtitle={isWeb() ? 'Estado do servidor de Minecraft' : 'Servidor do grupo'}
            online={countByActivity(activities, 'minecraft')}
            onEnter={() => navigate('/jogo')}
          />
          <GameCard
            game="poker"
            title="Pôquer"
            subtitle="Texas Hold'em valendo murchos"
            online={countPokerPlayers(tables)}
            onEnter={() => goToPoker()}
          />
          <GameCard
            game="lol"
            title="League of Legends"
            subtitle="Partidas e estatísticas do grupo"
            online={countByActivity(activities, 'lol')}
            onEnter={() => navigate('/lol')}
          />
        </div>
      </div>
    </div>
  )
}
