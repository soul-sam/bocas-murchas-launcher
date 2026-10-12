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

/**
 * Ovos de out/2026 que valem só por estar com o launcher aberto na hora (ou no
 * dia) certa. A API confere com o relógio dela (`when`, com 2 min de folga).
 */
export const TIMED_EGGS: ReadonlyArray<{
  id: string
  test: (now: ClockParts) => boolean
  title: string
  body?: string
}> = [
  { id: 'escadinha', test: (n) => at(n, 12, 34), title: '12:34', body: 'Um, dois, três, quatro.' },
  { id: 'meia-noite', test: (n) => at(n, 0, 0), title: 'Meia-noite', body: 'Virou o dia. Vai dormir.' },
  { id: 'patinhos', test: (n) => at(n, 22, 22), title: '22:22', body: 'Dois patinhos na lagoa.' },
  { id: 'pi', test: (n) => at(n, 3, 14), title: '3:14', body: 'π da madrugada.' },
  { id: 'star-wars', test: (n) => n.month === 5 && n.day === 4, title: 'May the 4th', body: 'Que a força esteja com você.' },
  { id: 'namorados', test: (n) => n.month === 6 && n.day === 12, title: 'Dia dos Namorados', body: 'E você aqui no launcher.' },
  { id: 'arraia', test: (n) => n.month === 6 && n.day === 24, title: 'Arraiá', body: 'Olha a cobra! É mentira.' },
  { id: 'dia-do-gamer', test: (n) => n.month === 8 && n.day === 29, title: 'Dia do Gamer', body: 'Hoje pode jogar sem culpa.' },
  { id: 'criancas', test: (n) => n.month === 10 && n.day === 12, title: 'Dia das Crianças', body: 'A criança murcha que mora em você agradece.' },
  { id: 'bissexto', test: (n) => n.month === 2 && n.day === 29, title: '29 de fevereiro', body: 'Esse dia quase não existe.' },
  { id: 'pi-perfeito', test: (n) => n.month === 3 && n.day === 14 && at(n, 1, 59), title: '3,14159', body: 'Pi perfeito. Um minuto por ano.' },
  { id: 'onze-onze-onze', test: (n) => n.month === 11 && n.day === 11 && at(n, 11, 11), title: '11/11 11:11', body: 'Faz quatro pedidos.' },
  { id: 'azar-dobrado', test: (n) => n.weekday === 5 && n.day === 13 && at(n, 13, 13), title: 'Sexta 13, 13:13', body: 'Azar em dobro. Ou sorte.' }
]

/** Primeiros minutos do ano. */
export function newYear(now: ClockParts): boolean {
  return now.month === 1 && now.day === 1 && now.hour === 0 && now.minute < 15
}
