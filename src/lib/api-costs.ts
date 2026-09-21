import { request } from './api'

/**
 * A CONTA DA HOSPEDAGEM — /api/costs
 *
 *   GET    /costs                -> CostSummary
 *   POST   /costs/paid           -> CostSummary  (marca "paguei" no mês corrente)
 *   DELETE /costs/paid           -> CostSummary  (desmarca a própria)
 *   POST   /costs/confirm/:id    -> CostSummary  (admin: o Pix caiu)
 *   DELETE /costs/confirm/:id    -> CostSummary  (admin: não caiu, desfaz)
 *
 * Tudo vem pronto do servidor, inclusive a CHAVE PIX: ela é um CPF, e este
 * repositório é público. Escrever a chave aqui a publicaria pra internet
 * inteira — por isso ela chega em tempo de execução, do repositório privado
 * da API.
 *
 * QUEM PODE CONFIRMAR TAMBÉM VEM DE LÁ (`canConfirm`), em vez de o launcher
 * olhar o próprio cargo: o servidor é quem recusa a rota, então deixar o botão
 * aparecer por uma conta de cliente só criaria um botão que dá 403.
 */

export interface CostContributor {
  userId: string
  displayName: string
  avatar: string | null
  /** ISO de quando marcou. */
  at: string
}

/** Marcou e está esperando quem recebe conferir. Só chega pra quem confirma. */
export interface PendingContribution extends CostContributor {
  /** ISO de quando entrou na fila. */
  since: string
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
  /** Quem ajudou e já foi conferido por quem recebe. É a lista pública. */
  contributors: CostContributor[]
  /** A fila de quem está esperando. Vazia pra quem não confirma. */
  pending: PendingContribution[]
  /** Marquei — confirmado ou esperando. É o que tira a cobrança da minha tela. */
  iPaid: boolean
  /** Marquei e ainda estou na fila. */
  iAmAwaiting: boolean
  /** Sou eu quem confirma. */
  canConfirm: boolean
}

/**
 * QUANTO JÁ ENTROU E QUANTO FALTA — a conta do mês vista de cima.
 *
 * O resumo do servidor diz o total, a cota de cada um e quem já ajudou; o que
 * ninguém via era a soma. "Somos 9, dá R$ 13,89 pra cada" não responde a única
 * pergunta que faz alguém abrir a carteira: FALTA MUITO?
 *
 * A conta é cota × gente confirmada, e não um valor por pessoa, porque não
 * existe valor por pessoa: ninguém digita quanto pagou, marca-se "paguei" e
 * quem recebe confere no extrato (ver lib/costs.ts na API). Então a leitura
 * honesta é "quantas cotas já caíram".
 *
 * Quem marcou e ainda não foi conferido NÃO entra no que já caiu — entra em
 * `aguardandoCents`, que só tem número pra quem confirma (pro resto a fila
 * chega vazia). Contar promessa como dinheiro na barra faria a conta "fechar"
 * sem ninguém ter recebido nada.
 */
export interface ProgressoDaConta {
  /** Cotas confirmadas, em centavos. */
  pagoCents: number
  /** Quanto ainda falta pra fechar o mês. Zero quando já bateu. */
  faltaCents: number
  /** O que passou do total — cota arredondada pra cima sobra por natureza. */
  sobraCents: number
  /** Marcado e esperando conferência. Zero pra quem não confirma. */
  aguardandoCents: number
  /** 0..100, já limitado: barra que passa de 100% vaza do desenho. */
  percent: number
  /** A conta do mês está paga. */
  bateu: boolean
  /** Quantas cotas ainda faltam. */
  faltamCotas: number
}

export function progressoDaConta(summary: CostSummary): ProgressoDaConta {
  // Nunca zero: é divisor logo abaixo, e um total mal configurado no servidor
  // não pode virar Infinity na tela de todo mundo.
  const cota = Math.max(1, summary.shareCents)
  const pagoCents = summary.contributors.length * cota
  const faltaCents = Math.max(0, summary.totalCents - pagoCents)

  return {
    pagoCents,
    faltaCents,
    sobraCents: Math.max(0, pagoCents - summary.totalCents),
    aguardandoCents: (summary.pending?.length ?? 0) * cota,
    percent: summary.totalCents > 0 ? Math.min(100, Math.round((pagoCents / summary.totalCents) * 100)) : 100,
    bateu: pagoCents >= summary.totalCents,
    faltamCotas: Math.ceil(faltaCents / cota)
  }
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
  },

  confirm(token: string, userId: string): Promise<CostSummary> {
    return request<CostSummary>(`/costs/confirm/${encodeURIComponent(userId)}`, {
      method: 'POST',
      token
    })
  },

  reject(token: string, userId: string): Promise<CostSummary> {
    return request<CostSummary>(`/costs/confirm/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      token
    })
  }
}
