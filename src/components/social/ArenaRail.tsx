import * as React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Flame } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu'
import { Hint } from '@/components/ui/tooltip'
import { formatCompact } from '@/lib/api-gamification'
import { useLayout } from '@/lib/layout-context'
import { useOverlays } from '@/lib/overlay-context'
import { useGamification } from '@/lib/gamification-context'
import { cn } from '@/lib/utils'
import { ARENA_ICON, ARENA_LABEL, LiveCount, useLiveMatchCount, type ArenaItem } from './ArenaChrome'

/**
 * A ARENA NA BARRA DE ÍCONES — o troféu e, embaixo dele, o que morava atrás
 * dele.
 *
 * Era um troféu só, abrindo um painel com meu card, três botões (lojinha,
 * conquistas, recap), a tabela e as apostas. Quem não sabia que atrás do
 * troféu havia lojinha nunca achava a lojinha. Agora são cinco ícones em
 * coluna, com a mesma cara dos de cima: Ranking (o troféu, com o nível),
 * Apostas (com a contagem de partidas abertas), Conquistas, Lojinha (com os
 * murchos) e Recap. Os três primeiros estados vivem na coluna da direita da
 * tela social (layout-context); conquistas e lojinha são modais.
 *
 * NO CELULAR a barra deita no rodapé e não cabem mais cinco ícones: o troféu
 * vira um menu com os mesmos cinco, nome e número ao lado. Um toque a mais,
 * mas com rótulo — numa barra de 360px, cinco ícones sem nome seriam adivinhação.
 */

const RAIL_BUTTON = 'alvo-dedo relative rounded-brutal p-2.5 transition-colors'
const RAIL_ACTIVE = 'bg-acid/10 text-acid shadow-[inset_2px_0_0_hsl(var(--acid))]'
const RAIL_IDLE = 'text-muted-foreground hover:bg-void-light hover:text-foreground'

interface Item {
  id: ArenaItem
  active: boolean
  run: () => void
  hint: string
  /** Pílula no canto do ícone (nível, murchos, partidas ao vivo). */
  badge?: React.ReactNode
  /** O mesmo dado, escrito, pro menu do celular. */
  meta?: React.ReactNode
}

