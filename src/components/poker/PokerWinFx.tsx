import * as React from 'react'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { CATEGORY_LABEL, formatMoneyShort, type HandCategory, type SeatView, type TableView } from '@/lib/api-poker'
import { useMembers } from '@/lib/members-context'
import { breakdown, type ChipDenom } from '@/lib/poker-chips'
import { cn } from '@/lib/utils'
import { ChipFace } from './PokerGlyphs'
import './poker.css'

/**
 * A VITÓRIA — o que acontece na mesa quando a mão acaba.
 *
 * A ordem conta a história, como num cassino filmado:
 *   1. a luz baixa em volta e fica em quem levou (holofote);
 *   2. o pote sai do meio em FICHAS, uma atrás da outra, num arco até o
 *      assento (as cores são as das fichas que o pote tinha);
 *   3. quando a última chega, faíscas e uma onda dourada saem do avatar;
 *   4. no showdown, o nome da mão bate no meio da mesa como um carimbo —
 *      maior e com raios atrás se a mão for grande (sequência pra cima) ou o
 *      pote for gordo;
 *   5. se fui EU, chove confete.
 * A placa do vencedor (quem, quanto — contando — e com o quê) fica por cima
 * das cartas da mesa até a próxima mão.
 *
 * Tudo é CSS a partir de `--seat-x/--seat-y` (destino) e `--pot-y` (origem),
 * em cqw/cqh da `.poker-area`. "Reduzir movimento" desliga partículas e voo.
 */

const BIG_HANDS: ReadonlySet<HandCategory> = new Set(['straight', 'flush', 'full-house', 'quads', 'straight-flush', 'royal'])

