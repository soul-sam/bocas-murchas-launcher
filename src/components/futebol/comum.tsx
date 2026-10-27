import * as React from 'react'
import { cn } from '@/lib/utils'

/** Peças pequenas que as abas da tela de futebol dividem. */

export function Secao({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn('mb-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground', className)}>
      {children}
    </h2>
  )
}

/** Fileira de filtros que rola de lado no celular em vez de quebrar em três linhas. */
export function Chips<T extends string>({
  opcoes,
  atual,
  onChange,
  rotulo
}: {
  opcoes: Array<{ id: T; nome: string; extra?: React.ReactNode }>
  atual: T
  onChange: (id: T) => void
  rotulo: string
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === atual}
          onClick={() => onChange(o.id)}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-brutal border px-2.5 py-1 text-xs transition-colors',
            o.id === atual
              ? 'border-acid/60 bg-acid/10 text-acid'
              : 'border-line text-muted-foreground hover:bg-void-light hover:text-foreground'
          )}
        >
          {o.nome}
          {o.extra}
        </button>
      ))}
    </div>
  )
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
}
