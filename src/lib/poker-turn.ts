/**
 * A VEZ NO PÔQUER, a parte que é só conta — sem React, pra rodar no
 * `node --test` cru (como lib/poker-chips).
 *
 * 1. Jogada PRÉ-ESCOLHIDA: fora da sua vez você deixa marcado o que fazer
 *    ("passar ou desistir", "pagar 300", "pagar qualquer") e, quando a vez
 *    chega, a mesa decide se a marca ainda vale contra o que é permitido
 *    AGORA. A regra que importa: "pagar 300" só paga 300 — se alguém subiu
 *    no meio, a marca cai e a decisão volta pra pessoa.
 *
 * 2. VALOR DIGITADO: o que a pessoa escreve no campo da aposta, na moeda da
 *    mesa — "1.250", "1250" ou "2,5k" em murchos; "12,50" em reais (vira
 *    centavos). Quem prende ao mínimo/máximo e ao passo é a barra.
 */

export type PreAction = { kind: 'check-fold' | 'check' | 'call-any' } | { kind: 'call'; amount: number }

/** O pedaço das jogadas legais que a pré-escolha consulta. */
export interface PreLegal {
  fold: boolean
  check: boolean
  /** Quanto falta pagar; null quando não há o que pagar. */
  call: number | null
}

export type PrePlay = { type: 'fold' | 'check' | 'call' }

/**
 * Dado o que está marcado e o que a mesa permite agora, a jogada — ou
 * nenhuma (a marca cai e a pessoa decide na mão).
 */
export function resolvePreAction(pre: PreAction, legal: PreLegal, currentBet: number): PrePlay | null {
  switch (pre.kind) {
    case 'check-fold':
      return legal.check ? { type: 'check' } : legal.fold ? { type: 'fold' } : null
    case 'check':
      return legal.check ? { type: 'check' } : null
    case 'call':
      // "Pagar 300" só vale pros mesmos 300: subiu, a decisão volta pra você.
      if (legal.check) return { type: 'check' }
      return legal.call !== null && currentBet === pre.amount ? { type: 'call' } : null
    case 'call-any':
      return legal.check ? { type: 'check' } : legal.call !== null ? { type: 'call' } : null
  }
}

/** Duas marcas iguais? (pra desenhar o botão aceso) */
export function samePreAction(a: PreAction, b: PreAction | null): boolean {
  if (!b || a.kind !== b.kind) return false
  if (a.kind === 'call' && b.kind === 'call') return a.amount === b.amount
  return true
}

export type Currency = 'murchos' | 'brl'

/**
 * Lê um valor digitado na moeda da mesa. `null` quando não dá pra entender.
 *   murchos: "1.250" e "1250" são 1250; "2k" é 2000; "2,5k" é 2500.
 *   reais:   "12,50" e "12.5" são 1250 centavos; "1.250,00" é 125000.
 */
export function parseAmount(text: string, currency: Currency): number | null {
  const clean = text.trim().replace(/\s/g, '')
  if (!clean) return null
  if (currency === 'brl') {
    // Com vírgula, o ponto é milhar; sem vírgula, um ponto só é decimal ("12.5").
    const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean
    if (!/^\d+(\.\d+)?$/.test(normalized)) return null
    const reais = Number(normalized)
    return Number.isFinite(reais) ? Math.round(reais * 100) : null
  }
  const k = /k$/i.test(clean)
  const body = clean.replace(/k$/i, '').replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(body)) return null
  const n = Number(body)
  if (!Number.isFinite(n)) return null
  return Math.round(k ? n * 1000 : n)
}

/** O valor como a pessoa digitaria (sem símbolo): "1250" ou "12,50". */
export function rawAmount(value: number, currency: Currency): string {
  if (currency === 'brl') return (value / 100).toFixed(2).replace('.', ',')
  return String(Math.round(value))
}
