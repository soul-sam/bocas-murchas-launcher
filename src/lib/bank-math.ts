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

/** Valor digitado no campo: só inteiro dentro de [min, max], senão null. */
export function parseLoanAmount(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value) || value < min || value > max) return null
  return value
}
