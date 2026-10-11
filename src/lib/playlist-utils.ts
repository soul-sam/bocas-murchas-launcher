/**
 * Cópia embaralhada (Fisher–Yates). A original fica intacta: é o estado da
 * tela, e embaralhar ela mudaria a ordem que a pessoa está vendo.
 *
 * O "Aleatório" da playlist embaralha AQUI, a lista inteira, e só depois corta
 * no teto do envio — senão uma playlist de 300 sortearia sempre entre as 100
 * primeiras.
 */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
