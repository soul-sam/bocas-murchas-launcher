import * as React from 'react'

/**
 * "Agora", atualizado de tanto em tanto tempo.
 *
 * Textos como "em 45 min" e "expira em 12 min" ficam errados parados na tela.
 * Em vez de cada card ter o próprio setInterval, este hook devolve um Date
 * que muda no ritmo pedido e força o re-render só de quem usa.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = React.useState(() => new Date())

  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])

  return now
}
