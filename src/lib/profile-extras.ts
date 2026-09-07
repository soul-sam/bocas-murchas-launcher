/**
 * ANIVERSÁRIO E FUSO — a parte "gente" do perfil.
 *
 * Os dois campos existem por um motivo prático deste grupo: metade joga de
 * madrugada e tem gente fora do Brasil, então "ele tá acordado?" é pergunta
 * de verdade antes de chamar pra call; e aniversário sem ninguém lembrar é
 * aniversário perdido.
 *
 * Aniversário é guardado como "MM-DD", SEM ANO: o que a tela usa é o dia. Ano
 * seria pedir a idade de todo mundo pra um recurso que não usa idade.
 *
 * Fuso é string IANA ("America/Sao_Paulo"). Toda conta de hora sai do `Intl`,
 * nunca de somar offset na mão — horário de verão muda de país pra país e de
 * ano pra ano, e é isso que transforma "que horas são pra ele" em uma hora
 * errada durante três semanas por ano.
 */

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro'
]

/** Pros seletores do editor. 29/02 existe: quem nasceu em bissexto também faz. */
export const MONTHS = MONTH_NAMES.map((label, index) => ({
  value: String(index + 1).padStart(2, '0'),
  label
}))

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function daysInMonth(month: string): number {
  const index = Number(month) - 1
  return DAYS_IN_MONTH[index] ?? 31
}

/** Aceita só "MM-DD" válido. Qualquer outra coisa vira null. */
export function parseBirthday(raw: string | null | undefined): { month: string; day: string } | null {
  if (!raw) return null
  const match = /^(\d{2})-(\d{2})$/.exec(raw)
  if (!match) return null

  const month = Number(match[1])
  const day = Number(match[2])
  if (month < 1 || month > 12) return null
  if (day < 1 || day > DAYS_IN_MONTH[month - 1]) return null

  return { month: match[1], day: match[2] }
}

/** "14 de março". Null quando não tem (ou tem lixo salvo). */
export function formatBirthday(raw: string | null | undefined): string | null {
  const parsed = parseBirthday(raw)
  if (!parsed) return null
  return `${Number(parsed.day)} de ${MONTH_NAMES[Number(parsed.month) - 1]}`
}

/**
 * "MM-DD" de hoje, no fuso pedido.
 *
 * `en-CA` porque ele formata como "2026-09-07" — ISO, com as partes na ordem
 * certa e sempre com dois dígitos. Montar isso com getMonth()/getDate() daria
 * a data da MÁQUINA de quem está olhando, não a do fuso pedido.
 */
function todayIn(timeZone?: string | null): string | null {
  try {
    const iso = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date())
    return iso.slice(5) // "MM-DD"
  } catch {
    // Fuso inválido salvo no banco. Não pode derrubar o cartão de perfil.
    return null
  }
}

/**
 * É hoje?
 *
 * Comparado no fuso DA PESSOA quando ela tem um: às 22h de Lisboa já é o dia
 * seguinte pra quem está lá, e o aniversário é dela. Sem fuso salvo, cai no
 * fuso de quem está olhando, que é o melhor palpite disponível.
 */
export function isBirthdayToday(
  birthday: string | null | undefined,
  timezone?: string | null
): boolean {
  const parsed = parseBirthday(birthday)
  if (!parsed) return false
  const today = todayIn(timezone) ?? todayIn(null)
  return today === `${parsed.month}-${parsed.day}`
}

/** "23:41" no fuso pedido. Null se o fuso não presta. */
export function localTimeIn(timeZone: string | null | undefined): string | null {
  if (!timeZone) return null
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date())
  } catch {
    return null
  }
}

/**
 * A diferença de horas em relação a quem está olhando.
 *
 * É o que responde de verdade "posso chamar ele agora?": saber que são 04:12
 * lá só ajuda depois de fazer a conta. Devolve null quando é o mesmo fuso —
 * não faz sentido escrever "0h de diferença".
 */
export function hourDifference(timeZone: string | null | undefined): number | null {
  if (!timeZone) return null

  const now = new Date()
  const there = zonedOffsetMinutes(now, timeZone)
  const here = zonedOffsetMinutes(now, detectTimezone())
  if (there === null || here === null) return null

  const diff = Math.round((there - here) / 60)
  return diff === 0 ? null : diff
}

/**
 * Offset de um fuso em minutos, medido pelo próprio Intl.
 *
 * O truque: formata o MESMO instante no fuso alvo e lê de volta como se fosse
 * UTC. A diferença entre os dois é o offset — com horário de verão já
 * aplicado, porque foi o Intl que formatou.
 */
function zonedOffsetMinutes(date: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).formatToParts(date)

    const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? NaN)

    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second')
    )
    if (!Number.isFinite(asUtc)) return null

    return Math.round((asUtc - date.getTime()) / 60_000)
  } catch {
    return null
  }
}

/** O fuso desta máquina. Serve de padrão e do botão "usar o meu". */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'
  } catch {
    return 'America/Sao_Paulo'
  }
}

/**
 * Fusos que valem virar opção.
 *
 * Se o runtime souber listar (`Intl.supportedValuesOf`, que o Chromium do
 * Electron sabe), usamos a lista completa: `<select>` nativo já é navegável
 * digitando, então 400 opções não incomodam. Se não souber, cai numa lista
 * curta com o que o grupo usa de fato — melhor curta do que vazia.
 */
export function timezoneOptions(): string[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf

  if (typeof supported === 'function') {
    try {
      const all = supported.call(Intl, 'timeZone')
      if (Array.isArray(all) && all.length > 0) return all
    } catch {
      /* cai no fallback */
    }
  }

  return [
    'America/Sao_Paulo',
    'America/Manaus',
    'America/Rio_Branco',
    'America/Belem',
    'America/Fortaleza',
    'America/Noronha',
    'America/New_York',
    'America/Los_Angeles',
    'Europe/Lisbon',
    'Europe/London',
    'Europe/Madrid',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Australia/Sydney',
    'UTC'
  ]
}
