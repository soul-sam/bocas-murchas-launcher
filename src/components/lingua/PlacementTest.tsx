import * as React from 'react'
import { Check, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { lingua, type Lang, type Level, type PlacementResult, type PublicQuestion } from '@/lib/api-lingua'
import { useAuth } from '@/lib/auth-context'
import { errorCode, errorMessage, LANG_NAME, LEVEL_LABEL, placementResume } from '@/lib/lingua-ui'
import { Flag } from './Flag'

/**
 * Primeira vez numa língua: teste de nivelamento (ou começar do zero).
 *
 * Blocos de 5 perguntas por nível, do A1 pra cima; o servidor corrige cada
 * bloco e diz se passou (4+) — sem mostrar qual estava certa, que essas
 * perguntas também caem nas lições. Começa no primeiro nível em que não
 * passou. Fechou no meio? O próximo bloco fica no localStorage e o teste
 * retoma dali. Não gasta vida, não dá XP, não conta como lição do dia.
 */

type Phase =
  | { kind: 'intro' }
  | { kind: 'loading'; level: Level }
  | { kind: 'question'; level: Level; questions: PublicQuestion[]; answers: number[] }
  | { kind: 'checking'; level: Level }
  | { kind: 'placed'; level: Level }
  | { kind: 'error'; message: string; retry: () => void }

const storageKey = (lang: Lang) => `lingua-placement:${lang}`

function readResume(lang: Lang): Level {
  try {
    return placementResume(localStorage.getItem(storageKey(lang)))
  } catch {
    return 'A1'
  }
}

function writeResume(lang: Lang, level: Level | null) {
  try {
    if (level) localStorage.setItem(storageKey(lang), level)
    else localStorage.removeItem(storageKey(lang))
  } catch {
    // Sem storage (janela privada): só não retoma.
  }
}

export function PlacementTest({
  lang,
  busy,
  onPick,
  onClose
}: {
  lang: Lang
  busy: boolean
  onPick: (level: Level) => void
  onClose: () => void
}) {
  const { token } = useAuth()
  const [phase, setPhase] = React.useState<Phase>({ kind: 'intro' })
  const [history, setHistory] = React.useState<PlacementResult[]>([])
  const resume = React.useMemo(() => readResume(lang), [lang])
  const alive = React.useRef(true)
  React.useEffect(
    () => () => {
      alive.current = false
    },
    []
  )

  const fail = (e: unknown, retry: () => void) => {
    if (alive.current) setPhase({ kind: 'error', message: errorMessage(errorCode(e)), retry })
  }

  const load = (level: Level) => {
    if (!token) return
    setPhase({ kind: 'loading', level })
    lingua
      .placement(token, lang, level)
      .then((r) => alive.current && setPhase({ kind: 'question', level, questions: r.questions, answers: [] }))
      .catch((e) => fail(e, () => load(level)))
  }

  const check = (level: Level, answers: number[]) => {
    if (!token) return
    setPhase({ kind: 'checking', level })
    lingua
      .checkPlacement(token, lang, level, answers)
      .then((r) => {
        if (!alive.current) return
        setHistory((h) => [...h, r])
        if (r.next) {
          writeResume(lang, r.next)
          load(r.next)
        } else {
          writeResume(lang, null)
          setPhase({ kind: 'placed', level: r.placed ?? level })
        }
      })
      .catch((e) => fail(e, () => check(level, answers)))
  }

  // Clique duplo na última opção mandaria o bloco duas vezes (o `phase` do
  // segundo clique ainda é o velho): trava até a próxima pergunta renderizar.
  const lastAnswered = React.useRef<string | null>(null)

  const choose = (choice: number) => {
    if (phase.kind !== 'question') return
    const id = phase.questions[phase.answers.length].id
    if (lastAnswered.current === id) return
    lastAnswered.current = id
    const answers = [...phase.answers, choice]
    if (answers.length < phase.questions.length) setPhase({ ...phase, answers })
    else check(phase.level, answers)
  }

  const working = busy || phase.kind === 'loading' || phase.kind === 'checking'

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag lang={lang} size={18} /> {LANG_NAME[lang]}: teste de nivelamento
          </DialogTitle>
          <DialogDescription>
            {phase.kind === 'question' || phase.kind === 'loading' || phase.kind === 'checking'
              ? `Nível ${phase.level}. Não vale vida nem XP, e não conta como lição do dia.`
              : 'Descubra em que nível começar. Depois ele sobe sozinho a cada 60 lições.'}
          </DialogDescription>
        </DialogHeader>

        {phase.kind === 'intro' && (
          <div className="mt-4 space-y-3 text-sm text-foreground">
            <p>
              Até 25 perguntas, 5 por nível, do A1 ao C1. Acertou 4 de 5, sobe pro próximo. Você começa no primeiro
              nível em que não passar.
            </p>
            {resume !== 'A1' && <p className="text-acid">Você parou no {resume}. O teste continua de lá.</p>}
            <p className="flex items-start gap-2 text-xs text-burn">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Não dá para trocar de nível depois.
            </p>
          </div>
        )}

        {(phase.kind === 'loading' || phase.kind === 'checking') && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {phase.kind === 'loading' ? 'Carregando perguntas…' : 'Corrigindo…'}
          </p>
        )}

        {phase.kind === 'question' && (
          <Question
            question={phase.questions[phase.answers.length]}
            index={phase.answers.length}
            total={phase.questions.length}
            onChoose={choose}
          />
        )}

        {phase.kind === 'placed' && (
          <div className="mt-4 space-y-3">
            <p className="text-center text-sm text-muted-foreground">Você começa no</p>
            <p className="text-center font-mono text-3xl font-bold text-acid">{phase.level}</p>
            <p className="text-center text-sm text-foreground">{LEVEL_LABEL[phase.level]}</p>
          </div>
        )}

        {history.length > 0 && phase.kind !== 'intro' && (
          <ul className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Resultado por nível">
            {history.map((r) => (
              <li
                key={r.level}
                className={
                  r.passed
                    ? 'flex items-center gap-1 rounded-brutal border border-acid/40 px-2 py-0.5 font-mono text-xs text-acid'
                    : 'flex items-center gap-1 rounded-brutal border border-line px-2 py-0.5 font-mono text-xs text-muted-foreground'
                }
              >
                {r.passed ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
                {r.level} {r.correct}/{r.total}
              </li>
            ))}
          </ul>
        )}

        {phase.kind === 'error' && (
          <p className="mt-4 flex items-start gap-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {phase.message}
          </p>
        )}

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {phase.kind === 'question' ? 'Parar' : 'Cancelar'}
          </Button>
          {phase.kind === 'intro' && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  writeResume(lang, null)
                  onPick('A1')
                }}
                disabled={working}
              >
                Começar do zero (A1)
              </Button>
              <Button onClick={() => load(resume)} disabled={working}>
                Fazer o teste
              </Button>
            </>
          )}
          {phase.kind === 'error' && (
            <Button onClick={phase.retry} disabled={working}>
              Tentar de novo
            </Button>
          )}
          {phase.kind === 'placed' && (
            <Button onClick={() => onPick(phase.level)} disabled={working}>
              Começar no {phase.level}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Question({
  question,
  index,
  total,
  onChoose
}: {
  question: PublicQuestion
  index: number
  total: number
  onChoose: (choice: number) => void
}) {
  return (
    <div className="mt-4 space-y-3">
      <p className="font-mono text-xs text-muted-foreground">
        {index + 1}/{total}
      </p>
      <p className="text-base font-semibold text-foreground">{question.prompt}</p>
      <div className="grid gap-2">
        {question.options.map((option, i) => (
          <button
            key={`${question.id}-${i}`}
            type="button"
            onClick={() => onChoose(i)}
            className="flex min-h-12 items-center rounded-brutal border border-line px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-acid/40 hover:bg-void-light"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}
