import type { ReactNode } from 'react'
import { Check, Circle } from 'lucide-react'
import { Secao, Vazio } from '@/components/futebol/comum'
import type { LinguaLangState } from '@/lib/api-lingua'
import { LANG_NAME } from '@/lib/lingua-ui'
import { cn } from '@/lib/utils'
import { Flag } from './Flag'

function Mission({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <span className={cn('flex items-center gap-1.5 text-xs', done ? 'text-acid' : 'text-muted-foreground')}>
      {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3.5 w-3.5" aria-hidden />}
      {children}
    </span>
  )
}

/** Missões da semana, por língua já começada: lição perfeita e 5 dias (150 XP cada). */
export function MissionsPanel({ langs }: { langs: LinguaLangState[] }) {
  const started = langs.filter((l) => l.level !== null)

  return (
    <section>
      <Secao>Missões da semana · 150 XP cada</Secao>
      {started.length === 0 ? (
        <Vazio>Escolha uma língua pra liberar as missões.</Vazio>
      ) : (
        <ul className="space-y-1.5">
          {started.map((l) => (
            <li
              key={l.lang}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-brutal border border-line px-3 py-2"
            >
              <span className="flex w-28 items-center gap-2 text-sm text-foreground">
                <Flag lang={l.lang} size={12} /> {LANG_NAME[l.lang]}
              </span>
              <Mission done={l.missions.perfect}>Lição perfeita</Mission>
              <Mission done={l.missions.fiveDays >= 5}>5 dias ({Math.min(l.missions.fiveDays, 5)}/5)</Mission>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