/** Gerador determinístico por mão: as partículas não pulam a cada render. */
function seeded(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

const SPARK_COLORS = ['hsl(var(--burn))', 'hsl(var(--acid))', 'hsl(var(--foreground))', 'rgb(var(--neon-rgb))']
const CONFETTI_COLORS = ['hsl(var(--burn))', 'hsl(var(--acid))', 'rgb(var(--neon-rgb))', 'hsl(var(--foreground))', 'hsl(var(--destructive))']

export function WinFx({
  table,
  rotated,
  geo,
  set
}: {
  table: TableView
  rotated: Array<{ index: number; seat: SeatView | null; pos: [number, number] }>
  geo: { potY: number; boardY: number }
  set: ChipDenom[]
}) {
  const result = table.result
  const seed = table.handId ?? 'mao'
  const winners = rotated.filter((r) => r.seat && (r.seat.won ?? 0) > 0)
  const heroWon = table.mySeat !== null && winners.some((w) => w.index === table.mySeat)
  const bigBlind = table.stake.bigBlind

  const best = React.useMemo(() => {
    if (!result?.showdown) return null
    let top: { category: HandCategory; label: string } | null = null
    const order = Object.keys(CATEGORY_LABEL) as HandCategory[]
    for (const w of winners) {
      const h = result.hands[String(w.index)]
      if (!h) continue
      if (!top || order.indexOf(h.category) > order.indexOf(top.category)) top = { category: h.category, label: h.label }
    }
    return top
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, seed])

  const totalWon = winners.reduce((s, w) => s + (w.seat?.won ?? 0), 0)
  const big = (!!best && BIG_HANDS.has(best.category)) || totalWon >= 40 * bigBlind

  const particles = React.useMemo(() => {
    const rand = seeded(seed)
    const streams = winners.map((w) => {
      const won = w.seat?.won ?? 0
      const n = Math.max(5, Math.min(12, 4 + Math.round(Math.log2(Math.max(1, won / Math.max(1, bigBlind))))))
      const tones = breakdown(won, set).flatMap((s) => Array.from({ length: Math.min(s.count, 4) }, () => s.denom.tone))
      return Array.from({ length: n }, (_, i) => ({
        tone: tones.length ? tones[i % tones.length] : 0,
        delay: i * 55 + Math.round(rand() * 30),
        lift: 6 + rand() * 7,
        jitter: (rand() - 0.5) * 3
      }))
    })
    const sparks = Array.from({ length: big ? 18 : 12 }, (_, i) => ({
      angle: (360 / (big ? 18 : 12)) * i + rand() * 14,
      dist: 46 + rand() * (big ? 46 : 26),
      color: SPARK_COLORS[i % SPARK_COLORS.length],
      size: 4 + Math.round(rand() * 4)
    }))
    const confetti = Array.from({ length: 42 }, (_, i) => ({
      x: rand() * 100,
      delay: Math.round(rand() * 700),
      dur: 1600 + Math.round(rand() * 1200),
      spin: (rand() > 0.5 ? 1 : -1) * (360 + Math.round(rand() * 540)),
      drift: (rand() - 0.5) * 14,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      w: 5 + Math.round(rand() * 4),
      h: 8 + Math.round(rand() * 6)
    }))
    return { streams, sparks, confetti }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, winners.length, big])

  if (!result || winners.length === 0) return null
  const single = winners.length === 1 ? winners[0] : null
  // A faísca espera a última ficha chegar.
  const landMs = Math.max(...particles.streams.map((s) => (s.length ? s[s.length - 1].delay : 0))) + 620

  return (
    <div className="pointer-events-none absolute inset-0 z-[14]" aria-hidden>
      {single && (
        <div
          className="poker-holofote"
          style={{ ['--seat-x' as string]: single.pos[0], ['--seat-y' as string]: single.pos[1] } as React.CSSProperties}
        />
      )}

      {winners.map((w, wi) => {
        const vars = { ['--seat-x' as string]: w.pos[0], ['--seat-y' as string]: w.pos[1] } as React.CSSProperties
        return (
          <React.Fragment key={w.index}>
            {big && <div className="poker-raios" style={vars} />}
            {/* As fichas do pote, em arco, do meio até o assento. */}
            {particles.streams[wi]?.map((p, i) => (
              <span
                key={i}
                className="poker-voo"
                style={
                  {
                    ...vars,
                    top: `${geo.potY}%`,
                    ['--atraso' as string]: `${p.delay}ms`,
                    ['--arco' as string]: `${p.lift}cqh`,
                    ['--desvio' as string]: `${p.jitter}cqw`
                  } as React.CSSProperties
                }
              >
                <span className="poker-voo-arco">
                  <ChipFace tone={p.tone} label="" size={22} />
                </span>
              </span>
            ))}
            {/* Chegou: onda e faíscas no avatar. */}
            <div className="poker-estouro" style={{ ...vars, ['--atraso' as string]: `${landMs}ms` } as React.CSSProperties}>
              <span className="poker-onda" />
              <span className="poker-onda poker-onda--2" />
              {particles.sparks.map((s, i) => (
                <span
                  key={i}
                  className="poker-faisca"
                  style={
                    {
                      ['--ang' as string]: `${s.angle}deg`,
                      ['--dist' as string]: `${s.dist}px`,
                      ['--cor' as string]: s.color,
                      width: s.size,
                      height: s.size
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
          </React.Fragment>
        )
      })}

      {/* O nome da mão, carimbado no meio da mesa. */}
      {best && (
        <div className={cn('poker-carimbo-mao', big && 'poker-carimbo-mao--grande')} style={{ top: `${geo.boardY}%` }}>
          <span>{CATEGORY_LABEL[best.category]}</span>
        </div>
      )}

      {heroWon &&
        particles.confetti.map((c, i) => (
          <span
            key={i}
            className="poker-confete"
            style={
              {
                left: `${c.x}%`,
                width: c.w,
                height: c.h,
                ['--cor' as string]: c.color,
                ['--atraso' as string]: `${landMs - 300 + c.delay}ms`,
                ['--dura' as string]: `${c.dur}ms`,
                ['--giro' as string]: `${c.spin}deg`,
                ['--deriva' as string]: `${c.drift}cqw`
              } as React.CSSProperties
            }
          />
        ))}
    </div>
  )
}

/** Conta de 0 até `value` em `ms` (o "+1.250" subindo). Sem animação, mostra direto. */
function useCountUp(value: number, ms = 900, delay = 0): number {
  const [shown, setShown] = React.useState(0)
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(value)
      return
    }
    let raf = 0
    const start = performance.now() + delay
    const tick = (now: number): void => {
      const t = Math.min(1, Math.max(0, (now - start) / ms))
      // Desacelera no fim, como contador de máquina.
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms, delay])
  return shown
}

/**
 * A placa de quem levou, por cima das cartas da mesa: avatar, nome, quanto
 * (contando) e com o quê. Um pote por linha (principal e laterais).
 */
export function WinnerPlaque({ table, fmt, topY }: { table: TableView; fmt: (v: number) => string; topY: number }) {
  const result = table.result!
  return (
    <div className="poker-placa-vitoria" style={{ top: `${topY}%` }} role="status">
      {result.pots.map((pot, i) => (
        <PotLine key={i} table={table} pot={pot} index={i} fmt={fmt} many={result.pots.length > 1} />
      ))}
      {!result.showdown && <p className="text-[11.5px] text-muted-foreground">todo mundo desistiu</p>}
      {result.rake > 0 && (
        <p className="text-[11px] text-muted-foreground">
          rake de <span className="font-mono">{fmt(result.rake)}</span> pro cofre da casa
        </p>
      )}
    </div>
  )
}

function PotLine({
  table,
  pot,
  index,
  fmt,
  many
}: {
  table: TableView
  pot: { amount: number; winners: number[]; label?: string }
  index: number
  fmt: (v: number) => string
  many: boolean
}) {
  const { byId } = useMembers()
  const counted = useCountUp(pot.amount, 900, 500 + index * 250)
  const people = pot.winners.map((s) => table.seats[s]).filter((s): s is SeatView => !!s)
  const mine = table.mySeat !== null && pot.winners.includes(table.mySeat)
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex shrink-0 -space-x-2">
        {people.map((s) => {
          const member = byId[s.userId]
          return (
            <UserAvatar
              key={s.userId}
              userId={s.userId}
              src={resolveAssetUrl(member?.avatar ?? s.avatar)}
              name={s.displayName}
              frame={null}
              className="poker-avatar border-2 border-burn"
              style={{ width: 30, height: 30 }}
            />
          )
        })}
      </span>
      <p className="min-w-0 text-left text-sm leading-snug text-foreground">
        <span className="font-semibold text-burn">
          {mine ? (people.length > 1 ? 'Você e mais ' + (people.length - 1) : 'Você') : people.map((s) => s.displayName.split(/\s+/)[0]).join(' e ')}
        </span>{' '}
        {people.length > 1 ? 'dividem' : 'leva'}{' '}
        <span className="font-mono font-semibold text-burn">{counted >= pot.amount ? fmt(pot.amount) : formatMoneyShort(counted, table.stake.currency)}</span>
        {pot.label ? <span className="text-foreground/70"> com {pot.label}</span> : null}
        {many && <span className="text-muted-foreground"> ({index === 0 ? 'pote principal' : `pote lateral ${index}`})</span>}
      </p>
    </div>
  )
}
