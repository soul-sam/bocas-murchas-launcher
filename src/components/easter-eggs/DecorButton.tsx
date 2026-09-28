import * as React from 'react'
import { Gift } from 'lucide-react'
import { Glyph } from '@/lib/cosmetic-glyphs'
import { emitEgg, type TitleDecor } from '@/lib/easter-eggs/bus'
import { cn } from '@/lib/utils'

/** Morcego de traço, na grade 24 dos glifos da casa. */
const BAT = (
  <path d="M2 9c2 0 3.5 1 4 3 .8-1.2 2-1.7 3-1.5L12 8l3 2.5c1-.2 2.2.3 3 1.5.5-2 2-3 4-3-1 2-1 4 0 6-1.5-1-3-1-4 0-1-1.3-2.2-1.6-3-1l-3 3-3-3c-.8-.6-2-.3-3 1-1-1-2.5-1-4 0 1-2 1-4 0-6Z" />
)

const FOUND: Record<Exclude<TitleDecor, 'leet' | null>, { title: string; body: string }> = {
  halloween: { title: 'Doce ou travessura?', body: 'Travessura. Sempre travessura.' },
  natal: { title: 'Presente adiantado', body: 'Não era meia. Dessa vez.' },
  'sexta-13': { title: 'Desentortou', body: 'Pelo menos a boca não ficou torta hoje.' },
  'primeiro-de-abril': {
    title: 'Primeiro de abril',
    body: 'Não existe Premium. Todo mundo aqui é igualmente murcho.'
  }
}

/**
 * O enfeite do dia, clicável. Mora na barra de título no Electron e flutua no
 * canto na web (onde a barra não existe) — por isso é componente próprio.
 *
 * A sexta-feira 13 NÃO passa por aqui no Electron: lá o enfeite é a própria
 * boca da barra, torta (ver TitleBar). Na web, sem boca, vira este botão.
 */
export function DecorButton({ decor, className }: { decor: Exclude<TitleDecor, 'leet' | null>; className?: string }) {
  const [done, setDone] = React.useState(false)

  const click = (): void => {
    setDone(true)
    emitEgg({ type: 'toast', ...FOUND[decor] })
    emitEgg({ type: 'found', id: decor })
  }

  if (decor === 'primeiro-de-abril') {
    return (
      <button
        type="button"
        onClick={click}
        className={cn(
          'app-no-drag rounded-brutal border border-burn/60 bg-burn/10 px-2 py-0.5 font-display text-[11px] uppercase tracking-[0.2em] text-burn transition-colors hover:bg-burn/20',
          className
        )}
      >
        {done ? 'Enganei o bobo' : 'Assinar Premium'}
      </button>
    )
  }

  const label = decor === 'halloween' ? 'Morcego' : decor === 'natal' ? 'Presente' : 'Boca torta'

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={click}
      className={cn(
        'app-no-drag flex h-6 w-6 items-center justify-center text-burn transition-transform',
        !done && 'egg-balanca',
        className
      )}
    >
      {decor === 'halloween' && <Glyph art={BAT} className="h-4 w-4" />}
      {decor === 'natal' && <Gift className="h-4 w-4" />}
      {decor === 'sexta-13' && (
        <img
          src="bocas-murchas-transp.png"
          alt=""
          aria-hidden
          className={cn('h-5 w-5', !done && 'egg-logo-torta')}
        />
      )}
    </button>
  )
}
