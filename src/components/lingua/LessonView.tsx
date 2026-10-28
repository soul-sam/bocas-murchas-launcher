import * as React from 'react'
import { Check, Loader2, RotateCcw, Volume2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { lingua, type AttemptStatus, type AttemptView, type FinishResult } from '@/lib/api-lingua'
import { errorCode, errorMessage, LANG_NAME, optionSpeech, promptSpeech } from '@/lib/lingua-ui'
import { speak } from '@/lib/lingua-tts'
import { cn } from '@/lib/utils'
import { Flag } from './Flag'

interface Feedback {
  choice: number
  answer: number
  correct: boolean
}

/** Erros que encerram a lição na tela: volta pra lista e recarrega. */
const FATAL = new Set(['attempt_expired', 'already_done_today', 'attempt_not_found'])

function stopSpeech() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

function SpeakButton({ onSpeak, label }: { onSpeak: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onSpeak()
      }}
      title={label}
      aria-label={label}
      className="alvo-dedo shrink-0 rounded-brutal p-2 text-muted-foreground transition-colors hover:bg-void-light hover:text-acid"
    >
      <Volume2 className="h-4 w-4" aria-hidden />
    </button>
  )
}

/**
 * A lição: as 10 perguntas da lição e depois as de revisão (erradas em lições
 * anteriores), uma por vez, sem limite de erro. O servidor confere cada
 * resposta; aqui só mostra. Abre de onde parou (`attempt.position`).
 */
export function LessonView({
  attempt,
  token,
  onFinish,
  onAbort,
  onExit
}: {
  attempt: AttemptView
  token: string
  onFinish: (result: FinishResult) => void
  /** A lição acabou por fora (expirou, já feita…): volta com o aviso. */
  onAbort: (message: string) => void
  /** Sair sem terminar: a tentativa fica aberta e retoma depois. */
  onExit: () => void
}) {
  const { lang, questions } = attempt
  const total = questions.length
  const [position, setPosition] = React.useState(attempt.position)
  const [status, setStatus] = React.useState<AttemptStatus>(attempt.status)
  const [feedback, setFeedback] = React.useState<Feedback | null>(null)
  const [result, setResult] = React.useState<FinishResult | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const q = questions[position]
  const foreignPrompt = q ? promptSpeech(q) : null

  // Fala só enquanto a tela está aberta e na mesma pergunta: cada troca de
  // pergunta (e a saída) muda a geração, e a fala atrasada fica muda.
  const alive = React.useRef(true)
  const speechGen = React.useRef(0)
  const say = React.useCallback(
    (text: string) => {
      const gen = speechGen.current
      void speak(text, lang, () => alive.current && speechGen.current === gen)
    },
    [lang]
  )

  React.useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      speechGen.current++
      stopSpeech()
    }
  }, [])

  // Enunciado estrangeiro: fala sozinho quando a pergunta aparece.
  React.useEffect(() => {
    speechGen.current++
    stopSpeech()
    if (foreignPrompt) say(foreignPrompt)
  }, [foreignPrompt, say, position])

  const choose = async (choice: number) => {
    if (!q || busy || feedback || status !== 'active') return
    setBusy(true)
    setError(null)
    try {
      const res = await lingua.answer(token, attempt.attemptId, position, choice)
      if (!alive.current) return
      setFeedback({ choice, answer: res.answer, correct: res.correct })
      setStatus(res.status)
      if (res.result) setResult(res.result)
      // Opções estrangeiras: fala a certa, pra fixar.
      const right = optionSpeech(q, res.answer)
      if (right) say(right)
    } catch (e) {
      if (!alive.current) return
      const code = errorCode(e)
      if (code && FATAL.has(code)) onAbort(errorMessage(code))
      else setError(errorMessage(code))
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  const next = () => {
    if (result) {
      onFinish(result)
      return
    }
    setFeedback(null)
    setPosition((p) => p + 1)
  }

  const shown = feedback ? position + 1 : position
  const pct = Math.round((shown / total) * 100)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onExit}
          disabled={busy}
          title="Sair (continua depois, hoje)"
          aria-label="Sair da lição"
          className="alvo-dedo rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground disabled:opacity-40"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        <div
          className="h-2.5 flex-1 overflow-hidden rounded-full bg-void-light"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={shown}
        >
          <div className="h-full rounded-full bg-acid transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {Math.min(position + 1, total)}/{total}
        </span>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Flag lang={lang} size={12} />
        {LANG_NAME[lang]} · {attempt.level} · lição {attempt.lesson} · {attempt.topic}
      </p>

      {q && (
        <>
          {q.review && (
            <p className="-mb-2 flex items-center gap-1.5 text-xs font-medium text-burn">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Revisão: você errou essa numa lição anterior
            </p>
          )}
          <div className="flex items-start gap-2">
            <h2 className="flex-1 text-2xl font-semibold leading-tight text-foreground">{q.prompt}</h2>
            {foreignPrompt && <SpeakButton onSpeak={() => say(foreignPrompt)} label="Ouvir" />}
          </div>
          <p className="-mt-3 text-xs text-muted-foreground">
            {q.direction === 'to_pt' ? 'O que significa?' : `Como se diz em ${LANG_NAME[lang].toLowerCase()}?`}
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {q.options.map((option, i) => {
              const speech = optionSpeech(q, i)
              const isRight = feedback?.answer === i
              const isWrongPick = feedback && !feedback.correct && feedback.choice === i
              return (
                <div
                  key={i}
                  className={cn(
                    'flex items-center rounded-brutal border transition-colors',
                    isRight
                      ? 'border-acid bg-acid/10'
                      : isWrongPick
                        ? 'border-destructive bg-destructive/10'
                        : 'border-line hover:border-acid/40'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void choose(i)}
                    disabled={busy || !!feedback || status !== 'active'}
                    className={cn(
                      'flex min-h-12 flex-1 items-center gap-2 px-3 py-2 text-left text-sm disabled:cursor-default',
                      isRight ? 'text-acid' : isWrongPick ? 'text-destructive' : 'text-foreground'
                    )}
                  >
                    <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
                    <span className="flex-1">{option}</span>
                    {isRight && <Check className="h-4 w-4" aria-hidden />}
                    {isWrongPick && <X className="h-4 w-4" aria-hidden />}
                  </button>
                  {speech && <SpeakButton onSpeak={() => say(speech)} label={`Ouvir ${option}`} />}
                </div>
              )
            })}
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {busy && <Loader2 className="h-4 w-4 animate-spin self-center text-muted-foreground" aria-hidden />}

      {feedback && (
        <div
          role="status"
          className={cn(
            'flex flex-wrap items-center gap-3 rounded-brutal border px-4 py-3',
            feedback.correct ? 'border-acid/50 bg-acid/10' : 'border-destructive/50 bg-destructive/10'
          )}
        >
          <p className={cn('flex-1 text-sm', feedback.correct ? 'text-acid' : 'text-destructive')}>
            {feedback.correct ? 'Certo!' : (
              <>
                Errou. Resposta: <strong>{q?.options[feedback.answer]}</strong>
              </>
            )}
          </p>
          <Button onClick={next} autoFocus>
            {result ? 'Ver resultado' : 'Continuar'}
          </Button>
        </div>
      )}
    </div>
  )
}
