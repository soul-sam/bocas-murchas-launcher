import type * as React from 'react'

const HEX = /^#[0-9A-Fa-f]{6}$/

/** "#a,#b" de `User.profileGradient` (Cor Suprema). */
export function parseGradient(value: string | null | undefined): [string, string] | null {
  if (!value) return null
  const parts = value.split(',')
  return parts.length === 2 && parts.every((p) => HEX.test(p)) ? [parts[0], parts[1]] : null
}

/**
 * A volta pra primeira cor (a, b, a) deixa o laço sem emenda quando
 * `.name-flow` desliza o fundo de 0% a 200%.
 */
export function gradientStyle([a, b]: [string, string]): React.CSSProperties {
  return {
    '--fx-c': a,
    '--fx-c2': b,
    backgroundImage: `linear-gradient(90deg, ${a}, ${b}, ${a})`
  } as React.CSSProperties
}
