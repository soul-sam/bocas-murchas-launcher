/**
 * Valor de aposta digitado: só dígitos (nada de 12.5, 1e1 ou -20), inteiro
 * dentro de [min, max]. Devolve null quando não serve. Sem imports, pra rodar
 * no `node --test` cru.
 */
export function parseBetAmount(raw: string, min: number, max: number): number | null {
  const text = raw.trim()
  if (!/^\d+$/.test(text)) return null
  const value = Number(text)
  if (!Number.isSafeInteger(value) || value < min || value > max) return null
  return value
}
