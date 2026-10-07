import { cn } from '@/lib/utils'
import type { OverlaySide, OverlayState } from '../../../electron/preload/types'
import { LevelTag, Medallion } from './parts'

/**
 * AS DUAS CARAS DA SOBREPOSIÇÃO FECHADA.
 *
 *   - `EdgeTab`: em partida. Fina, grudada na lateral que a pessoa escolheu,
 *     pra caber onde o HUD do jogo deixa livre.
 *   - `LogoTab`: fora de partida. A medalha da casa, metade escondida atrás da
 *     borda direita.
 *
 * As duas dizem a mesma coisa sem abrir: quem você é (nível), quanto falta pro
 * próximo (anel/barra de XP) e se há algo esperando (aposta aberta, aviso).
 * Quem as arrasta e quem as abre é a OverlayPage; elas só desenham.
 */

/** Quantas partidas do grupo ainda aceitam aposta minha. */
function openBets(state: OverlayState | null): number {
  return state?.targets.filter((t) => !t.myWager).length ?? 0
}

function xpProgress(state: OverlayState | null): number {
  if (!state?.ready || !state.nextLevelXp) return 0
  return state.levelXp / state.nextLevelXp
}

/**
 * A ABA DO JOGO.
 *
 * Era uma tira de 10px: nenhuma informação e quase nenhuma presença, e em jogo
 * com a borda poluída ela simplesmente não era vista — "a sobreposição não
 * aparece". Agora tem 32px, a logo e o nível; ainda é fina o bastante pra não
 * incomodar, e tão alta (≈100px) que se acha sem mirar.
 *
 * Encostar abre, clicar PRENDE aberta, arrastar muda de lugar (a OverlayPage
 * cuida dos três).
 */
export function EdgeTab({
  state,
  side,
  offset,
  expanded,
  pinned,
  dragging,
  onPointerDown
}: {
  state: OverlayState | null
  side: OverlaySide
  offset: number
  expanded: boolean
  pinned: boolean
  dragging: boolean
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
}) {
  const open = openBets(state)
  const ready = Boolean(state?.ready)
  const progress = xpProgress(state)

  return (
    <div
      data-overlay-hit
      onPointerDown={onPointerDown}
      title="Arraste pra mudar de lugar · clique pra prender aberto"
      style={{ top: `${offset * 100}%` }}
      className={cn(
        'absolute z-conteudo flex -translate-y-1/2 cursor-grab flex-col items-center gap-1.5 py-2',
        'border-line bg-void/95 shadow-neon-1 transition-[width,border-color] duration-150',
        dragging && 'cursor-grabbing',
        // Canto de fora reto e o de dentro arredondado: é o que faz a aba
        // parecer presa à tela em vez de flutuando.
        side === 'left'
          ? 'left-0 rounded-r-[10px] border-y border-r'
          : 'right-0 rounded-l-[10px] border-y border-l',
        expanded ? 'w-9 border-burn/70' : 'w-8',
        pinned && 'border-acid/70',
        open > 0 && !expanded && !pinned && 'ov-halo'
      )}
    >
      <img
        src="bocas-murchas-transp.png"
        alt="Bocas Murchas"
        draggable={false}
        className="h-[22px] w-[22px] select-none object-contain"
      />

      {ready && (
        <span
          title={`Nível ${state?.level}`}
          className="font-mono text-[11px] font-bold leading-none text-acid"
        >
          {state?.level}
        </span>
      )}

      {/* Quando há aposta esperando, o número dela; senão o XP, que sobe de
          baixo pra cima. Uma aba que pisca sem motivo vira ruído e a pessoa
          aprende a ignorar — por isso só a aposta chama atenção. */}
      {open > 0 ? (
        <span
          aria-label={`${open} pra apostar`}
          className="min-w-[18px] animate-pulse rounded-full bg-burn px-1 text-center font-mono text-[11px] font-bold leading-[18px] text-primary-foreground"
        >
          {open}
        </span>
      ) : (
        ready && (
          <span className="relative h-8 w-1 overflow-hidden rounded-full bg-line-strong" aria-hidden>
            <span
              className="absolute inset-x-0 bottom-0 rounded-full bg-acid transition-[height] duration-500"
              style={{ height: `${Math.round(progress * 100)}%` }}
            />
          </span>
        )
      )}
    </div>
  )
}

/**
 * A MEDALHA — a cara da sobreposição fora de partida.
 *
 * Metade escondida atrás da borda: presente sem ocupar a tela, e encostar o
 * mouse na borda naquela altura é o bastante pra ela sair inteira e o painel
 * abrir ao lado. Clicar prende aberto e arrastar muda de lugar (altura e
 * lado), igual à aba do jogo — com memória própria, porque o canto livre da
 * área de trabalho não é o canto livre do HUD.
 *
 * O anel de XP cresce pelo lado que aparece (ver `XpRing`, `mirrored`) e a
 * etiqueta de nível fica nesse mesmo lado: encolhida, metade da medalha está
 * fora da tela.
 *
 * Quem mede o ponteiro é o main, contra o retângulo que esta peça publica (ver
 * `useClickThrough`). A metade escondida fica fora da janela e não conta; a
 * folga de 24px do main é o que deixa encostar na borda sem mirar.
 */
export function LogoTab({
  state,
  side,
  offset,
  expanded,
  pinned,
  dragging,
  alerting,
  onPointerDown
}: {
  state: OverlayState | null
  side: OverlaySide
  offset: number
  expanded: boolean
  pinned: boolean
  dragging: boolean
  /** Tem notificação flutuando agora. */
  alerting: boolean
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
}) {
  const open = openBets(state)
  const ready = Boolean(state?.ready)
  const calling = open > 0 || alerting
  const left = side === 'left'
  // Encolhida, metade pra fora da tela; aberta, inteira e desencostada da
  // borda. É transform, e não `left`/`right`, pra deslizar sem layout.
  const slide = expanded ? (left ? '0.5rem' : '-0.5rem') : left ? '-50%' : '50%'

  return (
    <div
      data-overlay-hit
      onPointerDown={onPointerDown}
      title="Arraste pra mudar de lugar · clique pra prender aberto"
      style={{
        top: `${offset * 100}%`,
        transform: `translate(${slide}, -50%)`
      }}
      className={cn(
        'absolute z-conteudo h-[60px] w-[60px] cursor-grab rounded-full',
        left ? 'left-0' : 'right-0',
        'bg-void/95 shadow-neon-1 transition-transform duration-200 ease-out',
        dragging && 'cursor-grabbing',
        calling && !expanded && 'ov-halo'
      )}
    >
      <Medallion
        size={60}
        mirrored={!left}
        progress={xpProgress(state)}
        className={cn(
          'rounded-full transition-opacity',
          !ready && 'opacity-70',
          pinned && 'drop-shadow-[0_0_6px_rgb(var(--neon-rgb)/0.6)]'
        )}
      />

      {/* No lado que aparece — com a medalha encolhida, o da borda está fora. */}
      {ready && (
        <LevelTag
          level={state?.level ?? 1}
          className={cn('absolute -bottom-0.5', left ? 'right-0.5' : 'left-0.5')}
        />
      )}

      {calling && (
        <span
          aria-label={open > 0 ? `${open} pra apostar` : 'notificação nova'}
          className={cn(
            'absolute top-0.5 h-2.5 w-2.5 animate-pulse rounded-full border border-void bg-burn',
            left ? 'right-0.5' : 'left-0.5'
          )}
        />
      )}
    </div>
  )
}
