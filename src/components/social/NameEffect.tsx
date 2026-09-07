import * as React from 'react'
import { cn } from '@/lib/utils'
import { cosmeticKey } from '@/lib/api-gamification'
import '@/styles/effects.css'

/**
 * Efeito cosmético no nome de alguém: glow, rainbow, glitch, fire.
 *
 * Recebe o id do cosmético como vem do servidor (`effect:glow`) ou só a chave
 * (`glow`). Sem efeito (ou efeito desconhecido) devolve os filhos num span
 * comum, sem classe nenhuma — quem chama não precisa condicionar.
 *
 * O glow precisa do texto duplicado num ::after (ver effects.css); por isso,
 * quando os filhos são uma string, ela vai também em `data-text`.
 */

const EFFECT_CLASS: Record<string, string> = {
  glow: 'fx-glow',
  rainbow: 'fx-rainbow',
  glitch: 'fx-glitch',
  fire: 'fx-fire'
}

export const NAME_EFFECT_KEYS = Object.keys(EFFECT_CLASS)

export function NameEffect({
  effect,
  children,
  className,
  style,
  title,
  animated = true
}: {
  effect: string | null | undefined
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  title?: string
  /**
   * `false` congela o efeito num quadro so (cor/gradiente ficam, movimento
   * nao). E o que a lista de membros e o autor de mensagem usam: la o efeito
   * roda em DEZENAS de nomes ao mesmo tempo e vira movimento periferico
   * permanente, competindo com o chat. O efeito completo continua no perfil,
   * na lojinha e na call — onde a pessoa esta olhando pro nome.
   */
  animated?: boolean
}) {
  const key = cosmeticKey(effect)
  const effectClass = key ? EFFECT_CLASS[key] : undefined
  const text = typeof children === 'string' ? children : undefined

  return (
    <span
      className={cn(effectClass, effectClass && !animated && 'fx-static', className)}
      style={style}
      title={title}
      data-text={effectClass === 'fx-glow' ? text : undefined}
    >
      {children}
    </span>
  )
}
