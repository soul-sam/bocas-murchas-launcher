/**
 * Contas do Banco da Casa pra PRÉVIA na tela — espelho de `loanState` e
 * `BANK` do servidor (lib/gamification/rules.ts). O servidor recalcula tudo:
 * isto só mostra "pegando 1.000 por 14 dias, você devolve 1.098".
 *
 * Sem import nenhum de propósito: roda no `node --test` (test:policy).
 */

export interface BankRulesLike {
  dailyRate: number
  minDays: number
  lateFee: number
  chargeCap: number
}

/** Juro simples de um empréstimo de `principal` quitado depois de `days` dias. */
export function loanInterest(principal: number, days: number, rules: BankRulesLike): number {
  const counted = Math.max(rules.minDays, Math.ceil(Math.max(0, days)))
  const interest = Math.ceil(principal * rules.dailyRate * counted)
  return Math.min(Math.floor(principal * rules.chargeCap), interest)
}

/** Quanto se devolve quitando no último dia do prazo. */
export function loanTotalAtTerm(principal: number, termDays: number, rules: BankRulesLike): number {
  return principal + loanInterest(principal, termDays, rules)
}

/** Dias inteiros (pra cima) até `iso`, a partir de `now`. Negativo = já passou. */
export function daysUntil(iso: string, now = Date.now()): number {
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000)
}

/** "0,7%" — fração em porcentagem curta, com vírgula. */
export function percentText(fraction: number): string {
  const value = Math.round(fraction * 1000) / 10
  return `${String(value).replace('.', ',')}%`
}

/**
 * O máximo que uma aplicação do CDB pode render no prazo: o teto semanal em
 * todos os fechamentos. O de verdade sai do pote da semana e pode ser menos
 * (ou zero) — a tela diz "até".
 */
export function maxYield(amount: number, termWeeks: number, maxWeeklyRate: number): number {
  const perWeek = Math.floor(Math.max(0, amount) * maxWeeklyRate + 1e-9)
  return perWeek * Math.max(0, Math.floor(termWeeks))
}

/** Chance de sair a carta no próximo sorteio, com `pending` ainda esperando. */
export function cartaChance(pending: number): number {
  return pending > 0 ? 1 / pending : 0
}

/** Valor digitado no campo: só inteiro dentro de [min, max], senão null. */
export function parseLoanAmount(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value) || value < min || value > max) return null
  return value
}
