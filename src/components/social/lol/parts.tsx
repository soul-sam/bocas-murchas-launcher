import * as React from 'react'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import { DASH, fmtNumber, fmtPercent, type LolPlayerRef } from '@/lib/api-lol'

/**
 * AS PEÇAS DO PAINEL DO LOL.
 *
 * Tudo aqui é barra, número e rótulo — nenhuma biblioteca de gráfico. Três
 * regras que valem pro arquivo inteiro:
 *
 *   - COR NUNCA SOZINHA. Verde e vermelho são justamente o par que quem tem
 *     daltonismo vermelho-verde não separa, então toda barra de vitória vem
 *     com o número e a letra ao lado. Tirar a cor da tela não pode tirar a
 *     informação.
 *   - TEXTO É TEXTO. Valor e rótulo usam a cor de texto do tema; quem carrega
 *     a identidade da série é a barra, não a palavra.
 *   - VAZIO É TRAVESSÃO. Métrica que a partida não tem (bloco truncado,
 *     partida antiga) aparece como "—", nunca como zero.
 */

export function SectionTitle({
  title,
  hint,
  right
}: {
  title: string
  hint?: string
  right?: React.ReactNode
}) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <h4 className="font-display text-sm uppercase tracking-wide text-dirty-white">{title}</h4>
      {hint && <p className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">{hint}</p>}
      {right && <div className="ml-auto shrink-0">{right}</div>}
    </div>
  )
}

