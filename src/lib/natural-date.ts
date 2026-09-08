/**
 * DATAS EM PORTUGUÊS — "sexta 21h", "amanhã 20:30", "dia 12 21h", "daqui 30 min".
 *
 * É o que faz "/marcar sexta 21h LoL" virar um evento sem abrir calendário:
 * a pessoa escreve como falaria no chat, a gente entende a parte de
 * data/hora e o que sobra vira o título. Zero dependência: um parser de
 * expressões regulares sobre uma cópia sem acento do texto.
 *
 * A cópia sem acento é montada CARACTERE A CARACTERE, e não com um
 * `normalize()` no texto inteiro: precisamos que o índice N da cópia seja o
 * índice N do original, porque é do original que recortamos as palavras
 * entendidas (pra devolver o título com a grafia da pessoa). Um caractere que
 * não vira exatamente um caractere ao normalizar fica como está — a posição
 * importa mais que o acento.
 *
 * Regras de bom senso quando falta informação:
 *   - só hora ("21h"): hoje; se já passou, amanhã;
 *   - dia da semana sem hora ("sexta LoL"): 20h — a hora em que a galera
 *     costuma se juntar;
 *   - "sexta" numa sexta: hoje, se a hora ainda não passou; senão a próxima;
 *   - "dia 2" com o dia 2 já passado: mês que vem; "12/09" já passado: ano que vem;
 *   - "hoje 15h" às 18h: devolve hoje mesmo, no passado. Quem digitou "hoje"
 *     quis dizer hoje — é o compositor que avisa que já passou, não a gente que
 *     adivinha outro dia.
 */

export interface NaturalDate {
  date: Date
  /** O que sobrou depois de tirar as palavras de data/hora — vira o título. */
  rest: string
  /** As palavras entendidas como data/hora, na ordem em que apareceram. */
  matched: string
}

/** Hora padrão quando só o dia foi dito. */
const DEFAULT_HOUR = 20

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  dom: 0,
  segunda: 1,
  seg: 1,
  terca: 2,
  ter: 2,
  quarta: 3,
  qua: 3,
  quinta: 4,
  qui: 4,
  sexta: 5,
  sex: 5,
  sabado: 6,
  sab: 6
}

const MONTHS: Record<string, number> = {
  janeiro: 0,
  jan: 0,
  fevereiro: 1,
  fev: 1,
  marco: 2,
  mar: 2,
  abril: 3,
  abr: 3,
  maio: 4,
  mai: 4,
  junho: 5,
  jun: 5,
  julho: 6,
  jul: 6,
  agosto: 7,
  ago: 7,
  setembro: 8,
  set: 8,
  outubro: 9,
  out: 9,
  novembro: 10,
  nov: 10,
  dezembro: 11,
  dez: 11
}

type Span = { start: number; end: number }

/** Cópia minúscula e sem acento com os MESMOS índices do original. */
function normalize(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const flat = ch
      .normalize('NFD')
      // Escapes, nao os combining marks crus (mesmo estilo de api-cargos.ts).
      // Crus, o range so' e' valido se quem carrega o JS acertar o charset:
      // servido como latin-1 ele vira lixo, "Range out of order in character
      // class", e o bundle INTEIRO morre no parse — nao so' esta funcao.
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    out += flat.length === 1 ? flat : ch
  }
  return out
}

function overlaps(a: Span, b: Span | null): boolean {
  return !!b && a.start < b.end && b.start < a.end
}

/**
 * Primeiro match de `re` que não pisa em `avoid`. Regex com flag `g` pra
 * poder pular um match e tentar o próximo.
 */
function find(text: string, re: RegExp, avoid: Span | null): RegExpExecArray | null {
  re.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const span = { start: match.index, end: match.index + match[0].length }
    if (!overlaps(span, avoid)) return match
    if (match[0].length === 0) re.lastIndex++
  }
  return null
}

function spanOf(match: RegExpExecArray): Span {
  return { start: match.index, end: match.index + match[0].length }
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function at(day: Date, hour: number, minute: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute)
}

/** Recorta os trechos entendidos e devolve o que sobrou, limpo. */
function leftover(original: string, spans: Span[]): string {
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  let rest = ''
  let cursor = 0
  for (const span of sorted) {
    rest += original.slice(cursor, span.start) + ' '
    cursor = span.end
  }
  rest += original.slice(cursor)
  return rest
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—·,:;]+|[\s\-–—·,:;]+$/g, '')
    .trim()
}

