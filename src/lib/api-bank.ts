import { request } from './api'

/**
 * BANCO DA CASA e PRÊMIO DO ANO — contrato com /api/gamification.
 *
 *   GET  /gamification/bank            -> { bank } livre no Banco, dívida, oferta, regras
 *   POST /gamification/bank/loan       -> { amount, termDays } -> { loan, coins }
 *   POST /gamification/bank/pay        -> { amount? } (vazio = quitar) -> { loan, coins, paid }
 *   GET  /gamification/year-award      -> { award } placar do ano, fundo e prévia
 *
 *   GET  /gamification/invest                 -> { invest } aplicações, teto, último rendimento
 *   POST /gamification/invest                 -> { amount, termWeeks } -> { deposit, coins }
 *   POST /gamification/invest/:id/withdraw    -> { deposit, coins, forfeited }
 *   POST /gamification/invest/daily           -> { amount } -> { coins }
 *   POST /gamification/invest/daily/withdraw  -> { amount? } (vazio = tudo) -> { coins, paid, minted }
 *   POST /gamification/invest/daily/auto      -> { on } -> { auto }
 *   POST /gamification/invest/term            -> { amount, days } -> { deposit, coins }
 *   POST /gamification/invest/term/:id/withdraw -> { coins, paid, earned, lost }
 *
 *   GET  /gamification/consortium             -> { consortium } planos, meus grupos, carta
 *   POST /gamification/consortium/join        -> { plan } -> { groupId, consortium }
 *   POST /gamification/consortium/:g/leave    -> { result: left|quit, consortium }
 *   POST /gamification/consortium/arrears     -> { paid, coins, consortium }
 *   POST /gamification/consortium/carta/:m/cashout -> { net, fee, consortium }
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
  /** Limite individual: sobe quitando no prazo, cai atrasando (ver `rules.limit`). */
  limit: number
  max: number
  /** Pegando pelo menos `minPrincipal` e quitando no prazo, o limite vira `next`. */
  growth: { minPrincipal: number; next: number }
}

export interface BankRules {
  dailyRate: number
  minDays: number
  terms: number[]
  lateFee: number
  chargeCap: number
  minLoan: number
  limit: {
    start: number
    floor: number
    max: number
    usage: number
    up: number
    late: number
    severe: number
    severeLateDays: number
  }
  /** `current`/`late`: renda de atividade. `wagerProfit*`: lucro de aposta. */
  withhold: { current: number; late: number; wagerProfit: number; wagerProfitLate: number }
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

export interface DepositView {
  id: string
  amount: number
  termWeeks: number
  earned: number
  status: 'open' | 'redeemed' | 'withdrawn' | string
  createdAt: string
  /** Primeiro fechamento que rende (domingo 21h). */
  startsAt: string
  maturesAt: string
  closedAt: string | null
}

export interface InvestYieldInfo {
  weekStart: string
  pool: number
  paid: number
  burned: number
  rate: number
  eligible: number
}

/** CDB congelado (7/15/30/60 dias). `now` = se sair agora. */
export interface TermView {
  id: string
  amount: number
  termDays: number
  rate: number
  status: 'open' | 'redeemed' | 'withdrawn' | string
  paid: number
  createdAt: string
  maturesAt: string
  closedAt: string | null
  now: { fraction: number; accrued: number; share: number; earned: number; total: number }
}

/** CDB novo: diário e congelado. O murcho aplicado entra no Banco. */
export interface CdbView {
  savings: { total: number; earning: number; pending: number; earned: number; auto: boolean }
  terms: TermView[]
  termHistory: TermView[]
  eligible: boolean
  reason: string | null
  rules: {
    minDeposit: number
    monthlyRate: number
    dailyRate: number
    terms: Array<{ days: number; rate: number }>
    early: Array<{ from: number; share: number }>
    sweepHour: number
  }
}

export interface InvestView {
  /** CDB novo. Sem ele (API antiga), a aba mostra só o antigo. */
  cdb?: CdbView
  /** CDB antigo (2/4 semanas): só termina o que já está aberto. */
  open: DepositView[]
  history: DepositView[]
  room: number
  eligible: boolean
  reason: string | null
  /** Pote esperando o próximo fechamento (o juro do Banco da semana). */
  pool: number
  invested: number
  lastYield: InvestYieldInfo | null
  rules: { terms: number[]; minDeposit: number; maxOpen: number; maxWeeklyRate: number; yieldShare: number }
}

export type ConsortiumPlanId = 'epico' | 'lendario' | 'supremo'

export interface ConsortiumParcel {
  base: number
  admin: number
  reserve: number
  total: number
}

export interface ConsortiumPlanView {
  id: ConsortiumPlanId
  name: string
  carta: number
  parcels: Array<{ size: number } & ConsortiumParcel>
  forming: { groupId: string; number: number; members: Array<{ userId: string; displayName: string }> } | null
  joined: boolean
}

export interface MembershipView {
  memberId: string
  groupId: string
  plan: ConsortiumPlanId
  name: string
  number: number
  groupStatus: 'forming' | 'running' | 'done' | string
  status: 'active' | 'quit' | string
  size: number
  done: number
  parcel: ConsortiumParcel
  paidCount: number
  arrears: number
  contemplatedAt: string | null
  credit: number
  creditLeft: number
  creditUntil: string | null
  members: Array<{ userId: string; displayName: string; contemplated: boolean; quit: boolean }>
  assemblies: Array<{ index: number; weekStart: string; winner: string | null; carta: number }>
  nextAssembly: string | null
}

export interface ConsortiumView {
  plans: ConsortiumPlanView[]
  mine: MembershipView[]
  carta: number
  arrears: number
  eligible: boolean
  reason: string | null
  rules: {
    minMembers: number
    maxMembers: number
    adminFee: number
    reserveFee: number
    quitPenalty: number
    cartaGraceDays: number
    cashOutFee: number
    /** Multa e juro diário do atraso (servidor antigo não manda). */
    lateFee?: number
    lateDailyRate?: number
  }
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

