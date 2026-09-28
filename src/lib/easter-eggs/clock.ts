import type { TitleDecor } from './bus'

/**
 * O relógio dos ovos de data e hora — em São Paulo, igual à API.
 *
 * Esta regra só decide o que DESENHAR. Quem decide se o ovo vale é o servidor
 * (lib/gamification/easter-eggs.ts, `when`), com o relógio dele: adiantar o
 * relógio do PC faz o morcego aparecer, mas não paga nada.
 */

export interface ClockParts {
  month: number
  day: number
  hour: number
  minute: number
  /** 0 = domingo. */
  weekday: number
}

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  weekday: 'short',
  hour12: false
})

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function clockNow(date: Date = new Date()): ClockParts {
  const parts: Record<string, string> = {}
  for (const p of formatter.formatToParts(date)) parts[p.type] = p.value
  return {
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday] ?? 0
  }
}

function at(now: ClockParts, hour: number, minute: number): boolean {
  return now.hour === hour && now.minute === minute
}

/** O enfeite da barra agora. O minuto exato ganha do dia inteiro. */
export function decorFor(now: ClockParts): TitleDecor {
  if (at(now, 13, 37)) return 'leet'
  if (now.month === 4 && now.day === 1) return 'primeiro-de-abril'
  if (now.month === 10 && now.day === 31) return 'halloween'
  if (now.month === 12 && (now.day === 24 || now.day === 25)) return 'natal'
  if (now.weekday === 5 && now.day === 13) return 'sexta-13'
  return null
}

/** Estrela cadente: 11:11 e 23:11. */
export function shootingStarTime(now: ClockParts): boolean {
  return at(now, 11, 11) || at(now, 23, 11)
}

/** 3:33 da manhã: a tela escurece e o ovo vale só por estar ali. */
export function deadHour(now: ClockParts): boolean {
  return at(now, 3, 33)
}

/** Primeiros minutos do ano. */
export function newYear(now: ClockParts): boolean {
  return now.month === 1 && now.day === 1 && now.hour === 0 && now.minute < 15
}
