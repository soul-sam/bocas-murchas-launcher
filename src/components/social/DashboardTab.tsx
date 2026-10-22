import * as React from 'react'
import { Loader2, TrendingDown, TrendingUp } from 'lucide-react'
import { bankApi, type WealthDashboard, type WealthPoint } from '@/lib/api-bank'
import { formatCompact } from '@/lib/api-gamification'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

/**
 * DASHBOARD — a aba do Banco ao lado da Carteira: o patrimônio dia a dia e o
 * juro que o CDB rendeu.
 *
 * Patrimônio = saldo + CDB (diário, congelado, antigo) + carta − dívida. O
 * servidor grava uma foto por dia desde 22/10/2026; antes disso o ponto é
 * estimado pelo extrato (linha tracejada). Gráficos em SVG à mão (o launcher
 * não tem biblioteca de gráfico): uma série cada, então sem legenda — o título
 * diz o que é — e com dica no hover.
 */

const fmt = (n: number): string => n.toLocaleString('pt-BR')
const dayLabel = (key: string): string => `${key.slice(8, 10)}/${key.slice(5, 7)}`

const RANGES = [7, 30, 90] as const
type Range = (typeof RANGES)[number]

export function DashboardTab() {
  const { token } = useAuth()
  const [range, setRange] = React.useState<Range>(30)
  // undefined = buscando · null = falhou
  const [data, setData] = React.useState<WealthDashboard | null | undefined>(undefined)

  React.useEffect(() => {
    if (!token) return
    let alive = true
    setData((prev) => (prev === null ? undefined : prev))
    bankApi
      .dashboard(token, range)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData((prev) => (prev === undefined ? null : prev)))
    return () => {
      alive = false
    }
  }, [token, range])

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Período" className="flex items-center gap-1">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={range === r}
            onClick={() => setRange(r)}
            className={cn(
              'rounded-brutal border px-2.5 py-1 font-mono text-[11.5px] transition-colors',
              range === r
                ? 'border-acid/60 bg-acid/10 text-acid'
                : 'border-line text-muted-foreground hover:bg-void-light hover:text-foreground'
            )}
          >
            {r} dias
          </button>
        ))}
      </div>

      {data === undefined && (
        <div className="flex justify-center py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
      {data === null && (
        <p className="rounded-brutal border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Não deu pra abrir o dashboard agora.
        </p>
      )}
      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <NetHero data={data} />
            <InterestHero data={data} />
          </div>
          <WealthChart series={data.series} />
          <InterestChart daily={data.interestDaily} />
          <Breakdown now={data.now} />
        </>
      )}
    </div>
  )
}

/** O número grande: patrimônio de hoje e quanto mudou no período. */
function NetHero({ data }: { data: WealthDashboard }) {
  const first = data.series[0]
  const change = first ? data.now.net - first.net : 0
  const Up = change >= 0 ? TrendingUp : TrendingDown
  return (
    <section className="rounded-brutal border border-acid-dark/60 bg-acid/[0.05] p-3">
      <h4 className="font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">Patrimônio</h4>
      <p className="mt-1.5 font-mono text-3xl leading-none tabular-nums text-acid-text">{fmt(data.now.net)}</p>
      {first && (
        <p className="mt-2 flex items-center gap-1 text-[11.5px] text-muted-foreground">
          <Up className={cn('h-3.5 w-3.5', change >= 0 ? 'text-acid-text' : 'text-destructive')} aria-hidden />
          <span className="font-mono text-foreground">
            {change >= 0 ? '+' : '−'}
            {fmt(Math.abs(change))}
          </span>
          desde {dayLabel(first.day)}
        </p>
      )}
    </section>
  )
}

/** Juro dos últimos 7 dias, com a quebra por produto. */
function InterestHero({ data }: { data: WealthDashboard }) {
  const w = data.interestWeek
  const parts = [
    { label: 'CDB diário', value: w.savings },
    { label: 'CDB congelado', value: w.terms },
    { label: 'CDB antigo', value: w.deposits }
  ].filter((p) => p.value > 0)
  return (
    <section className="rounded-brutal border border-line bg-void/60 p-3">
      <h4 className="font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">Juros na última semana</h4>
      <p className="mt-1.5 font-mono text-3xl leading-none tabular-nums text-foreground">+{fmt(w.total)}</p>
      <p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">
        {parts.length === 0
          ? 'Nada rendeu nos últimos 7 dias.'
          : parts.map((p, i) => (
              <React.Fragment key={p.label}>
                {i > 0 && ' · '}
                {p.label} <span className="font-mono text-foreground">{fmt(p.value)}</span>
              </React.Fragment>
            ))}
      </p>
      {w.terms > 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground">O do congelado é o que já correu: vem inteiro no vencimento.</p>
      )}
    </section>
  )
}