  async invest(token: string): Promise<InvestView | null> {
    const res = await request<{ invest?: InvestView }>('/gamification/invest', { token })
    return res?.invest ?? null
  },

  async deposit(token: string, amount: number, termWeeks: number): Promise<{ deposit: DepositView; coins: number }> {
    return request('/gamification/invest', { method: 'POST', token, body: JSON.stringify({ amount, termWeeks }) })
  },

  async withdraw(token: string, id: string): Promise<{ deposit: DepositView; coins: number; forfeited: number }> {
    return request(`/gamification/invest/${encodeURIComponent(id)}/withdraw`, { method: 'POST', token, body: '{}' })
  },

  async savingsDeposit(token: string, amount: number): Promise<{ coins: number }> {
    return request('/gamification/invest/daily', { method: 'POST', token, body: JSON.stringify({ amount }) })
  },

  /** `amount` omitido = resgatar tudo. */
  async savingsWithdraw(token: string, amount?: number): Promise<{ coins: number; paid: number; minted: number }> {
    return request('/gamification/invest/daily/withdraw', {
      method: 'POST',
      token,
      body: JSON.stringify(amount === undefined ? {} : { amount })
    })
  },

  async savingsAuto(token: string, on: boolean): Promise<{ auto: boolean }> {
    return request('/gamification/invest/daily/auto', { method: 'POST', token, body: JSON.stringify({ on }) })
  },

  async termDeposit(token: string, amount: number, days: number): Promise<{ deposit: TermView; coins: number }> {
    return request('/gamification/invest/term', { method: 'POST', token, body: JSON.stringify({ amount, days }) })
  },

  async termWithdraw(token: string, id: string): Promise<{ coins: number; paid: number; earned: number; lost: number }> {
    return request(`/gamification/invest/term/${encodeURIComponent(id)}/withdraw`, { method: 'POST', token, body: '{}' })
  },

  async consortium(token: string): Promise<ConsortiumView | null> {
    const res = await request<{ consortium?: ConsortiumView }>('/gamification/consortium', { token })
    return res?.consortium ?? null
  },

  async join(token: string, plan: ConsortiumPlanId): Promise<{ groupId: string; consortium: ConsortiumView }> {
    return request('/gamification/consortium/join', { method: 'POST', token, body: JSON.stringify({ plan }) })
  },

  async leave(token: string, groupId: string): Promise<{ result: 'left' | 'quit'; consortium: ConsortiumView }> {
    return request(`/gamification/consortium/${encodeURIComponent(groupId)}/leave`, { method: 'POST', token, body: '{}' })
  },

  async payArrears(token: string): Promise<{ paid: number; coins: number; consortium: ConsortiumView }> {
    return request('/gamification/consortium/arrears', { method: 'POST', token, body: '{}' })
  },

  async cashOut(token: string, memberId: string): Promise<{ net: number; fee: number; consortium: ConsortiumView }> {
    return request(`/gamification/consortium/carta/${encodeURIComponent(memberId)}/cashout`, {
      method: 'POST',
      token,
      body: '{}'
    })
  },

  async yearAward(token: string, year?: number): Promise<YearAwardView | null> {
    const query = year ? `?year=${year}` : ''
    const res = await request<{ award?: YearAwardView }>(`/gamification/year-award${query}`, { token })
    return res?.award ?? null
  }
}
