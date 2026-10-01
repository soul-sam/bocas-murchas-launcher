import * as React from 'react'
import { ChevronLeft, ChevronRight, Music, PhoneOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OverlaySound, OverlayVoice } from '../../../electron/preload/types'
import { IconButton, shortKey } from './parts'
import { send } from './Panel'

/** Gomos por volta. Mais que isso e nem um anel maior separa os nomes. */
const WHEEL_SLOTS = 12
/** Largura de um gomo, em px. Espelha o `w-[7rem]` lá embaixo. */
const SLOT_WIDTH = 112
/**
 * Raio do anel, em px.
 *
 * O aperto NÃO é o perímetro, é o topo e a base da roda: lá os gomos ficam
 * lado a lado, e o que os separa é só a distância HORIZONTAL entre eles. Pro
 * gomo do topo e o vizinho, ela vale `R·cos(90° − 360°/N)` — com 12 gomos, um
 * quinto a menos que o vão calculado pelo perímetro.
 *
 * A 196px isso dava 98px de vão pra gomos de 112px, e eles se montavam uns por
 * cima dos outros no topo e na base. 252 dá 126px — 14 de folga. A roda inteira
 * fica em 624px, que cabe deitada até em 720p. NÃO MEXA sem refazer a conta.
 */
const WHEEL_RADIUS = 252
/** Meia-largura de um gomo, pra caixa da roda caber ele inteiro. */
const SLOT_HALF = SLOT_WIDTH / 2 + 4
const WHEEL_BOX = (WHEEL_RADIUS + SLOT_HALF) * 2

/**
 * A RODA — os sons do servidor em volta de um miolo, no meio da tela.
 *
 * Por que roda e não grade: a grade do launcher é pra ESCOLHER som (tem busca,
 * categoria, edição). Esta é pra ACERTAR som com o jogo rodando, e o que
 * importa aí é a distância do ponteiro até o alvo. Numa roda todo gomo fica à
 * mesma distância do centro da tela, sempre no mesmo ângulo — dá pra decorar
 * "o berro fica embaixo à esquerda" e parar de ler.
 *
 * O MIOLO acompanha o ponteiro: passou por um gomo, o emoji e o nome dele vêm
 * pro centro, grandes — dá pra confirmar o som sem ler a etiqueta pequena.
 *
 * Ela FECHA ao escolher, de propósito: é um gesto, não um painel. Quem quer
 * dois sons seguidos aperta o atalho de novo, que é o mesmo dedo. E, sem
 * teclado nesta janela, o atalho é também a única saída — por isso nada aqui
 * pode prender o ponteiro.
 *
 * O vão entre os gomos NÃO tem `data-overlay-hit`: o clique que erra o gomo
 * vai pro jogo, como sempre.
 */
