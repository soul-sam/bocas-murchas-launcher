import { Flame } from 'lucide-react'
import type { Lang, LinguaLangState } from '@/lib/api-lingua'
import { canOpenToday, dayLabel, LANG_NAME, LESSONS_PER_LEVEL } from '@/lib/lingua-ui'
import { cn } from '@/lib/utils'
import { Flag } from './Flag'

/** As 7 línguas: nível, lição, ofensiva e como está a lição de hoje. */
export function LanguageGrid({
  langs,
  busyLang,
  onOpen
}: {
  langs: LinguaLangState[]
  busyLang: Lang | null
  onOpen: (lang: Lang) => void
}) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {langs.map((l) => {
        const open = canOpenToday(l.today)
        const pending = l.today === 'active' || l.today === 'awaiting_life'
        return (
          <button
            key={l.lang}
            type="button"
            onClick={() => onOpen(l.lang)}
            disabled={!open || busyLang !== null}
            className={cn(
              'flex items-center gap-3 rounded-brutal border px-3.5 py-3 text-left transition-colors',
              open
                ? 'border-line bg-surface-raised hover:border-acid/50 hover:bg-acid/5'
                : 'cursor-default border-line/60 opacity-70',
              pending && 'border-burn/50',
              busyLang === l.lang && 'animate-pulse'
            )}
          >
            <Flag lang={l.lang} size={26} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="truncate text-sm font-semibold text-foreground">{LANG_NAME[l.lang]}</span>
                {l.level && <span className="font-mono text-xs text-acid">{l.level}</span>}
              </span>
              <span className="block text-xs text-muted-foreground">
                {l.level ? `lição ${l.lesson}/${LESSONS_PER_LEVEL}` : 'Escolher nível'}
              </span>
              <span
                className={cn(
                  'block text-[11px]',
                  pending ? 'text-burn' : l.today === 'available' ? 'text-acid' : 'text-muted-foreground'
                )}
              >
                {dayLabel(l.today)}
              </span>
            </span>
            {l.streak > 0 && (
              <span className="flex items-center gap-0.5 font-mono text-sm text-burn" title="Ofensiva nessa língua">
                <Flame className="h-4 w-4" aria-hidden />
                {l.streak}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