function joinSpans(original: string, spans: Span[]): string {
  return [...spans]
    .sort((a, b) => a.start - b.start)
    .map((s) => original.slice(s.start, s.end).trim())
    .join(' ')
}

// ============================================
// O PARSER
// ============================================

type DatePart =
  | { kind: 'offset'; days: number }
  | { kind: 'weekday'; weekday: number }
  | { kind: 'dayOfMonth'; day: number }
  | { kind: 'dayMonth'; day: number; month: number; year: number | null }

type TimePart = { hour: number; minute: number }

/** "daqui 30 min", "daqui a 2 horas", "em 1h", "daqui meia hora". */
const RELATIVE_RE =
  /\b(?:daqui(?:\s+a)?|em)\s+(?:(\d{1,3})\s*(min(?:utos?)?|m|h(?:oras?|rs)?|horas?)|(meia\s+hora))\b/g

const DATE_RULES: Array<{ re: RegExp; build: (m: RegExpExecArray) => DatePart | null }> = [
  { re: /\bdepois\s+de\s+amanha\b/g, build: () => ({ kind: 'offset', days: 2 }) },
  { re: /\bamanha\b/g, build: () => ({ kind: 'offset', days: 1 }) },
  { re: /\bhoje\b/g, build: () => ({ kind: 'offset', days: 0 }) },
  {
    // 12/09, 12/09/26, 12/09/2026
    re: /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/g,
    build: (m) => {
      const day = Number(m[1])
      const month = Number(m[2]) - 1
      if (day < 1 || day > 31 || month < 0 || month > 11) return null
      const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null
      return { kind: 'dayMonth', day, month, year }
    }
  },
  {
    // "12 de setembro", "dia 12 de set"
    re: /\b(?:dia\s+)?(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/g,
    build: (m) => {
      const day = Number(m[1])
      if (day < 1 || day > 31) return null
      return { kind: 'dayMonth', day, month: MONTHS[m[2]], year: null }
    }
  },
  {
    re: /\bdia\s+(\d{1,2})\b/g,
    build: (m) => {
      const day = Number(m[1])
      return day >= 1 && day <= 31 ? { kind: 'dayOfMonth', day } : null
    }
  },
  {
    // "na sexta", "na próxima sexta-feira", "sex" — até dois enfeites antes do dia
    re: /\b(?:(?:na|no|nesta|neste|proxima|proximo|prox)\s+){0,2}(segunda|terca|quarta|quinta|sexta|sabado|domingo|seg|ter|qua|qui|sex|sab|dom)(?:-feira)?\b/g,
    build: (m) => ({ kind: 'weekday', weekday: WEEKDAYS[m[1]] })
  }
]

function validTime(hour: number, minute: number): TimePart | null {
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

const TIME_RULES: Array<{ re: RegExp; build: (m: RegExpExecArray) => TimePart | null }> = [
  {
    // "9 da noite", "9:30 da noite", "3 da tarde", "10 da manhã"
    re: /\b(?:as\s+)?(\d{1,2})(?:[:h](\d{2}))?\s*(?:h\s*)?da\s+(noite|tarde|manha)\b/g,
    build: (m) => {
      let hour = Number(m[1])
      if (hour > 12) return null
      if (m[3] !== 'manha' && hour < 12) hour += 12
      if (m[3] === 'manha' && hour === 12) hour = 0
      return validTime(hour, Number(m[2] ?? 0))
    }
  },
  {
    // 21h30, 21:30
    re: /\b(?:as\s+)?(\d{1,2})[h:](\d{2})\b/g,
    build: (m) => validTime(Number(m[1]), Number(m[2]))
  },
  {
    // 21h, 21 h, 21hrs, 21 horas
    re: /\b(?:as\s+)?(\d{1,2})\s*h(?:oras?|rs)?\b/g,
    build: (m) => validTime(Number(m[1]), 0)
  },
  { re: /\bmeio[-\s]?dia\b/g, build: () => ({ hour: 12, minute: 0 }) },
  { re: /\bmeia[-\s]?noite\b/g, build: () => ({ hour: 0, minute: 0 }) }
]

/** "sex 21": número solto só vale como hora quando um dia foi dito. */
const BARE_HOUR_RE = /\b(\d{1,2})\b/g

function resolveDate(part: DatePart, time: TimePart, now: Date): Date {
  const today = startOfDay(now)

  switch (part.kind) {
    case 'offset':
      return at(new Date(today.getTime() + part.days * DAY_MS), time.hour, time.minute)

    case 'weekday': {
      const delta = (part.weekday - today.getDay() + 7) % 7
      let candidate = at(new Date(today.getTime() + delta * DAY_MS), time.hour, time.minute)
      if (candidate.getTime() <= now.getTime()) {
        candidate = new Date(candidate.getTime() + 7 * DAY_MS)
      }
      return candidate
    }

    case 'dayOfMonth': {
      let candidate = new Date(today.getFullYear(), today.getMonth(), part.day, time.hour, time.minute)
      if (candidate.getTime() <= now.getTime()) {
        candidate = new Date(today.getFullYear(), today.getMonth() + 1, part.day, time.hour, time.minute)
      }
      return candidate
    }

    case 'dayMonth': {
      const year = part.year ?? today.getFullYear()
      let candidate = new Date(year, part.month, part.day, time.hour, time.minute)
      if (part.year === null && candidate.getTime() <= now.getTime()) {
        candidate = new Date(year + 1, part.month, part.day, time.hour, time.minute)
      }
      return candidate
    }
  }
}

export function parseNaturalDate(text: string, now: Date = new Date()): NaturalDate | null {
  const original = text ?? ''
  if (!original.trim()) return null

  const flat = normalize(original)

  // --- "daqui 30 min" resolve sozinho: não combina com dia nem hora --------
  const relative = find(flat, RELATIVE_RE, null)
  if (relative) {
    let ms: number
    if (relative[3]) {
      ms = 30 * MINUTE_MS
    } else {
      const amount = Number(relative[1])
      ms = relative[2].startsWith('m') ? amount * MINUTE_MS : amount * HOUR_MS
    }
    const span = spanOf(relative)
    return {
      date: new Date(now.getTime() + ms),
      rest: leftover(original, [span]),
      matched: joinSpans(original, [span])
    }
  }

  // --- dia -----------------------------------------------------------------
  let datePart: DatePart | null = null
  let dateSpan: Span | null = null
  for (const rule of DATE_RULES) {
    const match = find(flat, rule.re, null)
    if (!match) continue
    const built = rule.build(match)
    if (!built) continue
    datePart = built
    dateSpan = spanOf(match)
    break
  }

  // --- hora ----------------------------------------------------------------
  let timePart: TimePart | null = null
  let timeSpan: Span | null = null
  for (const rule of TIME_RULES) {
    const match = find(flat, rule.re, dateSpan)
    if (!match) continue
    const built = rule.build(match)
    if (!built) continue
    timePart = built
    timeSpan = spanOf(match)
    break
  }

  if (!timePart && datePart) {
    const match = find(flat, BARE_HOUR_RE, dateSpan)
    if (match) {
      const hour = Number(match[1])
      if (hour >= 0 && hour <= 23) {
        timePart = { hour, minute: 0 }
        timeSpan = spanOf(match)
      }
    }
  }

  if (!datePart && !timePart) return null

  const spans: Span[] = []
  if (dateSpan) spans.push(dateSpan)
  if (timeSpan) spans.push(timeSpan)

  let date: Date
  if (datePart) {
    date = resolveDate(datePart, timePart ?? { hour: DEFAULT_HOUR, minute: 0 }, now)
  } else {
    // Só a hora: hoje, ou amanhã se já passou.
    const time = timePart!
    date = at(startOfDay(now), time.hour, time.minute)
    if (date.getTime() <= now.getTime()) date = new Date(date.getTime() + DAY_MS)
  }

  return {
    date,
    rest: leftover(original, spans),
    matched: joinSpans(original, spans)
  }
}

// ============================================
// FORMATAÇÃO — o caminho de volta, pra tela
// ============================================

const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** "21h", "21h30". */
export function formatTime(d: Date): string {
  return d.getMinutes() === 0 ? `${d.getHours()}h` : `${d.getHours()}h${pad(d.getMinutes())}`
}

/** "hoje", "amanhã", "sexta, 12/09". */
export function formatDayLabel(d: Date, now: Date = new Date()): string {
  const days = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / DAY_MS)
  if (days === 0) return 'hoje'
  if (days === 1) return 'amanhã'
  const base = `${WEEKDAY_NAMES[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
  return d.getFullYear() === now.getFullYear() ? base : `${base}/${d.getFullYear()}`
}

/** "em 45 min", "em 2h", "em 3 dias", "há 20 min". Curto: cabe num card. */
export function formatRelative(d: Date, now: Date = new Date()): string {
  const diff = d.getTime() - now.getTime()
  const abs = Math.abs(diff)
  const prefix = diff >= 0 ? 'em' : 'há'

  if (abs < MINUTE_MS) return diff >= 0 ? 'agora' : 'agora mesmo'
  if (abs < HOUR_MS) return `${prefix} ${Math.round(abs / MINUTE_MS)} min`
  if (abs < DAY_MS) {
    const hours = Math.floor(abs / HOUR_MS)
    const mins = Math.round((abs % HOUR_MS) / MINUTE_MS)
    return mins > 0 && hours < 6 ? `${prefix} ${hours}h${pad(mins)}` : `${prefix} ${hours}h`
  }
  const days = Math.round(
    (startOfDay(d).getTime() - startOfDay(now).getTime()) / DAY_MS
  )
  const n = Math.abs(days)
  return `${prefix} ${n} ${n === 1 ? 'dia' : 'dias'}`
}

/**
 * Linha completa do card: "sexta, 12/09 às 21h · em 3 dias", "hoje às 21h ·
 * em 2h", "começou há 20 min", "já rolou".
 */
export function formatEventWhen(when: string | Date, now: Date = new Date()): string {
  const d = typeof when === 'string' ? new Date(when) : when
  if (Number.isNaN(d.getTime())) return '—'

  const diff = d.getTime() - now.getTime()
  if (diff < 0) {
    if (-diff <= 3 * HOUR_MS) return `começou ${formatRelative(d, now)}`
    return `já rolou · ${formatDayLabel(d, now)}`
  }
  return `${formatDayLabel(d, now)} às ${formatTime(d)} · ${formatRelative(d, now)}`
}

// ============================================
// AUTO-TESTE (só em desenvolvimento)
// ============================================

/**
 * Roda uma vez ao carregar o módulo com `npm run dev`; no build de produção
 * `import.meta.env.DEV` é false e o Vite descarta o bloco inteiro. Não é um
 * test runner — é um cheiro no console se alguém quebrar uma regra mexendo
 * nas regexes. Base: sexta, 4/9/2026 às 18:00.
 */
if (import.meta.env.DEV) {
  const base = new Date(2026, 8, 4, 18, 0)
  const expect = (
    input: string,
    want: [number, number, number, number, number] | null,
    rest?: string
  ): void => {
    const got = parseNaturalDate(input, base)
    if (want === null) {
      console.assert(got === null, `[natural-date] "${input}" devia falhar, deu`, got)
      return
    }
    const [y, m, d, h, min] = want
    const ok =
      !!got &&
      got.date.getFullYear() === y &&
      got.date.getMonth() === m - 1 &&
      got.date.getDate() === d &&
      got.date.getHours() === h &&
      got.date.getMinutes() === min &&
      (rest === undefined || got.rest === rest)
    console.assert(
      ok,
      `[natural-date] "${input}" -> esperado ${d}/${m}/${y} ${h}:${min} rest=${rest ?? '*'}, deu`,
      got && `${got.date.toString()} rest="${got.rest}"`
    )
  }

  expect('hoje 21h', [2026, 9, 4, 21, 0], '')
  expect('amanhã 20:30 LoL', [2026, 9, 5, 20, 30], 'LoL')
  expect('amanha 20h30', [2026, 9, 5, 20, 30])
  expect('sexta 21h', [2026, 9, 4, 21, 0])
  expect('sexta 17h', [2026, 9, 11, 17, 0])
  expect('sex 21 ranked', [2026, 9, 4, 21, 0], 'ranked')
  expect('sábado 15h', [2026, 9, 5, 15, 0])
  expect('sabado 15h', [2026, 9, 5, 15, 0])
  expect('dia 12 21h', [2026, 9, 12, 21, 0])
  expect('dia 2 21h', [2026, 10, 2, 21, 0])
  expect('12/09 21h', [2026, 9, 12, 21, 0])
  expect('12/09/2026 21:00', [2026, 9, 12, 21, 0])
  expect('21h', [2026, 9, 4, 21, 0])
  expect('17h', [2026, 9, 5, 17, 0])
  expect('daqui 30 min', [2026, 9, 4, 18, 30])
  expect('em 2h', [2026, 9, 4, 20, 0])
  expect('depois de amanhã 19h', [2026, 9, 6, 19, 0])
  expect('LoL sexta', [2026, 9, 4, 20, 0], 'LoL')
  expect('9 da noite minecraft', [2026, 9, 4, 21, 0], 'minecraft')
  expect('Aram na quinta às 22h', [2026, 9, 10, 22, 0], 'Aram')
  expect('treino', null)
}