export function ArenaRail() {
  const { profile } = useGamification()
  const live = useLiveMatchCount()
  const {
    isPhone,
    leaderboardOpen,
    wagersOpen,
    recapOpen,
    toggleLeaderboard,
    toggleWagers,
    toggleRecap,
    openLeaderboard,
    openWagers,
    openRecap
  } = useLayout()
  const { openShop, openAchievements, shopOpen, achievementsOpen } = useOverlays()
  const navigate = useNavigate()
  const onSocial = useLocation().pathname === '/'

  /**
   * Painel da coluna direita: na tela social alterna; de outra aba (Minecraft,
   * impressora) vai pra social e ABRE — abrir um painel que a pessoa não vê é
   * a mesma coisa que não fazer nada.
   */
  const panel = (toggle: () => void, open: () => void) => (): void => {
    if (onSocial) toggle()
    else {
      navigate('/')
      open()
    }
  }

  const streak = profile?.streak ?? 0

  const items: Item[] = [
    {
      id: 'ranking',
      active: leaderboardOpen && onSocial,
      run: panel(toggleLeaderboard, openLeaderboard),
      hint: 'Quem lidera a semana e desde sempre, em XP, murchos, vitórias e mais.',
      badge: profile && <Pill tone="level">{profile.level}</Pill>,
      meta: profile && <span className="font-mono text-[11.5px] text-muted-foreground">nível {profile.level}</span>
    },
    {
      id: 'wagers',
      active: wagersOpen && onSocial,
      run: panel(toggleWagers, openWagers),
      hint: 'Partidas ao vivo pra apostar murchos, com a pool e o pote da casa.',
      badge: live > 0 && (
        <Pill tone="urgent" corner="top">
          {live}
        </Pill>
      ),
      meta: live > 0 && <LiveCount count={live} />
    },
    {
      id: 'achievements',
      active: achievementsOpen,
      run: () => openAchievements(),
      hint: 'Todas as badges, quem tem cada uma e o placar de colecionador.',
      meta: profile && profile.badges.length > 0 && (
        <span className="font-mono text-[11.5px] text-muted-foreground">{profile.badges.length}</span>
      )
    },
    {
      id: 'shop',
      active: shopOpen,
      run: openShop,
      hint: 'Títulos, molduras, efeitos e sons, pagos em murchos.',
      badge: profile && <Pill tone="burn">{formatCompact(profile.coins)}</Pill>,
      meta: profile && <span className="font-mono text-[11.5px] text-burn">{formatCompact(profile.coins)}</span>
    },
    {
      id: 'recap',
      active: recapOpen && onSocial,
      run: panel(toggleRecap, openRecap),
      hint: 'O recap da semana, as anteriores e a retrospectiva do ano.'
    }
  ]

  if (isPhone) {
    const Trophy = ARENA_ICON.ranking
    const anyActive = items.some((item) => item.active)
    return (
      <>
        {/* modal={false} pelo mesmo motivo do menu de status na barra de
            canais: menu modal do Radix tranca o <body>, e daqui abrem outras
            camadas (lojinha, conquistas). Ver lib/interaction-guard.ts. */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Arena"
              title="Arena: ranking, apostas, conquistas, lojinha e recap"
              className={cn(RAIL_BUTTON, anyActive ? RAIL_ACTIVE : RAIL_IDLE)}
            >
              <Trophy className="h-5 w-5" />
              {profile && <Pill tone="level">{profile.level}</Pill>}
              {live > 0 && <Pill tone="urgent" corner="top">{live}</Pill>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" className="w-52">
            <DropdownMenuLabel>Arena</DropdownMenuLabel>
            {items.map((item) => {
              const Icon = ARENA_ICON[item.id]
              return (
                <DropdownMenuItem key={item.id} onSelect={item.run} className={cn(item.active && 'text-acid')}>
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="flex-1">{ARENA_LABEL[item.id]}</span>
                  {item.meta}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <StreakFlame streak={streak} />
      </>
    )
  }

  return (
    <>
      {/* Um risco separa a Arena das abas de cima (social, jogo, impressora):
          aquelas trocam a TELA; estas abrem coisas dentro dela. */}
      <span aria-hidden className="my-1 h-px w-8 shrink-0 bg-surface-raised" />

      {items.map((item) => {
        const Icon = ARENA_ICON[item.id]
        return (
          <React.Fragment key={item.id}>
            <Hint label={ARENA_LABEL[item.id]} description={item.hint} side="right">
              <button
                type="button"
                aria-label={ARENA_LABEL[item.id]}
                aria-pressed={item.active}
                onClick={item.run}
                className={cn(RAIL_BUTTON, item.active ? RAIL_ACTIVE : RAIL_IDLE)}
              >
                <Icon className="h-5 w-5" />
                {item.badge}
              </button>
            </Hint>
            {/* O streak fica colado no troféu, como sempre esteve. */}
            {item.id === 'ranking' && <StreakFlame streak={streak} />}
          </React.Fragment>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------------------

/**
 * Pílula no canto do ícone. `level` e `burn` são ESTADO (embaixo, à direita,
 * fundo escuro); `urgent` é AVISO (em cima, vermelho chapado) — a mesma
 * convenção das menções no ícone do social.
 */
function Pill({
  children,
  tone,
  corner = 'bottom'
}: {
  children: React.ReactNode
  tone: 'level' | 'burn' | 'urgent'
  corner?: 'top' | 'bottom'
}) {
  return (
    <span
      className={cn(
        'absolute -right-0.5 min-w-4 rounded-full border px-1 text-center font-mono text-[11px] font-bold leading-4',
        corner === 'top' ? '-top-0.5' : '-bottom-0.5',
        tone === 'level' && 'border-acid-dark bg-void text-foreground',
        tone === 'burn' && 'border-burn/60 bg-void text-burn',
        tone === 'urgent' && 'border-void bg-destructive text-dirty-white'
      )}
    >
      {children}
    </span>
  )
}

/** Streak só a partir de 2: "1" é qualquer um que abriu o app hoje. */
function StreakFlame({ streak }: { streak: number }) {
  if (streak < 2) return null
  return (
    <span
      title={`Streak de check-in: ${streak} dias seguidos`}
      className="flex items-center gap-0.5 rounded-brutal px-1 font-mono text-[11.5px] font-bold text-burn"
    >
      <Flame className="h-3 w-3" aria-hidden />
      {streak}
    </span>
  )
}
