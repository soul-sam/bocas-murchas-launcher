import { BackToHall } from '@/components/games/BackToHall'
import { GameIcon } from '@/components/social/GameIcon'
import { LolPanel } from '@/components/social/lol/LolPanel'

/**
 * O LOL COMO TELA.
 *
 * O painel é o mesmo do canal de LoL do chat (components/social/lol/LolPanel),
 * que continua lá. Aqui ele ganha a área inteira e um endereço próprio, que é
 * o que o card do Salão de jogos abre. Nada de estado novo: o painel busca e
 * filtra sozinho.
 */
export function LolPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-line/70 px-4 py-3 sm:px-6">
        <GameIcon game="lol" className="h-8 w-8 shrink-0 text-acid" />
        <div className="min-w-0 flex-1">
          <h1 className="title-brutal text-2xl leading-none">League of Legends</h1>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
            Partidas, campeões e padrões do grupo
          </p>
        </div>
        <BackToHall />
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <LolPanel />
      </div>
    </div>
  )
}
