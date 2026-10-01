import * as React from 'react'
import { X, ScrollText } from 'lucide-react'
import { BetIcon, MedalIcon, ShopIcon, TrophyIcon } from '@/lib/bocas-icons'
import type { IconComponent } from '@/lib/icon-component'
import { cn } from '@/lib/utils'
import { useLayout } from '@/lib/layout-context'
import { useGamification } from '@/lib/gamification-context'

/**
 * A ARENA — o que era o painel "Ranking", repartido.
 *
 * Um painel só de 288px carregava meu card, três botões (lojinha, conquistas,
 * recap), a tabela com 7 métricas e as partidas ao vivo pra apostar. Cada
 * assunto desses tem uma pergunta própria ("quem lidera?", "tem partida pra
 * apostar?", "como foi a semana?") e agora tem uma entrada própria na barra
 * de canais (ArenaSection) e o seu painel (LeaderboardPanel, WagersPanel,
 * RecapPanel). Lojinha e conquistas continuam modais (overlay-context).
 *
 * Aqui mora o que os três painéis têm em comum: o catálogo de ícone e nome
 * (pra barra, o Ctrl+K e os painéis desenharem o MESMO símbolo pra mesma
 * coisa), o cabeçalho e a fileira de abas que troca de painel sem voltar à
 * barra — no celular a barra é uma tela inteira, e ir e voltar por ela pra
 * sair do ranking e cair nas apostas é um passeio.
 */

export type ArenaItem = 'ranking' | 'wagers' | 'achievements' | 'shop' | 'recap'

export const ARENA_ICON: Record<ArenaItem, IconComponent> = {
  ranking: TrophyIcon,
  wagers: BetIcon,
  achievements: MedalIcon,
  shop: ShopIcon,
  recap: ScrollText
}

export const ARENA_LABEL: Record<ArenaItem, string> = {
  ranking: 'Ranking',
  wagers: 'Apostas',
  achievements: 'Conquistas',
  shop: 'Lojinha',
  recap: 'Recap'
}

/** Os três que ocupam a coluna da direita (os outros dois são modais). */
export type ArenaPanel = Extract<ArenaItem, 'ranking' | 'wagers' | 'recap'>

/**
 * Quantas PARTIDAS estão abertas pra aposta. `liveGames` traz um board por
 * sessão, e um 5-stack são cinco boards da mesma partida — contar boards
 * dizia "5 ao vivo" pra uma partida só.
 */
export function useLiveMatchCount(): number {
  const { liveGames } = useGamification()
  return React.useMemo(
    () => new Set(liveGames.map((g) => g.matchId ?? g.session.id)).size,
    [liveGames]
  )
}

export function ArenaHeader({
  title,
  onClose,
  children
}: {
  title: string
  onClose: () => void
  /** Botões à direita do título, antes do fechar. */
  children?: React.ReactNode
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
      <h3 className="min-w-0 flex-1 truncate font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      {children}
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </header>
  )
}

export function ArenaTabs({ current }: { current: ArenaPanel }) {
  const { openLeaderboard, openWagers, openRecap } = useLayout()
  const live = useLiveMatchCount()

  const tabs: Array<{ id: ArenaPanel; go: () => void; count?: number }> = [
    { id: 'ranking', go: openLeaderboard },
    { id: 'wagers', go: openWagers, count: live },
    { id: 'recap', go: openRecap }
  ]

  return (
    <div role="tablist" aria-label="Arena" className="grid shrink-0 grid-cols-3 gap-1 border-b border-line p-2">
      {tabs.map(({ id, go, count }) => {
        const Icon = ARENA_ICON[id]
        const active = id === current
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (!active) go()
            }}
            className={cn(
              'relative flex items-center justify-center gap-1.5 rounded-brutal border px-2 py-1.5 text-xs transition-colors',
              active
                ? 'border-acid/60 bg-acid/10 text-acid'
                : 'border-transparent text-muted-foreground hover:bg-void-light hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{ARENA_LABEL[id]}</span>
            {/* No canto, e não na linha: a 288px a aba tem ~90px, e o chip
                inline comia o rótulo ("A…"). */}
            {!!count && count > 0 && <LiveCount count={count} className="absolute -right-1 -top-1.5" />}
          </button>
        )
      })}
    </div>
  )
}

/**
 * "N ao vivo": ponto vermelho pulsando + número. O mesmo chip na aba, na
 * linha da barra de canais e no Ctrl+K — partida aberta é a única coisa da
 * Arena que tem pressa, e tem que parecer a mesma pressa em todo lugar.
 */
export function LiveCount({ count, className }: { count: number; className?: string }) {
  return (
    <span
      title={`${count} ${count === 1 ? 'partida' : 'partidas'} ao vivo`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-1.5 font-mono text-[11px] font-bold leading-4 text-destructive',
        className
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
      {count}
    </span>
  )
}
