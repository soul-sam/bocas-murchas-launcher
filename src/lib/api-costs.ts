import { request } from './api'

/**
 * A CONTA DA HOSPEDAGEM — /api/costs
 *
 *   GET    /costs        -> CostSummary
 *   POST   /costs/paid   -> CostSummary  (marca "paguei" no mês corrente)
 *   DELETE /costs/paid   -> CostSummary  (desmarca)
 *
 * Tudo vem pronto do servidor, inclusive a CHAVE PIX: ela é um CPF, e este
 * repositório é público. Escrever a chave aqui a publicaria pra internet
 * inteira — por isso ela chega em tempo de execução, do repositório privado
 * da API.
 */

export interface CostContributor {
  userId: string
  displayName: string
  avatar: string | null
  /** ISO de quando marcou. */
  at: string
}

export interface CostSummary {
  /** "2026-09" — o mês que está sendo rateado. */
  month: string
  /** Total mensal em centavos. */
  totalCents: number
  /** Quantas pessoas apareceram nos últimos 30 dias. É por elas que divide. */
  activeUsers: number
  /** Quanto cabe a cada uma, em centavos. */
  shareCents: number
  pixKey: string
  /** O que entra na conta, em português de gente. */
  items: string[]
  contributors: CostContributor[]
  iPaid: boolean
}

/** 2423 -> "R$ 24,23". */
export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** "2026-09" -> "setembro". */
export function monthName(month: string): string {
  const [year, m] = month.split('-').map(Number)
  if (!year || !m) return month
  // Dia 15 pra nenhum fuso empurrar a data pro mês vizinho.
  return new Date(year, m - 1, 15).toLocaleDateString('pt-BR', { month: 'long' })
}

export const costs = {
  get(token: string): Promise<CostSummary> {
    return request<CostSummary>('/costs', { token })
  },

  markPaid(token: string): Promise<CostSummary> {
    return request<CostSummary>('/costs/paid', { method: 'POST', token })
  },

  unmarkPaid(token: string): Promise<CostSummary> {
    return request<CostSummary>('/costs/paid', { method: 'DELETE', token })
  }
}