export function SoundWheel({
  sounds,
  voice
}: {
  sounds: OverlaySound[]
  voice: OverlayVoice | null
}) {
  const [page, setPage] = React.useState(0)
  const [hovered, setHovered] = React.useState<OverlaySound | null>(null)

  const pages = Math.max(1, Math.ceil(sounds.length / WHEEL_SLOTS))
  // A lista pode ENCOLHER com a roda aberta (alguém apagou um som lá no
  // launcher) e deixar a página atual sem existir.
  const current = Math.min(page, pages - 1)
  const slice = sounds.slice(current * WHEEL_SLOTS, current * WHEEL_SLOTS + WHEEL_SLOTS)

  /**
   * Fora de call o som não sai: o soundboard toca PRA SALA, e sala é a call.
   * O gomo fica apagado e sem clique em vez de mandar um pedido que só voltaria
   * como erro numa janela que está atrás do jogo.
   */
  const canPlay = Boolean(voice)

  const pick = (sound: OverlaySound): void => {
    send({ type: 'sound', soundId: sound.id })
    void window.bocas.overlay.setMode({ wheel: false })
  }

  const mid = WHEEL_BOX / 2

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative" style={{ width: WHEEL_BOX, height: WHEEL_BOX }}>
        {/* Clarão atrás da roda: num jogo claro os gomos sumiriam no fundo. É
            degradê, e não `blur`, porque borrar uma área de 600px por cima de
            um jogo custa quadros. Sem `data-overlay-hit` — o mouse atravessa. */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              'radial-gradient(circle, hsl(var(--background) / 0.9) 0%, hsl(var(--background) / 0.7) 42%, hsl(var(--background) / 0) 70%)'
          }}
        />

        {/* O trilho em que os gomos andam: dá estrutura à roda sem pesar. */}
        <svg
          className="pointer-events-none absolute inset-0"
          width={WHEEL_BOX}
          height={WHEEL_BOX}
          viewBox={`0 0 ${WHEEL_BOX} ${WHEEL_BOX}`}
          aria-hidden
        >
          <circle
            cx={mid}
            cy={mid}
            r={WHEEL_RADIUS}
            fill="none"
            stroke="hsl(var(--border-strong))"
            strokeWidth={1}
            strokeDasharray="2 7"
          />
          <circle
            cx={mid}
            cy={mid}
            r={86}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={1}
          />
        </svg>

        <div
          data-overlay-hit
          className={cn(
            'absolute left-1/2 top-1/2 flex h-40 w-40 -translate-x-1/2 -translate-y-1/2',
            'flex-col items-center justify-center gap-1 rounded-full border border-line-strong',
            'bg-void/95 px-5 text-center shadow-neon-2'
          )}
        >
          {hovered && canPlay ? (
            <span className="text-4xl leading-none">{hovered.emoji}</span>
          ) : canPlay ? (
            <Music className="h-6 w-6 shrink-0 text-acid" aria-hidden />
          ) : (
            <PhoneOff className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden />
          )}

          <p
            className={cn(
              'w-full truncate text-sm font-semibold leading-snug',
              hovered && canPlay ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {sounds.length === 0
              ? 'ninguém subiu som'
              : !canPlay
                ? 'entre numa call'
                : (hovered?.name ?? 'escolha um som')}
          </p>

          {hovered?.hotkey && canPlay ? (
            <p className="font-mono text-[11px] text-acid-text">{shortKey(hovered.hotkey)}</p>
          ) : (
            <p className="text-[11.5px] text-muted-foreground">
              {canPlay ? 'toca pra sala toda' : 'o som toca pra sala'}
            </p>
          )}

          {pages > 1 && (
            <div className="mt-0.5 flex items-center gap-1">
              <IconButton
                label="Sons anteriores"
                onClick={() => setPage((prev) => (prev - 1 + pages) % pages)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </IconButton>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {current + 1}/{pages}
              </span>
              <IconButton
                label="Próximos sons"
                onClick={() => setPage((prev) => (prev + 1) % pages)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          )}
        </div>

        {slice.map((sound, index) => {
          // O -90° põe o primeiro gomo no TOPO; daí em diante, sentido
          // horário. Dividir por `slice.length` (e não por WHEEL_SLOTS) faz a
          // última página, com 3 sons, virar um triângulo bem distribuído em
          // vez de três gomos amontoados num quarto da roda.
          const angle = (index / slice.length) * Math.PI * 2 - Math.PI / 2
          const x = Math.cos(angle) * WHEEL_RADIUS
          const y = Math.sin(angle) * WHEEL_RADIUS

          return (
            <button
              key={sound.id}
              type="button"
              data-overlay-hit
              disabled={!canPlay}
              title={canPlay ? `Tocar "${sound.name}" pra sala` : 'Entre num canal de voz'}
              onMouseEnter={() => setHovered(sound)}
              onMouseLeave={() => setHovered((prev) => (prev?.id === sound.id ? null : prev))}
              onClick={() => pick(sound)}
              style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}
              className={cn(
                'absolute flex w-[7rem] -translate-x-1/2 -translate-y-1/2 flex-col',
                'items-center gap-1 rounded-[10px] border border-line-strong bg-void/95',
                'px-2 py-2 shadow-neon-1 transition-[transform,border-color,background-color] duration-100',
                canPlay
                  ? 'hover:scale-105 hover:border-acid hover:bg-surface-raised hover:shadow-neon-2'
                  : 'cursor-not-allowed opacity-50'
              )}
            >
              <span className="text-2xl leading-none">{sound.emoji}</span>
              <span className="w-full truncate text-[11.5px] font-medium leading-tight text-foreground">
                {sound.name}
              </span>
              {sound.hotkey && (
                <span className="w-full truncate font-mono text-[11px] leading-tight text-muted-foreground">
                  {shortKey(sound.hotkey)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