/** Largura de um elemento, acompanhando o redimensionamento. */
function useWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(0)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

const PAD = { top: 10, right: 8, bottom: 20, left: 44 }

function niceTicks(min: number, max: number): number[] {
  if (min === max) return [min]
  return [min, Math.round((min + max) / 2), max]
}

/** Patrimônio no tempo: linha + área, tracejada onde é estimativa. */
function WealthChart({ series }: { series: WealthPoint[] }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = React.useState<number | null>(null)
  const height = 180

  if (series.length < 2) {
    return (
      <ChartFrame title="Evolução do patrimônio">
        <p className="py-6 text-center text-[11.5px] text-muted-foreground">Ainda não tem dias suficientes pra desenhar.</p>
      </ChartFrame>
    )
  }

  const values = series.map((p) => p.net)
  const lo = Math.min(0, ...values)
  const hi = Math.max(...values, lo + 1)
  const w = Math.max(0, width - PAD.left - PAD.right)
  const h = height - PAD.top - PAD.bottom
  const x = (i: number): number => PAD.left + (series.length === 1 ? w / 2 : (i * w) / (series.length - 1))
  const y = (v: number): number => PAD.top + h - ((v - lo) / (hi - lo)) * h
  const firstReal = series.findIndex((p) => !p.estimated)
  const split = firstReal < 0 ? series.length - 1 : firstReal

  const line = (from: number, to: number): string =>
    series
      .slice(from, to + 1)
      .map((p, k) => `${k === 0 ? 'M' : 'L'}${x(from + k).toFixed(1)},${y(p.net).toFixed(1)}`)
      .join(' ')
  const area = `${line(0, series.length - 1)} L${x(series.length - 1).toFixed(1)},${y(lo).toFixed(1)} L${x(0).toFixed(1)},${y(lo).toFixed(1)} Z`

  const point = hover !== null ? series[hover] : null
  return (
    <ChartFrame title="Evolução do patrimônio" note={split > 0 ? 'Tracejado: estimado pelo extrato, antes das fotos diárias.' : undefined}>
      <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Patrimônio de ${fmt(values[0])} a ${fmt(values[values.length - 1])} em ${series.length} dias`}
            onPointerMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const i = Math.round(((e.clientX - rect.left - PAD.left) / Math.max(1, w)) * (series.length - 1))
              setHover(Math.min(series.length - 1, Math.max(0, i)))
            }}
          >
            {niceTicks(lo, hi).map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end" className="fill-muted-foreground font-mono text-[11px]">
                  {formatCompact(t)}
                </text>
              </g>
            ))}
            <path d={area} className="fill-acid/10" />
            {split > 0 && (
              <path d={line(0, split)} fill="none" className="stroke-acid" strokeWidth={2} strokeDasharray="4 4" strokeLinejoin="round" />
            )}
            <path d={line(split, series.length - 1)} fill="none" className="stroke-acid" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <text x={PAD.left} y={height - 4} className="fill-muted-foreground font-mono text-[11px]">
              {dayLabel(series[0].day)}
            </text>
            <text x={width - PAD.right} y={height - 4} textAnchor="end" className="fill-muted-foreground font-mono text-[11px]">
              {dayLabel(series[series.length - 1].day)}
            </text>
            {hover !== null && point && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + h} className="stroke-muted-foreground/50" strokeWidth={1} />
                <circle cx={x(hover)} cy={y(point.net)} r={5} className="fill-acid stroke-void" strokeWidth={2} />
              </g>
            )}
          </svg>
        )}
        {hover !== null && point && (
          <Tooltip x={x(hover)} width={width}>
            <p className="font-mono text-[11px] text-muted-foreground">
              {dayLabel(point.day)}
              {point.estimated ? ' · estimado' : ''}
            </p>
            <p className="font-mono text-sm text-foreground">{fmt(point.net)}</p>
            <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 text-[11px]">
              <Row label="saldo" value={point.coins} />
              <Row label="CDB" value={point.savings + point.terms + point.deposits} />
              {point.carta > 0 && <Row label="carta" value={point.carta} />}
              {point.debt > 0 && <Row label="dívida" value={-point.debt} />}
            </dl>
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  )
}

/** Juro por dia, em barras (só dos dias com foto). */
function InterestChart({ daily }: { daily: Array<{ day: string; amount: number }> }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = React.useState<number | null>(null)
  const height = 120

  if (daily.length === 0) {
    return (
      <ChartFrame title="Juros por dia">
        <p className="py-6 text-center text-[11.5px] text-muted-foreground">
          Começa a contar a partir das fotos diárias: amanhã já aparece a primeira barra.
        </p>
      </ChartFrame>
    )
  }

  const hi = Math.max(1, ...daily.map((d) => d.amount))
  const w = Math.max(0, width - PAD.left - PAD.right)
  const h = height - PAD.top - PAD.bottom
  const slot = w / daily.length
  const bar = Math.max(2, Math.min(24, slot - 2))
  const point = hover !== null ? daily[hover] : null

  return (
    <ChartFrame title="Juros por dia">
      <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`Juros por dia, até ${fmt(hi)}`}>
            <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + h} y2={PAD.top + h} className="stroke-line" strokeWidth={1} />
            <text x={PAD.left - 6} y={PAD.top + 3.5} textAnchor="end" className="fill-muted-foreground font-mono text-[11px]">
              {formatCompact(hi)}
            </text>
            {daily.map((d, i) => {
              const bh = (d.amount / hi) * h
              const bx = PAD.left + i * slot + (slot - bar) / 2
              return (
                <g key={d.day} onPointerEnter={() => setHover(i)}>
                  {/* Alvo maior que a barra: a coluna inteira. */}
                  <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={h} fill="transparent" />
                  <rect
                    x={bx}
                    y={PAD.top + h - bh}
                    width={bar}
                    height={Math.max(0, bh)}
                    rx={Math.min(4, bar / 2)}
                    className={cn(hover === i ? 'fill-acid' : 'fill-acid/70')}
                  />
                </g>
              )
            })}
            <text x={PAD.left} y={height - 4} className="fill-muted-foreground font-mono text-[11px]">
              {dayLabel(daily[0].day)}
            </text>
            <text x={width - PAD.right} y={height - 4} textAnchor="end" className="fill-muted-foreground font-mono text-[11px]">
              {dayLabel(daily[daily.length - 1].day)}
            </text>
          </svg>
        )}
        {hover !== null && point && (
          <Tooltip x={PAD.left + hover * slot + slot / 2} width={width}>
            <p className="font-mono text-[11px] text-muted-foreground">{dayLabel(point.day)}</p>
            <p className="font-mono text-sm text-foreground">+{fmt(point.amount)}</p>
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  )
}

/** Do que o patrimônio de hoje é feito (também é a tabela do gráfico). */
function Breakdown({ now }: { now: WealthDashboard['now'] }) {
  const rows = [
    { label: 'Saldo', value: now.coins },
    { label: 'CDB diário', value: now.savings },
    { label: 'CDB congelado (saindo hoje)', value: now.terms },
    { label: 'CDB antigo', value: now.deposits },
    { label: 'Carta do consórcio', value: now.carta },
    { label: 'Dívidas', value: -now.debt }
  ].filter((r) => r.value !== 0 || r.label === 'Saldo')
  return (
    <section className="rounded-brutal border border-line bg-void/60 p-3">
      <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">Hoje</h4>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
        {rows.map((r) => (
          <Row key={r.label} label={r.label} value={r.value} />
        ))}
        <dt className="border-t border-line pt-1 text-foreground">Patrimônio</dt>
        <dd className="border-t border-line pt-1 text-right font-mono text-foreground">{fmt(now.net)}</dd>
      </dl>
    </section>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('text-right font-mono', value < 0 ? 'text-destructive' : 'text-foreground')}>{fmt(value)}</dd>
    </>
  )
}

function ChartFrame({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-brutal border border-line bg-void/60 p-3">
      <h4 className="mb-2 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">{title}</h4>
      {children}
      {note && <p className="mt-1.5 text-[11px] text-muted-foreground">{note}</p>}
    </section>
  )
}

/** Dica do hover, presa dentro da largura do gráfico. */
function Tooltip({ x, width, children }: { x: number; width: number; children: React.ReactNode }) {
  const box = 168
  const left = Math.min(Math.max(0, x - box / 2), Math.max(0, width - box))
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 rounded-brutal border border-line bg-surface-raised px-2.5 py-1.5 shadow-lg"
      style={{ left, width: box }}
    >
      {children}
    </div>
  )
}
