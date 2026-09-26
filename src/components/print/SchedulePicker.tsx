import * as React from 'react'
import { Moon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * "Quando começar" — o agendamento de uma peça.
 *
 * A impressora mora no quarto de alguém: quem manda às 23h quer que ela
 * comece de manhã, não que acorde a casa. O servidor guarda só um PISO
 * (`scheduledFor`): quando a hora chega a peça entra na ordem justa como
 * qualquer outra, então a tela fala "a partir de", nunca "às".
 *
 * A noite é a janela de silêncio que o admin configurou; sem ela, 22h→8h
 * serve só pra este aviso — o servidor não trava nada por conta disso.
 */

export interface QuietWindow {
  quietStartHour?: number | null
  quietEndHour?: number | null
}

const FALLBACK_NIGHT = { start: 22, end: 8 }

function nightOf(quiet: QuietWindow): { start: number; end: number; configured: boolean } {
  const { quietStartHour: start, quietEndHour: end } = quiet
  if (typeof start === 'number' && typeof end === 'number' && start !== end) {
    return { start, end, configured: true }
  }
  return { ...FALLBACK_NIGHT, configured: false }
}

function isNightHour(hour: number, night: { start: number; end: number }): boolean {
  return night.start < night.end
    ? hour >= night.start && hour < night.end
    : hour >= night.start || hour < night.end
}

/** A peça roda algum pedaço dentro da noite? Varre de 15 em 15 min. */
export function crossesNight(start: Date, seconds: number, quiet: QuietWindow): boolean {
  const night = nightOf(quiet)
  const end = start.getTime() + Math.max(0, seconds) * 1000
  for (let t = start.getTime(); t < end; t += 15 * 60_000) {
    if (isNightHour(new Date(t).getHours(), night)) return true
  }
  return false
}

/** O próximo fim de noite: hoje se ainda não passou, senão amanhã. */
function nextMorning(quiet: QuietWindow, now: Date): Date {
  const { end } = nightOf(quiet)
  const when = new Date(now)
  when.setHours(end, 0, 0, 0)
  if (when.getTime() <= now.getTime()) when.setDate(when.getDate() + 1)
  return when
}

/** "hoje 08:00", "amanhã 08:00", "sex 08:00", "12/10 08:00". */
export function describeSchedule(when: Date, now: Date = new Date()): string {
  const time = when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(when) - day(now)) / 86_400_000)
  if (days === 0) return `hoje ${time}`
  if (days === 1) return `amanhã ${time}`
  if (days > 1 && days < 7) {
    return `${when.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')} ${time}`
  }
  return `${when.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`
}

/** Date → valor do `<input type="datetime-local">` (hora local, sem fuso). */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** O servidor aceita até 7 dias pra frente (a reserva da cota fica presa). */
const MAX_AHEAD_MS = 7 * 24 * 60 * 60 * 1000

type Mode = 'now' | 'morning' | 'custom'

export function SchedulePicker({
  value,
  onChange,
  quiet,
  estimatedSeconds,
  disabled
}: {
  value: Date | null
  onChange: (next: Date | null) => void
  quiet: QuietWindow
  /** Quando já se sabe (peça na fila), avisa se vai atravessar a noite. */
  estimatedSeconds?: number | null
  disabled?: boolean
}) {
  const now = new Date()
  const morning = nextMorning(quiet, now)
  const [mode, setMode] = React.useState<Mode>(() =>
    value === null ? 'now' : value.getTime() === morning.getTime() ? 'morning' : 'custom'
  )
  const night = nightOf(quiet)

  function choose(next: Mode): void {
    setMode(next)
    if (next === 'now') onChange(null)
    else if (next === 'morning') onChange(morning)
    // "Outro horário" abre já com a manhã preenchida: é o palpite mais comum
    // e evita um input vazio que manda "agora" sem querer.
    else onChange(value ?? morning)
  }

  const start = value ?? now
  const nightNow = mode === 'now' && isNightHour(now.getHours(), night)
  const startsInNight = value !== null && isNightHour(value.getHours(), night)
  const runsIntoNight =
    !nightNow && !startsInNight && !!estimatedSeconds && crossesNight(start, estimatedSeconds, quiet)

  const chip = (active: boolean) =>
    cn(
      'rounded-brutal border px-2.5 py-1 text-[11.5px] transition-colors disabled:opacity-50',
      active
        ? 'border-acid bg-acid/10 text-acid-text'
        : 'border-line text-muted-foreground hover:border-line-strong hover:text-foreground'
    )

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11.5px] text-muted-foreground">Quando começar</span>
        <button type="button" className={chip(mode === 'now')} onClick={() => choose('now')} disabled={disabled}>
          assim que der
        </button>
        <button
          type="button"
          className={chip(mode === 'morning')}
          onClick={() => choose('morning')}
          disabled={disabled}
        >
          {describeSchedule(morning, now)}
        </button>
        <button
          type="button"
          className={chip(mode === 'custom')}
          onClick={() => choose('custom')}
          disabled={disabled}
        >
          outro horário
        </button>
      </div>

      {mode === 'custom' && (
        <input
          type="datetime-local"
          className="input-terminal w-full sm:w-auto"
          value={value ? toLocalInput(value) : ''}
          min={toLocalInput(now)}
          max={toLocalInput(new Date(now.getTime() + MAX_AHEAD_MS))}
          disabled={disabled}
          onChange={(e) => {
            const parsed = e.target.value ? new Date(e.target.value) : null
            onChange(parsed && !Number.isNaN(parsed.getTime()) ? parsed : null)
          }}
        />
      )}

      {(nightNow || startsInNight || runsIntoNight) && (
        <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-burn">
          <Moon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {nightNow
              ? `Já é noite — se sair agora, a impressora trabalha enquanto a casa dorme. Que tal ${describeSchedule(morning, now)}?`
              : startsInNight
                ? night.configured
                  ? `Esse horário cai no silêncio da impressora — ela só começa às ${String(night.end).padStart(2, '0')}h.`
                  : 'Esse horário é de madrugada — a impressora vai trabalhar enquanto a casa dorme.'
                : 'Pelo tempo estimado, essa peça vai entrar pela noite.'}
          </span>
        </p>
      )}
    </div>
  )
}
