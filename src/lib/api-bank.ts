import { request } from './api'

/**
 * BANCO DA CASA e PRÊMIO DO ANO — contrato com /api/gamification.
 *
 *   GET  /gamification/bank            -> { bank } reserva, dívida, oferta, regras
 *   POST /gamification/bank/loan       -> { amount, termDays } -> { loan, coins }
 *   POST /gamification/bank/pay        -> { amount? } (vazio = quitar) -> { loan, coins, paid }
 *   GET  /gamification/year-award      -> { award } placar do ano, fundo e prévia
 *
 * As regras (juro, prazos, limite, travas) vêm do servidor em `bank.rules`:
 * a tela nunca decide sozinha quanto alguém pode pegar.
 */

export interface LoanStateView {
  days: number
  interest: number
  penalty: number
  charges: number
  late: boolean
  principalDue: number
  chargesDue: number
  owed: number
}

export interface LoanView {
  id: string
  principal: number
  termDays: number
  createdAt: string
  dueAt: string
  closedAt: string | null
  status: 'open' | 'paid' | string
  principalPaid: number
  chargesPaid: number
  state: LoanStateView
}

export interface LoanOffer {
  eligible: boolean
  reason: string | null
  limit: number
  max: number
  income: number
}

export interface BankRules {
  dailyRate: number
  minDays: number
  terms: number[]
  lateFee: number
  chargeCap: number
  minLoan: number
  maxPrincipal: number
  incomeShare: number
  incomeWindowDays: number
  withhold: { current: number; late: number }
  wagerCapWhileOwing: number
}

export interface BankView {
  reserve: number
  lent: number
  loan: LoanView | null
  history: LoanView[]
  offer: LoanOffer
  rules: BankRules
}

export interface YearStanding {
  userId: string
  displayName: string
  avatar: string | null
  profileColor: string | null
  points: number
  categories: number
  joke: number
  xp: number
  awards: Record<string, number>
}

export interface YearAwardResult {
  year: number
  pool: number
  paid: number
  winners: Array<{ userId: string; displayName: string; place: number; points: number; prize: number }>
  murcho: { userId: string; displayName: string; joke: number } | null
  champions: Record<string, { userId: string; displayName: string; count: number }>
}

export interface YearAwardView {
  year: number
  fund: number
  split: number[]
  weeks: number
  standings: YearStanding[]
  preview: number[]
  result: YearAwardResult | null
  closesAt: string
}

export const bankApi = {
  async view(token: string): Promise<BankView | null> {
    const res = await request<{ bank?: BankView }>('/gamification/bank', { token })
    return res?.bank ?? null
  },

  async take(token: string, amount: number, termDays: number): Promise<{ loan: LoanView; coins: number }> {
    return request('/gamification/bank/loan', {
      method: 'POST',
      token,
      body: JSON.stringify({ amount, termDays })
    })
  },

  /** `amount` omitido = quitar tudo que o saldo cobrir. */
  async pay(token: string, amount?: number): Promise<{ loan: LoanView; coins: number; paid: number }> {
    return request('/gamification/bank/pay', {
      method: 'POST',
      token,
      body: JSON.stringify(amount === undefined ? {} : { amount })
    })
  },

  async yearAward(token: string, year?: number): Promise<YearAwardView | null> {
    const query = year ? `?year=${year}` : ''
    const res = await request<{ award?: YearAwardView }>(`/gamification/year-award${query}`, { token })
    return res?.award ?? null
  }
}
