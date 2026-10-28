import type { DayStatus, FinishResult, Lang, Level, PublicQuestion } from './api-lingua'

/**
 * LÍNGUA MURCHA — regras puras da tela (o que falar, rótulos, erro → frase).
 * Sem import de valor: roda no `node --test` sem o resto do app.
 */

export const LANG_NAME: Record<Lang, string> = {
  en: 'Inglês',
  ja: 'Japonês',
  fr: 'Francês',
  it: 'Italiano',
  es: 'Espanhol',
  de: 'Alemão',
  zh: 'Mandarim',
  ru: 'Russo'
}

export const LEVEL_LABEL: Record<Level, string> = {
  A1: 'Começando do zero',
  A2: 'Básico',
  B1: 'Intermediário',
  B2: 'Intermediário avançado',
  C1: 'Avançado'
}

/** Como a voz aparece em Configurações > Fala > Adicionar vozes do Windows. */
export const VOICE_PACK_NAME: Record<Lang, string> = {
  en: 'Inglês (Estados Unidos)',
  ja: 'Japonês (Japão)',
  fr: 'Francês (França)',
  it: 'Italiano (Itália)',
  es: 'Espanhol (Espanha)',
  de: 'Alemão (Alemanha)',
  zh: 'Chinês (Simplificado, China)',
  ru: 'Russo (Rússia)'
}

export const LESSONS_PER_LEVEL = 60

/**
 * Texto do enunciado pra voz: só quando o enunciado é estrangeiro (to_pt).
 * Japonês/mandarim aparecem em romaji/pinyin, mas a voz lê o `promptSpeak`.
 */
export function promptSpeech(q: PublicQuestion): string | null {
  if (q.direction !== 'to_pt') return null
  return q.promptSpeak ?? q.prompt
}

/** Texto da opção `i` pra voz: só quando as opções são estrangeiras (from_pt). */
export function optionSpeech(q: PublicQuestion, i: number): string | null {
  if (q.direction !== 'from_pt') return null
  return q.optionsSpeak?.[i] ?? q.options[i] ?? null
}

/** Dá pra abrir a lição da língua hoje (nova ou retomando)? */
export function canOpenToday(today: DayStatus): boolean {
  return today === 'available' || today === 'active'
}

export function dayLabel(today: DayStatus): string {
  switch (today) {
    case 'available':
      return 'Lição de hoje liberada'
    case 'active':
      return 'Lição em andamento'
    case 'done':
      return 'Feita hoje'
    case 'failed':
      return 'Repete amanhã'
  }
}

export function fmtMurchos(n: number): string {
  return Math.round(n).toLocaleString('pt-BR')
}

export function missionsXp(result: FinishResult): number {
  return result.missions.reduce((sum, m) => sum + m.xp, 0)
}

export function resultTitle(result: FinishResult, total: number): string {
  if (result.status === 'failed') return 'Quase! Essa lição volta amanhã'
  if (result.correct >= total) return 'Lição perfeita!'
  return 'Lição concluída'
}

export const MISSION_NAME: Record<FinishResult['missions'][number]['kind'], string> = {
  perfect: 'Lição perfeita',
  five_days: '5 dias na semana'
}

/**
 * Código do erro da API (a mensagem do ApiError). Sem `instanceof` pra não
 * puxar o api.ts aqui; null = falha de rede/outra coisa.
 */
export function errorCode(e: unknown): string | null {
  return e instanceof Error && e.name === 'ApiError' ? e.message : null
}

/**
 * Erro da API → frase. `code` é a mensagem do ApiError (o código, tipo
 * `already_done_today`); null = nem chegou no servidor.
 */
export function errorMessage(code: string | null): string {
  if (code === null) return 'Sem conexão com o servidor. Tenta de novo.'
  switch (code) {
    case 'level_required':
      return 'Escolha o nível antes de começar.'
    case 'already_done_today':
      return 'A lição dessa língua já foi feita hoje. Volta amanhã.'
    case 'attempt_expired':
      return 'Essa lição era de ontem e já fechou.'
    case 'invalid_lang':
      return 'Língua desconhecida.'
    case 'attempt_not_found':
      return 'Lição não encontrada. Recarregue a página.'
    case 'already_placed':
      return 'Você já começou essa língua. O nível não muda mais.'
  }
  // Erro 500 da API e regras de fora (dívida no banco…) já vêm em frase.
  return /\s/.test(code) ? code : 'Deu ruim. Tenta de novo.'
}

/**
 * Nível guardado de um nivelamento interrompido (localStorage) → de onde
 * retomar. Qualquer lixo volta pro A1.
 */
export function placementResume(stored: unknown): Level {
  return typeof stored === 'string' && ['A1', 'A2', 'B1', 'B2', 'C1'].includes(stored) ? (stored as Level) : 'A1'
}
