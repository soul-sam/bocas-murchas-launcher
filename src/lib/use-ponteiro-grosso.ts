import * as React from 'react'

/**
 * DEDO OU MOUSE?
 *
 * Largura (`isPhone`) responde "quanto espaço tem"; isto responde "o que está
 * apontando". As duas perguntas quase sempre dão a mesma resposta, mas não
 * sempre: um tablet deitado tem 1024px de largura e só dedo — lá o hover não
 * existe, o Enter é do teclado virtual e o alvo de 32px continua pequeno.
 *
 * Quem decide LAYOUT usa `isPhone`. Quem decide INTERAÇÃO — se há hover, se
 * Enter envia ou quebra linha, se cabe um alvo de 44px — usa isto.
 *
 * `hover: none` entra junto porque é o que separa o tablet do notebook com
 * tela sensível ao toque: lá o mouse ainda existe e o hover funciona.
 */
const CONSULTA = '(pointer: coarse) and (hover: none)'

export function usePonteiroGrosso(): boolean {
  const [grosso, setGrosso] = React.useState(
    () => typeof window !== 'undefined' && window.matchMedia(CONSULTA).matches
  )

  React.useEffect(() => {
    const consulta = window.matchMedia(CONSULTA)
    const aplicar = (): void => setGrosso(consulta.matches)
    // Plugar um mouse num tablet (ou abrir o DevTools em modo aparelho) muda a
    // resposta com o app aberto.
    consulta.addEventListener('change', aplicar)
    return () => consulta.removeEventListener('change', aplicar)
  }, [])

  return grosso
}
