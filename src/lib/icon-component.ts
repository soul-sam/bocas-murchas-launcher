import type { ComponentType } from 'react'

/**
 * Um ícone de traço que a tela desenha passando só a classe — serve tanto pros
 * do lucide quanto pros da casa (`@/lib/bocas-icons`). Mapas e catálogos que
 * misturam os dois tipam por aqui em vez de `LucideIcon`, sem cast nenhum:
 * qualquer componente que aceite `className` (e, opcionalmente, o traço)
 * encaixa pela estrutura.
 */
export type IconComponent = ComponentType<{
  className?: string
  strokeWidth?: number | string
  'aria-hidden'?: boolean | 'true' | 'false'
  'aria-label'?: string
}>