export function Tile({
  label,
  value,
  hint,
  tone = 'neutral'
}: {
  label: string
  value: React.ReactNode
  hint?: string
  tone?: 'neutral' | 'good' | 'bad' | 'accent'
}) {
  return (
    <div className="rounded-brutal border border-line bg-void/60 px-2.5 py-2">
      <p className="text-[11.5px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          'font-display text-xl leading-tight',
          tone === 'good' && 'text-acid',
          tone === 'bad' && 'text-destructive',
          tone === 'accent' && 'text-burn',
          tone === 'neutral' && 'text-foreground'
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * Vitórias e derrotas na mesma barra, com 2px de fundo entre elas pra que os
 * dois blocos não virem uma mancha só. O número vem sempre ao lado.
 */
export function WinBar({
  wins,
  losses,
  className,
  showCounts = true
}: {
  wins: number
  losses: number
  className?: string
  showCounts?: boolean
}) {
  const total = wins + losses
  const winPct = total > 0 ? (wins / total) * 100 : 0

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="flex h-1.5 min-w-0 flex-1 gap-[2px] overflow-hidden rounded-brutal bg-surface-raised"
        role="img"
        aria-label={`${wins} vitórias e ${losses} derrotas`}
      >
        {wins > 0 && (
          <span className="h-full shrink-0 rounded-brutal bg-acid" style={{ width: `${winPct}%` }} />
        )}
        {losses > 0 && <span className="h-full flex-1 rounded-brutal bg-destructive" />}
      </div>
      {showCounts && (
        <p className="shrink-0 font-mono text-[11px] text-muted-foreground">
          <span className="text-acid-text">{wins}V</span>
          <span> · </span>
          <span className="text-destructive">{losses}D</span>
        </p>
      )}
    </div>
  )
}

/**
 * Uma linha de ranking: rótulo, barra proporcional ao maior da lista e valor.
 * A barra é comparação; o número é o dado — os dois juntos porque barra sem
 * número obriga a estimar e número sem barra esconde a distância.
 */
export function BarRow({
  label,
  value,
  max,
  display,
  tone = 'accent',
  sub,
  title,
  onClick,
  active
}: {
  label: React.ReactNode
  value: number | null
  max: number
  display: string
  tone?: 'accent' | 'good' | 'bad' | 'muted'
  sub?: string
  title?: string
  onClick?: () => void
  active?: boolean
}) {
  const pct = value !== null && max > 0 ? Math.max(2, (value / max) * 100) : 0
  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      title={title}
      className={cn(
        'flex w-full items-center gap-2 rounded-brutal px-1 py-[3px] text-left',
        onClick && 'transition-colors hover:bg-void-light',
        active && 'bg-void-light'
      )}
    >
      <span className="w-28 shrink-0 truncate text-[11.5px] text-foreground">{label}</span>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-brutal bg-surface-raised">
        <span
          className={cn(
            'block h-full rounded-brutal',
            tone === 'accent' && 'bg-burn',
            tone === 'good' && 'bg-acid',
            tone === 'bad' && 'bg-destructive',
            tone === 'muted' && 'bg-dirty-gray'
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-16 shrink-0 text-right font-mono text-[11.5px] text-foreground">{display}</span>
      {sub && <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground">{sub}</span>}
    </Tag>
  )
}

/**
 * Barras verticais pra distribuição (hora do dia, dia a dia). Altura é UMA
 * medida só — partidas. Winrate vira outra visão, nunca um segundo eixo em
 * cima do mesmo desenho.
 */
export function Columns({
  data,
  height = 64,
  emphasis
}: {
  data: Array<{ key: string; label: string; value: number; sub?: string; tone?: 'good' | 'bad' | 'accent' }>
  height?: number
  /** Rótulo embaixo só de alguns: 24 números colados não se leem. */
  emphasis?: (key: string, index: number) => boolean
}) {
  const max = data.reduce((acc, d) => Math.max(acc, d.value), 0)

  return (
    <div className="flex items-end gap-[2px]" style={{ height: height + 18 }}>
      {data.map((item, index) => {
        const pct = max > 0 ? (item.value / max) * 100 : 0
        const show = emphasis ? emphasis(item.key, index) : true
        return (
          <div key={item.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-end" style={{ height }}>
              <span
                title={`${item.label}: ${item.value}${item.sub ? ` · ${item.sub}` : ''}`}
                className={cn(
                  'w-full rounded-brutal',
                  item.tone === 'good' && 'bg-acid',
                  item.tone === 'bad' && 'bg-destructive',
                  (!item.tone || item.tone === 'accent') && 'bg-burn'
                )}
                style={{ height: `${Math.max(pct, item.value > 0 ? 4 : 0)}%` }}
              />
            </div>
            <span className="h-3 truncate text-[11px] leading-none text-muted-foreground">
              {show ? item.label : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Barras empilhadas por dia: a altura é uma medida só (partidas), partida em
 * dois pedaços (ganhou / perdeu). Com legenda ao lado, porque dois pedaços já
 * são duas séries — e verde/vermelho sozinhos não se separam pra todo mundo.
 */
export function StackedColumns({
  data,
  height = 56,
  emphasis
}: {
  data: Array<{ key: string; label: string; wins: number; losses: number; other?: number }>
  height?: number
  emphasis?: (key: string, index: number) => boolean
}) {
  const max = data.reduce((acc, d) => Math.max(acc, d.wins + d.losses + (d.other ?? 0)), 0)

  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height: height + 16 }}>
        {data.map((item, index) => {
          const total = item.wins + item.losses + (item.other ?? 0)
          const pct = max > 0 ? (total / max) * 100 : 0
          const show = emphasis ? emphasis(item.key, index) : true
          return (
            // max-w na coluna: com dez dias no filtro, uma barra de 200px de
            // largura por 8 de altura não é gráfico, é tarja.
            <div key={item.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="flex w-full max-w-[28px] items-end self-center" style={{ height }}>
                <span
                  title={`${item.label}: ${item.wins}V · ${item.losses}D`}
                  className="flex w-full flex-col-reverse gap-[2px]"
                  style={{ height: `${Math.max(pct, total > 0 ? 4 : 0)}%` }}
                >
                  {item.wins > 0 && (
                    <span
                      className="w-full rounded-brutal bg-acid"
                      style={{ height: `${(item.wins / Math.max(1, total)) * 100}%` }}
                    />
                  )}
                  {item.losses > 0 && (
                    <span
                      className="w-full rounded-brutal bg-destructive"
                      style={{ height: `${(item.losses / Math.max(1, total)) * 100}%` }}
                    />
                  )}
                  {(item.other ?? 0) > 0 && (
                    <span
                      className="w-full rounded-brutal bg-dirty-gray"
                      style={{ height: `${((item.other ?? 0) / Math.max(1, total)) * 100}%` }}
                    />
                  )}
                </span>
              </div>
              <span className="h-3 truncate text-[11px] leading-none text-muted-foreground">
                {show ? item.label : ''}
              </span>
            </div>
          )
        })}
      </div>
      <Legend />
    </div>
  )
}

/** Vitória e derrota nomeadas — identidade nunca fica só na cor. */
export function Legend() {
  return (
    <p className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-brutal bg-acid" />
        vitória
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-brutal bg-destructive" />
        derrota
      </span>
    </p>
  )
}

/** Nota de atuação: 0–100, onde 50 é a média das partidas do próprio filtro. */
export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="font-mono text-[11.5px] text-muted-foreground">{DASH}</span>
  }
  return (
    <span
      title="Nota de atuação: 50 é a média das partidas deste filtro. Sai de KDA, participação, fatia de dano, farm, visão e mortes."
      className={cn(
        'rounded-brutal border px-1 font-mono text-[11.5px]',
        score >= 65
          ? 'border-acid/60 text-acid-text'
          : score <= 35
            ? 'border-destructive/60 text-destructive'
            : 'border-line-strong text-muted-foreground'
      )}
    >
      {score.toFixed(0)}
    </span>
  )
}

export function ResultPill({ result }: { result: 'win' | 'loss' | 'remake' | 'unknown' }) {
  const label = result === 'win' ? 'V' : result === 'loss' ? 'D' : result === 'remake' ? 'R' : '?'
  return (
    <span
      title={
        result === 'win'
          ? 'Vitória'
          : result === 'loss'
            ? 'Derrota'
            : result === 'remake'
              ? 'Remake — não conta no winrate'
              : 'O launcher não viu o fim dessa partida'
      }
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-brutal border font-mono text-[11px]',
        result === 'win' && 'border-acid/60 bg-acid/10 text-acid-text',
        result === 'loss' && 'border-destructive/60 bg-destructive/10 text-destructive',
        (result === 'remake' || result === 'unknown') && 'border-line-strong text-muted-foreground'
      )}
    >
      {label}
    </span>
  )
}

export function PlayerChip({
  player,
  fallback,
  size = 'sm'
}: {
  player: LolPlayerRef | null | undefined
  fallback?: string
  size?: 'sm' | 'md'
}) {
  const name = player?.displayName ?? fallback ?? 'alguém'
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <UserAvatar
        src={resolveAssetUrl(player?.avatar)}
        name={name}
        ringColor={player?.profileColor ?? undefined}
        className={size === 'md' ? 'h-6 w-6' : 'h-4 w-4'}
      />
      <span
        className="truncate text-[11.5px]"
        style={player?.profileColor ? { color: player.profileColor } : undefined}
      >
        {name}
      </span>
    </span>
  )
}

/**
 * O aviso de que não dá pra afirmar nada ainda. Aparece no lugar do gráfico —
 * um gráfico de três partidas é pior que gráfico nenhum, porque parece
 * resposta.
 */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-brutal border border-dashed border-line px-3 py-4 text-center text-[11.5px] text-muted-foreground">
      {children}
    </p>
  )
}

/** Winrate com a amostra ao lado: 100% de 2 partidas não é 100%. */
export function WinrateCell({ row }: { row: { winrate: number | null; decided: number } }) {
  if (row.winrate === null) {
    return <span className="font-mono text-[11.5px] text-muted-foreground">{DASH}</span>
  }
  return (
    <span className="font-mono text-[11.5px]">
      <span
        className={cn(
          row.winrate >= 0.55 ? 'text-acid-text' : row.winrate <= 0.45 ? 'text-destructive' : 'text-foreground'
        )}
      >
        {fmtPercent(row.winrate)}
      </span>
      <span className="text-muted-foreground"> /{row.decided}</span>
    </span>
  )
}

/** Cabeçalho de tabela que ordena ao clicar. */
export function Th({
  children,
  sortKey,
  active,
  order,
  onSort,
  align = 'right',
  title,
  className
}: {
  children: React.ReactNode
  sortKey?: string
  active?: boolean
  order?: 'asc' | 'desc'
  onSort?: (key: string) => void
  align?: 'left' | 'right'
  title?: string
  className?: string
}) {
  const content = (
    <span className={cn('text-[11px] uppercase tracking-wide', active ? 'text-acid-text' : 'text-muted-foreground')}>
      {children}
      {active && <span className="ml-0.5">{order === 'asc' ? '↑' : '↓'}</span>}
    </span>
  )

  return (
    <th
      scope="col"
      title={title}
      className={cn(
        'sticky top-0 z-10 bg-depth-3 px-2 py-1.5 font-normal',
        align === 'right' ? 'text-right' : 'text-left',
        className
      )}
    >
      {sortKey && onSort ? (
        <button type="button" onClick={() => onSort(sortKey)} className="transition-colors hover:text-foreground">
          {content}
        </button>
      ) : (
        content
      )}
    </th>
  )
}

export function Td({
  children,
  align = 'right',
  className,
  title
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  className?: string
  title?: string
}) {
  return (
    <td
      title={title}
      className={cn(
        'px-2 py-1 font-mono text-[11.5px] text-foreground',
        align === 'right' ? 'text-right' : 'text-left',
        className
      )}
    >
      {children}
    </td>
  )
}

/** Número com a amostra que o sustenta na dica — média de 2 não é média. */
export function AvgCell({ value, sample, digits = 1 }: { value: number | null; sample?: number; digits?: number }) {
  return (
    <span title={sample !== undefined ? `de ${sample} partidas com esse dado` : undefined}>
      {fmtNumber(value, digits)}
    </span>
  )
}
