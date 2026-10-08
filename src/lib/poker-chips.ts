/**
 * FICHAS DO PÔQUER — que fichas a mesa tem e como um valor vira pilhas.
 *
 * Numa mesa de verdade ninguém aposta "1.250": empurra uma preta, duas
 * verdes e duas vermelhas. Aqui é a mesma coisa: cada mesa tem cinco
 * denominações tiradas dos blinds (small blind, big blind, 10, 50 e 200
 * small blinds, arredondadas pra um valor "redondo" de cassino), e qualquer
 * valor da mesa — aposta, pote, a pilha de alguém — vira pilhas dessas
 * fichas. Como a régua anda de small blind em small blind, a menor ficha
 * sempre fecha a conta.
 *
 * Sem imports, pra rodar no `node --test` cru.
 */

export interface ChipDenom {
  value: number
  /** Posição na paleta (0 = a menor ficha da mesa). */
  tone: number
}

export interface ChipStackSpec {
  denom: ChipDenom
  count: number
}

/** Valores "de cassino": é neles que as fichas de cima são arredondadas. */
const NICE = [
  1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1_000, 2_000, 2_500, 5_000, 10_000, 20_000, 25_000, 50_000,
  100_000, 200_000, 250_000, 500_000, 1_000_000
]

function niceAtMost(value: number): number {
  let best = NICE[0]
  for (const n of NICE) {
    if (n <= value) best = n
    else break
  }
  return best
}

/**
 * As cinco fichas da mesa, da menor pra maior. As duas de baixo são os
 * blinds EXATOS (pagar o blind é uma ficha); as de cima são 10, 50 e 200
 * small blinds arredondados pra baixo — 5/10 dá 5, 10, 50, 250, 1.000;
 * 25/50 dá 25, 50, 250, 1.000, 5.000.
 */
export function chipSet(smallBlind: number, bigBlind: number): ChipDenom[] {
  const sb = Math.max(1, Math.round(smallBlind))
  const bb = Math.max(sb, Math.round(bigBlind))
  const values = [sb]
  if (bb > sb) values.push(bb)
  for (const mult of [10, 50, 200]) {
    const v = Math.max(niceAtMost(sb * mult), 1)
    // Arredondar não pode deixar uma ficha que não é múltiplo da menor: a
    // conta precisa fechar sempre.
    const fixed = v % sb === 0 ? v : Math.floor(v / sb) * sb
    if (fixed > values[values.length - 1]) values.push(fixed)
  }
  return values.map((value, tone) => ({ value, tone }))
}

/**
 * Um valor em pilhas, da ficha maior pra menor (guloso: o mínimo de fichas,
 * que é como o crupiê troca). Sobra que não fecha com a menor ficha (pote
 * dividido em número quebrado) vira mais uma ficha pequena — a pilha é
 * desenho; o número exato está escrito do lado.
 */
export function breakdown(amount: number, set: ChipDenom[]): ChipStackSpec[] {
  if (!(amount > 0) || set.length === 0) return []
  const out: ChipStackSpec[] = []
  let rest = Math.round(amount)
  for (let i = set.length - 1; i >= 0; i--) {
    const d = set[i]
    const count = Math.floor(rest / d.value)
    if (count > 0) {
      out.push({ denom: d, count })
      rest -= count * d.value
    }
  }
  if (rest > 0) {
    const smallest = set[0]
    const last = out[out.length - 1]
    if (last && last.denom.value === smallest.value) last.count += 1
    else out.push({ denom: smallest, count: 1 })
  }
  return out
}

/**
 * A pilha de quem está sentado, como ela fica arrumada na frente da pessoa:
 * não o mínimo de fichas (seria só preta), e sim um pouco de cada — até
 * quatro de cada ficha de baixo pra trocar, o resto nas maiores. Só desenho.
 */
export function rackBreakdown(amount: number, set: ChipDenom[], keepSmall = 4): ChipStackSpec[] {
  if (!(amount > 0) || set.length === 0) return []
  let rest = Math.round(amount)
  const counts = new Map<number, number>()
  // Reserva as pequenas primeiro (de baixo pra cima), menos a maior.
  for (let i = 0; i < set.length - 1; i++) {
    const d = set[i]
    const take = Math.min(keepSmall, Math.floor(rest / d.value))
    if (take > 0) {
      counts.set(i, take)
      rest -= take * d.value
    }
  }
  // O resto, guloso de cima pra baixo.
  for (let i = set.length - 1; i >= 0 && rest > 0; i--) {
    const d = set[i]
    const take = Math.floor(rest / d.value)
    if (take > 0) {
      counts.set(i, (counts.get(i) ?? 0) + take)
      rest -= take * d.value
    }
  }
  if (rest > 0) counts.set(0, (counts.get(0) ?? 0) + 1)
  const out: ChipStackSpec[] = []
  for (let i = set.length - 1; i >= 0; i--) {
    const count = counts.get(i) ?? 0
    if (count > 0) out.push({ denom: set[i], count })
  }
  return out
}

/** Soma de uma lista de fichas escolhidas (os valores). */
export function sumChips(values: readonly number[]): number {
  let total = 0
  for (const v of values) total += v
  return total
}

/** Rótulo curto pra ficha: 5, 250, 1k, 2,5k, 20k, 1M — o que cabe no miolo. */
export function chipFace(value: number, currency: 'murchos' | 'brl'): string {
  if (currency === 'brl') {
    const reais = value / 100
    if (reais < 1) return `${Math.round(value)}¢`
    return Number.isInteger(reais) ? `R$${reais}` : `R$${reais.toFixed(2).replace('.', ',')}`
  }
  if (value >= 1_000_000) return `${trim(value / 1_000_000)}M`
  if (value >= 1_000) return `${trim(value / 1_000)}k`
  return String(value)
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',')
}
