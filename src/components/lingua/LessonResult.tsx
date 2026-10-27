import { ArrowUp, Flame, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { FinishResult, Lang } from '@/lib/api-lingua'
import { LANG_NAME, MISSION_NAME, missionsXp, resultTitle } from '@/lib/lingua-ui'
import { cn } from '@/lib/utils'
import { Flag } from './Flag'

/** Fim da lição: acertos, XP, missões, ofensiva e subida de nível. */
export function LessonResult({
  lang,
  total,
  result,
  onBack
}: {
  lang: Lang
  total: number
  result: FinishResult
  onBack: () => void
}) {
  const failed = result.status === 'failed'
  const bonus = missionsXp(result)

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 py-6 text-center">
      <Flag lang={lang} size={32} />
      <div>
        <h2 className={cn('title-brutal text-3xl', failed ? 'text-destructive' : 'text-acid')}>
          {resultTitle(result, total)}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {LANG_NAME[lang]}: {result.correct}/{total} acertos
        </p>
      </div>

      <div className="grid w-full grid-cols-2 gap-2">
        <div className="rounded-brutal border border-line bg-surface-raised px-3 py-3">
          <p className="font-mono text-2xl font-bold text-acid">+{result.xp + bonus}</p>
          <p className="text-xs text-muted-foreground">XP</p>
        </div>
        <div className="rounded-brutal border border-line bg-surface-raised px-3 py-3">
          <p className="flex items-center justify-center gap-1 font-mono text-2xl font-bold text-burn">
            <Flame className="h-5 w-5" aria-hidden />
            {result.streak}
          </p>
          <p className="text-xs text-muted-foreground">
            {result.streak === 1 ? 'dia' : 'dias'} de ofensiva · geral {result.generalStreak}
          </p>
        </div>
      </div>

      {result.missions.length > 0 && (
        <ul className="w-full space-y-1.5">
          {result.missions.map((m) => (
            <li
              key={m.kind}
              className="flex items-center gap-2 rounded-brutal border border-acid/40 bg-acid/10 px-3 py-2 text-sm text-acid"
            >
              <Target className="h-4 w-4" aria-hidden />
              <span className="flex-1 text-left">Missão: {MISSION_NAME[m.kind]}</span>
              <span className="font-mono">+{m.xp} XP</span>
            </li>
          ))}
        </ul>
      )}

      {result.levelUp && (
        <p className="flex items-center gap-2 rounded-brutal border border-burn/50 bg-burn/10 px-3 py-2 text-sm text-burn">
          <ArrowUp className="h-4 w-4" aria-hidden />
          Subiu pro {result.levelUp}!
        </p>
      )}

      {failed && (
        <p className="text-xs text-muted-foreground">Os acertos contaram. Amanhã tem outra.</p>
      )}

      <Button onClick={onBack} autoFocus>
        Voltar
      </Button>
    </div>
  )
}
