import { cn } from '@/lib/utils'

/**
 * Barrinhas de sinal + o ping em ms, no dock da call.
 *
 * Antes era um ícone de `Signal` fixo, sempre verde e sempre pulsando: ele
 * dizia "você está numa call", que a pessoa já sabia, e não dizia nada sobre a
 * call estar boa. Quando alguém trava, a primeira pergunta é "é a minha
 * internet?" — e a resposta não estava em lugar nenhum do app.
 *
 * DUAS FONTES, de propósito, porque respondem coisas diferentes:
 *
 *  - as BARRAS vêm do julgamento do próprio LiveKit (`connectionQuality`), que
 *    olha perda de pacote e jitter além de latência. É o "está ruim?";
 *  - o NÚMERO é o round-trip real medido no WebRTC. É o "quão ruim, e é longe
 *    ou é perto?" — 40ms com barra ruim é perda de pacote na sua rede; 250ms
 *    com barra boa é só distância até o servidor.
 *
 * Sem medição ainda (os primeiros segundos) mostra só as barras. Um número
 * chutado seria pior que nenhum.
 */

type Quality = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown'

/** Quantas das 4 barrinhas acendem, por qualidade. */
const LIT: Record<Quality, number> = {
  excellent: 4,
  good: 3,
  poor: 2,
  lost: 0,
  unknown: 1
}

const COLOR: Record<Quality, string> = {
  excellent: 'bg-acid',
  good: 'bg-acid',
  poor: 'bg-burn',
  lost: 'bg-destructive',
  unknown: 'bg-muted-foreground'
}

const LABEL: Record<Quality, string> = {
  excellent: 'Conexão ótima',
  good: 'Conexão boa',
  poor: 'Conexão ruim — pode travar',
  lost: 'Conexão perdida',
  unknown: 'Medindo a conexão…'
}

/** Alturas das 4 barrinhas, em px. */
const HEIGHTS = [4, 6, 8, 10]

export function ConnectionBars({
  quality,
  pingMs,
  className
}: {
  quality: Quality
  pingMs: number | null
  className?: string
}) {
  const lit = LIT[quality] ?? 1
  const color = COLOR[quality] ?? COLOR.unknown

  const title =
    pingMs === null ? LABEL[quality] : `${LABEL[quality]} · ${pingMs} ms até o servidor de voz`

  return (
    <span className={cn('flex shrink-0 items-center gap-1', className)} title={title}>
      <span className="flex items-end gap-[2px]" aria-hidden>
        {HEIGHTS.map((height, index) => (
          <span
            key={height}
            style={{ height }}
            className={cn(
              'w-[3px] rounded-[1px] transition-colors',
              index < lit ? color : 'bg-surface-strong'
            )}
          />
        ))}
      </span>

      {/*
        Largura fixa e tabular-nums: o número muda a cada 3s, e sem isso o
        nome do canal ao lado dançava um pixel pra cada dígito.
      */}
      {pingMs !== null && (
        <span
          className={cn(
            'w-9 shrink-0 text-right font-mono text-[11px] tabular-nums',
            quality === 'poor'
              ? 'text-burn'
              : quality === 'lost'
                ? 'text-destructive'
                : 'text-muted-foreground'
          )}
        >
          {pingMs}ms
        </span>
      )}

      <span className="sr-only">{title}</span>
    </span>
  )
}
