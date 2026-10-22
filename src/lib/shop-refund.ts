/**
 * Reembolso na lojinha: a API diz até quando a compra pode ser desfeita
 * (`refundableUntil`, 24h depois dela). Aqui só a leitura disso pra tela.
 */

/** Prazo do reembolso, ou null se já passou (ou o item não é reembolsável). */
export function refundDeadline(
  item: { owned: boolean; refundableUntil?: string | null },
  now: number = Date.now()
): Date | null {
  if (!item.owned || !item.refundableUntil) return null
  const until = new Date(item.refundableUntil)
  return Number.isFinite(until.getTime()) && until.getTime() > now ? until : null
}

/** "faltam 5h" / "faltam 12 min": quanto ainda dá pra reembolsar. */
export function refundTimeLeft(until: Date, now: number = Date.now()): string {
  const minutes = Math.max(1, Math.ceil((until.getTime() - now) / 60_000))
  if (minutes < 60) return `faltam ${minutes} min`
  return `faltam ${Math.floor(minutes / 60)}h`
}
